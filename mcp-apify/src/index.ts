/**
 * Apify MCP Worker
 * Implements MCP protocol over HTTP for Apify API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: APIFY_API_TOKEN → X-Mcp-Secret-APIFY-API-TOKEN
 */

const APIFY_API = 'https://api.apify.com/v2';

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
        description: 'Verify Apify credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_actors',
        description: "List user's Apify actors",
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max actors to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_actor',
        description: 'Get details of a specific Apify actor',
        inputSchema: {
            type: 'object',
            properties: {
                actor_id: { type: 'string', description: 'Actor ID or username~actorName' },
            },
            required: ['actor_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'run_actor',
        description: 'Start a run of an Apify actor with optional input',
        inputSchema: {
            type: 'object',
            properties: {
                actor_id: { type: 'string', description: 'Actor ID or username~actorName' },
                input: { type: 'object', description: 'Input JSON to pass to the actor (optional)' },
            },
            required: ['actor_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_run',
        description: 'Get status and details of an Apify actor run',
        inputSchema: {
            type: 'object',
            properties: {
                run_id: { type: 'string', description: 'Run ID' },
            },
            required: ['run_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'abort_run',
        description: 'Abort a running Apify actor run',
        inputSchema: {
            type: 'object',
            properties: {
                run_id: { type: 'string', description: 'Run ID to abort' },
            },
            required: ['run_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_datasets',
        description: "List user's Apify datasets",
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max datasets to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_dataset_items',
        description: 'Get items from an Apify dataset',
        inputSchema: {
            type: 'object',
            properties: {
                dataset_id: { type: 'string', description: 'Dataset ID' },
                limit: { type: 'number', description: 'Max items to return (default 20)' },
                offset: { type: 'number', description: 'Offset for pagination (default 0)' },
            },
            required: ['dataset_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_key_value_stores',
        description: "List user's Apify key-value stores",
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max stores to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function apifyApi(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${APIFY_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`Apify API ${res.status}: ${err.error?.message ?? err.message ?? 'unknown error'}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await apifyApi('/users/me', token) as any;
            return { connected: true, username: data.data?.username ?? data.username ?? 'unknown' };
        }

        case 'list_actors': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const data = await apifyApi(`/acts?my=true&limit=${limit}`, token) as any;
            return data.data?.items ?? data.data ?? [];
        }

        case 'get_actor': {
            const data = await apifyApi(`/acts/${args.actor_id}`, token) as any;
            return data.data ?? data;
        }

        case 'run_actor': {
            const data = await apifyApi(`/acts/${args.actor_id}/runs`, token, {
                method: 'POST',
                body: JSON.stringify(args.input ?? {}),
            }) as any;
            return data.data ?? data;
        }

        case 'get_run': {
            const data = await apifyApi(`/actor-runs/${args.run_id}`, token) as any;
            return data.data ?? data;
        }

        case 'abort_run': {
            const data = await apifyApi(`/actor-runs/${args.run_id}/abort`, token, {
                method: 'POST',
            }) as any;
            return data.data ?? { success: true };
        }

        case 'list_datasets': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const data = await apifyApi(`/datasets?my=true&limit=${limit}`, token) as any;
            return data.data?.items ?? data.data ?? [];
        }

        case 'get_dataset_items': {
            const limit = Math.min(Number(args.limit ?? 20), 1000);
            const offset = Number(args.offset ?? 0);
            const data = await apifyApi(
                `/datasets/${args.dataset_id}/items?format=json&limit=${limit}&offset=${offset}`,
                token,
            ) as any;
            return data;
        }

        case 'list_key_value_stores': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const data = await apifyApi(`/key-value-stores?my=true&limit=${limit}`, token) as any;
            return data.data?.items ?? data.data ?? [];
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-apify', tools: TOOLS.length }), {
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
                serverInfo: { name: 'mcp-apify', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-APIFY-API-TOKEN');
            if (!token) return rpcErr(id, -32001, 'Missing APIFY_API_TOKEN secret — add it to your workspace secrets');

            try {
                const result = await callTool(toolName, toolArgs, token);
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
