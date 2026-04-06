/**
 * Courier MCP Worker
 * Implements MCP protocol over HTTP for Courier multi-channel notification operations.
 *
 * Secrets required:
 *   COURIER_API_KEY → X-Mcp-Secret-COURIER-API-KEY
 *
 * Auth: Authorization: Bearer {api_key}
 * Base URL: https://api.courier.com
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

const BASE_URL = 'https://api.courier.com';

async function courierFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return { success: true };

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Courier HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'message' in data) {
            msg = String((data as { message: unknown }).message) || msg;
        }
        throw { code: -32603, message: `Courier API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Courier credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'send',
        description: 'Send a notification via Courier. Supports email, push, SMS, and other channels through templates or inline content.',
        inputSchema: {
            type: 'object',
            properties: {
                to_email: { type: 'string', description: 'Recipient email address' },
                to_user_id: { type: 'string', description: 'Recipient user/profile ID' },
                template: { type: 'string', description: 'Courier notification template ID' },
                title: { type: 'string', description: 'Notification title (for inline content)' },
                body: { type: 'string', description: 'Notification body text (for inline content)' },
                routing_method: { type: 'string', enum: ['all', 'single'], description: 'Routing method: all=send to all channels, single=send to first available' },
                channels: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of channels to route to (e.g. ["email", "push"])',
                },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_message',
        description: 'Get delivery status and details of a sent Courier message by message ID.',
        inputSchema: {
            type: 'object',
            properties: {
                message_id: { type: 'string', description: 'Courier message ID' },
            },
            required: ['message_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_messages',
        description: 'List recently sent messages and their delivery statuses.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of messages to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_profile',
        description: 'Get recipient profile data stored in Courier by recipient ID.',
        inputSchema: {
            type: 'object',
            properties: {
                recipient_id: { type: 'string', description: 'Courier recipient/profile ID' },
            },
            required: ['recipient_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'upsert_profile',
        description: 'Create or update a recipient profile in Courier.',
        inputSchema: {
            type: 'object',
            properties: {
                recipient_id: { type: 'string', description: 'Courier recipient ID (required)' },
                email: { type: 'string', description: 'Profile email address' },
                phone_number: { type: 'string', description: 'Profile phone number' },
            },
            required: ['recipient_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_templates',
        description: 'List available Courier notification templates.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of templates to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_brands',
        description: 'List brand themes/configurations in Courier.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of brands to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            return courierFetch('/messages?limit=1', apiKey);
        }

        case 'send': {
            const to: Record<string, unknown> = {};
            if (args.to_email) to.email = args.to_email;
            if (args.to_user_id) to.user_id = args.to_user_id;

            const message: Record<string, unknown> = { to };
            if (args.template) message.template = args.template;
            if (args.title || args.body) {
                message.content = {
                    title: args.title ?? '',
                    body: args.body ?? '',
                };
            }
            if (args.routing_method || args.channels) {
                message.routing = {
                    method: args.routing_method ?? 'single',
                    channels: args.channels ?? [],
                };
            }

            return courierFetch('/send', apiKey, {
                method: 'POST',
                body: JSON.stringify({ message }),
            });
        }

        case 'get_message': {
            validateRequired(args, ['message_id']);
            return courierFetch(`/messages/${args.message_id}`, apiKey);
        }

        case 'list_messages': {
            const params = new URLSearchParams();
            params.set('limit', String(args.limit ?? 20));
            return courierFetch(`/messages?${params.toString()}`, apiKey);
        }

        case 'get_profile': {
            validateRequired(args, ['recipient_id']);
            return courierFetch(`/profiles/${args.recipient_id}`, apiKey);
        }

        case 'upsert_profile': {
            validateRequired(args, ['recipient_id']);
            const profile: Record<string, unknown> = {};
            if (args.email !== undefined) profile.email = args.email;
            if (args.phone_number !== undefined) profile.phone_number = args.phone_number;
            return courierFetch(`/profiles/${args.recipient_id}`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ profile }),
            });
        }

        case 'list_templates': {
            const params = new URLSearchParams();
            params.set('limit', String(args.limit ?? 20));
            return courierFetch(`/notifications?${params.toString()}`, apiKey);
        }

        case 'list_brands': {
            const params = new URLSearchParams();
            params.set('limit', String(args.limit ?? 20));
            return courierFetch(`/brands?${params.toString()}`, apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-courier', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-courier', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const apiKey = request.headers.get('X-Mcp-Secret-COURIER-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: COURIER_API_KEY (header: X-Mcp-Secret-COURIER-API-KEY)');
            }

            try {
                const result = await callTool(toolName, args, apiKey);
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
