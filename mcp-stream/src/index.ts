/**
 * GetStream.io Chat MCP Worker
 * Secret: STREAM_API_KEY → header: X-Mcp-Secret-STREAM-API-KEY
 * Secret: STREAM_API_SECRET → header: X-Mcp-Secret-STREAM-API-SECRET
 */

const BASE_URL = 'https://chat.stream-io-api.com';

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
        description: 'Verify Stream credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_channels',
        description: 'List all channels',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of channels to return (default 10)' },
            },
        },
    },
    {
        name: 'get_channel',
        description: 'Get a channel by type and ID',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string', description: 'Channel type (e.g. messaging, team)' },
                id: { type: 'string', description: 'Channel ID' },
            },
            required: ['type', 'id'],
        },
    },
    {
        name: 'create_channel',
        description: 'Create a new channel',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string', description: 'Channel type (e.g. messaging, team)' },
                id: { type: 'string', description: 'Channel ID' },
                name: { type: 'string', description: 'Channel display name' },
                members: { type: 'array', items: { type: 'string' }, description: 'Optional member user IDs' },
            },
            required: ['type', 'id', 'name'],
        },
    },
    {
        name: 'send_message',
        description: 'Send a message to a channel',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string', description: 'Channel type' },
                id: { type: 'string', description: 'Channel ID' },
                text: { type: 'string', description: 'Message text' },
                user_id: { type: 'string', description: 'ID of the user sending the message' },
            },
            required: ['type', 'id', 'text', 'user_id'],
        },
    },
    {
        name: 'list_messages',
        description: 'List messages in a channel',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string', description: 'Channel type' },
                id: { type: 'string', description: 'Channel ID' },
                limit: { type: 'number', description: 'Number of messages to return (default 20)' },
            },
            required: ['type', 'id'],
        },
    },
    {
        name: 'create_user',
        description: 'Create or update a user',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'Unique user ID' },
                name: { type: 'string', description: 'User display name' },
            },
            required: ['user_id', 'name'],
        },
    },
    {
        name: 'delete_channel',
        description: 'Delete a channel',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string', description: 'Channel type' },
                id: { type: 'string', description: 'Channel ID' },
            },
            required: ['type', 'id'],
        },
    },
];

function makeAuthHeaders(apiKey: string, apiSecret: string): Record<string, string> {
    const credentials = btoa(`${apiKey}:${apiSecret}`);
    return {
        'Authorization': `Basic ${credentials}`,
        'stream-auth-type': 'basic',
        'Content-Type': 'application/json',
    };
}

async function callApi(
    method: string,
    path: string,
    apiKey: string,
    apiSecret: string,
    body?: unknown,
): Promise<unknown> {
    const opts: RequestInit = {
        method,
        headers: makeAuthHeaders(apiKey, apiSecret),
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, opts);
    if (res.status === 204) return { success: true };
    const text = await res.text();
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    if (!res.ok) {
        if (res.status === 401) throw new Error('Invalid or expired API credentials');
        if (res.status === 403) throw new Error('Insufficient permissions for this action');
        if (res.status === 404) throw new Error('Resource not found');
        if (res.status === 429) throw new Error('Rate limit exceeded — try again later');
        const msg = (data.message ?? data.error ?? data.detail ?? text) as string;
        throw new Error(`API error ${res.status}: ${msg}`);
    }
    return data;
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
    apiSecret: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const payload = encodeURIComponent(JSON.stringify({ filter_conditions: {}, limit: 1 }));
            await callApi('GET', `/channels?payload=${payload}`, apiKey, apiSecret);
            return { content: [{ type: 'text', text: 'Connected to Stream' }] };
        }
        case 'list_channels': {
            const limit = (args.limit as number | undefined) ?? 10;
            const payload = encodeURIComponent(JSON.stringify({ filter_conditions: {}, limit }));
            return callApi('GET', `/channels?payload=${payload}`, apiKey, apiSecret);
        }
        case 'get_channel': {
            return callApi('GET', `/channels/${encodeURIComponent(String(args.type))}/${encodeURIComponent(String(args.id))}`, apiKey, apiSecret);
        }
        case 'create_channel': {
            const data: Record<string, unknown> = { name: args.name };
            if (args.members) data.members = args.members;
            return callApi('POST', `/channels/${encodeURIComponent(String(args.type))}/${encodeURIComponent(String(args.id))}`, apiKey, apiSecret, { data });
        }
        case 'send_message': {
            const body = { message: { text: args.text, user_id: args.user_id } };
            return callApi('POST', `/channels/${args.type}/${args.id}/message`, apiKey, apiSecret, body);
        }
        case 'list_messages': {
            const limit = (args.limit as number | undefined) ?? 20;
            return callApi('POST', `/channels/${args.type}/${args.id}/query`, apiKey, apiSecret, { messages: { limit } });
        }
        case 'create_user': {
            const userId = args.user_id as string;
            return callApi('POST', '/users', apiKey, apiSecret, { users: { [userId]: { id: userId, name: args.name } } });
        }
        case 'delete_channel': {
            return callApi('DELETE', `/channels/${encodeURIComponent(String(args.type))}/${encodeURIComponent(String(args.id))}`, apiKey, apiSecret);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-stream', version: '1.0.0', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
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
                serverInfo: { name: 'mcp-stream', version: '1.0.0' },
            });
        }
        if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });
        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
            const apiKey = request.headers.get('X-Mcp-Secret-STREAM-API-KEY');
            const apiSecret = request.headers.get('X-Mcp-Secret-STREAM-API-SECRET');
            if (!apiKey) return rpcErr(id, -32001, 'Missing STREAM_API_KEY — add it to workspace secrets');
            if (!apiSecret) return rpcErr(id, -32001, 'Missing STREAM_API_SECRET — add it to workspace secrets');
            try {
                const result = await callTool(toolName, toolArgs, apiKey, apiSecret);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            }
        }
        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
