/**
 * Front MCP Worker
 * Implements MCP protocol over HTTP for Front shared inbox operations.
 * Secrets received via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   FRONT_API_TOKEN → X-Mcp-Secret-FRONT-API-TOKEN
 *
 * Auth: Authorization: Bearer {token}
 * Base URL: https://api2.frontapp.com
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

const API_BASE = 'https://api2.frontapp.com';

async function frontFetch(token: string, path: string, options: RequestInit = {}): Promise<unknown> {
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
    try { data = JSON.parse(text); } catch { throw { code: -32603, message: `Front HTTP ${res.status}: ${text}` }; }
    if (!res.ok) {
        const d = data as Record<string, unknown>;
        const msg = (d?.message as string) || res.statusText;
        throw { code: -32603, message: `Front API error ${res.status}: ${msg}` };
    }
    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Front credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_conversations',
        description: 'List conversations in Front with optional status filters.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results to return (default: 25)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_conversation',
        description: 'Get full details of a specific conversation.',
        inputSchema: {
            type: 'object',
            properties: { conversationId: { type: 'string', description: 'Front conversation ID (e.g. cnv_abc123)' } },
            required: ['conversationId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_messages',
        description: 'List all messages in a conversation.',
        inputSchema: {
            type: 'object',
            properties: { conversationId: { type: 'string', description: 'Conversation ID' } },
            required: ['conversationId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_message',
        description: 'Get a specific message by ID.',
        inputSchema: {
            type: 'object',
            properties: { messageId: { type: 'string', description: 'Front message ID (e.g. msg_abc123)' } },
            required: ['messageId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'send_reply',
        description: 'Send a reply to a conversation.',
        inputSchema: {
            type: 'object',
            properties: {
                conversationId: { type: 'string', description: 'Conversation ID to reply to' },
                authorEmail: { type: 'string', description: 'Email of the sender (teammate)' },
                body: { type: 'string', description: 'Reply body text' },
                toHandle: { type: 'string', description: 'Recipient email handle' },
            },
            required: ['conversationId', 'authorEmail', 'body', 'toHandle'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_conversation',
        description: 'Update conversation assignee, status, inbox, or tags.',
        inputSchema: {
            type: 'object',
            properties: {
                conversationId: { type: 'string', description: 'Conversation ID to update' },
                assignee_id: { type: 'string', description: 'Teammate ID to assign to' },
                inbox_id: { type: 'string', description: 'Inbox ID to move to' },
                status: { type: 'string', description: 'New status: assigned, unassigned, archived, deleted, spam' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Tag names to apply' },
            },
            required: ['conversationId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_inboxes',
        description: 'List all inboxes in the Front account.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_inbox',
        description: 'Get details of a specific inbox.',
        inputSchema: {
            type: 'object',
            properties: { inboxId: { type: 'string', description: 'Inbox ID (e.g. inb_abc123)' } },
            required: ['inboxId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_contacts',
        description: 'List contacts with pagination.',
        inputSchema: {
            type: 'object',
            properties: { limit: { type: 'number', description: 'Max results (default: 25)' } },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_contact',
        description: 'Get a contact by ID.',
        inputSchema: {
            type: 'object',
            properties: { contactId: { type: 'string', description: 'Contact ID (e.g. crd_abc123)' } },
            required: ['contactId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_contact',
        description: 'Create a new contact in Front.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Contact name' },
                email: { type: 'string', description: 'Contact email address' },
                description: { type: 'string', description: 'Contact description or notes' },
            },
            required: ['name', 'email'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_contact',
        description: 'Update a contact name or description.',
        inputSchema: {
            type: 'object',
            properties: {
                contactId: { type: 'string', description: 'Contact ID to update' },
                name: { type: 'string', description: 'Updated name' },
                description: { type: 'string', description: 'Updated description' },
            },
            required: ['contactId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_teammates',
        description: 'List all teammates in the Front account.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_conversation_note',
        description: 'Add an internal note to a conversation.',
        inputSchema: {
            type: 'object',
            properties: {
                conversationId: { type: 'string', description: 'Conversation ID' },
                authorEmail: { type: 'string', description: 'Email of the note author' },
                body: { type: 'string', description: 'Note text content' },
            },
            required: ['conversationId', 'authorEmail', 'body'],
        },
        annotations: { readOnlyHint: false },
    },
];

// ── Request handler ───────────────────────────────────────────────────────────

async function handleRequest(request: Request): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', mcp: 'mcp-front' }), {
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
            serverInfo: { name: 'mcp-front', version: '1.0.0' },
        });
    }

    if (body.method === 'tools/list') {
        return rpcOk(id, { tools: TOOLS });
    }

    if (body.method === 'tools/call') {
        const token = request.headers.get('X-Mcp-Secret-FRONT-API-TOKEN');
        if (!token) return rpcErr(id, -32001, 'Missing required secret: FRONT_API_TOKEN');

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
            const data = await frontFetch(token, '/me');
            return toolOk(data);
        }
        case 'list_conversations': {
            const limit = (args.limit as number) ?? 25;
            const data = await frontFetch(token, `/conversations?q[statuses][]=assigned&q[statuses][]=unassigned&limit=${limit}`);
            return toolOk(data);
        }
        case 'get_conversation': {
            validateRequired(args, ['conversationId']);
            const data = await frontFetch(token, `/conversations/${args.conversationId}`);
            return toolOk(data);
        }
        case 'list_messages': {
            validateRequired(args, ['conversationId']);
            const data = await frontFetch(token, `/conversations/${args.conversationId}/messages`);
            return toolOk(data);
        }
        case 'get_message': {
            validateRequired(args, ['messageId']);
            const data = await frontFetch(token, `/messages/${args.messageId}`);
            return toolOk(data);
        }
        case 'send_reply': {
            validateRequired(args, ['conversationId', 'authorEmail', 'body', 'toHandle']);
            const data = await frontFetch(token, `/conversations/${args.conversationId}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    author: { email: args.authorEmail },
                    body: args.body,
                    to: [{ handle: args.toHandle }],
                }),
            });
            return toolOk(data);
        }
        case 'update_conversation': {
            validateRequired(args, ['conversationId']);
            const { conversationId, ...rest } = args;
            const data = await frontFetch(token, `/conversations/${conversationId}`, {
                method: 'PATCH',
                body: JSON.stringify(rest),
            });
            return toolOk(data);
        }
        case 'list_inboxes': {
            const data = await frontFetch(token, '/inboxes');
            return toolOk(data);
        }
        case 'get_inbox': {
            validateRequired(args, ['inboxId']);
            const data = await frontFetch(token, `/inboxes/${args.inboxId}`);
            return toolOk(data);
        }
        case 'list_contacts': {
            const limit = (args.limit as number) ?? 25;
            const data = await frontFetch(token, `/contacts?limit=${limit}`);
            return toolOk(data);
        }
        case 'get_contact': {
            validateRequired(args, ['contactId']);
            const data = await frontFetch(token, `/contacts/${args.contactId}`);
            return toolOk(data);
        }
        case 'create_contact': {
            validateRequired(args, ['name', 'email']);
            const body: Record<string, unknown> = {
                name: args.name,
                handles: [{ handle: args.email, source: 'email' }],
            };
            if (args.description) body.description = args.description;
            const data = await frontFetch(token, '/contacts', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            return toolOk(data);
        }
        case 'update_contact': {
            validateRequired(args, ['contactId']);
            const { contactId, ...rest } = args;
            const data = await frontFetch(token, `/contacts/${contactId}`, {
                method: 'PATCH',
                body: JSON.stringify(rest),
            });
            return toolOk(data);
        }
        case 'list_teammates': {
            const data = await frontFetch(token, '/teammates');
            return toolOk(data);
        }
        case 'create_conversation_note': {
            validateRequired(args, ['conversationId', 'authorEmail', 'body']);
            const data = await frontFetch(token, `/conversations/${args.conversationId}/comments`, {
                method: 'POST',
                body: JSON.stringify({ author: { email: args.authorEmail }, body: args.body }),
            });
            return toolOk(data);
        }
        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

export default { fetch: handleRequest };
