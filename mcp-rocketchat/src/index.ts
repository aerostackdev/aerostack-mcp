/**
 * Rocket.Chat MCP Worker
 * Implements MCP protocol over HTTP for Rocket.Chat team messaging operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   ROCKETCHAT_URL     → X-Mcp-Secret-ROCKETCHAT-URL      (e.g. https://your-instance.rocket.chat)
 *   ROCKETCHAT_TOKEN   → X-Mcp-Secret-ROCKETCHAT-TOKEN    (user auth token)
 *   ROCKETCHAT_USER_ID → X-Mcp-Secret-ROCKETCHAT-USER-ID  (user ID)
 *
 * Auth format: X-Auth-Token + X-User-Id headers on all requests
 * Base URL: {ROCKETCHAT_URL}/api/v1
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

function getSecrets(request: Request): { rcUrl: string | null; rcToken: string | null; rcUserId: string | null } {
    return {
        rcUrl: request.headers.get('X-Mcp-Secret-ROCKETCHAT-URL'),
        rcToken: request.headers.get('X-Mcp-Secret-ROCKETCHAT-TOKEN'),
        rcUserId: request.headers.get('X-Mcp-Secret-ROCKETCHAT-USER-ID'),
    };
}

async function rcFetch(
    baseUrl: string,
    path: string,
    token: string,
    userId: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${baseUrl.replace(/\/$/, '')}/api/v1${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'X-Auth-Token': token,
            'X-User-Id': userId,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Rocket.Chat HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'error' in data) {
            msg = (data as { error: string }).error || msg;
        }
        throw new Error(`Rocket.Chat API error ${res.status}: ${msg}`);
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Rocket.Chat credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_me',
        description: 'Get current user info including id, name, username, email, and status.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_channels',
        description: 'List public channels in the Rocket.Chat server.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of channels to return (default 50)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_channel',
        description: 'Get channel details by channel name.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Channel name (without #)' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_channel',
        description: 'Create a new public channel.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Channel name' },
                members: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional list of usernames to add to the channel',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_message',
        description: 'Send a message to a channel or room.',
        inputSchema: {
            type: 'object',
            properties: {
                channel: { type: 'string', description: 'Channel name with # prefix (e.g. #general) or room ID' },
                text: { type: 'string', description: 'Message text to send' },
            },
            required: ['channel', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_messages',
        description: 'List recent messages in a channel by room ID.',
        inputSchema: {
            type: 'object',
            properties: {
                room_id: { type: 'string', description: 'Room ID to list messages from' },
                limit: { type: 'number', description: 'Number of messages to return (default 50)' },
            },
            required: ['room_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_room_info',
        description: 'Get room details by room ID.',
        inputSchema: {
            type: 'object',
            properties: {
                room_id: { type: 'string', description: 'Room ID to get info for' },
            },
            required: ['room_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_users',
        description: 'List users in the Rocket.Chat server.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of users to return (default 50)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    rcUrl: string,
    rcToken: string,
    rcUserId: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // GET /api/v1/me — validates auth token + user ID
            const data = (await rcFetch(rcUrl, '/me', rcToken, rcUserId)) as any;
            return { connected: true, username: data?.username ?? 'unknown', name: data?.name ?? 'unknown' };
        }

        case 'get_me':
            return rcFetch(rcUrl, '/me', rcToken, rcUserId);

        case 'list_channels': {
            const limit = args.limit ?? 50;
            return rcFetch(rcUrl, `/channels.list?count=${limit}`, rcToken, rcUserId);
        }

        case 'get_channel': {
            validateRequired(args, ['name']);
            return rcFetch(rcUrl, `/channels.info?roomName=${encodeURIComponent(args.name as string)}`, rcToken, rcUserId);
        }

        case 'create_channel': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.members !== undefined) body.members = args.members;
            return rcFetch(rcUrl, '/channels.create', rcToken, rcUserId, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'send_message': {
            validateRequired(args, ['channel', 'text']);
            return rcFetch(rcUrl, '/chat.postMessage', rcToken, rcUserId, {
                method: 'POST',
                body: JSON.stringify({ channel: args.channel, text: args.text }),
            });
        }

        case 'list_messages': {
            validateRequired(args, ['room_id']);
            const limit = args.limit ?? 50;
            return rcFetch(rcUrl, `/channels.messages?roomId=${encodeURIComponent(String(args.room_id))}&count=${limit}`, rcToken, rcUserId);
        }

        case 'get_room_info': {
            validateRequired(args, ['room_id']);
            return rcFetch(rcUrl, `/rooms.info?roomId=${encodeURIComponent(String(args.room_id))}`, rcToken, rcUserId);
        }

        case 'list_users': {
            const limit = args.limit ?? 50;
            return rcFetch(rcUrl, `/users.list?count=${limit}`, rcToken, rcUserId);
        }

        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-rocketchat', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-rocketchat', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const { rcUrl, rcToken, rcUserId } = getSecrets(request);
            if (!rcUrl || !rcToken || !rcUserId) {
                const missing = [];
                if (!rcUrl) missing.push('ROCKETCHAT_URL (header: X-Mcp-Secret-ROCKETCHAT-URL)');
                if (!rcToken) missing.push('ROCKETCHAT_TOKEN (header: X-Mcp-Secret-ROCKETCHAT-TOKEN)');
                if (!rcUserId) missing.push('ROCKETCHAT_USER_ID (header: X-Mcp-Secret-ROCKETCHAT-USER-ID)');
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                const result = await callTool(toolName, args, rcUrl, rcToken, rcUserId);
                return rpcOk(id, toolOk(result));
            } catch (err: unknown) {
                if (err && typeof err === 'object' && 'code' in err) {
                    const e = err as { code: number; message: string };
                    return rpcErr(id, e.code, e.message);
                }
                if (err instanceof Error) {
                    return rpcErr(id, -32603, err.message);
                }
                return rpcErr(id, -32603, 'Internal error');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
