/**
 * Instantly MCP Worker
 * Implements MCP protocol over HTTP for Instantly.ai cold email operations.
 *
 * Secrets:
 *   INSTANTLY_API_KEY → X-Mcp-Secret-INSTANTLY-API-KEY
 */

const BASE = 'https://api.instantly.ai/api/v2';

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
        name: 'list_campaigns',
        description: 'List all Instantly campaigns',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default 20)' },
                starting_after: { type: 'string', description: 'Cursor for pagination' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_campaign',
        description: 'Create a new campaign in Instantly',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Campaign name' },
                campaign_schedule: { type: 'object', description: 'Schedule object with days/times' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_campaign',
        description: 'Get a specific campaign by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Campaign ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_campaign_status',
        description: 'Update the status of a campaign',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Campaign ID' },
                status: { type: 'string', description: 'New status: active, paused, or completed', enum: ['active', 'paused', 'completed'] },
            },
            required: ['id', 'status'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_campaign',
        description: 'Delete a campaign',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Campaign ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_leads',
        description: 'List leads, optionally filtered by campaign',
        inputSchema: {
            type: 'object',
            properties: {
                campaign_id: { type: 'string', description: 'Filter by campaign ID' },
                limit: { type: 'number', description: 'Max results' },
                starting_after: { type: 'string', description: 'Cursor for pagination' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_leads',
        description: 'Add leads to a campaign',
        inputSchema: {
            type: 'object',
            properties: {
                campaign_id: { type: 'string', description: 'Campaign ID' },
                leads: { type: 'array', description: 'Array of lead objects with email, first_name, last_name, personalization' },
            },
            required: ['campaign_id', 'leads'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'move_leads',
        description: 'Move leads to a different campaign',
        inputSchema: {
            type: 'object',
            properties: {
                campaign_id: { type: 'string', description: 'Destination campaign ID' },
                leads: { type: 'array', description: 'Array of lead objects with email' },
            },
            required: ['campaign_id', 'leads'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_lead',
        description: 'Delete a lead by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Lead ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_lead_status',
        description: 'Get status details for a lead',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Lead ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_accounts',
        description: 'List email sending accounts',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results' },
                starting_after: { type: 'string', description: 'Cursor for pagination' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_campaign_analytics',
        description: 'Get analytics overview for a campaign',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Campaign ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_email_accounts',
        description: 'List all email accounts with status and warmup info',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'verify_email',
        description: 'Verify a single email address',
        inputSchema: {
            type: 'object',
            properties: { email: { type: 'string', description: 'Email address to verify' } },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'bulk_verify_emails',
        description: 'Verify multiple email addresses at once',
        inputSchema: {
            type: 'object',
            properties: { emails: { type: 'array', description: 'Array of email addresses to verify' } },
            required: ['emails'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_account_status',
        description: 'Get status details for a specific email account',
        inputSchema: {
            type: 'object',
            properties: { email: { type: 'string', description: 'Email account address' } },
            required: ['email'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function instantlyFetch(path: string, apiKey: string, options: RequestInit = {}): Promise<unknown> {
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
        throw new Error(`Instantly API ${res.status}: ${text}`);
    }
    if (res.status === 204) return { success: true };
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case 'list_campaigns': {
            const params = new URLSearchParams();
            if (args.limit) params.set('limit', String(args.limit));
            if (args.starting_after) params.set('starting_after', String(args.starting_after));
            const q = params.toString();
            return instantlyFetch(`/campaigns${q ? '?' + q : ''}`, apiKey);
        }

        case 'create_campaign': {
            if (!args.name) throw new Error('name is required');
            const body: Record<string, unknown> = { name: args.name };
            if (args.campaign_schedule) body.campaign_schedule = args.campaign_schedule;
            return instantlyFetch('/campaigns', apiKey, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'get_campaign': {
            if (!args.id) throw new Error('id is required');
            return instantlyFetch(`/campaigns/${args.id}`, apiKey);
        }

        case 'update_campaign_status': {
            if (!args.id) throw new Error('id is required');
            if (!args.status) throw new Error('status is required');
            return instantlyFetch(`/campaigns/${args.id}/status`, apiKey, {
                method: 'PATCH',
                body: JSON.stringify({ status: args.status }),
            });
        }

        case 'delete_campaign': {
            if (!args.id) throw new Error('id is required');
            return instantlyFetch(`/campaigns/${args.id}`, apiKey, { method: 'DELETE' });
        }

        case 'list_leads': {
            const params = new URLSearchParams();
            if (args.campaign_id) params.set('campaign_id', String(args.campaign_id));
            if (args.limit) params.set('limit', String(args.limit));
            if (args.starting_after) params.set('starting_after', String(args.starting_after));
            const q = params.toString();
            return instantlyFetch(`/leads${q ? '?' + q : ''}`, apiKey);
        }

        case 'add_leads': {
            if (!args.campaign_id) throw new Error('campaign_id is required');
            if (!args.leads) throw new Error('leads is required');
            return instantlyFetch('/leads/add-to-campaign', apiKey, {
                method: 'POST',
                body: JSON.stringify({ campaign_id: args.campaign_id, leads: args.leads }),
            });
        }

        case 'move_leads': {
            if (!args.campaign_id) throw new Error('campaign_id is required');
            if (!args.leads) throw new Error('leads is required');
            return instantlyFetch('/leads/move-to-campaign', apiKey, {
                method: 'POST',
                body: JSON.stringify({ campaign_id: args.campaign_id, leads: args.leads }),
            });
        }

        case 'delete_lead': {
            if (!args.id) throw new Error('id is required');
            return instantlyFetch(`/leads/${args.id}`, apiKey, { method: 'DELETE' });
        }

        case 'get_lead_status': {
            if (!args.id) throw new Error('id is required');
            return instantlyFetch(`/leads/${args.id}`, apiKey);
        }

        case 'list_accounts': {
            const params = new URLSearchParams();
            if (args.limit) params.set('limit', String(args.limit));
            if (args.starting_after) params.set('starting_after', String(args.starting_after));
            const q = params.toString();
            return instantlyFetch(`/accounts${q ? '?' + q : ''}`, apiKey);
        }

        case 'get_campaign_analytics': {
            if (!args.id) throw new Error('id is required');
            return instantlyFetch(`/campaigns/${args.id}/analytics/overview`, apiKey);
        }

        case 'list_email_accounts':
            return instantlyFetch('/accounts', apiKey);

        case 'verify_email': {
            if (!args.email) throw new Error('email is required');
            return instantlyFetch('/email-verification/verify', apiKey, {
                method: 'POST',
                body: JSON.stringify({ email: args.email }),
            });
        }

        case 'bulk_verify_emails': {
            if (!args.emails) throw new Error('emails is required');
            return instantlyFetch('/email-verification/bulk', apiKey, {
                method: 'POST',
                body: JSON.stringify({ emails: args.emails }),
            });
        }

        case 'get_account_status': {
            if (!args.email) throw new Error('email is required');
            return instantlyFetch(`/accounts/${args.email}`, apiKey);
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'instantly-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'instantly-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-INSTANTLY-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: INSTANTLY_API_KEY');
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
