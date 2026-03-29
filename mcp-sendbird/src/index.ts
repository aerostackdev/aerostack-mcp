/**
 * Sendbird MCP Worker
 * Secret: SENDBIRD_API_TOKEN → header: X-Mcp-Secret-SENDBIRD-API-TOKEN
 * Secret: SENDBIRD_APP_ID → header: X-Mcp-Secret-SENDBIRD-APP-ID
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
        name: 'list_channels',
        description: 'List group channels',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of channels to return (default 10)' },
            },
        },
    },
    {
        name: 'get_channel',
        description: 'Get a group channel by URL',
        inputSchema: {
            type: 'object',
            properties: {
                channel_url: { type: 'string', description: 'The channel URL' },
            },
            required: ['channel_url'],
        },
    },
    {
        name: 'create_channel',
        description: 'Create a new group channel',
        inputSchema: {
            type: 'object',
            properties: {
                user_ids: { type: 'array', items: { type: 'string' }, description: 'User IDs to add to the channel' },
                name: { type: 'string', description: 'Channel name' },
                channel_url: { type: 'string', description: 'Optional custom channel URL' },
            },
            required: ['user_ids', 'name'],
        },
    },
    {
        name: 'send_message',
        description: 'Send a message to a group channel',
        inputSchema: {
            type: 'object',
            properties: {
                channel_url: { type: 'string', description: 'The channel URL' },
                user_id: { type: 'string', description: 'ID of the user sending the message' },
                message: { type: 'string', description: 'Message text' },
            },
            required: ['channel_url', 'user_id', 'message'],
        },
    },
    {
        name: 'list_messages',
        description: 'List messages in a group channel',
        inputSchema: {
            type: 'object',
            properties: {
                channel_url: { type: 'string', description: 'The channel URL' },
                limit: { type: 'number', description: 'Number of messages to return (default 20)' },
            },
            required: ['channel_url'],
        },
    },
    {
        name: 'list_users',
        description: 'List users in the application',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of users to return (default 10)' },
            },
        },
    },
    {
        name: 'create_user',
        description: 'Create a new user',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'Unique user ID' },
                nickname: { type: 'string', description: 'Display nickname' },
                profile_url: { type: 'string', description: 'Optional profile image URL' },
            },
            required: ['user_id', 'nickname'],
        },
    },
    {
        name: 'delete_message',
        description: 'Delete a message from a group channel',
        inputSchema: {
            type: 'object',
            properties: {
                channel_url: { type: 'string', description: 'The channel URL' },
                message_id: { type: 'string', description: 'The message ID to delete' },
            },
            required: ['channel_url', 'message_id'],
        },
    },
];

async function callApi(
    method: string,
    path: string,
    apiToken: string,
    appId: string,
    body?: unknown,
): Promise<unknown> {
    const baseUrl = `https://api-${appId}.sendbird.com/v3`;
    const opts: RequestInit = {
        method,
        headers: {
            'Api-Token': apiToken,
            'Content-Type': 'application/json',
        },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${baseUrl}${path}`, opts);
    if (res.status === 204) return { success: true };
    const text = await res.text();
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    if (!res.ok) {
        if (res.status === 401) throw new Error('Invalid or expired API token');
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
    apiToken: string,
    appId: string,
): Promise<unknown> {
    switch (name) {
        case 'list_channels': {
            const limit = (args.limit as number | undefined) ?? 10;
            return callApi('GET', `/group_channels?limit=${limit}`, apiToken, appId);
        }
        case 'get_channel': {
            const channelUrl = args.channel_url as string;
            return callApi('GET', `/group_channels/${encodeURIComponent(channelUrl)}`, apiToken, appId);
        }
        case 'create_channel': {
            const body: Record<string, unknown> = {
                user_ids: args.user_ids,
                name: args.name,
            };
            if (args.channel_url) body.channel_url = args.channel_url;
            return callApi('POST', '/group_channels', apiToken, appId, body);
        }
        case 'send_message': {
            const channelUrl = args.channel_url as string;
            const body = {
                message_type: 'MESG',
                user_id: args.user_id,
                message: args.message,
            };
            return callApi('POST', `/group_channels/${encodeURIComponent(channelUrl)}/messages`, apiToken, appId, body);
        }
        case 'list_messages': {
            const channelUrl = args.channel_url as string;
            const limit = (args.limit as number | undefined) ?? 20;
            return callApi('GET', `/group_channels/${encodeURIComponent(channelUrl)}/messages?limit=${limit}`, apiToken, appId);
        }
        case 'list_users': {
            const limit = (args.limit as number | undefined) ?? 10;
            return callApi('GET', `/users?limit=${limit}`, apiToken, appId);
        }
        case 'create_user': {
            const body: Record<string, unknown> = {
                user_id: args.user_id,
                nickname: args.nickname,
            };
            if (args.profile_url) body.profile_url = args.profile_url;
            return callApi('POST', '/users', apiToken, appId, body);
        }
        case 'delete_message': {
            const channelUrl = args.channel_url as string;
            const messageId = args.message_id as string;
            return callApi('DELETE', `/group_channels/${encodeURIComponent(channelUrl)}/messages/${messageId}`, apiToken, appId);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-sendbird', version: '1.0.0', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-sendbird', version: '1.0.0' },
            });
        }
        if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });
        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
            const apiToken = request.headers.get('X-Mcp-Secret-SENDBIRD-API-TOKEN');
            const appId = request.headers.get('X-Mcp-Secret-SENDBIRD-APP-ID');
            if (!apiToken) return rpcErr(id, -32001, 'Missing SENDBIRD_API_TOKEN — add it to workspace secrets');
            if (!appId) return rpcErr(id, -32001, 'Missing SENDBIRD_APP_ID — add it to workspace secrets');
            try {
                const result = await callTool(toolName, toolArgs, apiToken, appId);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            }
        }
        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
