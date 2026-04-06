/**
 * Dub MCP Worker
 * Implements MCP protocol over HTTP for Dub.co link management.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: DUB_API_KEY → X-Mcp-Secret-DUB-API-KEY
 */

const DUB_API = 'https://api.dub.co';

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
        description: 'Verify Dub credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_link',
        description: 'Create a new short link in Dub',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'The destination URL to shorten' },
                key: { type: 'string', description: 'Custom slug for the short link (optional)' },
                domain: { type: 'string', description: 'Domain to use (default: dub.sh)' },
                title: { type: 'string', description: 'Title for the link (optional)' },
                description: { type: 'string', description: 'Description for the link (optional)' },
                expires_at: { type: 'string', description: 'Expiration date ISO 8601 (optional)' },
            },
            required: ['url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_links',
        description: 'List short links in the Dub workspace',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max links to return (default 20)' },
                search: { type: 'string', description: 'Search query to filter links (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_link',
        description: 'Get details of a specific Dub link by ID',
        inputSchema: {
            type: 'object',
            properties: {
                link_id: { type: 'string', description: 'Link ID' },
            },
            required: ['link_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_link',
        description: 'Update an existing Dub short link',
        inputSchema: {
            type: 'object',
            properties: {
                link_id: { type: 'string', description: 'Link ID to update' },
                url: { type: 'string', description: 'New destination URL (optional)' },
                key: { type: 'string', description: 'New custom slug (optional)' },
                title: { type: 'string', description: 'New title (optional)' },
                description: { type: 'string', description: 'New description (optional)' },
            },
            required: ['link_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_link',
        description: 'Delete a Dub short link',
        inputSchema: {
            type: 'object',
            properties: {
                link_id: { type: 'string', description: 'Link ID to delete' },
            },
            required: ['link_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_link_analytics',
        description: 'Get click analytics for a Dub link',
        inputSchema: {
            type: 'object',
            properties: {
                link_id: { type: 'string', description: 'Link ID' },
                interval: { type: 'string', enum: ['24h', '7d', '30d', '90d'], description: 'Time interval (default 7d)' },
            },
            required: ['link_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_domains',
        description: 'List custom domains in the Dub workspace',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_workspace',
        description: 'Get information about the current Dub workspace',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function dubApi(path: string, apiKey: string, opts: RequestInit = {}) {
    const res = await fetch(`${DUB_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`Dub API ${res.status}: ${err.error?.message ?? err.message ?? 'unknown error'}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            return dubApi('/workspaces', apiKey);
        }

        case 'create_link': {
            const body: Record<string, unknown> = { url: args.url };
            if (args.key) body.key = args.key;
            if (args.domain) body.domain = args.domain;
            if (args.title) body.title = args.title;
            if (args.description) body.description = args.description;
            if (args.expires_at) body.expiresAt = args.expires_at;
            const data = await dubApi('/links', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;
            return data;
        }

        case 'list_links': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const params = new URLSearchParams({ limit: String(limit) });
            if (args.search) params.set('search', String(args.search));
            const data = await dubApi(`/links?${params}`, apiKey) as any;
            return data;
        }

        case 'get_link': {
            const data = await dubApi(`/links/${encodeURIComponent(String(args.link_id))}`, apiKey) as any;
            return data;
        }

        case 'update_link': {
            const body: Record<string, unknown> = {};
            if (args.url) body.url = args.url;
            if (args.key) body.key = args.key;
            if (args.title) body.title = args.title;
            if (args.description) body.description = args.description;
            const data = await dubApi(`/links/${encodeURIComponent(String(args.link_id))}`, apiKey, {
                method: 'PATCH',
                body: JSON.stringify(body),
            }) as any;
            return data;
        }

        case 'delete_link': {
            const data = await dubApi(`/links/${encodeURIComponent(String(args.link_id))}`, apiKey, {
                method: 'DELETE',
            }) as any;
            return data;
        }

        case 'get_link_analytics': {
            const interval = String(args.interval ?? '7d');
            const data = await dubApi(
                `/analytics?linkId=${args.link_id}&interval=${interval}&groupBy=timeseries`,
                apiKey,
            ) as any;
            return data;
        }

        case 'list_domains': {
            const data = await dubApi('/domains', apiKey) as any;
            return data;
        }

        case 'get_workspace': {
            const data = await dubApi('/workspaces', apiKey) as any;
            return data;
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-dub', tools: TOOLS.length }), {
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
                serverInfo: { name: 'mcp-dub', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const apiKey = request.headers.get('X-Mcp-Secret-DUB-API-KEY');
            if (!apiKey) return rpcErr(id, -32001, 'Missing DUB_API_KEY secret — add it to your workspace secrets');

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
