/**
 * Zoho Books MCP Worker
 * Implements MCP protocol over HTTP for Zoho Books accounting operations.
 *
 * Secrets:
 *   ZOHO_BOOKS_ACCESS_TOKEN     → X-Mcp-Secret-ZOHO-BOOKS-ACCESS-TOKEN
 *   ZOHO_BOOKS_ORGANIZATION_ID  → X-Mcp-Secret-ZOHO-BOOKS-ORGANIZATION-ID
 */

const BASE = 'https://www.zohoapis.com/books/v3';

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
        description: 'List contacts (customers and vendors)',
        inputSchema: {
            type: 'object',
            properties: {
                contact_type: { type: 'string', description: 'customer or vendor' },
                search_text: { type: 'string', description: 'Search term' },
                per_page: { type: 'number', description: 'Results per page (default 25)' },
                page: { type: 'number', description: 'Page number' },
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
                contact_name: { type: 'string', description: 'Contact name' },
                contact_type: { type: 'string', description: 'customer or vendor' },
                email: { type: 'string', description: 'Email address' },
                phone: { type: 'string', description: 'Phone number' },
            },
            required: ['contact_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_contact',
        description: 'Get a contact by ID',
        inputSchema: {
            type: 'object',
            properties: { contact_id: { type: 'string', description: 'Contact ID' } },
            required: ['contact_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_invoices',
        description: 'List invoices with optional filters',
        inputSchema: {
            type: 'object',
            properties: {
                status: { type: 'string', description: 'Filter by status' },
                customer_id: { type: 'string', description: 'Filter by customer' },
                per_page: { type: 'number', description: 'Results per page' },
                page: { type: 'number', description: 'Page number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_invoice',
        description: 'Create a new invoice',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: { type: 'string', description: 'Customer ID' },
                date: { type: 'string', description: 'Invoice date YYYY-MM-DD' },
                due_date: { type: 'string', description: 'Due date YYYY-MM-DD' },
                line_items: { type: 'array', description: 'Array of line items with name, rate, quantity' },
            },
            required: ['customer_id', 'line_items'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_invoice',
        description: 'Get an invoice by ID',
        inputSchema: {
            type: 'object',
            properties: { invoice_id: { type: 'string', description: 'Invoice ID' } },
            required: ['invoice_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'email_invoice',
        description: 'Send an invoice via email',
        inputSchema: {
            type: 'object',
            properties: {
                invoice_id: { type: 'string', description: 'Invoice ID' },
                to_mail_ids: { type: 'array', description: 'Array of recipient emails' },
                subject: { type: 'string', description: 'Email subject' },
                body: { type: 'string', description: 'Email body' },
            },
            required: ['invoice_id', 'to_mail_ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_bills',
        description: 'List vendor bills',
        inputSchema: {
            type: 'object',
            properties: {
                status: { type: 'string', description: 'Filter by status' },
                vendor_id: { type: 'string', description: 'Filter by vendor' },
                per_page: { type: 'number', description: 'Results per page' },
                page: { type: 'number', description: 'Page number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_bill',
        description: 'Create a vendor bill',
        inputSchema: {
            type: 'object',
            properties: {
                vendor_id: { type: 'string', description: 'Vendor ID' },
                date: { type: 'string', description: 'Bill date YYYY-MM-DD' },
                due_date: { type: 'string', description: 'Due date YYYY-MM-DD' },
                line_items: { type: 'array', description: 'Array of line items' },
            },
            required: ['vendor_id', 'line_items'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_estimates',
        description: 'List estimates/quotes',
        inputSchema: {
            type: 'object',
            properties: {
                status: { type: 'string', description: 'Filter by status' },
                customer_id: { type: 'string', description: 'Filter by customer' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_estimate',
        description: 'Create an estimate/quote',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: { type: 'string', description: 'Customer ID' },
                date: { type: 'string', description: 'Estimate date YYYY-MM-DD' },
                expiry_date: { type: 'string', description: 'Expiry date YYYY-MM-DD' },
                line_items: { type: 'array', description: 'Array of line items' },
            },
            required: ['customer_id', 'line_items'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_expenses',
        description: 'List expenses',
        inputSchema: {
            type: 'object',
            properties: {
                filter_by: { type: 'string', description: 'Filter by expense type' },
                from_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
                to_date: { type: 'string', description: 'End date YYYY-MM-DD' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_expense',
        description: 'Create an expense',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: { type: 'string', description: 'Expense account ID' },
                date: { type: 'string', description: 'Expense date YYYY-MM-DD' },
                total: { type: 'number', description: 'Total amount' },
                vendor_id: { type: 'string', description: 'Vendor ID' },
                description: { type: 'string', description: 'Expense description' },
            },
            required: ['account_id', 'date', 'total'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_items',
        description: 'List products and services',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_item',
        description: 'Create a new product or service',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Item name' },
                rate: { type: 'number', description: 'Item rate' },
                item_type: { type: 'string', description: 'sales, purchases, or sales_and_purchases' },
            },
            required: ['name', 'rate'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_payments',
        description: 'List customer payments',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_payment',
        description: 'Record a customer payment',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: { type: 'string', description: 'Customer ID' },
                payment_mode: { type: 'string', description: 'Payment mode (e.g. Cash, Check, Bank Transfer)' },
                amount: { type: 'number', description: 'Payment amount' },
                date: { type: 'string', description: 'Payment date YYYY-MM-DD' },
                invoices: { type: 'array', description: 'Array of invoice objects with invoice_id and amount_applied' },
            },
            required: ['customer_id', 'payment_mode', 'amount', 'date'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_balance_sheet',
        description: 'Get the balance sheet report',
        inputSchema: {
            type: 'object',
            properties: { date: { type: 'string', description: 'Report date YYYY-MM-DD' } },
            required: ['date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_profit_loss',
        description: 'Get profit and loss report',
        inputSchema: {
            type: 'object',
            properties: {
                from_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
                to_date: { type: 'string', description: 'End date YYYY-MM-DD' },
            },
            required: ['from_date', 'to_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_organization',
        description: 'Get organization details',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function zohoFetch(path: string, token: string, orgId: string, options: RequestInit = {}): Promise<unknown> {
    const separator = path.includes('?') ? '&' : '?';
    const url = `${BASE}${path}${separator}organization_id=${orgId}`;
    const res = await fetch(url, {
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
        throw new Error(`Zoho Books API ${res.status}: ${text}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string, orgId: string): Promise<unknown> {
    switch (name) {
        case 'list_contacts': {
            const params = new URLSearchParams();
            if (args.contact_type) params.set('contact_type', String(args.contact_type));
            if (args.search_text) params.set('search_text', String(args.search_text));
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            const q = params.toString();
            return zohoFetch(`/contacts${q ? '?' + q : ''}`, token, orgId);
        }

        case 'create_contact': {
            if (!args.contact_name) throw new Error('contact_name is required');
            const body: Record<string, unknown> = { contact_name: args.contact_name };
            if (args.contact_type) body.contact_type = args.contact_type;
            if (args.email) body.email = args.email;
            if (args.phone) body.phone = args.phone;
            return zohoFetch('/contacts', token, orgId, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'get_contact': {
            if (!args.contact_id) throw new Error('contact_id is required');
            return zohoFetch(`/contacts/${args.contact_id}`, token, orgId);
        }

        case 'list_invoices': {
            const params = new URLSearchParams();
            if (args.status) params.set('status', String(args.status));
            if (args.customer_id) params.set('customer_id', String(args.customer_id));
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            const q = params.toString();
            return zohoFetch(`/invoices${q ? '?' + q : ''}`, token, orgId);
        }

        case 'create_invoice': {
            if (!args.customer_id) throw new Error('customer_id is required');
            if (!args.line_items) throw new Error('line_items is required');
            const body: Record<string, unknown> = {
                customer_id: args.customer_id,
                line_items: args.line_items,
            };
            if (args.date) body.date = args.date;
            if (args.due_date) body.due_date = args.due_date;
            return zohoFetch('/invoices', token, orgId, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'get_invoice': {
            if (!args.invoice_id) throw new Error('invoice_id is required');
            return zohoFetch(`/invoices/${args.invoice_id}`, token, orgId);
        }

        case 'email_invoice': {
            if (!args.invoice_id) throw new Error('invoice_id is required');
            if (!args.to_mail_ids) throw new Error('to_mail_ids is required');
            const body: Record<string, unknown> = { to_mail_ids: args.to_mail_ids };
            if (args.subject) body.subject = args.subject;
            if (args.body) body.body = args.body;
            return zohoFetch(`/invoices/${args.invoice_id}/email`, token, orgId, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_bills': {
            const params = new URLSearchParams();
            if (args.status) params.set('status', String(args.status));
            if (args.vendor_id) params.set('vendor_id', String(args.vendor_id));
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            const q = params.toString();
            return zohoFetch(`/bills${q ? '?' + q : ''}`, token, orgId);
        }

        case 'create_bill': {
            if (!args.vendor_id) throw new Error('vendor_id is required');
            if (!args.line_items) throw new Error('line_items is required');
            const body: Record<string, unknown> = { vendor_id: args.vendor_id, line_items: args.line_items };
            if (args.date) body.date = args.date;
            if (args.due_date) body.due_date = args.due_date;
            return zohoFetch('/bills', token, orgId, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_estimates': {
            const params = new URLSearchParams();
            if (args.status) params.set('status', String(args.status));
            if (args.customer_id) params.set('customer_id', String(args.customer_id));
            const q = params.toString();
            return zohoFetch(`/estimates${q ? '?' + q : ''}`, token, orgId);
        }

        case 'create_estimate': {
            if (!args.customer_id) throw new Error('customer_id is required');
            if (!args.line_items) throw new Error('line_items is required');
            const body: Record<string, unknown> = { customer_id: args.customer_id, line_items: args.line_items };
            if (args.date) body.date = args.date;
            if (args.expiry_date) body.expiry_date = args.expiry_date;
            return zohoFetch('/estimates', token, orgId, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_expenses': {
            const params = new URLSearchParams();
            if (args.filter_by) params.set('filter_by', String(args.filter_by));
            if (args.from_date) params.set('from_date', String(args.from_date));
            if (args.to_date) params.set('to_date', String(args.to_date));
            const q = params.toString();
            return zohoFetch(`/expenses${q ? '?' + q : ''}`, token, orgId);
        }

        case 'create_expense': {
            if (!args.account_id) throw new Error('account_id is required');
            if (!args.date) throw new Error('date is required');
            if (args.total == null) throw new Error('total is required');
            const body: Record<string, unknown> = { account_id: args.account_id, date: args.date, total: args.total };
            if (args.vendor_id) body.vendor_id = args.vendor_id;
            if (args.description) body.description = args.description;
            return zohoFetch('/expenses', token, orgId, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_items':
            return zohoFetch('/items', token, orgId);

        case 'create_item': {
            if (!args.name) throw new Error('name is required');
            if (args.rate == null) throw new Error('rate is required');
            const body: Record<string, unknown> = { name: args.name, rate: args.rate };
            if (args.item_type) body.item_type = args.item_type;
            return zohoFetch('/items', token, orgId, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_payments':
            return zohoFetch('/customerpayments', token, orgId);

        case 'create_payment': {
            if (!args.customer_id) throw new Error('customer_id is required');
            if (!args.payment_mode) throw new Error('payment_mode is required');
            if (args.amount == null) throw new Error('amount is required');
            if (!args.date) throw new Error('date is required');
            const body: Record<string, unknown> = {
                customer_id: args.customer_id,
                payment_mode: args.payment_mode,
                amount: args.amount,
                date: args.date,
            };
            if (args.invoices) body.invoices = args.invoices;
            return zohoFetch('/customerpayments', token, orgId, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'get_balance_sheet': {
            if (!args.date) throw new Error('date is required');
            return zohoFetch(`/reports/balancesheet?date=${args.date}`, token, orgId);
        }

        case 'get_profit_loss': {
            if (!args.from_date) throw new Error('from_date is required');
            if (!args.to_date) throw new Error('to_date is required');
            return zohoFetch(`/reports/profitandloss?from_date=${args.from_date}&to_date=${args.to_date}`, token, orgId);
        }

        case 'get_organization':
            return zohoFetch(`/organizations/${orgId}`, token, orgId);

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'zoho-books-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'zoho-books-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-ZOHO-BOOKS-ACCESS-TOKEN');
            const orgId = request.headers.get('X-Mcp-Secret-ZOHO-BOOKS-ORGANIZATION-ID');

            if (!token || !orgId) {
                return rpcErr(id, -32001, 'Missing required secrets: ZOHO_BOOKS_ACCESS_TOKEN, ZOHO_BOOKS_ORGANIZATION_ID');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, token, orgId);
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
