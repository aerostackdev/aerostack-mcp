/**
 * ConvertKit (Kit) MCP Worker
 * Implements MCP protocol over HTTP for ConvertKit creator email operations.
 *
 * Secrets:
 *   CONVERTKIT_API_KEY → X-Mcp-Secret-CONVERTKIT-API-KEY
 */

const BASE = 'https://api.kit.com/v4';

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
        description: 'Verify ConvertKit credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_subscribers',
        description: 'List subscribers with optional filters',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Results per page (default 500)' },
                page: { type: 'number', description: 'Page number' },
                status: { type: 'string', description: 'Filter: active, inactive, cancelled, bounced, complained' },
                sort_field: { type: 'string', description: 'Sort by: id, email_address, created_at' },
                sort_order: { type: 'string', description: 'asc or desc' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_subscriber',
        description: 'Get a subscriber by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Subscriber ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_subscriber',
        description: 'Create a new subscriber',
        inputSchema: {
            type: 'object',
            properties: {
                email_address: { type: 'string', description: 'Email address' },
                first_name: { type: 'string', description: 'First name' },
                fields: { type: 'object', description: 'Custom field values' },
            },
            required: ['email_address'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_subscriber',
        description: 'Update an existing subscriber',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Subscriber ID' },
                email_address: { type: 'string', description: 'New email address' },
                first_name: { type: 'string', description: 'New first name' },
                fields: { type: 'object', description: 'Custom fields to update' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'unsubscribe',
        description: 'Unsubscribe a subscriber',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Subscriber ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'bulk_create_subscribers',
        description: 'Create multiple subscribers at once',
        inputSchema: {
            type: 'object',
            properties: {
                subscribers: { type: 'array', description: 'Array of subscriber objects with email_address, first_name, fields' },
            },
            required: ['subscribers'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_broadcasts',
        description: 'List broadcasts (email campaigns)',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Results per page' },
                page: { type: 'number', description: 'Page number' },
                sort_order: { type: 'string', description: 'asc or desc' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_broadcast',
        description: 'Get a broadcast by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Broadcast ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_broadcast',
        description: 'Create a new broadcast',
        inputSchema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'HTML content' },
                subject: { type: 'string', description: 'Email subject' },
                description: { type: 'string', description: 'Internal description' },
                email_address: { type: 'string', description: 'From email address' },
                published: { type: 'boolean', description: 'Whether to publish' },
                send_at: { type: 'string', description: 'Schedule send time (ISO timestamp)' },
            },
            required: ['content', 'subject'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_forms',
        description: 'List all forms',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Results per page' },
                page: { type: 'number', description: 'Page number' },
                type: { type: 'string', description: 'Filter: embed, modal, slide_in, sticky_bar' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_subscriber_to_form',
        description: 'Add a subscriber to a form',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Form ID' },
                email_address: { type: 'string', description: 'Subscriber email' },
                first_name: { type: 'string', description: 'First name' },
            },
            required: ['id', 'email_address'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_sequences',
        description: 'List all email sequences',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Results per page' },
                page: { type: 'number', description: 'Page number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_subscriber_to_sequence',
        description: 'Add a subscriber to an email sequence',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Sequence ID' },
                email_address: { type: 'string', description: 'Subscriber email' },
            },
            required: ['id', 'email_address'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_tags',
        description: 'List all tags',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Results per page' },
                page: { type: 'number', description: 'Page number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_tag',
        description: 'Create a new tag',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Tag name' } },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'tag_subscriber',
        description: 'Add a tag to a subscriber',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Tag ID' },
                email_address: { type: 'string', description: 'Subscriber email' },
            },
            required: ['id', 'email_address'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'remove_tag_from_subscriber',
        description: 'Remove a tag from a subscriber',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Tag ID' },
                subscriber_id: { type: 'string', description: 'Subscriber ID' },
            },
            required: ['id', 'subscriber_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_account_info',
        description: 'Get account information',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function ckFetch(path: string, apiKey: string, options: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ConvertKit API ${res.status}: ${text}`);
    }
    if (res.status === 204) return { success: true };
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            return ckFetch('/account', apiKey);
        }

        case 'list_subscribers': {
            const params = new URLSearchParams();
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            if (args.status) params.set('status', String(args.status));
            if (args.sort_field) params.set('sort_field', String(args.sort_field));
            if (args.sort_order) params.set('sort_order', String(args.sort_order));
            const q = params.toString();
            return ckFetch(`/subscribers${q ? '?' + q : ''}`, apiKey);
        }

        case 'get_subscriber': {
            if (!args.id) throw new Error('id is required');
            return ckFetch(`/subscribers/${args.id}`, apiKey);
        }

        case 'create_subscriber': {
            if (!args.email_address) throw new Error('email_address is required');
            const body: Record<string, unknown> = { email_address: args.email_address };
            if (args.first_name) body.first_name = args.first_name;
            if (args.fields) body.fields = args.fields;
            return ckFetch('/subscribers', apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'update_subscriber': {
            if (!args.id) throw new Error('id is required');
            const body: Record<string, unknown> = {};
            if (args.email_address) body.email_address = args.email_address;
            if (args.first_name) body.first_name = args.first_name;
            if (args.fields) body.fields = args.fields;
            return ckFetch(`/subscribers/${args.id}`, apiKey, { method: 'PATCH', body: JSON.stringify(body) });
        }

        case 'unsubscribe': {
            if (!args.id) throw new Error('id is required');
            return ckFetch(`/subscribers/${args.id}`, apiKey, { method: 'DELETE' });
        }

        case 'bulk_create_subscribers': {
            if (!args.subscribers) throw new Error('subscribers is required');
            return ckFetch('/bulk/subscribers', apiKey, {
                method: 'POST',
                body: JSON.stringify({ subscribers: args.subscribers }),
            });
        }

        case 'list_broadcasts': {
            const params = new URLSearchParams();
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            if (args.sort_order) params.set('sort_order', String(args.sort_order));
            const q = params.toString();
            return ckFetch(`/broadcasts${q ? '?' + q : ''}`, apiKey);
        }

        case 'get_broadcast': {
            if (!args.id) throw new Error('id is required');
            return ckFetch(`/broadcasts/${args.id}`, apiKey);
        }

        case 'create_broadcast': {
            if (!args.content) throw new Error('content is required');
            if (!args.subject) throw new Error('subject is required');
            const body: Record<string, unknown> = { content: args.content, subject: args.subject };
            if (args.description) body.description = args.description;
            if (args.email_address) body.email_address = args.email_address;
            if (args.published != null) body.published = args.published;
            if (args.send_at) body.send_at = args.send_at;
            return ckFetch('/broadcasts', apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_forms': {
            const params = new URLSearchParams();
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            if (args.type) params.set('type', String(args.type));
            const q = params.toString();
            return ckFetch(`/forms${q ? '?' + q : ''}`, apiKey);
        }

        case 'add_subscriber_to_form': {
            if (!args.id) throw new Error('id is required');
            if (!args.email_address) throw new Error('email_address is required');
            const body: Record<string, unknown> = { email_address: args.email_address };
            if (args.first_name) body.first_name = args.first_name;
            return ckFetch(`/forms/${args.id}/subscribers`, apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_sequences': {
            const params = new URLSearchParams();
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            const q = params.toString();
            return ckFetch(`/sequences${q ? '?' + q : ''}`, apiKey);
        }

        case 'add_subscriber_to_sequence': {
            if (!args.id) throw new Error('id is required');
            if (!args.email_address) throw new Error('email_address is required');
            return ckFetch(`/sequences/${args.id}/subscribers`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ email_address: args.email_address }),
            });
        }

        case 'list_tags': {
            const params = new URLSearchParams();
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            const q = params.toString();
            return ckFetch(`/tags${q ? '?' + q : ''}`, apiKey);
        }

        case 'create_tag': {
            if (!args.name) throw new Error('name is required');
            return ckFetch('/tags', apiKey, { method: 'POST', body: JSON.stringify({ name: args.name }) });
        }

        case 'tag_subscriber': {
            if (!args.id) throw new Error('id is required');
            if (!args.email_address) throw new Error('email_address is required');
            return ckFetch(`/tags/${args.id}/subscribers`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ email_address: args.email_address }),
            });
        }

        case 'remove_tag_from_subscriber': {
            if (!args.id) throw new Error('id is required');
            if (!args.subscriber_id) throw new Error('subscriber_id is required');
            return ckFetch(`/tags/${args.id}/subscribers/${args.subscriber_id}`, apiKey, { method: 'DELETE' });
        }

        case 'get_account_info':
            return ckFetch('/account', apiKey);

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'convertkit-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: any;
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { jsonrpc, id, method, params } = body;
        if (jsonrpc !== '2.0') return rpcErr(id ?? null, -32600, 'Invalid Request');

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'convertkit-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-CONVERTKIT-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: CONVERTKIT_API_KEY');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, apiKey);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
