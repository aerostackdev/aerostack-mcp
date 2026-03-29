/**
 * Novu MCP Worker
 * Implements MCP protocol over HTTP for Novu notification infrastructure operations.
 *
 * Secrets required:
 *   NOVU_API_KEY → X-Mcp-Secret-NOVU-API-KEY
 *
 * Auth: Authorization: ApiKey {api_key}
 * Base URL: https://api.novu.co/v1
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

const BASE_URL = 'https://api.novu.co/v1';

async function novuFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `ApiKey ${apiKey}`,
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
        throw { code: -32603, message: `Novu HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'message' in data) {
            msg = String((data as { message: unknown }).message) || msg;
        }
        throw { code: -32603, message: `Novu API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'trigger_event',
        description: 'Trigger a Novu workflow/notification event for a subscriber. Specify the workflow ID, recipient subscriber, and event payload.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Workflow/event trigger identifier' },
                subscriberId: { type: 'string', description: 'Subscriber ID to send notification to' },
                email: { type: 'string', description: 'Optional subscriber email address' },
                payload: { type: 'object', description: 'Event payload data for template variables', additionalProperties: true },
            },
            required: ['name', 'subscriberId'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'bulk_trigger',
        description: 'Trigger multiple Novu notification events in a single API call.',
        inputSchema: {
            type: 'object',
            properties: {
                events: {
                    type: 'array',
                    description: 'Array of events to trigger',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Workflow trigger identifier' },
                            subscriberId: { type: 'string', description: 'Subscriber ID' },
                            email: { type: 'string', description: 'Subscriber email' },
                            payload: { type: 'object', description: 'Event payload', additionalProperties: true },
                        },
                        required: ['name', 'subscriberId'],
                    },
                },
            },
            required: ['events'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'cancel_event',
        description: 'Cancel a scheduled or queued Novu notification event by transaction ID.',
        inputSchema: {
            type: 'object',
            properties: {
                transaction_id: { type: 'string', description: 'Transaction ID of the event to cancel' },
            },
            required: ['transaction_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_subscribers',
        description: 'List subscribers in your Novu environment with pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (default 0)' },
                limit: { type: 'number', description: 'Number of results per page (default 10)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_subscriber',
        description: 'Create a new subscriber in Novu.',
        inputSchema: {
            type: 'object',
            properties: {
                subscriberId: { type: 'string', description: 'Unique subscriber identifier (required)' },
                email: { type: 'string', description: 'Subscriber email address' },
                firstName: { type: 'string', description: 'Subscriber first name' },
                lastName: { type: 'string', description: 'Subscriber last name' },
                phone: { type: 'string', description: 'Subscriber phone number' },
            },
            required: ['subscriberId'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_subscriber',
        description: 'Get a subscriber\'s details by subscriber ID.',
        inputSchema: {
            type: 'object',
            properties: {
                subscriber_id: { type: 'string', description: 'Novu subscriber ID' },
            },
            required: ['subscriber_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_subscriber',
        description: 'Update an existing subscriber\'s properties.',
        inputSchema: {
            type: 'object',
            properties: {
                subscriber_id: { type: 'string', description: 'Novu subscriber ID to update' },
                email: { type: 'string', description: 'Updated email address' },
                firstName: { type: 'string', description: 'Updated first name' },
                lastName: { type: 'string', description: 'Updated last name' },
                phone: { type: 'string', description: 'Updated phone number' },
                data: { type: 'object', description: 'Custom subscriber data', additionalProperties: true },
            },
            required: ['subscriber_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_subscriber',
        description: 'Delete a subscriber from Novu by subscriber ID.',
        inputSchema: {
            type: 'object',
            properties: {
                subscriber_id: { type: 'string', description: 'Novu subscriber ID to delete' },
            },
            required: ['subscriber_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case 'trigger_event': {
            validateRequired(args, ['name', 'subscriberId']);
            const body: Record<string, unknown> = {
                name: args.name,
                to: { subscriberId: args.subscriberId },
                payload: args.payload ?? {},
            };
            if (args.email) {
                (body.to as Record<string, unknown>).email = args.email;
            }
            return novuFetch('/events/trigger', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'bulk_trigger': {
            validateRequired(args, ['events']);
            const events = (args.events as Array<Record<string, unknown>>).map(e => ({
                name: e.name,
                to: { subscriberId: e.subscriberId, ...(e.email ? { email: e.email } : {}) },
                payload: e.payload ?? {},
            }));
            return novuFetch('/events/trigger/bulk', apiKey, {
                method: 'POST',
                body: JSON.stringify({ events }),
            });
        }

        case 'cancel_event': {
            validateRequired(args, ['transaction_id']);
            return novuFetch(`/events/cancel/${args.transaction_id}`, apiKey, {
                method: 'DELETE',
            });
        }

        case 'list_subscribers': {
            const params = new URLSearchParams();
            params.set('page', String(args.page ?? 0));
            params.set('limit', String(args.limit ?? 10));
            return novuFetch(`/subscribers?${params.toString()}`, apiKey);
        }

        case 'create_subscriber': {
            validateRequired(args, ['subscriberId']);
            const body: Record<string, unknown> = { subscriberId: args.subscriberId };
            for (const key of ['email', 'firstName', 'lastName', 'phone']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return novuFetch('/subscribers', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_subscriber': {
            validateRequired(args, ['subscriber_id']);
            return novuFetch(`/subscribers/${args.subscriber_id}`, apiKey);
        }

        case 'update_subscriber': {
            validateRequired(args, ['subscriber_id']);
            const { subscriber_id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['email', 'firstName', 'lastName', 'phone', 'data']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return novuFetch(`/subscribers/${subscriber_id}`, apiKey, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'delete_subscriber': {
            validateRequired(args, ['subscriber_id']);
            return novuFetch(`/subscribers/${args.subscriber_id}`, apiKey, {
                method: 'DELETE',
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
                JSON.stringify({ status: 'ok', server: 'mcp-novu', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-novu', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const apiKey = request.headers.get('X-Mcp-Secret-NOVU-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: NOVU_API_KEY (header: X-Mcp-Secret-NOVU-API-KEY)');
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
