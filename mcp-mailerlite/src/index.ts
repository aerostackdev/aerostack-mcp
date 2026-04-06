/**
 * MailerLite MCP Worker
 * Implements MCP protocol over HTTP for MailerLite email marketing operations.
 *
 * Secrets:
 *   MAILERLITE_API_KEY → X-Mcp-Secret-MAILERLITE-API-KEY
 */

const BASE = 'https://connect.mailerlite.com/api';

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
        description: 'Verify MailerLite credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_subscribers',
        description: 'List subscribers with optional status filter',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Results per page (default 25)' },
                page: { type: 'number', description: 'Page number' },
                'filter[status]': { type: 'string', description: 'Status filter: active, unsubscribed, unconfirmed, bounced, junk' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_subscriber',
        description: 'Create a new subscriber',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Subscriber email' },
                name: { type: 'string', description: 'Subscriber name' },
                fields: { type: 'object', description: 'Custom field values' },
                groups: { type: 'array', description: 'Array of group IDs to add subscriber to' },
                status: { type: 'string', description: 'Status (default: active)' },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_subscriber',
        description: 'Get a subscriber by ID or email',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Subscriber ID or email' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_subscriber',
        description: 'Update a subscriber',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Subscriber ID' },
                name: { type: 'string', description: 'New name' },
                fields: { type: 'object', description: 'Custom fields to update' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_subscriber',
        description: 'Delete a subscriber',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Subscriber ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_groups',
        description: 'List all subscriber groups',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Results per page' },
                page: { type: 'number', description: 'Page number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_group',
        description: 'Create a new subscriber group',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Group name' } },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'add_subscriber_to_group',
        description: 'Add a subscriber to a group',
        inputSchema: {
            type: 'object',
            properties: {
                subscriber_id: { type: 'string', description: 'Subscriber ID' },
                group_id: { type: 'string', description: 'Group ID' },
            },
            required: ['subscriber_id', 'group_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'remove_subscriber_from_group',
        description: 'Remove a subscriber from a group',
        inputSchema: {
            type: 'object',
            properties: {
                subscriber_id: { type: 'string', description: 'Subscriber ID' },
                group_id: { type: 'string', description: 'Group ID' },
            },
            required: ['subscriber_id', 'group_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_campaigns',
        description: 'List campaigns with optional status filter',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Results per page' },
                page: { type: 'number', description: 'Page number' },
                'filter[status]': { type: 'string', description: 'Filter by status: draft, ready, sent, cancelled' },
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
        name: 'create_campaign',
        description: 'Create a new email campaign',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Campaign name' },
                type: { type: 'string', description: 'Campaign type: regular, ab, resend, rss' },
                language_id: { type: 'number', description: 'Language ID (default 1)' },
                emails: { type: 'array', description: 'Array of email objects with subject, from_name, from_email, content' },
                groups: { type: 'array', description: 'Array of group IDs to send to' },
            },
            required: ['name', 'emails', 'groups'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'schedule_campaign',
        description: 'Schedule a campaign for delivery',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Campaign ID' },
                delivery: { type: 'string', description: 'Delivery type: instant or scheduled' },
                schedule: { type: 'object', description: 'Schedule object with date, hours, minutes (for scheduled delivery)' },
            },
            required: ['id', 'delivery'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_campaign_stats',
        description: 'Get subscriber activity stats for a campaign',
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
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Results per page' },
                page: { type: 'number', description: 'Page number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_fields',
        description: 'List all custom subscriber fields',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_field',
        description: 'Create a new custom subscriber field',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Field name' },
                type: { type: 'string', description: 'Field type: text, number, date, boolean' },
            },
            required: ['name', 'type'],
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

async function mlFetch(path: string, apiKey: string, options: RequestInit = {}): Promise<unknown> {
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
        throw new Error(`MailerLite API ${res.status}: ${text}`);
    }
    if (res.status === 204) return { success: true };
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const data = await mlFetch('/me', apiKey) as { data?: { email?: string; username?: string } };
            const account = data.data;
            return { content: [{ type: 'text', text: `Connected to MailerLite as ${account?.email ?? account?.username ?? 'unknown'}` }] };
        }

        case 'list_subscribers': {
            const params = new URLSearchParams();
            if (args.limit) params.set('limit', String(args.limit));
            if (args.page) params.set('page', String(args.page));
            if (args['filter[status]']) params.set('filter[status]', String(args['filter[status]']));
            const q = params.toString();
            return mlFetch(`/subscribers${q ? '?' + q : ''}`, apiKey);
        }

        case 'create_subscriber': {
            if (!args.email) throw new Error('email is required');
            const body: Record<string, unknown> = { email: args.email };
            if (args.name) body.name = args.name;
            if (args.fields) body.fields = args.fields;
            if (args.groups) body.groups = args.groups;
            if (args.status) body.status = args.status;
            return mlFetch('/subscribers', apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'get_subscriber': {
            if (!args.id) throw new Error('id is required');
            return mlFetch(`/subscribers/${args.id}`, apiKey);
        }

        case 'update_subscriber': {
            if (!args.id) throw new Error('id is required');
            const body: Record<string, unknown> = {};
            if (args.name) body.name = args.name;
            if (args.fields) body.fields = args.fields;
            return mlFetch(`/subscribers/${args.id}`, apiKey, { method: 'PUT', body: JSON.stringify(body) });
        }

        case 'delete_subscriber': {
            if (!args.id) throw new Error('id is required');
            return mlFetch(`/subscribers/${args.id}`, apiKey, { method: 'DELETE' });
        }

        case 'list_groups': {
            const params = new URLSearchParams();
            if (args.limit) params.set('limit', String(args.limit));
            if (args.page) params.set('page', String(args.page));
            const q = params.toString();
            return mlFetch(`/groups${q ? '?' + q : ''}`, apiKey);
        }

        case 'create_group': {
            if (!args.name) throw new Error('name is required');
            return mlFetch('/groups', apiKey, { method: 'POST', body: JSON.stringify({ name: args.name }) });
        }

        case 'add_subscriber_to_group': {
            if (!args.subscriber_id) throw new Error('subscriber_id is required');
            if (!args.group_id) throw new Error('group_id is required');
            return mlFetch(`/subscribers/${args.subscriber_id}/groups/${args.group_id}`, apiKey, { method: 'POST', body: '{}' });
        }

        case 'remove_subscriber_from_group': {
            if (!args.subscriber_id) throw new Error('subscriber_id is required');
            if (!args.group_id) throw new Error('group_id is required');
            return mlFetch(`/subscribers/${args.subscriber_id}/groups/${args.group_id}`, apiKey, { method: 'DELETE' });
        }

        case 'list_campaigns': {
            const params = new URLSearchParams();
            if (args.limit) params.set('limit', String(args.limit));
            if (args.page) params.set('page', String(args.page));
            if (args['filter[status]']) params.set('filter[status]', String(args['filter[status]']));
            const q = params.toString();
            return mlFetch(`/campaigns${q ? '?' + q : ''}`, apiKey);
        }

        case 'get_campaign': {
            if (!args.id) throw new Error('id is required');
            return mlFetch(`/campaigns/${args.id}`, apiKey);
        }

        case 'create_campaign': {
            if (!args.name) throw new Error('name is required');
            if (!args.emails) throw new Error('emails is required');
            if (!args.groups) throw new Error('groups is required');
            const body: Record<string, unknown> = {
                name: args.name,
                type: args.type ?? 'regular',
                language_id: args.language_id ?? 1,
                emails: args.emails,
                groups: args.groups,
            };
            return mlFetch('/campaigns', apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'schedule_campaign': {
            if (!args.id) throw new Error('id is required');
            if (!args.delivery) throw new Error('delivery is required');
            const body: Record<string, unknown> = { delivery: args.delivery };
            if (args.schedule) body.schedule = args.schedule;
            return mlFetch(`/campaigns/${args.id}/schedule`, apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'get_campaign_stats': {
            if (!args.id) throw new Error('id is required');
            return mlFetch(`/campaigns/${args.id}/reports/subscriber-activity`, apiKey);
        }

        case 'list_automations': {
            const params = new URLSearchParams();
            if (args.limit) params.set('limit', String(args.limit));
            if (args.page) params.set('page', String(args.page));
            const q = params.toString();
            return mlFetch(`/automations${q ? '?' + q : ''}`, apiKey);
        }

        case 'list_fields':
            return mlFetch('/fields', apiKey);

        case 'create_field': {
            if (!args.name) throw new Error('name is required');
            if (!args.type) throw new Error('type is required');
            return mlFetch('/fields', apiKey, {
                method: 'POST',
                body: JSON.stringify({ name: args.name, type: args.type }),
            });
        }

        case 'get_account_info':
            return mlFetch('/me', apiKey);

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mailerlite-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'mailerlite-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-MAILERLITE-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: MAILERLITE_API_KEY');
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
