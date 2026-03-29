/**
 * Pipedream MCP Worker
 * Implements MCP protocol over HTTP for Pipedream API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: PIPEDREAM_API_KEY → X-Mcp-Secret-PIPEDREAM-API-KEY
 */

const PIPEDREAM_API = 'https://api.pipedream.com/v1';

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
        name: 'list_sources',
        description: 'List event sources for the authenticated Pipedream user',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max sources to return (default 10)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_source',
        description: 'Get details of a specific Pipedream event source',
        inputSchema: {
            type: 'object',
            properties: {
                source_id: { type: 'string', description: 'Source ID' },
            },
            required: ['source_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_source_events',
        description: 'List recent events emitted by a Pipedream event source',
        inputSchema: {
            type: 'object',
            properties: {
                source_id: { type: 'string', description: 'Source ID' },
                limit: { type: 'number', description: 'Max events to return (default 10)' },
            },
            required: ['source_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_workflows',
        description: 'List workflows for the authenticated Pipedream user',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max workflows to return (default 10)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_me',
        description: 'Get current authenticated Pipedream user info',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_apps',
        description: 'Search and list available Pipedream app integrations',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query to filter apps (optional)' },
                limit: { type: 'number', description: 'Max apps to return (default 10)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function pdApi(path: string, apiKey: string, opts: RequestInit = {}) {
    const res = await fetch(`${PIPEDREAM_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`Pipedream API ${res.status}: ${err.error ?? err.message ?? 'unknown error'}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case 'list_sources': {
            const limit = Math.min(Number(args.limit ?? 10), 100);
            const data = await pdApi(`/users/me/sources?limit=${limit}`, apiKey) as any;
            return data.data ?? data;
        }

        case 'get_source': {
            const data = await pdApi(`/sources/${args.source_id}`, apiKey) as any;
            return data.data ?? data;
        }

        case 'list_source_events': {
            const limit = Math.min(Number(args.limit ?? 10), 100);
            const data = await pdApi(`/sources/${args.source_id}/event_summaries?limit=${limit}`, apiKey) as any;
            return data.data ?? data;
        }

        case 'list_workflows': {
            const limit = Math.min(Number(args.limit ?? 10), 100);
            const data = await pdApi(`/users/me/workflows?limit=${limit}`, apiKey) as any;
            return data.data ?? data;
        }

        case 'get_me': {
            const data = await pdApi('/users/me', apiKey) as any;
            return data.data ?? data;
        }

        case 'list_apps': {
            const limit = Math.min(Number(args.limit ?? 10), 100);
            const params = new URLSearchParams({ limit: String(limit) });
            if (args.query) params.set('q', String(args.query));
            const data = await pdApi(`/apps?${params}`, apiKey) as any;
            return data.data ?? data;
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-pipedream', tools: TOOLS.length }), {
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
                serverInfo: { name: 'mcp-pipedream', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const apiKey = request.headers.get('X-Mcp-Secret-PIPEDREAM-API-KEY');
            if (!apiKey) return rpcErr(id, -32001, 'Missing PIPEDREAM_API_KEY secret — add it to your workspace secrets');

            try {
                const result = await callTool(toolName, toolArgs, apiKey);
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
