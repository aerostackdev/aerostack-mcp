/**
 * Zoho CRM MCP Worker
 * Implements MCP protocol over HTTP for Zoho CRM operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   ZOHO_CRM_ACCESS_TOKEN → X-Mcp-Secret-ZOHO-CRM-ACCESS-TOKEN
 */

const ZOHO_BASE = 'https://www.zohoapis.com/crm/v6';

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
        name: 'list_leads',
        description: 'List leads from Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                fields: { type: 'string', description: 'Comma-separated field names (default: First_Name,Last_Name,Email,Phone,Company,Lead_Source)' },
                per_page: { type: 'number', description: 'Records per page (default: 20)' },
                page: { type: 'number', description: 'Page number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_lead',
        description: 'Create a new lead in Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                last_name: { type: 'string', description: 'Last name (required)' },
                first_name: { type: 'string', description: 'First name' },
                email: { type: 'string', description: 'Email address' },
                phone: { type: 'string', description: 'Phone number' },
                company: { type: 'string', description: 'Company name' },
                lead_source: { type: 'string', description: 'Lead source' },
                description: { type: 'string', description: 'Description' },
            },
            required: ['last_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_lead',
        description: 'Get a specific lead by ID',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Lead ID (required)' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_lead',
        description: 'Update a lead in Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Lead ID (required)' },
                first_name: { type: 'string' },
                last_name: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
                company: { type: 'string' },
                description: { type: 'string' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_lead',
        description: 'Delete a lead from Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Lead ID (required)' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'convert_lead',
        description: 'Convert a lead to contact/account/deal',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Lead ID (required)' },
                deal_name: { type: 'string', description: 'Deal name for converted deal' },
                account_name: { type: 'string', description: 'Account name' },
                assign_to: { type: 'string', description: 'User ID to assign to' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_contacts',
        description: 'List contacts from Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                fields: { type: 'string', description: 'Comma-separated field names' },
                per_page: { type: 'number', description: 'Records per page (default: 20)' },
                page: { type: 'number', description: 'Page number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_contact',
        description: 'Create a new contact in Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                last_name: { type: 'string', description: 'Last name (required)' },
                first_name: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
                account_name: { type: 'string' },
                department: { type: 'string' },
                title: { type: 'string' },
            },
            required: ['last_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_contact',
        description: 'Get a specific contact by ID',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Contact ID (required)' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_contact',
        description: 'Update a contact in Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Contact ID (required)' },
                first_name: { type: 'string' },
                last_name: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
                title: { type: 'string' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_deals',
        description: 'List deals from Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                fields: { type: 'string', description: 'Comma-separated field names (default: Deal_Name,Stage,Amount,Closing_Date,Account_Name)' },
                per_page: { type: 'number', description: 'Records per page (default: 20)' },
                page: { type: 'number', description: 'Page number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_deal',
        description: 'Create a new deal in Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                deal_name: { type: 'string', description: 'Deal name (required)' },
                stage: { type: 'string', description: 'Deal stage (required)' },
                amount: { type: 'number', description: 'Deal amount' },
                closing_date: { type: 'string', description: 'Closing date (YYYY-MM-DD)' },
                account_name: { type: 'string', description: 'Account name' },
                probability: { type: 'number', description: 'Probability percentage' },
            },
            required: ['deal_name', 'stage'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_deal',
        description: 'Get a specific deal by ID',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Deal ID (required)' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_deal',
        description: 'Update a deal in Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Deal ID (required)' },
                deal_name: { type: 'string' },
                stage: { type: 'string' },
                amount: { type: 'number' },
                closing_date: { type: 'string' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_accounts',
        description: 'List accounts from Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Records per page (default: 20)' },
                page: { type: 'number', description: 'Page number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_account',
        description: 'Create a new account in Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                account_name: { type: 'string', description: 'Account name (required)' },
                phone: { type: 'string' },
                website: { type: 'string' },
                industry: { type: 'string' },
                annual_revenue: { type: 'number' },
            },
            required: ['account_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'search_records',
        description: 'Search records across Zoho CRM modules',
        inputSchema: {
            type: 'object',
            properties: {
                module: { type: 'string', description: 'Module name (required)', enum: ['Leads', 'Contacts', 'Deals', 'Accounts', 'Tasks'] },
                criteria: { type: 'string', description: 'Search criteria string' },
                per_page: { type: 'number', description: 'Records per page (default: 20)' },
            },
            required: ['module'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_task',
        description: 'Create a new task in Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                subject: { type: 'string', description: 'Task subject (required)' },
                due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
                status: { type: 'string', description: 'Task status (default: Not Started)' },
                priority: { type: 'string', description: 'Priority (default: Normal)' },
                description: { type: 'string', description: 'Task description' },
            },
            required: ['subject'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_tasks',
        description: 'List tasks from Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Records per page (default: 20)' },
                page: { type: 'number', description: 'Page number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_modules',
        description: 'Get all available modules in Zoho CRM',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function zohoFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${ZOHO_BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Zoho CRM API ${res.status}: ${text}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'list_leads': {
            const fields = String(args.fields ?? 'First_Name,Last_Name,Email,Phone,Company,Lead_Source');
            const per_page = Number(args.per_page ?? 20);
            const page = args.page ? Number(args.page) : undefined;
            const url = new URL(`${ZOHO_BASE}/Leads`);
            url.searchParams.set('fields', fields);
            url.searchParams.set('per_page', String(per_page));
            if (page) url.searchParams.set('page', String(page));
            const data = await zohoFetch(`/Leads?fields=${fields}&per_page=${per_page}${page ? `&page=${page}` : ''}`, token) as any;
            return { leads: data.data ?? [], info: data.info ?? {} };
        }

        case 'create_lead': {
            if (!args.last_name) throw new Error('last_name is required');
            const record: Record<string, unknown> = { Last_Name: args.last_name };
            if (args.first_name) record.First_Name = args.first_name;
            if (args.email) record.Email = args.email;
            if (args.phone) record.Phone = args.phone;
            if (args.company) record.Company = args.company;
            if (args.lead_source) record.Lead_Source = args.lead_source;
            if (args.description) record.Description = args.description;
            const data = await zohoFetch('/Leads', token, {
                method: 'POST',
                body: JSON.stringify({ data: [record] }),
            }) as any;
            const item = data.data?.[0];
            return { id: item?.details?.id, message: item?.message, status: item?.code };
        }

        case 'get_lead': {
            if (!args.id) throw new Error('id is required');
            const data = await zohoFetch(`/Leads/${args.id}`, token) as any;
            return data.data?.[0] ?? {};
        }

        case 'update_lead': {
            if (!args.id) throw new Error('id is required');
            const { id, ...rest } = args;
            const record: Record<string, unknown> = {};
            if (rest.first_name) record.First_Name = rest.first_name;
            if (rest.last_name) record.Last_Name = rest.last_name;
            if (rest.email) record.Email = rest.email;
            if (rest.phone) record.Phone = rest.phone;
            if (rest.company) record.Company = rest.company;
            if (rest.description) record.Description = rest.description;
            const data = await zohoFetch(`/Leads/${id}`, token, {
                method: 'PUT',
                body: JSON.stringify({ data: [record] }),
            }) as any;
            const item = data.data?.[0];
            return { id: item?.details?.id, message: item?.message, status: item?.code };
        }

        case 'delete_lead': {
            if (!args.id) throw new Error('id is required');
            await zohoFetch(`/Leads/${args.id}`, token, { method: 'DELETE' });
            return { success: true, id: args.id };
        }

        case 'convert_lead': {
            if (!args.id) throw new Error('id is required');
            const body: Record<string, unknown> = {};
            if (args.deal_name) body.Deals = [{ Deal_Name: args.deal_name }];
            if (args.account_name) body.Accounts = [{ Account_Name: args.account_name }];
            if (args.assign_to) body.assign_to = { id: args.assign_to };
            const data = await zohoFetch(`/Leads/${args.id}/actions/convert`, token, {
                method: 'POST',
                body: JSON.stringify({ data: [body] }),
            }) as any;
            return data.data?.[0] ?? {};
        }

        case 'list_contacts': {
            const fields = String(args.fields ?? 'First_Name,Last_Name,Email,Phone,Account_Name');
            const per_page = Number(args.per_page ?? 20);
            const page = args.page ? `&page=${args.page}` : '';
            const data = await zohoFetch(`/Contacts?fields=${fields}&per_page=${per_page}${page}`, token) as any;
            return { contacts: data.data ?? [], info: data.info ?? {} };
        }

        case 'create_contact': {
            if (!args.last_name) throw new Error('last_name is required');
            const record: Record<string, unknown> = { Last_Name: args.last_name };
            if (args.first_name) record.First_Name = args.first_name;
            if (args.email) record.Email = args.email;
            if (args.phone) record.Phone = args.phone;
            if (args.account_name) record.Account_Name = args.account_name;
            if (args.department) record.Department = args.department;
            if (args.title) record.Title = args.title;
            const data = await zohoFetch('/Contacts', token, {
                method: 'POST',
                body: JSON.stringify({ data: [record] }),
            }) as any;
            const item = data.data?.[0];
            return { id: item?.details?.id, message: item?.message };
        }

        case 'get_contact': {
            if (!args.id) throw new Error('id is required');
            const data = await zohoFetch(`/Contacts/${args.id}`, token) as any;
            return data.data?.[0] ?? {};
        }

        case 'update_contact': {
            if (!args.id) throw new Error('id is required');
            const { id, ...rest } = args;
            const record: Record<string, unknown> = {};
            if (rest.first_name) record.First_Name = rest.first_name;
            if (rest.last_name) record.Last_Name = rest.last_name;
            if (rest.email) record.Email = rest.email;
            if (rest.phone) record.Phone = rest.phone;
            if (rest.title) record.Title = rest.title;
            const data = await zohoFetch(`/Contacts/${id}`, token, {
                method: 'PUT',
                body: JSON.stringify({ data: [record] }),
            }) as any;
            const item = data.data?.[0];
            return { id: item?.details?.id, message: item?.message };
        }

        case 'list_deals': {
            const fields = String(args.fields ?? 'Deal_Name,Stage,Amount,Closing_Date,Account_Name');
            const per_page = Number(args.per_page ?? 20);
            const page = args.page ? `&page=${args.page}` : '';
            const data = await zohoFetch(`/Deals?fields=${fields}&per_page=${per_page}${page}`, token) as any;
            return { deals: data.data ?? [], info: data.info ?? {} };
        }

        case 'create_deal': {
            if (!args.deal_name) throw new Error('deal_name is required');
            if (!args.stage) throw new Error('stage is required');
            const record: Record<string, unknown> = { Deal_Name: args.deal_name, Stage: args.stage };
            if (args.amount != null) record.Amount = args.amount;
            if (args.closing_date) record.Closing_Date = args.closing_date;
            if (args.account_name) record.Account_Name = args.account_name;
            if (args.probability != null) record.Probability = args.probability;
            const data = await zohoFetch('/Deals', token, {
                method: 'POST',
                body: JSON.stringify({ data: [record] }),
            }) as any;
            const item = data.data?.[0];
            return { id: item?.details?.id, message: item?.message };
        }

        case 'get_deal': {
            if (!args.id) throw new Error('id is required');
            const data = await zohoFetch(`/Deals/${args.id}`, token) as any;
            return data.data?.[0] ?? {};
        }

        case 'update_deal': {
            if (!args.id) throw new Error('id is required');
            const { id, ...rest } = args;
            const record: Record<string, unknown> = {};
            if (rest.deal_name) record.Deal_Name = rest.deal_name;
            if (rest.stage) record.Stage = rest.stage;
            if (rest.amount != null) record.Amount = rest.amount;
            if (rest.closing_date) record.Closing_Date = rest.closing_date;
            const data = await zohoFetch(`/Deals/${id}`, token, {
                method: 'PUT',
                body: JSON.stringify({ data: [record] }),
            }) as any;
            const item = data.data?.[0];
            return { id: item?.details?.id, message: item?.message };
        }

        case 'list_accounts': {
            const per_page = Number(args.per_page ?? 20);
            const page = args.page ? `&page=${args.page}` : '';
            const data = await zohoFetch(`/Accounts?per_page=${per_page}${page}`, token) as any;
            return { accounts: data.data ?? [], info: data.info ?? {} };
        }

        case 'create_account': {
            if (!args.account_name) throw new Error('account_name is required');
            const record: Record<string, unknown> = { Account_Name: args.account_name };
            if (args.phone) record.Phone = args.phone;
            if (args.website) record.Website = args.website;
            if (args.industry) record.Industry = args.industry;
            if (args.annual_revenue != null) record.Annual_Revenue = args.annual_revenue;
            const data = await zohoFetch('/Accounts', token, {
                method: 'POST',
                body: JSON.stringify({ data: [record] }),
            }) as any;
            const item = data.data?.[0];
            return { id: item?.details?.id, message: item?.message };
        }

        case 'search_records': {
            if (!args.module) throw new Error('module is required');
            const per_page = Number(args.per_page ?? 20);
            let query = `/Accounts/search?per_page=${per_page}`;
            if (String(args.module) !== 'Accounts') {
                query = `/${args.module}/search?per_page=${per_page}`;
            } else {
                query = `/Accounts/search?per_page=${per_page}`;
            }
            if (args.criteria) query += `&criteria=${encodeURIComponent(String(args.criteria))}`;
            const data = await zohoFetch(query.replace('/Accounts/search', `/${args.module}/search`), token) as any;
            return { records: data.data ?? [], info: data.info ?? {} };
        }

        case 'create_task': {
            if (!args.subject) throw new Error('subject is required');
            const record: Record<string, unknown> = {
                Subject: args.subject,
                Status: args.status ?? 'Not Started',
                Priority: args.priority ?? 'Normal',
            };
            if (args.due_date) record.Due_Date = args.due_date;
            if (args.description) record.Description = args.description;
            const data = await zohoFetch('/Tasks', token, {
                method: 'POST',
                body: JSON.stringify({ data: [record] }),
            }) as any;
            const item = data.data?.[0];
            return { id: item?.details?.id, message: item?.message };
        }

        case 'list_tasks': {
            const per_page = Number(args.per_page ?? 20);
            const page = args.page ? `&page=${args.page}` : '';
            const data = await zohoFetch(`/Tasks?per_page=${per_page}${page}`, token) as any;
            return { tasks: data.data ?? [], info: data.info ?? {} };
        }

        case 'get_modules': {
            const data = await zohoFetch('/settings/modules', token) as any;
            return (data.modules ?? []).map((m: any) => ({
                api_name: m.api_name,
                module_name: m.module_name,
                singular_label: m.singular_label,
                plural_label: m.plural_label,
            }));
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-zoho-crm', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-zoho-crm', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-ZOHO-CRM-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing required secret: ZOHO_CRM_ACCESS_TOKEN');
            }
            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};
            try {
                const result = await callTool(toolName, toolArgs, token);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
