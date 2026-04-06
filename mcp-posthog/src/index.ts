/**
 * PostHog MCP Worker
 * Implements MCP protocol over HTTP for PostHog analytics operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   POSTHOG_API_KEY         → X-Mcp-Secret-POSTHOG-API-KEY         (personal API key for REST API)
 *   POSTHOG_PROJECT_ID      → X-Mcp-Secret-POSTHOG-PROJECT-ID      (project numeric ID)
 *   POSTHOG_PROJECT_API_KEY → X-Mcp-Secret-POSTHOG-PROJECT-API-KEY (project API key for capture, starts with phc_)
 */

const POSTHOG_CAPTURE = 'https://app.posthog.com';
const POSTHOG_API = 'https://app.posthog.com/api';

function rpcOk(id: number | string, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: number | string | null, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify PostHog credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'capture_event',
        description: 'Capture a custom event in PostHog for a specific user',
        inputSchema: {
            type: 'object',
            properties: {
                distinct_id: { type: 'string', description: 'Unique identifier for the user' },
                event: { type: 'string', description: 'Name of the event to capture' },
                properties: { type: 'object', description: 'Additional event properties (optional)' },
                timestamp: { type: 'string', description: 'ISO 8601 timestamp (optional, defaults to now)' },
            },
            required: ['distinct_id', 'event'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'identify_user',
        description: 'Identify a user and set their properties in PostHog',
        inputSchema: {
            type: 'object',
            properties: {
                distinct_id: { type: 'string', description: 'Unique identifier for the user' },
                properties: { type: 'object', description: 'User properties to set via $set (e.g. name, email, plan)' },
            },
            required: ['distinct_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_feature_flags',
        description: 'Evaluate feature flags for a specific user using the PostHog decide endpoint',
        inputSchema: {
            type: 'object',
            properties: {
                distinct_id: { type: 'string', description: 'Unique identifier for the user' },
                person_properties: { type: 'object', description: 'User properties for flag evaluation (optional)' },
            },
            required: ['distinct_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_persons',
        description: 'List persons (users) in the PostHog project with optional search',
        inputSchema: {
            type: 'object',
            properties: {
                search: { type: 'string', description: 'Search by email or name (optional)' },
                limit: { type: 'number', description: 'Maximum number of persons to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_person',
        description: 'Get full details for a specific person by their PostHog person ID',
        inputSchema: {
            type: 'object',
            properties: {
                person_id: { type: 'string', description: 'PostHog person ID' },
            },
            required: ['person_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_feature_flags',
        description: 'List all feature flags in the PostHog project',
        inputSchema: {
            type: 'object',
            properties: {
                active: { type: 'boolean', description: 'Filter to only active flags (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_insights',
        description: 'List insights (analytics queries) in the PostHog project',
        inputSchema: {
            type: 'object',
            properties: {
                insight: {
                    type: 'string',
                    description: 'Filter by insight type: TRENDS, FUNNELS, RETENTION, PATHS (optional)',
                    enum: ['TRENDS', 'FUNNELS', 'RETENTION', 'PATHS'],
                },
                limit: { type: 'number', description: 'Maximum number of insights to return (default 10)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_cohorts',
        description: 'List all cohorts defined in the PostHog project',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_experiments',
        description: 'List all A/B experiments in the PostHog project',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function phApi(
    path: string,
    apiKey: string,
    opts: RequestInit = {},
): Promise<unknown> {
    const url = `${POSTHOG_API}${path}`;
    const res = await fetch(url, {
        ...opts,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(opts.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        throw new Error(`PostHog API error ${res.status}: ${await res.text()}`);
    }
    return res.json();
}

async function phCapture(
    endpoint: string,
    projectApiKey: string,
    body: Record<string, unknown>,
): Promise<unknown> {
    const url = `${POSTHOG_CAPTURE}${endpoint}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, api_key: projectApiKey }),
    });
    if (!res.ok) {
        throw new Error(`PostHog capture error ${res.status}: ${await res.text()}`);
    }
    return res.json();
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
    projectId: string,
    projectApiKey: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await phApi('/users/@me/', apiKey);
            return { content: [{ type: 'text', text: 'Connected to PostHog' }] };
        }

        case 'capture_event': {
            if (!args.distinct_id) throw new Error('distinct_id is required');
            if (!args.event) throw new Error('event is required');
            const body: Record<string, unknown> = {
                distinct_id: args.distinct_id,
                event: args.event,
            };
            if (args.properties) body.properties = args.properties;
            if (args.timestamp) body.timestamp = args.timestamp;
            return phCapture('/capture/', projectApiKey, body);
        }

        case 'identify_user': {
            if (!args.distinct_id) throw new Error('distinct_id is required');
            const body: Record<string, unknown> = {
                distinct_id: args.distinct_id,
                event: '$identify',
                properties: { $set: args.properties ?? {} },
            };
            return phCapture('/capture/', projectApiKey, body);
        }

        case 'get_feature_flags': {
            if (!args.distinct_id) throw new Error('distinct_id is required');
            const url = `${POSTHOG_CAPTURE}/decide/?v=3`;
            const body: Record<string, unknown> = {
                api_key: projectApiKey,
                distinct_id: args.distinct_id,
            };
            if (args.person_properties) body.person_properties = args.person_properties;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(`PostHog decide error ${res.status}: ${await res.text()}`);
            const data = await res.json() as any;
            return {
                featureFlags: data.featureFlags ?? {},
                featureFlagPayloads: data.featureFlagPayloads ?? {},
            };
        }

        case 'list_persons': {
            const params = new URLSearchParams();
            params.set('limit', String(Number(args.limit ?? 20)));
            if (args.search) params.set('search', String(args.search));
            const data = await phApi(`/projects/${projectId}/persons/?${params}`, apiKey) as any;
            return (data.results ?? []).map((p: any) => ({
                id: p.id,
                distinct_ids: p.distinct_ids,
                properties: p.properties,
                created_at: p.created_at,
            }));
        }

        case 'get_person': {
            if (!args.person_id) throw new Error('person_id is required');
            return phApi(`/projects/${projectId}/persons/${args.person_id}/`, apiKey);
        }

        case 'list_feature_flags': {
            const data = await phApi(`/projects/${projectId}/feature_flags/`, apiKey) as any;
            let results = data.results ?? [];
            if (args.active !== undefined) {
                results = results.filter((f: any) => f.active === args.active);
            }
            return results.map((f: any) => ({
                id: f.id,
                key: f.key,
                name: f.name,
                active: f.active,
                rollout_percentage: f.filters?.rollout_percentage ?? null,
            }));
        }

        case 'get_insights': {
            const params = new URLSearchParams();
            params.set('limit', String(Number(args.limit ?? 10)));
            if (args.insight) params.set('insight', String(args.insight));
            const data = await phApi(`/projects/${projectId}/insights/?${params}`, apiKey) as any;
            return data.results ?? [];
        }

        case 'list_cohorts': {
            const data = await phApi(`/projects/${projectId}/cohorts/`, apiKey) as any;
            return (data.results ?? []).map((c: any) => ({
                id: c.id,
                name: c.name,
                count: c.count,
                created_at: c.created_at,
            }));
        }

        case 'get_experiments': {
            const data = await phApi(`/projects/${projectId}/experiments/`, apiKey) as any;
            return (data.results ?? []).map((e: any) => ({
                id: e.id,
                name: e.name,
                feature_flag_key: e.feature_flag_key,
                status: e.status,
                start_date: e.start_date,
                end_date: e.end_date,
            }));
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'posthog-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: any;
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { jsonrpc, id, method, params } = body;
        if (jsonrpc !== '2.0') return rpcErr(id ?? null, -32600, 'Invalid Request');

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'posthog-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-POSTHOG-API-KEY');
            const projectId = request.headers.get('X-Mcp-Secret-POSTHOG-PROJECT-ID');
            const projectApiKey = request.headers.get('X-Mcp-Secret-POSTHOG-PROJECT-API-KEY');

            if (!apiKey || !projectId || !projectApiKey) {
                return rpcErr(id, -32001, 'Missing required secrets: POSTHOG_API_KEY, POSTHOG_PROJECT_ID, POSTHOG_PROJECT_API_KEY');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, apiKey, projectId, projectApiKey);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
