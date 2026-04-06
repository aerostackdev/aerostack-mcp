/**
 * Help Scout MCP Worker
 * Implements MCP protocol over HTTP for Help Scout customer support operations.
 * Secrets received via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   HELPSCOUT_ACCESS_TOKEN → X-Mcp-Secret-HELPSCOUT-ACCESS-TOKEN
 *
 * Auth: Authorization: Bearer {token}
 * Base URL: https://api.helpscout.net/v2
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpcOk(id: string | number | null, result: unknown): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: string | number | null, code: number, message: string): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    const missing = fields.filter(f => args[f] === undefined || args[f] === null || args[f] === '');
    if (missing.length > 0) throw new Error(`Missing required fields: ${missing.join(', ')}`);
}

const API_BASE = 'https://api.helpscout.net/v2';

async function hsFetch(token: string, path: string, options: RequestInit = {}): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });
    if (res.status === 204) return {};
    const text = await res.text();
    if (!text) return {};
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw { code: -32603, message: `Help Scout HTTP ${res.status}: ${text}` }; }
    if (!res.ok) {
        const d = data as Record<string, unknown>;
        const msg = (d?.message as string) || res.statusText;
        throw { code: -32603, message: `Help Scout API error ${res.status}: ${msg}` };
    }
    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Help Scout credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_conversations',
        description: 'List active conversations. Returns paginated conversation summaries.',
        inputSchema: {
            type: 'object',
            properties: {
                status: { type: 'string', description: 'Filter by status: active, closed, pending, spam (default: active)' },
                page: { type: 'number', description: 'Page number (default: 1)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_conversation',
        description: 'Get full details of a conversation by ID.',
        inputSchema: {
            type: 'object',
            properties: { conversationId: { type: 'number', description: 'Help Scout conversation ID' } },
            required: ['conversationId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_conversation',
        description: 'Create a new email conversation.',
        inputSchema: {
            type: 'object',
            properties: {
                subject: { type: 'string', description: 'Conversation subject' },
                customerEmail: { type: 'string', description: 'Customer email address' },
                mailboxId: { type: 'number', description: 'Mailbox ID to create conversation in' },
                text: { type: 'string', description: 'Initial message text' },
            },
            required: ['subject', 'customerEmail', 'mailboxId', 'text'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'reply_to_conversation',
        description: 'Reply to an existing conversation thread.',
        inputSchema: {
            type: 'object',
            properties: {
                conversationId: { type: 'number', description: 'Conversation ID to reply to' },
                text: { type: 'string', description: 'Reply text content' },
                status: { type: 'string', description: 'Set conversation status after reply: active, closed, pending' },
            },
            required: ['conversationId', 'text'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_conversation',
        description: 'Update conversation status, assignee, or tags.',
        inputSchema: {
            type: 'object',
            properties: {
                conversationId: { type: 'number', description: 'Conversation ID to update' },
                status: { type: 'string', description: 'New status: active, closed, pending, spam' },
                assignTo: { type: 'number', description: 'Assign to user ID' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Array of tag names' },
            },
            required: ['conversationId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'delete_conversation',
        description: 'Permanently delete a conversation.',
        inputSchema: {
            type: 'object',
            properties: { conversationId: { type: 'number', description: 'Conversation ID to delete' } },
            required: ['conversationId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_mailboxes',
        description: 'List all mailboxes in the Help Scout account.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_mailbox',
        description: 'Get details of a specific mailbox.',
        inputSchema: {
            type: 'object',
            properties: { mailboxId: { type: 'number', description: 'Mailbox ID' } },
            required: ['mailboxId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_customers',
        description: 'List customers with pagination.',
        inputSchema: {
            type: 'object',
            properties: { page: { type: 'number', description: 'Page number (default: 1)' } },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_customer',
        description: 'Get customer details by ID.',
        inputSchema: {
            type: 'object',
            properties: { customerId: { type: 'number', description: 'Customer ID' } },
            required: ['customerId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_customer',
        description: 'Create a new customer.',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Customer email address' },
                firstName: { type: 'string', description: 'First name' },
                lastName: { type: 'string', description: 'Last name' },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_customer',
        description: 'Update an existing customer record.',
        inputSchema: {
            type: 'object',
            properties: {
                customerId: { type: 'number', description: 'Customer ID to update' },
                firstName: { type: 'string', description: 'Updated first name' },
                lastName: { type: 'string', description: 'Updated last name' },
            },
            required: ['customerId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_tags',
        description: 'List all tags in the account.',
        inputSchema: {
            type: 'object',
            properties: { page: { type: 'number', description: 'Page number (default: 1)' } },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'search_conversations',
        description: 'Search conversations by query string.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query string' },
                status: { type: 'string', description: 'Filter by status (default: all)' },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true },
    },
];

// ── Request handler ───────────────────────────────────────────────────────────

async function handleRequest(request: Request): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', mcp: 'mcp-helpscout' }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    let body: { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
    try {
        body = await request.json() as typeof body;
    } catch {
        return rpcErr(null, -32700, 'Parse error: invalid JSON');
    }

    const id = body.id ?? null;

    if (body.method === 'initialize') {
        return rpcOk(id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'mcp-helpscout', version: '1.0.0' },
        });
    }

    if (body.method === 'tools/list') {
        return rpcOk(id, { tools: TOOLS });
    }

    if (body.method === 'tools/call') {
        const token = request.headers.get('X-Mcp-Secret-HELPSCOUT-ACCESS-TOKEN');
        if (!token) return rpcErr(id, -32001, 'Missing required secret: HELPSCOUT_ACCESS_TOKEN');

        const toolName = (body.params?.name ?? '') as string;
        const args = (body.params?.arguments ?? {}) as Record<string, unknown>;

        try {
            const result = await dispatchTool(token, toolName, args);
            return rpcOk(id, result);
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err) {
                const e = err as { code: number; message: string };
                return rpcErr(id, e.code, e.message);
            }
            return rpcErr(id, -32603, err instanceof Error ? err.message : String(err));
        }
    }

    return rpcErr(id, -32601, `Method not found: ${body.method}`);
}

async function dispatchTool(token: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const data = await hsFetch(token, '/users/me') as { firstName?: string; lastName?: string; email?: string };
            return toolOk({ connected: true, email: data.email ?? `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() || 'unknown' });
        }

        case 'list_conversations': {
            const status = (args.status as string) ?? 'active';
            const page = (args.page as number) ?? 1;
            const data = await hsFetch(token, `/conversations?status=${status}&page=${page}`);
            return toolOk(data);
        }
        case 'get_conversation': {
            validateRequired(args, ['conversationId']);
            const data = await hsFetch(token, `/conversations/${args.conversationId}`);
            return toolOk(data);
        }
        case 'create_conversation': {
            validateRequired(args, ['subject', 'customerEmail', 'mailboxId', 'text']);
            const data = await hsFetch(token, '/conversations', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'email',
                    subject: args.subject,
                    customer: { email: args.customerEmail },
                    mailboxId: args.mailboxId,
                    threads: [{ type: 'customer', customer: { email: args.customerEmail }, text: args.text }],
                }),
            });
            return toolOk(data);
        }
        case 'reply_to_conversation': {
            validateRequired(args, ['conversationId', 'text']);
            const body: Record<string, unknown> = { type: 'reply', text: args.text };
            if (args.status) body.status = args.status;
            const data = await hsFetch(token, `/conversations/${args.conversationId}/threads`, {
                method: 'POST',
                body: JSON.stringify(body),
            });
            return toolOk(data);
        }
        case 'update_conversation': {
            validateRequired(args, ['conversationId']);
            const body: Record<string, unknown> = {};
            if (args.status !== undefined) body.status = args.status;
            if (args.assignTo !== undefined) body.assignTo = args.assignTo;
            if (args.tags !== undefined) body.tags = args.tags;
            const data = await hsFetch(token, `/conversations/${args.conversationId}`, {
                method: 'PATCH',
                body: JSON.stringify(body),
            });
            return toolOk(data);
        }
        case 'delete_conversation': {
            validateRequired(args, ['conversationId']);
            await hsFetch(token, `/conversations/${args.conversationId}`, { method: 'DELETE' });
            return toolOk({ deleted: true });
        }
        case 'list_mailboxes': {
            const data = await hsFetch(token, '/mailboxes');
            return toolOk(data);
        }
        case 'get_mailbox': {
            validateRequired(args, ['mailboxId']);
            const data = await hsFetch(token, `/mailboxes/${args.mailboxId}`);
            return toolOk(data);
        }
        case 'list_customers': {
            const page = (args.page as number) ?? 1;
            const data = await hsFetch(token, `/customers?page=${page}`);
            return toolOk(data);
        }
        case 'get_customer': {
            validateRequired(args, ['customerId']);
            const data = await hsFetch(token, `/customers/${args.customerId}`);
            return toolOk(data);
        }
        case 'create_customer': {
            validateRequired(args, ['email']);
            const data = await hsFetch(token, '/customers', {
                method: 'POST',
                body: JSON.stringify({
                    firstName: args.firstName,
                    lastName: args.lastName,
                    emails: [{ value: args.email, type: 'work' }],
                }),
            });
            return toolOk(data);
        }
        case 'update_customer': {
            validateRequired(args, ['customerId']);
            const { customerId, ...rest } = args;
            const data = await hsFetch(token, `/customers/${customerId}`, {
                method: 'PATCH',
                body: JSON.stringify(rest),
            });
            return toolOk(data);
        }
        case 'list_tags': {
            const page = (args.page as number) ?? 1;
            const data = await hsFetch(token, `/tags?page=${page}`);
            return toolOk(data);
        }
        case 'search_conversations': {
            validateRequired(args, ['query']);
            const status = (args.status as string) ?? 'all';
            const data = await hsFetch(token, `/conversations?query=${encodeURIComponent(args.query as string)}&status=${status}`);
            return toolOk(data);
        }
        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

export default { fetch: handleRequest };
