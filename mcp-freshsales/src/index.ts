/**
 * Freshsales MCP Worker
 * Implements MCP protocol over HTTP for Freshsales CRM operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   FRESHSALES_API_KEY  → X-Mcp-Secret-FRESHSALES-API-KEY
 *   FRESHSALES_DOMAIN   → X-Mcp-Secret-FRESHSALES-DOMAIN (e.g. "yourcompany")
 */

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
        name: 'list_contacts',
        description: 'List contacts in Freshsales',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Records per page (default: 25)' },
                page: { type: 'number', description: 'Page number' },
                sort: { type: 'string', description: 'Sort field' },
                sort_type: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
                filter_id: { type: 'number', description: 'Filter ID' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_contact',
        description: 'Create a new contact in Freshsales',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Email (required)' },
                first_name: { type: 'string' },
                last_name: { type: 'string' },
                phone: { type: 'string' },
                mobile: { type: 'string' },
                company: { type: 'string' },
                title: { type: 'string' },
                lead_source_id: { type: 'number' },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_contact',
        description: 'Get a specific contact by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Contact ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_contact',
        description: 'Update a contact in Freshsales',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Contact ID (required)' },
                email: { type: 'string' },
                first_name: { type: 'string' },
                last_name: { type: 'string' },
                phone: { type: 'string' },
                title: { type: 'string' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_contact',
        description: 'Delete a contact from Freshsales',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Contact ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_leads',
        description: 'List leads in Freshsales',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Records per page (default: 25)' },
                page: { type: 'number', description: 'Page number' },
                sort: { type: 'string', description: 'Sort field' },
                sort_type: { type: 'string', enum: ['asc', 'desc'] },
                filter_id: { type: 'number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_lead',
        description: 'Create a new lead in Freshsales',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Email (required)' },
                first_name: { type: 'string' },
                last_name: { type: 'string' },
                phone: { type: 'string' },
                company: { type: 'string' },
                title: { type: 'string' },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_lead',
        description: 'Get a specific lead by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Lead ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'convert_lead',
        description: 'Convert a lead to contact, account, and deal',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Lead ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_deals',
        description: 'List deals in Freshsales',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Records per page (default: 25)' },
                page: { type: 'number' },
                stage_id: { type: 'number' },
                filter_id: { type: 'number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_deal',
        description: 'Create a new deal in Freshsales',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Deal name (required)' },
                amount: { type: 'number' },
                expected_close: { type: 'string', description: 'Expected close date (YYYY-MM-DD)' },
                deal_stage_id: { type: 'number' },
                deal_pipeline_id: { type: 'number' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_deal',
        description: 'Get a specific deal by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Deal ID (required)' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_deal',
        description: 'Update a deal in Freshsales',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Deal ID (required)' },
                name: { type: 'string' },
                amount: { type: 'number' },
                expected_close: { type: 'string' },
                deal_stage_id: { type: 'number' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_accounts',
        description: 'List accounts (sales accounts) in Freshsales',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number' },
                page: { type: 'number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_account',
        description: 'Create a new account in Freshsales',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Account name (required)' },
                phone: { type: 'string' },
                website: { type: 'string' },
                industry_type_id: { type: 'number' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_note',
        description: 'Create a note attached to a CRM record',
        inputSchema: {
            type: 'object',
            properties: {
                description: { type: 'string', description: 'Note content (required)' },
                targetable_type: { type: 'string', description: 'Record type (required)', enum: ['Contact', 'Lead', 'Deal', 'SalesAccount'] },
                targetable_id: { type: 'string', description: 'Record ID (required)' },
            },
            required: ['description', 'targetable_type', 'targetable_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_notes',
        description: 'List notes for a CRM record',
        inputSchema: {
            type: 'object',
            properties: {
                targetable_type: { type: 'string', description: 'Record type (required)' },
                targetable_id: { type: 'string', description: 'Record ID (required)' },
            },
            required: ['targetable_type', 'targetable_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search',
        description: 'Search across Freshsales records',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query (required)' },
                include: { type: 'string', description: 'Modules to include (default: contact,lead,deal,sales_account)' },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

function getSecrets(request: Request): { apiKey: string; domain: string } | null {
    const apiKey = request.headers.get('X-Mcp-Secret-FRESHSALES-API-KEY');
    const domain = request.headers.get('X-Mcp-Secret-FRESHSALES-DOMAIN');
    if (!apiKey || !domain) return null;
    return { apiKey, domain };
}

async function freshsalesFetch(
    path: string,
    apiKey: string,
    domain: string,
    options: RequestInit = {},
): Promise<unknown> {
    const base = `https://${domain}.myfreshworks.com/crm/sales/api`;
    const res = await fetch(`${base}${path}`, {
        ...options,
        headers: {
            Authorization: `Token token=${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Freshsales API ${res.status}: ${text}`);
    }
    if (res.status === 204) return {};
    return res.json();
}

function buildQuery(params: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
        if (v != null) parts.push(`${k}=${encodeURIComponent(String(v))}`);
    }
    return parts.length ? '?' + parts.join('&') : '';
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string, domain: string): Promise<unknown> {
    switch (name) {
        case 'list_contacts': {
            const q = buildQuery({
                per_page: args.per_page ?? 25,
                page: args.page,
                sort: args.sort,
                sort_type: args.sort_type,
                filter_id: args.filter_id,
            });
            const data = await freshsalesFetch(`/contacts${q}`, apiKey, domain) as any;
            return { contacts: data.contacts ?? [], meta: data.meta ?? {} };
        }

        case 'create_contact': {
            if (!args.email) throw new Error('email is required');
            const contact: Record<string, unknown> = { email: args.email };
            if (args.first_name) contact.first_name = args.first_name;
            if (args.last_name) contact.last_name = args.last_name;
            if (args.phone) contact.phone = args.phone;
            if (args.mobile) contact.mobile = args.mobile;
            if (args.company) contact.company = { name: args.company };
            if (args.title) contact.job_title = args.title;
            if (args.lead_source_id) contact.lead_source_id = args.lead_source_id;
            const data = await freshsalesFetch('/contacts', apiKey, domain, {
                method: 'POST',
                body: JSON.stringify({ contact }),
            }) as any;
            return data.contact ?? data;
        }

        case 'get_contact': {
            if (!args.id) throw new Error('id is required');
            const data = await freshsalesFetch(`/contacts/${args.id}`, apiKey, domain) as any;
            return data.contact ?? data;
        }

        case 'update_contact': {
            if (!args.id) throw new Error('id is required');
            const { id, ...rest } = args;
            const contact: Record<string, unknown> = {};
            if (rest.email) contact.email = rest.email;
            if (rest.first_name) contact.first_name = rest.first_name;
            if (rest.last_name) contact.last_name = rest.last_name;
            if (rest.phone) contact.phone = rest.phone;
            if (rest.title) contact.job_title = rest.title;
            const data = await freshsalesFetch(`/contacts/${id}`, apiKey, domain, {
                method: 'PUT',
                body: JSON.stringify({ contact }),
            }) as any;
            return data.contact ?? data;
        }

        case 'delete_contact': {
            if (!args.id) throw new Error('id is required');
            await freshsalesFetch(`/contacts/${args.id}`, apiKey, domain, { method: 'DELETE' });
            return { success: true, id: args.id };
        }

        case 'list_leads': {
            const q = buildQuery({
                per_page: args.per_page ?? 25,
                page: args.page,
                sort: args.sort,
                sort_type: args.sort_type,
                filter_id: args.filter_id,
            });
            const data = await freshsalesFetch(`/leads${q}`, apiKey, domain) as any;
            return { leads: data.leads ?? [], meta: data.meta ?? {} };
        }

        case 'create_lead': {
            if (!args.email) throw new Error('email is required');
            const lead: Record<string, unknown> = { email: args.email };
            if (args.first_name) lead.first_name = args.first_name;
            if (args.last_name) lead.last_name = args.last_name;
            if (args.phone) lead.phone = args.phone;
            if (args.company) lead.company = args.company;
            if (args.title) lead.job_title = args.title;
            const data = await freshsalesFetch('/leads', apiKey, domain, {
                method: 'POST',
                body: JSON.stringify({ lead }),
            }) as any;
            return data.lead ?? data;
        }

        case 'get_lead': {
            if (!args.id) throw new Error('id is required');
            const data = await freshsalesFetch(`/leads/${args.id}`, apiKey, domain) as any;
            return data.lead ?? data;
        }

        case 'convert_lead': {
            if (!args.id) throw new Error('id is required');
            const data = await freshsalesFetch(`/leads/${args.id}/convert`, apiKey, domain, {
                method: 'POST',
                body: JSON.stringify({}),
            }) as any;
            return data;
        }

        case 'list_deals': {
            const q = buildQuery({
                per_page: args.per_page ?? 25,
                page: args.page,
                stage_id: args.stage_id,
                filter_id: args.filter_id,
            });
            const data = await freshsalesFetch(`/deals${q}`, apiKey, domain) as any;
            return { deals: data.deals ?? [], meta: data.meta ?? {} };
        }

        case 'create_deal': {
            if (!args.name) throw new Error('name is required');
            const deal: Record<string, unknown> = { name: args.name };
            if (args.amount != null) deal.amount = args.amount;
            if (args.expected_close) deal.expected_close = args.expected_close;
            if (args.deal_stage_id) deal.deal_stage_id = args.deal_stage_id;
            if (args.deal_pipeline_id) deal.deal_pipeline_id = args.deal_pipeline_id;
            const data = await freshsalesFetch('/deals', apiKey, domain, {
                method: 'POST',
                body: JSON.stringify({ deal }),
            }) as any;
            return data.deal ?? data;
        }

        case 'get_deal': {
            if (!args.id) throw new Error('id is required');
            const data = await freshsalesFetch(`/deals/${args.id}`, apiKey, domain) as any;
            return data.deal ?? data;
        }

        case 'update_deal': {
            if (!args.id) throw new Error('id is required');
            const { id, ...rest } = args;
            const deal: Record<string, unknown> = {};
            if (rest.name) deal.name = rest.name;
            if (rest.amount != null) deal.amount = rest.amount;
            if (rest.expected_close) deal.expected_close = rest.expected_close;
            if (rest.deal_stage_id) deal.deal_stage_id = rest.deal_stage_id;
            const data = await freshsalesFetch(`/deals/${id}`, apiKey, domain, {
                method: 'PUT',
                body: JSON.stringify({ deal }),
            }) as any;
            return data.deal ?? data;
        }

        case 'list_accounts': {
            const q = buildQuery({ per_page: args.per_page ?? 25, page: args.page });
            const data = await freshsalesFetch(`/sales_accounts${q}`, apiKey, domain) as any;
            return { accounts: data.sales_accounts ?? [], meta: data.meta ?? {} };
        }

        case 'create_account': {
            if (!args.name) throw new Error('name is required');
            const sales_account: Record<string, unknown> = { name: args.name };
            if (args.phone) sales_account.phone = args.phone;
            if (args.website) sales_account.website = args.website;
            if (args.industry_type_id) sales_account.industry_type_id = args.industry_type_id;
            const data = await freshsalesFetch('/sales_accounts', apiKey, domain, {
                method: 'POST',
                body: JSON.stringify({ sales_account }),
            }) as any;
            return data.sales_account ?? data;
        }

        case 'create_note': {
            if (!args.description) throw new Error('description is required');
            if (!args.targetable_type) throw new Error('targetable_type is required');
            if (!args.targetable_id) throw new Error('targetable_id is required');
            const data = await freshsalesFetch('/notes', apiKey, domain, {
                method: 'POST',
                body: JSON.stringify({
                    note: {
                        description: args.description,
                        targetable_type: args.targetable_type,
                        targetable_id: args.targetable_id,
                    },
                }),
            }) as any;
            return data.note ?? data;
        }

        case 'list_notes': {
            if (!args.targetable_type) throw new Error('targetable_type is required');
            if (!args.targetable_id) throw new Error('targetable_id is required');
            const data = await freshsalesFetch(
                `/notes?targetable_type=${encodeURIComponent(String(args.targetable_type))}&targetable_id=${args.targetable_id}`,
                apiKey,
                domain,
            ) as any;
            return { notes: data.notes ?? [] };
        }

        case 'search': {
            if (!args.query) throw new Error('query is required');
            const include = args.include ?? 'contact,lead,deal,sales_account';
            const data = await freshsalesFetch(
                `/search?q=${encodeURIComponent(String(args.query))}&include=${encodeURIComponent(String(include))}`,
                apiKey,
                domain,
            ) as any;
            return data;
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-freshsales', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-freshsales', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const secrets = getSecrets(request);
            if (!secrets) {
                return rpcErr(id, -32001, 'Missing required secrets: FRESHSALES_API_KEY, FRESHSALES_DOMAIN');
            }
            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};
            try {
                const result = await callTool(toolName, toolArgs, secrets.apiKey, secrets.domain);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
