/**
 * Viber Bot API MCP Worker
 * Implements MCP protocol over HTTP for Viber Bot messaging operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   VIBER_AUTH_TOKEN → X-Mcp-Secret-VIBER-AUTH-TOKEN
 *
 * Auth format: X-Viber-Auth-Token: {token} on all requests
 * Base URL: https://chatapi.viber.com/pa
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

const VIBER_BASE = 'https://chatapi.viber.com/pa';

async function viberFetch(
    path: string,
    token: string,
    body: unknown,
): Promise<unknown> {
    const url = `${VIBER_BASE}${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'X-Viber-Auth-Token': token,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Viber HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'status_message' in data) {
            msg = (data as { status_message: string }).status_message || msg;
        }
        throw new Error(`Viber API error ${res.status}: ${msg}`);
    }

    // Viber returns status 0 = success in the body
    if (data && typeof data === 'object' && 'status' in data) {
        const d = data as { status: number; status_message: string };
        if (d.status !== 0) {
            throw new Error(`Viber error ${d.status}: ${d.status_message}`);
        }
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Viber credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_account_info',
        description: 'Get the bot account info including name, uri, category, and subscribers count.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'send_text_message',
        description: 'Send a text message to a specific Viber user.',
        inputSchema: {
            type: 'object',
            properties: {
                receiver: { type: 'string', description: 'Target Viber user ID' },
                text: { type: 'string', description: 'Message text to send' },
                sender_name: { type: 'string', description: 'Sender display name' },
            },
            required: ['receiver', 'text', 'sender_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_picture_message',
        description: 'Send a picture message with optional caption to a Viber user.',
        inputSchema: {
            type: 'object',
            properties: {
                receiver: { type: 'string', description: 'Target Viber user ID' },
                text: { type: 'string', description: 'Caption text for the image' },
                media: { type: 'string', description: 'URL of the image (JPEG only, max 1MB)' },
                sender_name: { type: 'string', description: 'Sender display name' },
            },
            required: ['receiver', 'text', 'media', 'sender_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'broadcast_message',
        description: 'Broadcast a text message to multiple Viber users (max 300 per request).',
        inputSchema: {
            type: 'object',
            properties: {
                broadcast_list: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of Viber user IDs to broadcast to (max 300)',
                },
                text: { type: 'string', description: 'Message text to broadcast' },
                sender_name: { type: 'string', description: 'Sender display name' },
            },
            required: ['broadcast_list', 'text', 'sender_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_user_details',
        description: 'Get details of a specific Viber user by their user ID.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'Viber user ID' },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // POST /get_account_info — validates auth token
            const data = (await viberFetch('/get_account_info', token, {})) as any;
            return { connected: true, name: data?.name ?? 'unknown', uri: data?.uri ?? 'unknown' };
        }

        case 'get_account_info':
            return viberFetch('/get_account_info', token, {});

        case 'send_text_message': {
            validateRequired(args, ['receiver', 'text', 'sender_name']);
            return viberFetch('/send_message', token, {
                receiver: args.receiver,
                type: 'text',
                text: args.text,
                sender: { name: args.sender_name },
            });
        }

        case 'send_picture_message': {
            validateRequired(args, ['receiver', 'text', 'media', 'sender_name']);
            return viberFetch('/send_message', token, {
                receiver: args.receiver,
                type: 'picture',
                text: args.text,
                media: args.media,
                sender: { name: args.sender_name },
            });
        }

        case 'broadcast_message': {
            validateRequired(args, ['broadcast_list', 'text', 'sender_name']);
            return viberFetch('/broadcast_message', token, {
                broadcast_list: args.broadcast_list,
                type: 'text',
                text: args.text,
                sender: { name: args.sender_name },
            });
        }

        case 'get_user_details': {
            validateRequired(args, ['user_id']);
            return viberFetch('/get_user_details', token, { id: args.user_id });
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
                JSON.stringify({ status: 'ok', server: 'mcp-viber', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-viber', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const token = request.headers.get('X-Mcp-Secret-VIBER-AUTH-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing required secret: VIBER_AUTH_TOKEN (header: X-Mcp-Secret-VIBER-AUTH-TOKEN)');
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
