/**
 * Hookdeck MCP Worker
 * Implements MCP protocol over HTTP for Hookdeck webhook management.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: HOOKDECK_API_KEY → X-Mcp-Secret-HOOKDECK-API-KEY
 */

const HOOKDECK_API = 'https://api.hookdeck.com/2024-03-01';

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
        description: 'Verify Hookdeck credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_connections',
        description: 'List webhook connections in Hookdeck',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max connections to return (default 25)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_connection',
        description: 'Get details of a specific Hookdeck connection',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Connection ID' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_connection',
        description: 'Create a new Hookdeck webhook connection',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Connection name' },
                source_name: { type: 'string', description: 'Source name' },
                destination_name: { type: 'string', description: 'Destination name' },
                destination_url: { type: 'string', description: 'Destination URL to forward webhooks to' },
            },
            required: ['name', 'source_name', 'destination_name', 'destination_url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'pause_connection',
        description: 'Pause a Hookdeck connection (stops forwarding events)',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Connection ID to pause' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'resume_connection',
        description: 'Resume a paused Hookdeck connection',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Connection ID to resume' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_events',
        description: 'List webhook events in Hookdeck',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max events to return (default 25)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_event',
        description: 'Get details of a specific Hookdeck webhook event',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Event ID' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'retry_event',
        description: 'Retry a failed Hookdeck webhook event',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Event ID to retry' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

async function hdApi(path: string, apiKey: string, opts: RequestInit = {}) {
    const res = await fetch(`${HOOKDECK_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`Hookdeck API ${res.status}: ${err.message ?? err.error ?? 'unknown error'}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const data = await hdApi('/workspaces', apiKey) as { models?: Array<{ name?: string }> };
            const ws = Array.isArray(data.models) ? data.models[0] : null;
            return { content: [{ type: 'text', text: `Connected to Hookdeck${ws?.name ? ` — workspace: ${ws.name}` : ''}` }] };
        }

        case 'list_connections': {
            const limit = Math.min(Number(args.limit ?? 25), 250);
            const data = await hdApi(`/connections?limit=${limit}`, apiKey) as any;
            return data.models ?? data;
        }

        case 'get_connection': {
            const data = await hdApi(`/connections/${args.id}`, apiKey) as any;
            return data;
        }

        case 'create_connection': {
            const data = await hdApi('/connections', apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    name: args.name,
                    source: { name: args.source_name },
                    destination: { name: args.destination_name, url: args.destination_url },
                }),
            }) as any;
            return data;
        }

        case 'pause_connection': {
            const data = await hdApi(`/connections/${args.id}/pause`, apiKey, {
                method: 'PUT',
            }) as any;
            return data;
        }

        case 'resume_connection': {
            const data = await hdApi(`/connections/${args.id}/resume`, apiKey, {
                method: 'PUT',
            }) as any;
            return data;
        }

        case 'list_events': {
            const limit = Math.min(Number(args.limit ?? 25), 250);
            const data = await hdApi(`/events?limit=${limit}`, apiKey) as any;
            return data.models ?? data;
        }

        case 'get_event': {
            const data = await hdApi(`/events/${args.id}`, apiKey) as any;
            return data;
        }

        case 'retry_event': {
            const data = await hdApi(`/events/${args.id}/retry`, apiKey, {
                method: 'POST',
            }) as any;
            return data;
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-hookdeck', tools: TOOLS.length }), {
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
                serverInfo: { name: 'mcp-hookdeck', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const apiKey = request.headers.get('X-Mcp-Secret-HOOKDECK-API-KEY');
            if (!apiKey) return rpcErr(id, -32001, 'Missing HOOKDECK_API_KEY secret — add it to your workspace secrets');

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
