/**
 * Make (Integromat) MCP Worker
 * Implements MCP protocol over HTTP for Make.com API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   MAKE_API_KEY    → X-Mcp-Secret-MAKE-API-KEY
 *   MAKE_REGION     → X-Mcp-Secret-MAKE-REGION
 *   MAKE_TEAM_ID    → X-Mcp-Secret-MAKE-TEAM-ID
 */

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
        description: 'Verify Make credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_scenarios',
        description: 'List automation scenarios for the configured team',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max scenarios to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_scenario',
        description: 'Get details of a specific Make scenario by ID',
        inputSchema: {
            type: 'object',
            properties: {
                scenario_id: { type: 'string', description: 'Scenario ID' },
            },
            required: ['scenario_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'run_scenario',
        description: 'Trigger an immediate run of a Make scenario',
        inputSchema: {
            type: 'object',
            properties: {
                scenario_id: { type: 'string', description: 'Scenario ID to run' },
            },
            required: ['scenario_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'activate_scenario',
        description: 'Enable (activate) a Make scenario so it runs on schedule',
        inputSchema: {
            type: 'object',
            properties: {
                scenario_id: { type: 'string', description: 'Scenario ID to activate' },
            },
            required: ['scenario_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'deactivate_scenario',
        description: 'Disable (deactivate) a Make scenario',
        inputSchema: {
            type: 'object',
            properties: {
                scenario_id: { type: 'string', description: 'Scenario ID to deactivate' },
            },
            required: ['scenario_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_executions',
        description: 'List execution logs for a Make scenario',
        inputSchema: {
            type: 'object',
            properties: {
                scenario_id: { type: 'string', description: 'Scenario ID' },
                limit: { type: 'number', description: 'Max executions to return (default 20)' },
            },
            required: ['scenario_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_teams',
        description: 'List teams in a Make organization',
        inputSchema: {
            type: 'object',
            properties: {
                org_id: { type: 'string', description: 'Organization ID' },
            },
            required: ['org_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function makeApi(path: string, apiKey: string, region: string, opts: RequestInit = {}) {
    const base = `https://${region}.make.com/api/v2`;
    const res = await fetch(`${base}${path}`, {
        ...opts,
        headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`Make API ${res.status}: ${err.message ?? err.detail ?? 'unknown error'}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string, region: string, teamId: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await makeApi(`/users/me`, apiKey, region);
            return { content: [{ type: 'text', text: 'Connected to Make' }] };
        }

        case 'list_scenarios': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const data = await makeApi(`/scenarios?teamId=${teamId}&limit=${limit}`, apiKey, region) as any;
            return data.scenarios ?? data ?? [];
        }

        case 'get_scenario': {
            const data = await makeApi(`/scenarios/${args.scenario_id}`, apiKey, region) as any;
            return data.scenario ?? data;
        }

        case 'run_scenario': {
            const data = await makeApi(`/scenarios/${args.scenario_id}/run`, apiKey, region, {
                method: 'POST',
                body: JSON.stringify({}),
            }) as any;
            return { success: true, execution_id: data.executionId ?? data.execution_id ?? null };
        }

        case 'activate_scenario': {
            const data = await makeApi(`/scenarios/${args.scenario_id}`, apiKey, region, {
                method: 'PATCH',
                body: JSON.stringify({ isEnabled: true }),
            }) as any;
            return data.scenario ?? data;
        }

        case 'deactivate_scenario': {
            const data = await makeApi(`/scenarios/${args.scenario_id}`, apiKey, region, {
                method: 'PATCH',
                body: JSON.stringify({ isEnabled: false }),
            }) as any;
            return data.scenario ?? data;
        }

        case 'list_executions': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const data = await makeApi(`/scenarios/${args.scenario_id}/logs?limit=${limit}`, apiKey, region) as any;
            return data.executions ?? data.logs ?? data ?? [];
        }

        case 'list_teams': {
            const data = await makeApi(`/teams?organizationId=${args.org_id}`, apiKey, region) as any;
            return data.teams ?? data ?? [];
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-make', tools: TOOLS.length }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-make', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const apiKey = request.headers.get('X-Mcp-Secret-MAKE-API-KEY');
            const region = request.headers.get('X-Mcp-Secret-MAKE-REGION');
            const teamId = request.headers.get('X-Mcp-Secret-MAKE-TEAM-ID');

            if (!apiKey) return rpcErr(id, -32001, 'Missing MAKE_API_KEY secret — add it to your workspace secrets');
            if (!region) return rpcErr(id, -32001, 'Missing MAKE_REGION secret — add it to your workspace secrets');
            if (!teamId) return rpcErr(id, -32001, 'Missing MAKE_TEAM_ID secret — add it to your workspace secrets');

            try {
                const result = await callTool(toolName, toolArgs, apiKey, region, teamId);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
