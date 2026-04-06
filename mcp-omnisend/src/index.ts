/**
 * Omnisend MCP Worker
 * Implements MCP protocol over HTTP for Omnisend ecom email/SMS operations.
 *
 * Secrets:
 *   OMNISEND_API_KEY → X-Mcp-Secret-OMNISEND-API-KEY
 */

const BASE = 'https://api.omnisend.com/v3';

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
        description: 'Verify Omnisend credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_contacts',
        description: 'List contacts with optional filters',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default 250)' },
                offset: { type: 'number', description: 'Pagination offset' },
                status: { type: 'string', description: 'Filter: subscribed, unsubscribed, nonSubscribed' },
                email: { type: 'string', description: 'Filter by email address' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_contact',
        description: 'Create a new contact',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Contact email' },
                firstName: { type: 'string', description: 'First name' },
                lastName: { type: 'string', description: 'Last name' },
                phone: { type: 'string', description: 'Phone number' },
                birthday: { type: 'string', description: 'Birthday in YYYY-MM-DD format' },
                tags: { type: 'array', description: 'Array of tag strings' },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_contact',
        description: 'Get a contact by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Contact ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_contact',
        description: 'Update a contact',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Contact ID' },
                firstName: { type: 'string', description: 'First name' },
                lastName: { type: 'string', description: 'Last name' },
                phone: { type: 'string', description: 'Phone number' },
                tags: { type: 'array', description: 'Tags' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_contact',
        description: 'Delete a contact',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Contact ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_campaigns',
        description: 'List campaigns',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results' },
                offset: { type: 'number', description: 'Pagination offset' },
                status: { type: 'string', description: 'Filter by status' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_campaign',
        description: 'Get a campaign by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Campaign ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_automations',
        description: 'List all automations',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'track_event',
        description: 'Track a custom event for a contact',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Contact email' },
                event_name: { type: 'string', description: 'Event name (e.g. Placed Order)' },
                fields: { type: 'object', description: 'Event properties' },
            },
            required: ['email', 'event_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_batch',
        description: 'Create a batch operation for contacts',
        inputSchema: {
            type: 'object',
            properties: {
                type: { type: 'string', description: 'Batch type (contacts)' },
                operation: { type: 'string', description: 'Operation: add or update' },
                items: { type: 'array', description: 'Array of contact objects' },
            },
            required: ['type', 'operation', 'items'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_batch_status',
        description: 'Get the status of a batch operation',
        inputSchema: {
            type: 'object',
            properties: { batchID: { type: 'string', description: 'Batch ID' } },
            required: ['batchID'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_segments',
        description: 'List all audience segments',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_segment_contacts',
        description: 'Get contacts in a segment',
        inputSchema: {
            type: 'object',
            properties: {
                segmentID: { type: 'string', description: 'Segment ID' },
                limit: { type: 'number', description: 'Max results' },
                offset: { type: 'number', description: 'Pagination offset' },
            },
            required: ['segmentID'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_forms',
        description: 'List all forms',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_tags',
        description: 'List all tags',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_account_info',
        description: 'Get account information',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function omFetch(path: string, apiKey: string, options: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Omnisend API ${res.status}: ${text}`);
    }
    if (res.status === 204) return { success: true };
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await omFetch('/contacts?limit=1', apiKey);
            return { content: [{ type: 'text', text: 'Connected to Omnisend' }] };
        }

        case 'list_contacts': {
            const params = new URLSearchParams();
            if (args.limit) params.set('limit', String(args.limit));
            if (args.offset) params.set('offset', String(args.offset));
            if (args.status) params.set('status', String(args.status));
            if (args.email) params.set('email', String(args.email));
            const q = params.toString();
            return omFetch(`/contacts${q ? '?' + q : ''}`, apiKey);
        }

        case 'create_contact': {
            if (!args.email) throw new Error('email is required');
            const body: Record<string, unknown> = { email: args.email };
            if (args.firstName) body.firstName = args.firstName;
            if (args.lastName) body.lastName = args.lastName;
            if (args.phone) body.phone = args.phone;
            if (args.birthday) body.birthday = args.birthday;
            if (args.tags) body.tags = args.tags;
            return omFetch('/contacts', apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'get_contact': {
            if (!args.id) throw new Error('id is required');
            return omFetch(`/contacts/${args.id}`, apiKey);
        }

        case 'update_contact': {
            if (!args.id) throw new Error('id is required');
            const body: Record<string, unknown> = {};
            if (args.firstName) body.firstName = args.firstName;
            if (args.lastName) body.lastName = args.lastName;
            if (args.phone) body.phone = args.phone;
            if (args.tags) body.tags = args.tags;
            return omFetch(`/contacts/${args.id}`, apiKey, { method: 'PATCH', body: JSON.stringify(body) });
        }

        case 'delete_contact': {
            if (!args.id) throw new Error('id is required');
            return omFetch(`/contacts/${args.id}`, apiKey, { method: 'DELETE' });
        }

        case 'list_campaigns': {
            const params = new URLSearchParams();
            if (args.limit) params.set('limit', String(args.limit));
            if (args.offset) params.set('offset', String(args.offset));
            if (args.status) params.set('status', String(args.status));
            const q = params.toString();
            return omFetch(`/campaigns${q ? '?' + q : ''}`, apiKey);
        }

        case 'get_campaign': {
            if (!args.id) throw new Error('id is required');
            return omFetch(`/campaigns/${args.id}`, apiKey);
        }

        case 'list_automations':
            return omFetch('/automations', apiKey);

        case 'track_event': {
            if (!args.email) throw new Error('email is required');
            if (!args.event_name) throw new Error('event_name is required');
            const body: Record<string, unknown> = {
                email: args.email,
                eventName: args.event_name,
            };
            if (args.fields) body.fields = args.fields;
            return omFetch('/events', apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'create_batch': {
            if (!args.type) throw new Error('type is required');
            if (!args.operation) throw new Error('operation is required');
            if (!args.items) throw new Error('items is required');
            return omFetch('/batches', apiKey, {
                method: 'POST',
                body: JSON.stringify({ type: args.type, operation: args.operation, items: args.items }),
            });
        }

        case 'get_batch_status': {
            if (!args.batchID) throw new Error('batchID is required');
            return omFetch(`/batches/${args.batchID}`, apiKey);
        }

        case 'list_segments':
            return omFetch('/segments', apiKey);

        case 'get_segment_contacts': {
            if (!args.segmentID) throw new Error('segmentID is required');
            const params = new URLSearchParams();
            if (args.limit) params.set('limit', String(args.limit));
            if (args.offset) params.set('offset', String(args.offset));
            const q = params.toString();
            return omFetch(`/segments/${args.segmentID}/contacts${q ? '?' + q : ''}`, apiKey);
        }

        case 'list_forms':
            return omFetch('/forms', apiKey);

        case 'list_tags':
            return omFetch('/tags', apiKey);

        case 'get_account_info':
            return omFetch('/accounts', apiKey);

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'omnisend-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'omnisend-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-OMNISEND-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: OMNISEND_API_KEY');
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
