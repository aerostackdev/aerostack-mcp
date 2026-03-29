/**
 * LINE Messaging API MCP Worker
 * Implements MCP protocol over HTTP for LINE Bot messaging operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   LINE_CHANNEL_ACCESS_TOKEN → X-Mcp-Secret-LINE-CHANNEL-ACCESS-TOKEN
 *
 * Auth format: Authorization: Bearer {token} on all requests
 * Base URL: https://api.line.me/v2
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

const LINE_BASE = 'https://api.line.me/v2';

async function lineFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${LINE_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 200 && res.headers.get('content-length') === '0') return {};

    const text = await res.text();
    if (!text) return {};

    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`LINE HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'message' in data) {
            msg = (data as { message: string }).message || msg;
        }
        throw new Error(`LINE API error ${res.status}: ${msg}`);
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'send_push_message',
        description: 'Send a push message to a specific user by userId.',
        inputSchema: {
            type: 'object',
            properties: {
                to: { type: 'string', description: 'Target user ID' },
                text: { type: 'string', description: 'Message text to send' },
            },
            required: ['to', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_multicast',
        description: 'Send a message to multiple users (up to 500) at once.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of target user IDs (max 500)',
                },
                text: { type: 'string', description: 'Message text to send' },
            },
            required: ['to', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'broadcast_message',
        description: 'Broadcast a message to all users who have added the bot as a friend.',
        inputSchema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'Message text to broadcast' },
            },
            required: ['text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_profile',
        description: 'Get the profile of a LINE user by userId.',
        inputSchema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: 'LINE user ID' },
            },
            required: ['userId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_bot_info',
        description: 'Get bot info including basic info and message quota.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_message_quota',
        description: 'Get remaining monthly message quota for the bot.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_rich_menu',
        description: 'Create a rich menu for the bot.',
        inputSchema: {
            type: 'object',
            properties: {
                width: { type: 'number', description: 'Menu width in pixels (2500 or 1200)' },
                height: { type: 'number', description: 'Menu height in pixels (1686, 843, or 405)' },
                selected: { type: 'boolean', description: 'Whether the menu is shown by default' },
                name: { type: 'string', description: 'Name of the rich menu' },
                chatBarText: { type: 'string', description: 'Text displayed in the chat bar (max 14 chars)' },
                areas: {
                    type: 'array',
                    description: 'Array of tappable area objects',
                    items: { type: 'object' },
                },
            },
            required: ['width', 'height', 'selected', 'name', 'chatBarText', 'areas'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        case 'send_push_message': {
            validateRequired(args, ['to', 'text']);
            return lineFetch('/bot/message/push', token, {
                method: 'POST',
                body: JSON.stringify({
                    to: args.to,
                    messages: [{ type: 'text', text: args.text }],
                }),
            });
        }

        case 'send_multicast': {
            validateRequired(args, ['to', 'text']);
            return lineFetch('/bot/message/multicast', token, {
                method: 'POST',
                body: JSON.stringify({
                    to: args.to,
                    messages: [{ type: 'text', text: args.text }],
                }),
            });
        }

        case 'broadcast_message': {
            validateRequired(args, ['text']);
            return lineFetch('/bot/message/broadcast', token, {
                method: 'POST',
                body: JSON.stringify({
                    messages: [{ type: 'text', text: args.text }],
                }),
            });
        }

        case 'get_profile': {
            validateRequired(args, ['userId']);
            return lineFetch(`/bot/profile/${args.userId}`, token);
        }

        case 'get_bot_info':
            return lineFetch('/bot/info', token);

        case 'get_message_quota':
            return lineFetch('/bot/message/quota', token);

        case 'create_rich_menu': {
            validateRequired(args, ['width', 'height', 'selected', 'name', 'chatBarText', 'areas']);
            return lineFetch('/bot/richmenu', token, {
                method: 'POST',
                body: JSON.stringify({
                    size: { width: args.width, height: args.height },
                    selected: args.selected,
                    name: args.name,
                    chatBarText: args.chatBarText,
                    areas: args.areas,
                }),
            });
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
                JSON.stringify({ status: 'ok', server: 'mcp-line', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-line', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const token = request.headers.get('X-Mcp-Secret-LINE-CHANNEL-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing required secret: LINE_CHANNEL_ACCESS_TOKEN (header: X-Mcp-Secret-LINE-CHANNEL-ACCESS-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, token);
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
