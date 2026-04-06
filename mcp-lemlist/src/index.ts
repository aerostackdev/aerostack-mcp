/**
 * Lemlist MCP Worker
 * Implements MCP protocol over HTTP for Lemlist cold email outreach operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   LEMLIST_API_KEY → X-Mcp-Secret-LEMLIST-API-KEY
 */

const BASE = 'https://api.lemlist.com/api';

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
        description: 'Verify Lemlist credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_campaigns',
        description: 'List all Lemlist campaigns',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_campaign',
        description: 'Get a specific campaign by ID',
        inputSchema: {
            type: 'object',
            properties: { campaignId: { type: 'string', description: 'Campaign ID' } },
            required: ['campaignId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_campaign',
        description: 'Create a new Lemlist campaign',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Campaign name' } },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'pause_campaign',
        description: 'Pause a running campaign',
        inputSchema: {
            type: 'object',
            properties: { campaignId: { type: 'string', description: 'Campaign ID' } },
            required: ['campaignId'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'resume_campaign',
        description: 'Resume a paused campaign',
        inputSchema: {
            type: 'object',
            properties: { campaignId: { type: 'string', description: 'Campaign ID' } },
            required: ['campaignId'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'export_campaign_results',
        description: 'Export leads and stats from a campaign',
        inputSchema: {
            type: 'object',
            properties: { campaignId: { type: 'string', description: 'Campaign ID' } },
            required: ['campaignId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_leads_in_campaign',
        description: 'List leads in a campaign',
        inputSchema: {
            type: 'object',
            properties: {
                campaignId: { type: 'string', description: 'Campaign ID' },
                limit: { type: 'number', description: 'Number of leads (default 25)' },
                offset: { type: 'number', description: 'Pagination offset' },
            },
            required: ['campaignId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_lead_to_campaign',
        description: 'Add a lead to a campaign',
        inputSchema: {
            type: 'object',
            properties: {
                campaignId: { type: 'string', description: 'Campaign ID' },
                email: { type: 'string', description: 'Lead email address' },
                first_name: { type: 'string', description: 'First name' },
                last_name: { type: 'string', description: 'Last name' },
                company_name: { type: 'string', description: 'Company name' },
                phone: { type: 'string', description: 'Phone number' },
                linkedin_url: { type: 'string', description: 'LinkedIn profile URL' },
            },
            required: ['campaignId', 'email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_lead_from_campaign',
        description: 'Remove a lead from a campaign',
        inputSchema: {
            type: 'object',
            properties: {
                campaignId: { type: 'string', description: 'Campaign ID' },
                email: { type: 'string', description: 'Lead email address' },
            },
            required: ['campaignId', 'email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_lead_activity',
        description: 'Get activity history for a lead in a campaign',
        inputSchema: {
            type: 'object',
            properties: {
                campaignId: { type: 'string', description: 'Campaign ID' },
                email: { type: 'string', description: 'Lead email address' },
            },
            required: ['campaignId', 'email'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_all_leads',
        description: 'List all leads across all campaigns',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of leads' },
                offset: { type: 'number', description: 'Pagination offset' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_lead',
        description: 'Get a lead by email with campaign history',
        inputSchema: {
            type: 'object',
            properties: { email: { type: 'string', description: 'Lead email address' } },
            required: ['email'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'unsubscribe_lead',
        description: 'Unsubscribe a lead from all campaigns',
        inputSchema: {
            type: 'object',
            properties: { email: { type: 'string', description: 'Lead email address' } },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_senders',
        description: 'List all email senders in the account',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_team',
        description: 'Get team info including plan and credits',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_campaign_stats',
        description: 'Get statistics for a campaign',
        inputSchema: {
            type: 'object',
            properties: { campaignId: { type: 'string', description: 'Campaign ID' } },
            required: ['campaignId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

function lemlistAuth(apiKey: string): string {
    return 'Basic ' + btoa(':' + apiKey);
}

async function lemlistFetch(path: string, apiKey: string, options: RequestInit = {}): Promise<unknown> {
    const url = `${BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: lemlistAuth(apiKey),
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Lemlist API ${res.status}: ${text}`);
    }
    if (res.status === 204) return { success: true };
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            await lemlistFetch('/me', apiKey);
            return { content: [{ type: 'text', text: 'Connected to Lemlist' }] };
        }

        case 'list_campaigns':
            return lemlistFetch('/campaigns', apiKey);

        case 'get_campaign': {
            if (!args.campaignId) throw new Error('campaignId is required');
            return lemlistFetch(`/campaigns/${args.campaignId}`, apiKey);
        }

        case 'create_campaign': {
            if (!args.name) throw new Error('name is required');
            return lemlistFetch('/campaigns', apiKey, {
                method: 'POST',
                body: JSON.stringify({ name: args.name }),
            });
        }

        case 'pause_campaign': {
            if (!args.campaignId) throw new Error('campaignId is required');
            return lemlistFetch(`/campaigns/${args.campaignId}/pause`, apiKey, { method: 'POST' });
        }

        case 'resume_campaign': {
            if (!args.campaignId) throw new Error('campaignId is required');
            return lemlistFetch(`/campaigns/${args.campaignId}/resume`, apiKey, { method: 'POST' });
        }

        case 'export_campaign_results': {
            if (!args.campaignId) throw new Error('campaignId is required');
            return lemlistFetch(`/campaigns/${args.campaignId}/export/leads`, apiKey);
        }

        case 'list_leads_in_campaign': {
            if (!args.campaignId) throw new Error('campaignId is required');
            const limit = args.limit ?? 25;
            let path = `/campaigns/${args.campaignId}/leads?limit=${limit}`;
            if (args.offset != null) path += `&offset=${args.offset}`;
            return lemlistFetch(path, apiKey);
        }

        case 'add_lead_to_campaign': {
            if (!args.campaignId) throw new Error('campaignId is required');
            if (!args.email) throw new Error('email is required');
            const body: Record<string, unknown> = {};
            if (args.first_name) body.firstName = args.first_name;
            if (args.last_name) body.lastName = args.last_name;
            if (args.company_name) body.companyName = args.company_name;
            if (args.phone) body.phone = args.phone;
            if (args.linkedin_url) body.linkedinUrl = args.linkedin_url;
            return lemlistFetch(`/campaigns/${args.campaignId}/leads/${args.email}`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'delete_lead_from_campaign': {
            if (!args.campaignId) throw new Error('campaignId is required');
            if (!args.email) throw new Error('email is required');
            return lemlistFetch(`/campaigns/${args.campaignId}/leads/${args.email}`, apiKey, { method: 'DELETE' });
        }

        case 'get_lead_activity': {
            if (!args.campaignId) throw new Error('campaignId is required');
            if (!args.email) throw new Error('email is required');
            return lemlistFetch(`/campaigns/${args.campaignId}/leads/${args.email}/activity`, apiKey);
        }

        case 'list_all_leads': {
            let path = '/leads';
            const params: string[] = [];
            if (args.limit != null) params.push(`limit=${args.limit}`);
            if (args.offset != null) params.push(`offset=${args.offset}`);
            if (params.length) path += '?' + params.join('&');
            return lemlistFetch(path, apiKey);
        }

        case 'get_lead': {
            if (!args.email) throw new Error('email is required');
            return lemlistFetch(`/leads/${args.email}`, apiKey);
        }

        case 'unsubscribe_lead': {
            if (!args.email) throw new Error('email is required');
            return lemlistFetch(`/leads/${args.email}/unsubscribe`, apiKey, { method: 'POST' });
        }

        case 'list_senders':
            return lemlistFetch('/senders', apiKey);

        case 'get_team':
            return lemlistFetch('/team', apiKey);

        case 'get_campaign_stats': {
            if (!args.campaignId) throw new Error('campaignId is required');
            return lemlistFetch(`/campaigns/${args.campaignId}/stats`, apiKey);
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'lemlist-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'lemlist-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-LEMLIST-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: LEMLIST_API_KEY');
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
