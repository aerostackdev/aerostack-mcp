/**
 * Wave MCP Worker
 * Implements MCP protocol over HTTP for Wave accounting (GraphQL API).
 *
 * Secrets:
 *   WAVE_ACCESS_TOKEN → X-Mcp-Secret-WAVE-ACCESS-TOKEN
 *   WAVE_BUSINESS_ID  → X-Mcp-Secret-WAVE-BUSINESS-ID
 */

const GRAPHQL_URL = 'https://gql.waveapps.com/graphql/public';

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
        description: 'Verify Wave credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_invoices',
        description: 'List invoices for the business',
        inputSchema: {
            type: 'object',
            properties: {
                first: { type: 'number', description: 'Number of results (default 20)' },
                after: { type: 'string', description: 'Cursor for pagination' },
                status: { type: 'string', description: 'Filter: DRAFT, SAVED, OVERDUE, PAID, PARTIAL, SENT, VIEWED' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_invoice',
        description: 'Get a single invoice by ID',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Invoice ID' } },
            required: ['id'],
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
                invoice_date: { type: 'string', description: 'Invoice date ISO format' },
                due_date: { type: 'string', description: 'Due date ISO format' },
                memo: { type: 'string', description: 'Invoice memo' },
                items: { type: 'array', description: 'Array of items with description, quantity, unit_price' },
            },
            required: ['customer_id', 'invoice_date', 'items'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_invoice',
        description: 'Send an invoice to the customer',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Invoice ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_invoice',
        description: 'Delete an invoice',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Invoice ID' } },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_customers',
        description: 'List customers for the business',
        inputSchema: {
            type: 'object',
            properties: {
                first: { type: 'number', description: 'Number of results' },
                after: { type: 'string', description: 'Cursor for pagination' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_customer',
        description: 'Create a new customer',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Customer name' },
                email: { type: 'string', description: 'Customer email' },
                currency_code: { type: 'string', description: 'Currency code (default USD)' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_products',
        description: 'List products for the business',
        inputSchema: {
            type: 'object',
            properties: {
                first: { type: 'number', description: 'Number of results' },
                after: { type: 'string', description: 'Cursor for pagination' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_product',
        description: 'Create a new product',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Product name' },
                description: { type: 'string', description: 'Product description' },
                unit_price: { type: 'number', description: 'Unit price' },
                income_account_id: { type: 'string', description: 'Income account ID' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_accounts',
        description: 'List chart of accounts',
        inputSchema: {
            type: 'object',
            properties: { first: { type: 'number', description: 'Number of results' } },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_income_transaction',
        description: 'Create an income transaction',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: { type: 'string', description: 'Income account ID' },
                amount: { type: 'number', description: 'Transaction amount' },
                date: { type: 'string', description: 'Transaction date ISO format' },
                description: { type: 'string', description: 'Transaction description' },
                customer_id: { type: 'string', description: 'Customer ID' },
            },
            required: ['account_id', 'amount', 'date'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_expense_transaction',
        description: 'Create an expense transaction',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: { type: 'string', description: 'Expense account ID' },
                amount: { type: 'number', description: 'Transaction amount' },
                date: { type: 'string', description: 'Transaction date ISO format' },
                description: { type: 'string', description: 'Transaction description' },
                anchor_account_id: { type: 'string', description: 'Anchor account ID (e.g. bank account)' },
            },
            required: ['account_id', 'amount', 'date'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_transactions',
        description: 'List transactions for the business',
        inputSchema: {
            type: 'object',
            properties: {
                first: { type: 'number', description: 'Number of results (default 20)' },
                after: { type: 'string', description: 'Cursor for pagination' },
                date_gte: { type: 'string', description: 'Filter transactions on or after this date' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_business',
        description: 'Get business information',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function waveGql(query: string, variables: Record<string, unknown>, token: string): Promise<unknown> {
    const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Wave API ${res.status}: ${text}`);
    }
    const data = await res.json() as any;
    if (data.errors && data.errors.length > 0) {
        throw new Error(`Wave GraphQL error: ${data.errors[0].message}`);
    }
    return data.data;
}

async function callTool(name: string, args: Record<string, unknown>, token: string, businessId: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const query = `query { user { id name email } }`;
            await waveGql(query, {}, token);
            return { content: [{ type: 'text', text: 'Connected to Wave' }] };
        }

        case 'list_invoices': {
            const query = `
                query($businessId: ID!, $first: Int, $after: String, $status: InvoiceStatus) {
                    business(id: $businessId) {
                        invoices(first: $first, after: $after, status: $status) {
                            pageInfo { hasNextPage endCursor }
                            edges { node {
                                id invoiceNumber status pdfUrl
                                amountDue { value currency { code } }
                                amountPaid { value }
                                total { value }
                                invoiceDate dueDate
                                customer { name email }
                            }}
                        }
                    }
                }`;
            return waveGql(query, { businessId, first: args.first ?? 20, after: args.after ?? null, status: args.status ?? null }, token);
        }

        case 'get_invoice': {
            if (!args.id) throw new Error('id is required');
            const query = `
                query($businessId: ID!, $invoiceId: ID!) {
                    business(id: $businessId) {
                        invoice(id: $invoiceId) {
                            id invoiceNumber status pdfUrl memo
                            amountDue { value } amountPaid { value } total { value }
                            customer { name email } invoiceDate dueDate
                            items { description quantity unitPrice { value } }
                        }
                    }
                }`;
            return waveGql(query, { businessId, invoiceId: args.id }, token);
        }

        case 'create_invoice': {
            if (!args.customer_id) throw new Error('customer_id is required');
            if (!args.invoice_date) throw new Error('invoice_date is required');
            if (!args.items) throw new Error('items is required');
            const mutation = `
                mutation($input: InvoiceCreateInput!) {
                    invoiceCreate(input: $input) {
                        didSucceed
                        inputErrors { message path code }
                        invoice { id invoiceNumber status }
                    }
                }`;
            const input: Record<string, unknown> = {
                businessId,
                customerId: args.customer_id,
                invoiceDate: args.invoice_date,
                items: args.items,
            };
            if (args.due_date) input.dueDate = args.due_date;
            if (args.memo) input.memo = args.memo;
            return waveGql(mutation, { input }, token);
        }

        case 'send_invoice': {
            if (!args.id) throw new Error('id is required');
            const mutation = `
                mutation($input: InvoiceSendInput!) {
                    invoiceSend(input: $input) {
                        didSucceed
                        inputErrors { message }
                    }
                }`;
            return waveGql(mutation, { input: { invoiceId: args.id } }, token);
        }

        case 'delete_invoice': {
            if (!args.id) throw new Error('id is required');
            const mutation = `
                mutation($input: InvoiceDeleteInput!) {
                    invoiceDelete(input: $input) {
                        didSucceed
                        inputErrors { message }
                    }
                }`;
            return waveGql(mutation, { input: { invoiceId: args.id } }, token);
        }

        case 'list_customers': {
            const query = `
                query($businessId: ID!, $first: Int, $after: String) {
                    business(id: $businessId) {
                        customers(first: $first, after: $after) {
                            pageInfo { hasNextPage endCursor }
                            edges { node {
                                id name email currency { code }
                            }}
                        }
                    }
                }`;
            return waveGql(query, { businessId, first: args.first ?? 20, after: args.after ?? null }, token);
        }

        case 'create_customer': {
            if (!args.name) throw new Error('name is required');
            const mutation = `
                mutation($input: CustomerCreateInput!) {
                    customerCreate(input: $input) {
                        didSucceed
                        inputErrors { message }
                        customer { id name email }
                    }
                }`;
            const input: Record<string, unknown> = { businessId, name: args.name };
            if (args.email) input.email = args.email;
            if (args.currency_code) input.currency = { code: args.currency_code };
            return waveGql(mutation, { input }, token);
        }

        case 'list_products': {
            const query = `
                query($businessId: ID!, $first: Int, $after: String) {
                    business(id: $businessId) {
                        products(first: $first, after: $after) {
                            pageInfo { hasNextPage endCursor }
                            edges { node {
                                id name description
                                unitPrice { value }
                                isSold isBought
                            }}
                        }
                    }
                }`;
            return waveGql(query, { businessId, first: args.first ?? 20, after: args.after ?? null }, token);
        }

        case 'create_product': {
            if (!args.name) throw new Error('name is required');
            const mutation = `
                mutation($input: ProductCreateInput!) {
                    productCreate(input: $input) {
                        didSucceed
                        inputErrors { message }
                        product { id name }
                    }
                }`;
            const input: Record<string, unknown> = { businessId, name: args.name };
            if (args.description) input.description = args.description;
            if (args.unit_price != null) input.unitPrice = args.unit_price;
            if (args.income_account_id) input.incomeAccountId = args.income_account_id;
            return waveGql(mutation, { input }, token);
        }

        case 'list_accounts': {
            const query = `
                query($businessId: ID!, $first: Int) {
                    business(id: $businessId) {
                        accounts(first: $first) {
                            edges { node {
                                id name normalBalance isArchived
                                type { name value }
                            }}
                        }
                    }
                }`;
            return waveGql(query, { businessId, first: args.first ?? 50 }, token);
        }

        case 'create_income_transaction': {
            if (!args.account_id) throw new Error('account_id is required');
            if (args.amount == null) throw new Error('amount is required');
            if (!args.date) throw new Error('date is required');
            const mutation = `
                mutation($input: MoneyTransactionCreateInput!) {
                    moneyTransactionCreate(input: $input) {
                        didSucceed
                        inputErrors { message }
                        transaction { id date description amount { value } }
                    }
                }`;
            const input: Record<string, unknown> = {
                businessId,
                accountId: args.account_id,
                amount: args.amount,
                date: args.date,
                direction: 'CREDIT',
            };
            if (args.description) input.description = args.description;
            if (args.customer_id) input.externalId = args.customer_id;
            return waveGql(mutation, { input }, token);
        }

        case 'create_expense_transaction': {
            if (!args.account_id) throw new Error('account_id is required');
            if (args.amount == null) throw new Error('amount is required');
            if (!args.date) throw new Error('date is required');
            const mutation = `
                mutation($input: MoneyTransactionCreateInput!) {
                    moneyTransactionCreate(input: $input) {
                        didSucceed
                        inputErrors { message }
                        transaction { id date description amount { value } }
                    }
                }`;
            const input: Record<string, unknown> = {
                businessId,
                accountId: args.account_id,
                amount: args.amount,
                date: args.date,
                direction: 'DEBIT',
            };
            if (args.description) input.description = args.description;
            if (args.anchor_account_id) input.anchorAccountId = args.anchor_account_id;
            return waveGql(mutation, { input }, token);
        }

        case 'list_transactions': {
            const query = `
                query($businessId: ID!, $first: Int, $after: String) {
                    business(id: $businessId) {
                        transactions(first: $first, after: $after) {
                            pageInfo { hasNextPage endCursor }
                            edges { node {
                                id date description
                                amount { value }
                                account { name }
                            }}
                        }
                    }
                }`;
            return waveGql(query, { businessId, first: args.first ?? 20, after: args.after ?? null }, token);
        }

        case 'get_business': {
            const query = `
                query($businessId: ID!) {
                    business(id: $businessId) {
                        id name
                        currency { code }
                        timezone
                        address { addressLine1 city }
                    }
                }`;
            return waveGql(query, { businessId }, token);
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'wave-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'wave-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-WAVE-ACCESS-TOKEN');
            const businessId = request.headers.get('X-Mcp-Secret-WAVE-BUSINESS-ID');

            if (!token || !businessId) {
                return rpcErr(id, -32001, 'Missing required secrets: WAVE_ACCESS_TOKEN, WAVE_BUSINESS_ID');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, token, businessId);
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
