/**
 * FreshBooks MCP Worker
 * Implements MCP protocol over HTTP for FreshBooks invoicing operations.
 *
 * Secrets:
 *   FRESHBOOKS_ACCESS_TOKEN → X-Mcp-Secret-FRESHBOOKS-ACCESS-TOKEN
 *   FRESHBOOKS_ACCOUNT_ID   → X-Mcp-Secret-FRESHBOOKS-ACCOUNT-ID
 */

const BASE = 'https://api.freshbooks.com';

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
        description: 'Verify FreshBooks credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_account_info',
        description: 'Get authenticated user info including business memberships',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_clients',
        description: 'List clients in the account',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Results per page (default 25)' },
                page: { type: 'number', description: 'Page number' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_client',
        description: 'Create a new client',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Client email' },
                fname: { type: 'string', description: 'First name' },
                lname: { type: 'string', description: 'Last name' },
                organization: { type: 'string', description: 'Company name' },
                mob_phone: { type: 'string', description: 'Mobile phone' },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_client',
        description: 'Get a client by ID',
        inputSchema: {
            type: 'object',
            properties: { client_id: { type: 'string', description: 'Client ID' } },
            required: ['client_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_client',
        description: 'Update an existing client',
        inputSchema: {
            type: 'object',
            properties: {
                client_id: { type: 'string', description: 'Client ID' },
                email: { type: 'string', description: 'Email' },
                fname: { type: 'string', description: 'First name' },
                lname: { type: 'string', description: 'Last name' },
                organization: { type: 'string', description: 'Company name' },
            },
            required: ['client_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_invoices',
        description: 'List invoices with optional filters',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Results per page' },
                page: { type: 'number', description: 'Page number' },
                'search[status]': { type: 'string', description: 'Status filter: draft, sent, viewed, paid, partial, unpaid, overdue' },
                'search[client_id]': { type: 'string', description: 'Filter by client ID' },
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
                client_id: { type: 'string', description: 'Client ID' },
                create_date: { type: 'string', description: 'Creation date YYYY-MM-DD' },
                due_offset_days: { type: 'number', description: 'Days until due (default 30)' },
                currency_code: { type: 'string', description: 'Currency code (default USD)' },
                lines: { type: 'array', description: 'Array of line items with name, qty, unit_cost' },
                notes: { type: 'string', description: 'Invoice notes' },
            },
            required: ['client_id', 'lines'],
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
        name: 'update_invoice',
        description: 'Update an invoice',
        inputSchema: {
            type: 'object',
            properties: {
                invoice_id: { type: 'string', description: 'Invoice ID' },
                notes: { type: 'string', description: 'Notes' },
                lines: { type: 'array', description: 'Updated line items' },
            },
            required: ['invoice_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_invoice',
        description: 'Delete (archive) an invoice',
        inputSchema: {
            type: 'object',
            properties: { invoice_id: { type: 'string', description: 'Invoice ID' } },
            required: ['invoice_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'send_invoice',
        description: 'Send an invoice via email',
        inputSchema: {
            type: 'object',
            properties: { invoice_id: { type: 'string', description: 'Invoice ID' } },
            required: ['invoice_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_payments',
        description: 'List payments',
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
        name: 'create_payment',
        description: 'Record a payment for an invoice',
        inputSchema: {
            type: 'object',
            properties: {
                invoice_id: { type: 'string', description: 'Invoice ID' },
                amount: { type: 'string', description: 'Payment amount' },
                date: { type: 'string', description: 'Payment date YYYY-MM-DD' },
                type: { type: 'string', description: 'Payment type: Check, Credit, Cash, PayPal' },
            },
            required: ['invoice_id', 'amount'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_expenses',
        description: 'List expenses',
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
        name: 'create_expense',
        description: 'Create a new expense',
        inputSchema: {
            type: 'object',
            properties: {
                amount: { type: 'string', description: 'Expense amount' },
                date: { type: 'string', description: 'Date YYYY-MM-DD' },
                note: { type: 'string', description: 'Expense note' },
                category_id: { type: 'string', description: 'Expense category ID' },
            },
            required: ['amount'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_items',
        description: 'List product/service items',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_item',
        description: 'Create a new product/service item',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Item name' },
                qty: { type: 'number', description: 'Default quantity' },
                unit_cost: { type: 'string', description: 'Unit cost amount' },
                currency_code: { type: 'string', description: 'Currency code (default USD)' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_profit_loss',
        description: 'Get profit and loss report for a date range',
        inputSchema: {
            type: 'object',
            properties: {
                date_from: { type: 'string', description: 'Start date YYYY-MM-DD' },
                date_to: { type: 'string', description: 'End date YYYY-MM-DD' },
            },
            required: ['date_from', 'date_to'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function fbFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`FreshBooks API ${res.status}: ${text}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string, accountId: string): Promise<unknown> {
    const base = `/accounting/account/${accountId}`;

    switch (name) {
        case '_ping':
            return fbFetch('/auth/api/v1/users/me', token);

        case 'get_account_info':
            return fbFetch('/auth/api/v1/users/me', token);

        case 'list_clients': {
            const params = new URLSearchParams();
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            const q = params.toString();
            return fbFetch(`${base}/users/clients${q ? '?' + q : ''}`, token);
        }

        case 'create_client': {
            if (!args.email) throw new Error('email is required');
            const client: Record<string, unknown> = { email: args.email };
            if (args.fname) client.fname = args.fname;
            if (args.lname) client.lname = args.lname;
            if (args.organization) client.organization = args.organization;
            if (args.mob_phone) client.mob_phone = args.mob_phone;
            return fbFetch(`${base}/users/clients`, token, { method: 'POST', body: JSON.stringify({ client }) });
        }

        case 'get_client': {
            if (!args.client_id) throw new Error('client_id is required');
            return fbFetch(`${base}/users/clients/${args.client_id}`, token);
        }

        case 'update_client': {
            if (!args.client_id) throw new Error('client_id is required');
            const client: Record<string, unknown> = {};
            if (args.email) client.email = args.email;
            if (args.fname) client.fname = args.fname;
            if (args.lname) client.lname = args.lname;
            if (args.organization) client.organization = args.organization;
            return fbFetch(`${base}/users/clients/${args.client_id}`, token, { method: 'PUT', body: JSON.stringify({ client }) });
        }

        case 'list_invoices': {
            const params = new URLSearchParams();
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            if (args['search[status]']) params.set('search[status]', String(args['search[status]']));
            if (args['search[client_id]']) params.set('search[client_id]', String(args['search[client_id]']));
            const q = params.toString();
            return fbFetch(`${base}/invoices/invoices${q ? '?' + q : ''}`, token);
        }

        case 'create_invoice': {
            if (!args.client_id) throw new Error('client_id is required');
            if (!args.lines) throw new Error('lines is required');
            const invoice: Record<string, unknown> = {
                client_id: args.client_id,
                create_date: args.create_date ?? new Date().toISOString().slice(0, 10),
                due_offset_days: args.due_offset_days ?? 30,
                currency_code: args.currency_code ?? 'USD',
                lines: args.lines,
            };
            if (args.notes) invoice.notes = args.notes;
            if (args.terms) invoice.terms = args.terms;
            return fbFetch(`${base}/invoices/invoices`, token, { method: 'POST', body: JSON.stringify({ invoice }) });
        }

        case 'get_invoice': {
            if (!args.invoice_id) throw new Error('invoice_id is required');
            return fbFetch(`${base}/invoices/invoices/${args.invoice_id}`, token);
        }

        case 'update_invoice': {
            if (!args.invoice_id) throw new Error('invoice_id is required');
            const invoice: Record<string, unknown> = {};
            if (args.notes) invoice.notes = args.notes;
            if (args.lines) invoice.lines = args.lines;
            return fbFetch(`${base}/invoices/invoices/${args.invoice_id}`, token, { method: 'PUT', body: JSON.stringify({ invoice }) });
        }

        case 'delete_invoice': {
            if (!args.invoice_id) throw new Error('invoice_id is required');
            return fbFetch(`${base}/invoices/invoices/${args.invoice_id}`, token, {
                method: 'PUT',
                body: JSON.stringify({ invoice: { vis_state: 1 } }),
            });
        }

        case 'send_invoice': {
            if (!args.invoice_id) throw new Error('invoice_id is required');
            return fbFetch(`${base}/invoices/invoices/${args.invoice_id}`, token, {
                method: 'PUT',
                body: JSON.stringify({ invoice: { action_email: true } }),
            });
        }

        case 'list_payments': {
            const params = new URLSearchParams();
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            const q = params.toString();
            return fbFetch(`${base}/payments/payments${q ? '?' + q : ''}`, token);
        }

        case 'create_payment': {
            if (!args.invoice_id) throw new Error('invoice_id is required');
            if (!args.amount) throw new Error('amount is required');
            const payment: Record<string, unknown> = {
                invoice_id: args.invoice_id,
                amount: { amount: args.amount, code: 'USD' },
                date: args.date ?? new Date().toISOString().slice(0, 10),
            };
            if (args.type) payment.type = args.type;
            return fbFetch(`${base}/payments/payments`, token, { method: 'POST', body: JSON.stringify({ payment }) });
        }

        case 'list_expenses': {
            const params = new URLSearchParams();
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            const q = params.toString();
            return fbFetch(`${base}/expenses/expenses${q ? '?' + q : ''}`, token);
        }

        case 'create_expense': {
            if (!args.amount) throw new Error('amount is required');
            const expense: Record<string, unknown> = {
                amount: { amount: args.amount, code: 'USD' },
                date: args.date ?? new Date().toISOString().slice(0, 10),
            };
            if (args.note) expense.note = args.note;
            if (args.category_id) expense.category_id = args.category_id;
            return fbFetch(`${base}/expenses/expenses`, token, { method: 'POST', body: JSON.stringify({ expense }) });
        }

        case 'list_items':
            return fbFetch(`${base}/items/items`, token);

        case 'create_item': {
            if (!args.name) throw new Error('name is required');
            const item: Record<string, unknown> = { name: args.name };
            if (args.qty != null) item.qty = args.qty;
            if (args.unit_cost) item.unit_cost = { amount: args.unit_cost, code: args.currency_code ?? 'USD' };
            return fbFetch(`${base}/items/items`, token, { method: 'POST', body: JSON.stringify({ item }) });
        }

        case 'get_profit_loss': {
            if (!args.date_from) throw new Error('date_from is required');
            if (!args.date_to) throw new Error('date_to is required');
            return fbFetch(`${base}/reports/accounting/profitloss?date_from=${args.date_from}&date_to=${args.date_to}`, token);
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'freshbooks-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'freshbooks-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-FRESHBOOKS-ACCESS-TOKEN');
            const accountId = request.headers.get('X-Mcp-Secret-FRESHBOOKS-ACCOUNT-ID');

            if (!token || !accountId) {
                return rpcErr(id, -32001, 'Missing required secrets: FRESHBOOKS_ACCESS_TOKEN, FRESHBOOKS_ACCOUNT_ID');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, token, accountId);
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
