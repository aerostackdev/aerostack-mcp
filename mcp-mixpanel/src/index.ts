/**
 * Mixpanel MCP Worker
 * Implements MCP protocol over HTTP for Mixpanel analytics operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   MIXPANEL_TOKEN                    → X-Mcp-Secret-MIXPANEL-TOKEN
 *   MIXPANEL_SERVICE_ACCOUNT_USERNAME → X-Mcp-Secret-MIXPANEL-SERVICE-ACCOUNT-USERNAME
 *   MIXPANEL_SERVICE_ACCOUNT_SECRET   → X-Mcp-Secret-MIXPANEL-SERVICE-ACCOUNT-SECRET
 *   MIXPANEL_PROJECT_ID               → X-Mcp-Secret-MIXPANEL-PROJECT-ID
 */

const MIXPANEL_INGEST = 'https://api.mixpanel.com';
const MIXPANEL_QUERY = 'https://mixpanel.com/api/2.0';
const MIXPANEL_EXPORT = 'https://data.mixpanel.com/api/2.0';

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
        description: 'Verify Mixpanel credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'track_event',
        description: 'Track a custom event in Mixpanel for a specific user',
        inputSchema: {
            type: 'object',
            properties: {
                distinct_id: { type: 'string', description: 'Unique identifier for the user' },
                event: { type: 'string', description: 'Name of the event to track' },
                properties: { type: 'object', description: 'Additional event properties (optional)' },
                time: { type: 'number', description: 'Unix timestamp for the event (optional, defaults to now)' },
            },
            required: ['distinct_id', 'event'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'set_user_properties',
        description: 'Set user profile properties in Mixpanel (e.g. $email, $name, $city)',
        inputSchema: {
            type: 'object',
            properties: {
                distinct_id: { type: 'string', description: 'Unique identifier for the user' },
                properties: { type: 'object', description: 'User traits to set (e.g. { "$email": "user@example.com", "$name": "John" })' },
            },
            required: ['distinct_id', 'properties'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'increment_property',
        description: 'Increment a numeric user profile property in Mixpanel',
        inputSchema: {
            type: 'object',
            properties: {
                distinct_id: { type: 'string', description: 'Unique identifier for the user' },
                property: { type: 'string', description: 'Property name to increment' },
                value: { type: 'number', description: 'Amount to increment by (default 1)' },
            },
            required: ['distinct_id', 'property'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_user_profile',
        description: 'Get a user profile and their properties from Mixpanel',
        inputSchema: {
            type: 'object',
            properties: {
                distinct_id: { type: 'string', description: 'Unique identifier for the user' },
            },
            required: ['distinct_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_insights_report',
        description: 'Get an insights analytics report for a specific event over a date range',
        inputSchema: {
            type: 'object',
            properties: {
                from_date: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
                to_date: { type: 'string', description: 'End date in YYYY-MM-DD format' },
                event: { type: 'string', description: 'Event name to analyze' },
            },
            required: ['from_date', 'to_date', 'event'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_funnel',
        description: 'Get funnel conversion data for a specific funnel by ID',
        inputSchema: {
            type: 'object',
            properties: {
                funnel_id: { type: 'string', description: 'Mixpanel funnel ID' },
                from_date: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
                to_date: { type: 'string', description: 'End date in YYYY-MM-DD format' },
            },
            required: ['funnel_id', 'from_date', 'to_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'export_events',
        description: 'Export raw events from Mixpanel over a date range (returns first 100 events)',
        inputSchema: {
            type: 'object',
            properties: {
                from_date: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
                to_date: { type: 'string', description: 'End date in YYYY-MM-DD format' },
                event: { type: 'string', description: 'Filter by event name (optional)' },
            },
            required: ['from_date', 'to_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

function basicAuth(username: string, secret: string): string {
    return 'Basic ' + btoa(`${username}:${secret}`);
}

async function queryApi(
    path: string,
    username: string,
    secret: string,
    params: Record<string, string> = {},
): Promise<unknown> {
    const url = new URL(`${MIXPANEL_QUERY}${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
        headers: {
            Authorization: basicAuth(username, secret),
            Accept: 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Mixpanel API ${res.status}: ${text}`);
    }
    return res.json();
}

async function ingestApi(
    path: string,
    data: object[],
    token: string,
): Promise<string> {
    const encoded = btoa(JSON.stringify(data));
    const body = `data=${encodeURIComponent(encoded)}`;
    const res = await fetch(`${MIXPANEL_INGEST}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Mixpanel ingest ${res.status}: ${text}`);
    }
    return text;
}

interface Secrets {
    token: string;
    username: string;
    secret: string;
    projectId: string;
}

async function callTool(name: string, args: Record<string, unknown>, secrets: Secrets): Promise<unknown> {
    const { token, username, secret, projectId } = secrets;

    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            await queryApi('/projects', username, secret, { project_id: projectId });
            return { content: [{ type: 'text', text: 'Connected to Mixpanel' }] };
        }

        case 'track_event': {
            if (!args.distinct_id) throw new Error('distinct_id is required');
            if (!args.event) throw new Error('event is required');
            const props: Record<string, unknown> = {
                distinct_id: args.distinct_id,
                token,
                ...(args.properties as Record<string, unknown> ?? {}),
            };
            if (args.time != null) props.time = args.time;
            const result = await ingestApi('/track', [{ event: args.event, properties: props }], token);
            return { success: result.trim() === '1', raw: result.trim() };
        }

        case 'set_user_properties': {
            if (!args.distinct_id) throw new Error('distinct_id is required');
            if (!args.properties) throw new Error('properties is required');
            const result = await ingestApi('/engage', [{
                $token: token,
                $distinct_id: args.distinct_id,
                $set: args.properties,
            }], token);
            return { success: result.trim() === '1', raw: result.trim() };
        }

        case 'increment_property': {
            if (!args.distinct_id) throw new Error('distinct_id is required');
            if (!args.property) throw new Error('property is required');
            const value = Number(args.value ?? 1);
            const result = await ingestApi('/engage', [{
                $token: token,
                $distinct_id: args.distinct_id,
                $add: { [args.property as string]: value },
            }], token);
            return { success: result.trim() === '1', raw: result.trim() };
        }

        case 'get_user_profile': {
            if (!args.distinct_id) throw new Error('distinct_id is required');
            const data = await queryApi('/engage', username, secret, {
                distinct_id: String(args.distinct_id),
                project_id: projectId,
            }) as any;
            if (data.results && data.results.length > 0) {
                const profile = data.results[0];
                return {
                    distinct_id: profile.$distinct_id,
                    properties: profile.$properties,
                };
            }
            return { distinct_id: args.distinct_id, properties: {} };
        }

        case 'get_insights_report': {
            if (!args.from_date) throw new Error('from_date is required');
            if (!args.to_date) throw new Error('to_date is required');
            if (!args.event) throw new Error('event is required');
            const data = await queryApi('/insights', username, secret, {
                project_id: projectId,
                from_date: String(args.from_date),
                to_date: String(args.to_date),
                event: JSON.stringify([{ event: args.event }]),
            });
            return data;
        }

        case 'get_funnel': {
            if (!args.funnel_id) throw new Error('funnel_id is required');
            if (!args.from_date) throw new Error('from_date is required');
            if (!args.to_date) throw new Error('to_date is required');
            const data = await queryApi('/funnels', username, secret, {
                project_id: projectId,
                funnel_id: String(args.funnel_id),
                from_date: String(args.from_date),
                to_date: String(args.to_date),
            });
            return data;
        }

        case 'export_events': {
            if (!args.from_date) throw new Error('from_date is required');
            if (!args.to_date) throw new Error('to_date is required');
            const url = new URL(`${MIXPANEL_EXPORT}/export`);
            url.searchParams.set('project_id', projectId);
            url.searchParams.set('from_date', String(args.from_date));
            url.searchParams.set('to_date', String(args.to_date));
            if (args.event) url.searchParams.set('event', JSON.stringify([args.event]));

            const res = await fetch(url.toString(), {
                headers: {
                    Authorization: basicAuth(username, secret),
                    Accept: 'application/json',
                },
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Mixpanel export ${res.status}: ${text}`);
            }
            const text = await res.text();
            const lines = text.trim().split('\n').filter(l => l.trim());
            const events = lines.slice(0, 100).map(line => {
                try { return JSON.parse(line); } catch { return { raw: line }; }
            });
            return { count: events.length, events };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mixpanel-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'mixpanel-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-MIXPANEL-TOKEN');
            const username = request.headers.get('X-Mcp-Secret-MIXPANEL-SERVICE-ACCOUNT-USERNAME');
            const secret = request.headers.get('X-Mcp-Secret-MIXPANEL-SERVICE-ACCOUNT-SECRET');
            const projectId = request.headers.get('X-Mcp-Secret-MIXPANEL-PROJECT-ID');

            if (!token || !username || !secret || !projectId) {
                return rpcErr(id, -32001, 'Missing required secrets: MIXPANEL_TOKEN, MIXPANEL_SERVICE_ACCOUNT_USERNAME, MIXPANEL_SERVICE_ACCOUNT_SECRET, MIXPANEL_PROJECT_ID');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, { token, username, secret, projectId });
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
