/**
 * QuickBooks Online MCP Worker
 * Implements MCP protocol over HTTP for QuickBooks Online Accounting operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   QUICKBOOKS_ACCESS_TOKEN  → X-Mcp-Secret-QUICKBOOKS-ACCESS-TOKEN  (OAuth 2.0 access token)
 *   QUICKBOOKS_REALM_ID      → X-Mcp-Secret-QUICKBOOKS-REALM-ID      (QuickBooks Company/Realm ID)
 *
 * Auth format: Authorization: Bearer {access_token}
 *              Accept: application/json
 *
 * Covers: Invoices (6), Customers (5), Expenses & Payments (5),
 *         Items, Accounts & Reports (6) = 22 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const QB_BASE = 'https://quickbooks.api.intuit.com/v3/company';

function qbBase(realmId: string): string {
    return `${QB_BASE}/${realmId}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

function getSecrets(request: Request): { token: string | null; realmId: string | null } {
    return {
        token: request.headers.get('X-Mcp-Secret-QUICKBOOKS-ACCESS-TOKEN'),
        realmId: request.headers.get('X-Mcp-Secret-QUICKBOOKS-REALM-ID'),
    };
}

async function qbFetch(
    realmId: string,
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${qbBase(realmId)}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `QuickBooks HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object') {
            const fault = (data as { Fault?: { Error?: Array<{ Detail?: string; Message?: string }> } }).Fault;
            if (fault?.Error?.[0]) {
                msg = fault.Error[0].Detail || fault.Error[0].Message || msg;
            }
        }
        throw { code: -32603, message: `QuickBooks API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Invoices (6 tools) ─────────────────────────────────────────

    {
        name: 'list_invoices',
        description: 'List invoices from QuickBooks, optionally filtered by customer ID, date range, or status. Returns Id, DocNumber, CustomerRef, TotalAmt, Balance, DueDate, and EmailStatus.',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: {
                    type: 'string',
                    description: 'QuickBooks Customer ID to filter by (optional)',
                },
                start_date: {
                    type: 'string',
                    description: 'Filter invoices on or after this date (YYYY-MM-DD)',
                },
                end_date: {
                    type: 'string',
                    description: 'Filter invoices on or before this date (YYYY-MM-DD)',
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum number of invoices to return (default 20, max 1000)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_invoice',
        description: 'Get full details of a specific invoice by ID, including line items, customer, total amount, balance, due date, and status.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'QuickBooks Invoice ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_invoice',
        description: 'Create a new invoice in QuickBooks with line items. CustomerRef and at least one line item are required.',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: {
                    type: 'string',
                    description: 'QuickBooks Customer ID (required)',
                },
                due_date: {
                    type: 'string',
                    description: 'Invoice due date in YYYY-MM-DD format',
                },
                bill_email: {
                    type: 'string',
                    description: 'Email address to send invoice to',
                },
                memo: {
                    type: 'string',
                    description: 'Customer-visible memo on the invoice',
                },
                line_items: {
                    type: 'array',
                    description: 'Array of line items. Each item: { amount, description, item_id? (ItemRef value) }',
                    items: {
                        type: 'object',
                        properties: {
                            amount: { type: 'number', description: 'Line item amount' },
                            description: { type: 'string', description: 'Line item description' },
                            item_id: { type: 'string', description: 'QuickBooks Item ID (optional)' },
                        },
                        required: ['amount'],
                    },
                },
            },
            required: ['customer_id', 'line_items'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_invoice',
        description: 'Update an existing invoice — add or replace line items, update due date, or update memo. Fetches current SyncToken automatically.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'QuickBooks Invoice ID (required)',
                },
                due_date: {
                    type: 'string',
                    description: 'Updated due date in YYYY-MM-DD format',
                },
                memo: {
                    type: 'string',
                    description: 'Updated customer memo',
                },
                bill_email: {
                    type: 'string',
                    description: 'Updated billing email address',
                },
                line_items: {
                    type: 'array',
                    description: 'Replace all line items with these. Each: { amount, description, item_id? }',
                    items: {
                        type: 'object',
                        properties: {
                            amount: { type: 'number' },
                            description: { type: 'string' },
                            item_id: { type: 'string' },
                        },
                        required: ['amount'],
                    },
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_invoice',
        description: 'Email an invoice to the customer. Sends to the BillEmail on file or a specified email address.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'QuickBooks Invoice ID (required)',
                },
                email: {
                    type: 'string',
                    description: 'Override email address to send to (optional — uses BillEmail if omitted)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'void_invoice',
        description: 'Void an invoice in QuickBooks. The invoice remains in the system with $0 amount and Voided status.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'QuickBooks Invoice ID to void (required)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 2 — Customers (5 tools) ─────────────────────────────────────────

    {
        name: 'list_customers',
        description: 'List customers from QuickBooks. Supports filtering by active/inactive status and pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                active: {
                    type: 'boolean',
                    description: 'Filter by active (true) or inactive (false) customers. Omit for all.',
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum number of customers to return (default 20)',
                },
                start_position: {
                    type: 'number',
                    description: 'Pagination offset — return results starting at this position (1-indexed)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_customer',
        description: 'Get full details of a specific customer by ID, including name, email, phone, balance, and currency.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'QuickBooks Customer ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_customer',
        description: 'Create a new customer in QuickBooks. DisplayName is required.',
        inputSchema: {
            type: 'object',
            properties: {
                display_name: {
                    type: 'string',
                    description: 'Customer display name — must be unique (required)',
                },
                email: {
                    type: 'string',
                    description: 'Primary email address',
                },
                phone: {
                    type: 'string',
                    description: 'Primary phone number',
                },
                billing_line1: {
                    type: 'string',
                    description: 'Billing address line 1',
                },
                billing_city: {
                    type: 'string',
                    description: 'Billing city',
                },
                billing_state: {
                    type: 'string',
                    description: 'Billing state or province',
                },
                billing_postal_code: {
                    type: 'string',
                    description: 'Billing ZIP or postal code',
                },
                billing_country: {
                    type: 'string',
                    description: 'Billing country',
                },
            },
            required: ['display_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_customer',
        description: 'Update customer fields in QuickBooks. Fetches current SyncToken automatically.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'QuickBooks Customer ID (required)',
                },
                display_name: { type: 'string', description: 'Updated display name' },
                email: { type: 'string', description: 'Updated email address' },
                phone: { type: 'string', description: 'Updated phone number' },
                billing_line1: { type: 'string', description: 'Updated billing address line 1' },
                billing_city: { type: 'string', description: 'Updated billing city' },
                billing_state: { type: 'string', description: 'Updated billing state' },
                billing_postal_code: { type: 'string', description: 'Updated billing postal code' },
                billing_country: { type: 'string', description: 'Updated billing country' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_customer_balance',
        description: 'Get the outstanding balance (open invoices total) for a specific customer.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'QuickBooks Customer ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Expenses & Payments (5 tools) ───────────────────────────────

    {
        name: 'list_expenses',
        description: 'List expense (Purchase) transactions, optionally filtered by date range, account, or vendor.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: {
                    type: 'string',
                    description: 'Filter expenses on or after this date (YYYY-MM-DD)',
                },
                end_date: {
                    type: 'string',
                    description: 'Filter expenses on or before this date (YYYY-MM-DD)',
                },
                account_id: {
                    type: 'string',
                    description: 'Filter by payment account ID (e.g. checking account)',
                },
                vendor_id: {
                    type: 'string',
                    description: 'Filter by vendor/entity ID',
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum number of expenses to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_expense',
        description: 'Create an expense (Purchase) transaction in QuickBooks with account, line items, payment method, and transaction date.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'string',
                    description: 'Payment account ID (e.g. checking or credit card account) — required',
                },
                payment_type: {
                    type: 'string',
                    enum: ['Cash', 'Check', 'CreditCard'],
                    description: 'Payment method type (required)',
                },
                txn_date: {
                    type: 'string',
                    description: 'Transaction date in YYYY-MM-DD format (defaults to today)',
                },
                total_amount: {
                    type: 'number',
                    description: 'Total expense amount (required)',
                },
                vendor_id: {
                    type: 'string',
                    description: 'Vendor/entity ID to associate with the expense',
                },
                memo: {
                    type: 'string',
                    description: 'Memo or note for the expense',
                },
                line_items: {
                    type: 'array',
                    description: 'Line items for the expense. Each: { amount, account_id, description? }',
                    items: {
                        type: 'object',
                        properties: {
                            amount: { type: 'number', description: 'Line item amount' },
                            account_id: { type: 'string', description: 'Expense category account ID' },
                            description: { type: 'string', description: 'Line item description' },
                        },
                        required: ['amount', 'account_id'],
                    },
                },
            },
            required: ['account_id', 'payment_type', 'total_amount', 'line_items'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_payments',
        description: 'List payment transactions received in QuickBooks, optionally filtered by customer or date range.',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: {
                    type: 'string',
                    description: 'Filter payments by customer ID',
                },
                start_date: {
                    type: 'string',
                    description: 'Filter payments on or after this date (YYYY-MM-DD)',
                },
                end_date: {
                    type: 'string',
                    description: 'Filter payments on or before this date (YYYY-MM-DD)',
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum number of payments to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_payment',
        description: 'Create a payment in QuickBooks linked to an invoice. CustomerRef, TotalAmt, and the invoice ID are required.',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: {
                    type: 'string',
                    description: 'QuickBooks Customer ID (required)',
                },
                total_amount: {
                    type: 'number',
                    description: 'Payment amount (required)',
                },
                invoice_id: {
                    type: 'string',
                    description: 'Invoice ID to apply this payment against (required)',
                },
                txn_date: {
                    type: 'string',
                    description: 'Payment date in YYYY-MM-DD format (defaults to today)',
                },
                payment_method_id: {
                    type: 'string',
                    description: 'QuickBooks PaymentMethod ID (optional)',
                },
                memo: {
                    type: 'string',
                    description: 'Payment memo or reference',
                },
            },
            required: ['customer_id', 'total_amount', 'invoice_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_profit_loss',
        description: 'Get the Profit & Loss report for a date range, optionally summarized by Month, Quarter, or Year.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: {
                    type: 'string',
                    description: 'Report start date in YYYY-MM-DD format (required)',
                },
                end_date: {
                    type: 'string',
                    description: 'Report end date in YYYY-MM-DD format (required)',
                },
                summarize_column_by: {
                    type: 'string',
                    enum: ['Month', 'Quarter', 'Year', 'Total'],
                    description: 'How to summarize columns (default: Total)',
                },
            },
            required: ['start_date', 'end_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Items, Accounts & Reports (6 tools) ─────────────────────────

    {
        name: 'list_items',
        description: 'List products and services (Items) in QuickBooks, optionally filtered by type.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['Inventory', 'Service', 'NonInventory'],
                    description: 'Filter by item type (optional)',
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum number of items to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_item',
        description: 'Create a new product or service item in QuickBooks. Name, Type, and IncomeAccountRef are required.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Item name — must be unique (required)',
                },
                type: {
                    type: 'string',
                    enum: ['Inventory', 'Service', 'NonInventory'],
                    description: 'Item type (required)',
                },
                unit_price: {
                    type: 'number',
                    description: 'Default unit price/rate',
                },
                description: {
                    type: 'string',
                    description: 'Item description',
                },
                income_account_id: {
                    type: 'string',
                    description: 'QuickBooks income account ID to post sales to (required)',
                },
                expense_account_id: {
                    type: 'string',
                    description: 'QuickBooks expense account ID (required for Inventory and NonInventory types)',
                },
            },
            required: ['name', 'type', 'income_account_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_accounts',
        description: 'List the chart of accounts in QuickBooks, optionally filtered by AccountType.',
        inputSchema: {
            type: 'object',
            properties: {
                account_type: {
                    type: 'string',
                    description: 'Filter by account type (e.g. Income, Expense, Asset, Liability, Equity, Bank, CreditCard)',
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum number of accounts to return (default 50)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_balance_sheet',
        description: 'Get the Balance Sheet report as of a specific date.',
        inputSchema: {
            type: 'object',
            properties: {
                as_of_date: {
                    type: 'string',
                    description: 'Balance sheet date in YYYY-MM-DD format (required)',
                },
            },
            required: ['as_of_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'run_query',
        description: 'Run a custom QuickBooks Query Language (QQL) query for advanced data retrieval.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Full QQL query string, e.g. "SELECT * FROM Invoice WHERE TotalAmt > \'100\' ORDERBY TxnDate DESC MAXRESULTS 10"',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_company_info',
        description: 'Get company information including name, address, fiscal year start month, and currency settings.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ──────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify QuickBooks credentials are valid. Calls GET /companyinfo/{realmId} with the access token.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

function buildLineItems(
    items: Array<{ amount: number; description?: string; item_id?: string }>,
    lineDetailType = 'SalesItemLineDetail',
): unknown[] {
    return items.map((item, index) => {
        const line: Record<string, unknown> = {
            Id: String(index + 1),
            Amount: item.amount,
            DetailType: lineDetailType,
        };
        if (lineDetailType === 'SalesItemLineDetail') {
            const detail: Record<string, unknown> = {};
            if (item.item_id) detail.ItemRef = { value: item.item_id };
            if (item.description) detail.ItemAccountRef = {};
            line.SalesItemLineDetail = detail;
            if (item.description) line.Description = item.description;
        } else if (lineDetailType === 'AccountBasedExpenseLineDetail') {
            const detail: Record<string, unknown> = {};
            const expItem = item as { amount: number; description?: string; account_id?: string };
            if (expItem.account_id) detail.AccountRef = { value: expItem.account_id };
            line.AccountBasedExpenseLineDetail = detail;
            if (item.description) line.Description = item.description;
        }
        return line;
    });
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    realmId: string,
): Promise<unknown> {
    switch (name) {
        // ── Invoices ─────────────────────────────────────────────────────────────

        case 'list_invoices': {
            const maxResults = (args.max_results as number) || 20;
            let where = '';
            const conditions: string[] = [];
            if (args.customer_id) conditions.push(`CustomerRef = '${args.customer_id}'`);
            if (args.start_date) conditions.push(`TxnDate >= '${args.start_date}'`);
            if (args.end_date) conditions.push(`TxnDate <= '${args.end_date}'`);
            if (conditions.length) where = ` WHERE ${conditions.join(' AND ')}`;
            const q = encodeURIComponent(
                `SELECT * FROM Invoice${where} ORDERBY TxnDate DESC MAXRESULTS ${maxResults}`,
            );
            return qbFetch(realmId, `/query?query=${q}`, token);
        }

        case 'get_invoice': {
            validateRequired(args, ['id']);
            return qbFetch(realmId, `/invoice/${args.id}`, token);
        }

        case 'create_invoice': {
            validateRequired(args, ['customer_id', 'line_items']);
            const lineItems = args.line_items as Array<{ amount: number; description?: string; item_id?: string }>;
            const body: Record<string, unknown> = {
                CustomerRef: { value: args.customer_id },
                Line: buildLineItems(lineItems, 'SalesItemLineDetail'),
            };
            if (args.due_date) body.DueDate = args.due_date;
            if (args.bill_email) body.BillEmail = { Address: args.bill_email };
            if (args.memo) body.CustomerMemo = { value: args.memo };
            return qbFetch(realmId, '/invoice', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_invoice': {
            validateRequired(args, ['id']);
            // Fetch current invoice to get SyncToken
            const current = await qbFetch(realmId, `/invoice/${args.id}`, token) as {
                Invoice: { SyncToken: string; CustomerRef: { value: string }; Line: unknown[] };
            };
            const inv = current.Invoice;
            const updateBody: Record<string, unknown> = {
                Id: args.id,
                SyncToken: inv.SyncToken,
                CustomerRef: inv.CustomerRef,
                sparse: true,
            };
            if (args.due_date) updateBody.DueDate = args.due_date;
            if (args.memo) updateBody.CustomerMemo = { value: args.memo };
            if (args.bill_email) updateBody.BillEmail = { Address: args.bill_email };
            if (args.line_items) {
                const lineItems = args.line_items as Array<{ amount: number; description?: string; item_id?: string }>;
                updateBody.Line = buildLineItems(lineItems, 'SalesItemLineDetail');
            }
            return qbFetch(realmId, '/invoice', token, {
                method: 'POST',
                body: JSON.stringify(updateBody),
            });
        }

        case 'send_invoice': {
            validateRequired(args, ['id']);
            let path = `/invoice/${args.id}/send`;
            if (args.email) path += `?sendTo=${encodeURIComponent(args.email as string)}`;
            return qbFetch(realmId, path, token, { method: 'POST', body: '' });
        }

        case 'void_invoice': {
            validateRequired(args, ['id']);
            // Fetch current invoice to get SyncToken
            const current = await qbFetch(realmId, `/invoice/${args.id}`, token) as {
                Invoice: { SyncToken: string; CustomerRef: { value: string } };
            };
            const inv = current.Invoice;
            const voidBody: Record<string, unknown> = {
                Id: args.id,
                SyncToken: inv.SyncToken,
                CustomerRef: inv.CustomerRef,
                sparse: true,
            };
            return qbFetch(realmId, '/invoice?operation=void', token, {
                method: 'POST',
                body: JSON.stringify(voidBody),
            });
        }

        // ── Customers ────────────────────────────────────────────────────────────

        case 'list_customers': {
            const maxResults = (args.max_results as number) || 20;
            const startPos = (args.start_position as number) || 1;
            const conditions: string[] = [];
            if (args.active !== undefined) conditions.push(`Active = ${args.active ? 'true' : 'false'}`);
            const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
            const q = encodeURIComponent(
                `SELECT * FROM Customer${where} STARTPOSITION ${startPos} MAXRESULTS ${maxResults}`,
            );
            return qbFetch(realmId, `/query?query=${q}`, token);
        }

        case 'get_customer': {
            validateRequired(args, ['id']);
            return qbFetch(realmId, `/customer/${args.id}`, token);
        }

        case 'create_customer': {
            validateRequired(args, ['display_name']);
            const body: Record<string, unknown> = {
                DisplayName: args.display_name,
            };
            if (args.email) body.PrimaryEmailAddr = { Address: args.email };
            if (args.phone) body.PrimaryPhone = { FreeFormNumber: args.phone };
            if (args.billing_line1 || args.billing_city || args.billing_state || args.billing_postal_code || args.billing_country) {
                body.BillAddr = {
                    ...(args.billing_line1 ? { Line1: args.billing_line1 } : {}),
                    ...(args.billing_city ? { City: args.billing_city } : {}),
                    ...(args.billing_state ? { CountrySubDivisionCode: args.billing_state } : {}),
                    ...(args.billing_postal_code ? { PostalCode: args.billing_postal_code } : {}),
                    ...(args.billing_country ? { Country: args.billing_country } : {}),
                };
            }
            return qbFetch(realmId, '/customer', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_customer': {
            validateRequired(args, ['id']);
            // Fetch current customer to get SyncToken
            const current = await qbFetch(realmId, `/customer/${args.id}`, token) as {
                Customer: { SyncToken: string; DisplayName: string };
            };
            const cust = current.Customer;
            const updateBody: Record<string, unknown> = {
                Id: args.id,
                SyncToken: cust.SyncToken,
                DisplayName: cust.DisplayName,
                sparse: true,
            };
            if (args.display_name) updateBody.DisplayName = args.display_name;
            if (args.email) updateBody.PrimaryEmailAddr = { Address: args.email };
            if (args.phone) updateBody.PrimaryPhone = { FreeFormNumber: args.phone };
            if (args.billing_line1 || args.billing_city || args.billing_state || args.billing_postal_code || args.billing_country) {
                updateBody.BillAddr = {
                    ...(args.billing_line1 ? { Line1: args.billing_line1 } : {}),
                    ...(args.billing_city ? { City: args.billing_city } : {}),
                    ...(args.billing_state ? { CountrySubDivisionCode: args.billing_state } : {}),
                    ...(args.billing_postal_code ? { PostalCode: args.billing_postal_code } : {}),
                    ...(args.billing_country ? { Country: args.billing_country } : {}),
                };
            }
            return qbFetch(realmId, '/customer', token, {
                method: 'POST',
                body: JSON.stringify(updateBody),
            });
        }

        case 'get_customer_balance': {
            validateRequired(args, ['id']);
            const q = encodeURIComponent(
                `SELECT Balance FROM Customer WHERE Id = '${args.id}'`,
            );
            return qbFetch(realmId, `/query?query=${q}`, token);
        }

        // ── Expenses & Payments ──────────────────────────────────────────────────

        case 'list_expenses': {
            const maxResults = (args.max_results as number) || 20;
            const conditions: string[] = [];
            if (args.start_date) conditions.push(`TxnDate >= '${args.start_date}'`);
            if (args.end_date) conditions.push(`TxnDate <= '${args.end_date}'`);
            if (args.account_id) conditions.push(`AccountRef = '${args.account_id}'`);
            if (args.vendor_id) conditions.push(`EntityRef = '${args.vendor_id}'`);
            const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
            const q = encodeURIComponent(
                `SELECT * FROM Purchase${where} ORDERBY TxnDate DESC MAXRESULTS ${maxResults}`,
            );
            return qbFetch(realmId, `/query?query=${q}`, token);
        }

        case 'create_expense': {
            validateRequired(args, ['account_id', 'payment_type', 'total_amount', 'line_items']);
            const lineItems = args.line_items as Array<{ amount: number; description?: string; account_id?: string }>;
            const body: Record<string, unknown> = {
                AccountRef: { value: args.account_id },
                PaymentType: args.payment_type,
                TotalAmt: args.total_amount,
                Line: buildLineItems(lineItems, 'AccountBasedExpenseLineDetail'),
            };
            if (args.txn_date) body.TxnDate = args.txn_date;
            if (args.vendor_id) body.EntityRef = { value: args.vendor_id, type: 'Vendor' };
            if (args.memo) body.PrivateNote = args.memo;
            return qbFetch(realmId, '/purchase', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_payments': {
            const maxResults = (args.max_results as number) || 20;
            const conditions: string[] = [];
            if (args.customer_id) conditions.push(`CustomerRef = '${args.customer_id}'`);
            if (args.start_date) conditions.push(`TxnDate >= '${args.start_date}'`);
            if (args.end_date) conditions.push(`TxnDate <= '${args.end_date}'`);
            const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
            const q = encodeURIComponent(
                `SELECT * FROM Payment${where} ORDERBY TxnDate DESC MAXRESULTS ${maxResults}`,
            );
            return qbFetch(realmId, `/query?query=${q}`, token);
        }

        case 'create_payment': {
            validateRequired(args, ['customer_id', 'total_amount', 'invoice_id']);
            const body: Record<string, unknown> = {
                CustomerRef: { value: args.customer_id },
                TotalAmt: args.total_amount,
                Line: [{
                    Amount: args.total_amount,
                    LinkedTxn: [{ TxnId: args.invoice_id, TxnType: 'Invoice' }],
                }],
            };
            if (args.txn_date) body.TxnDate = args.txn_date;
            if (args.payment_method_id) body.PaymentMethodRef = { value: args.payment_method_id };
            if (args.memo) body.PrivateNote = args.memo;
            return qbFetch(realmId, '/payment', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_profit_loss': {
            validateRequired(args, ['start_date', 'end_date']);
            const params = new URLSearchParams({
                start_date: args.start_date as string,
                end_date: args.end_date as string,
                ...(args.summarize_column_by ? { summarize_column_by: args.summarize_column_by as string } : {}),
            });
            return qbFetch(realmId, `/reports/ProfitAndLoss?${params}`, token);
        }

        // ── Items, Accounts & Reports ────────────────────────────────────────────

        case 'list_items': {
            const maxResults = (args.max_results as number) || 20;
            const conditions: string[] = [];
            if (args.type) conditions.push(`Type = '${args.type}'`);
            const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
            const q = encodeURIComponent(
                `SELECT * FROM Item${where} MAXRESULTS ${maxResults}`,
            );
            return qbFetch(realmId, `/query?query=${q}`, token);
        }

        case 'create_item': {
            validateRequired(args, ['name', 'type', 'income_account_id']);
            const body: Record<string, unknown> = {
                Name: args.name,
                Type: args.type,
                IncomeAccountRef: { value: args.income_account_id },
            };
            if (args.unit_price !== undefined) body.UnitPrice = args.unit_price;
            if (args.description) body.Description = args.description;
            if (args.expense_account_id) body.ExpenseAccountRef = { value: args.expense_account_id };
            return qbFetch(realmId, '/item', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_accounts': {
            const maxResults = (args.max_results as number) || 50;
            const conditions: string[] = [];
            if (args.account_type) conditions.push(`AccountType = '${args.account_type}'`);
            const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
            const q = encodeURIComponent(
                `SELECT * FROM Account${where} MAXRESULTS ${maxResults}`,
            );
            return qbFetch(realmId, `/query?query=${q}`, token);
        }

        case 'get_balance_sheet': {
            validateRequired(args, ['as_of_date']);
            const params = new URLSearchParams({ date_macro: 'Custom', end_date: args.as_of_date as string });
            return qbFetch(realmId, `/reports/BalanceSheet?${params}`, token);
        }

        case 'run_query': {
            validateRequired(args, ['query']);
            const q = encodeURIComponent(args.query as string);
            return qbFetch(realmId, `/query?query=${q}`, token);
        }

        case 'get_company_info': {
            return qbFetch(realmId, `/companyinfo/${realmId}`, token);
        }

        // ── _ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            return qbFetch(realmId, `/companyinfo/${realmId}`, token);
        }

        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-quickbooks', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        // ── MCP protocol methods ──────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-quickbooks', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            // Validate secrets
            const { token, realmId } = getSecrets(request);
            if (!token || !realmId) {
                const missing = [];
                if (!token) missing.push('QUICKBOOKS_ACCESS_TOKEN (header: X-Mcp-Secret-QUICKBOOKS-ACCESS-TOKEN)');
                if (!realmId) missing.push('QUICKBOOKS_REALM_ID (header: X-Mcp-Secret-QUICKBOOKS-REALM-ID)');
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                const result = await callTool(toolName, args, token, realmId);
                return rpcOk(id, toolOk(result));
            } catch (err: unknown) {
                if (err && typeof err === 'object' && 'code' in err) {
                    const e = err as { code: number; message: string };
                    return rpcErr(id, e.code, e.message);
                }
                if (err instanceof Error) {
                    return rpcErr(id, -32603, err.message);
                }
                return rpcErr(id, -32603, 'Internal error');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
