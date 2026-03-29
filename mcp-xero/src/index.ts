/**
 * Xero MCP Worker
 * Implements MCP protocol over HTTP for Xero accounting operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   XERO_ACCESS_TOKEN  → X-Mcp-Secret-XERO-ACCESS-TOKEN  (OAuth 2.0 Bearer token)
 *   XERO_TENANT_ID     → X-Mcp-Secret-XERO-TENANT-ID     (Xero organisation tenant ID)
 *
 * Auth format: Authorization: Bearer {access_token} + Xero-Tenant-Id: {tenantId}
 * IMPORTANT: Accept: application/json is required — Xero defaults to XML otherwise.
 *
 * Covers: Invoices (6), Contacts (5), Accounts & Organisation (4),
 *         Reports (4), Payments & Banking (3), Ping (1) = 23 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const XERO_BASE_URL = 'https://api.xero.com/api.xro/2.0';

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

function getSecrets(request: Request): { token: string | null; tenantId: string | null } {
    return {
        token: request.headers.get('X-Mcp-Secret-XERO-ACCESS-TOKEN'),
        tenantId: request.headers.get('X-Mcp-Secret-XERO-TENANT-ID'),
    };
}

async function xeroFetch(
    path: string,
    token: string,
    tenantId: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${XERO_BASE_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Xero-Tenant-Id': tenantId,
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
        throw { code: -32603, message: `Xero HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object') {
            const d = data as { Detail?: string; Message?: string; message?: string };
            msg = d.Detail || d.Message || d.message || msg;
        }
        throw { code: -32603, message: `Xero API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Invoices (6 tools) ──────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify Xero credentials by fetching the current organisation. Returns org name and base currency.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_invoices',
        description: 'List invoices with optional filters. Returns InvoiceID, Type, Contact, Status, Total, AmountDue.',
        inputSchema: {
            type: 'object',
            properties: {
                Status: {
                    type: 'string',
                    description: 'Filter by invoice status',
                    enum: ['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED'],
                },
                ContactIDs: {
                    type: 'string',
                    description: 'Comma-separated ContactIDs to filter by',
                },
                DateFrom: {
                    type: 'string',
                    description: 'Filter invoices from this date (YYYY-MM-DD)',
                },
                DateTo: {
                    type: 'string',
                    description: 'Filter invoices up to this date (YYYY-MM-DD)',
                },
                page: {
                    type: 'number',
                    description: 'Page number for pagination (default 1)',
                },
                pageSize: {
                    type: 'number',
                    description: 'Number of invoices per page (default 100, max 1000)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_invoice',
        description: 'Get full details of an invoice by InvoiceID, including line items, contact, tax, and payment history.',
        inputSchema: {
            type: 'object',
            properties: {
                InvoiceID: {
                    type: 'string',
                    description: 'Xero InvoiceID (UUID format)',
                },
            },
            required: ['InvoiceID'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_invoice',
        description: 'Create a new invoice (ACCREC = accounts receivable, ACCPAY = accounts payable).',
        inputSchema: {
            type: 'object',
            properties: {
                Type: {
                    type: 'string',
                    description: 'Invoice type',
                    enum: ['ACCREC', 'ACCPAY'],
                },
                ContactID: {
                    type: 'string',
                    description: 'ContactID of the invoice recipient',
                },
                LineItems: {
                    type: 'array',
                    description: 'Array of line items',
                    items: {
                        type: 'object',
                        properties: {
                            Description: { type: 'string', description: 'Line item description' },
                            Quantity: { type: 'number', description: 'Quantity (default 1)' },
                            UnitAmount: { type: 'number', description: 'Unit price' },
                            AccountCode: { type: 'string', description: 'Chart of accounts code (e.g. 200)' },
                            TaxType: { type: 'string', description: 'Tax type (e.g. OUTPUT, NONE)' },
                        },
                        required: ['Description', 'UnitAmount'],
                    },
                },
                Date: {
                    type: 'string',
                    description: 'Invoice date in YYYY-MM-DD format (defaults to today)',
                },
                DueDate: {
                    type: 'string',
                    description: 'Due date in YYYY-MM-DD format',
                },
                Status: {
                    type: 'string',
                    description: 'Invoice status (default DRAFT)',
                    enum: ['DRAFT', 'SUBMITTED', 'AUTHORISED'],
                },
                InvoiceNumber: {
                    type: 'string',
                    description: 'Custom invoice number (auto-generated if omitted)',
                },
                Reference: {
                    type: 'string',
                    description: 'Reference / PO number',
                },
            },
            required: ['Type', 'ContactID', 'LineItems'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_invoice',
        description: 'Update an existing invoice. InvoiceID must be included in the body.',
        inputSchema: {
            type: 'object',
            properties: {
                InvoiceID: {
                    type: 'string',
                    description: 'Xero InvoiceID (required)',
                },
                Status: {
                    type: 'string',
                    description: 'New invoice status',
                    enum: ['DRAFT', 'SUBMITTED', 'AUTHORISED', 'VOIDED'],
                },
                LineItems: {
                    type: 'array',
                    description: 'Updated line items array (replaces existing)',
                    items: {
                        type: 'object',
                        properties: {
                            Description: { type: 'string' },
                            Quantity: { type: 'number' },
                            UnitAmount: { type: 'number' },
                            AccountCode: { type: 'string' },
                        },
                    },
                },
                DueDate: {
                    type: 'string',
                    description: 'Updated due date (YYYY-MM-DD)',
                },
                Reference: {
                    type: 'string',
                    description: 'Updated reference',
                },
            },
            required: ['InvoiceID'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'email_invoice',
        description: 'Send an invoice to a contact by email.',
        inputSchema: {
            type: 'object',
            properties: {
                InvoiceID: {
                    type: 'string',
                    description: 'Xero InvoiceID to email',
                },
                EmailAddress: {
                    type: 'string',
                    description: 'Recipient email address (defaults to contact primary email if omitted)',
                },
            },
            required: ['InvoiceID'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'void_invoice',
        description: 'Void an invoice by setting its status to VOIDED.',
        inputSchema: {
            type: 'object',
            properties: {
                InvoiceID: {
                    type: 'string',
                    description: 'Xero InvoiceID to void',
                },
            },
            required: ['InvoiceID'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 2 — Contacts (5 tools) ──────────────────────────────────────────

    {
        name: 'list_contacts',
        description: 'List contacts with optional filters. Returns ContactID, Name, EmailAddress, IsSupplier, IsCustomer.',
        inputSchema: {
            type: 'object',
            properties: {
                ContactStatus: {
                    type: 'string',
                    description: 'Filter by status',
                    enum: ['ACTIVE', 'ARCHIVED'],
                },
                Name: {
                    type: 'string',
                    description: 'Filter by contact name (partial match)',
                },
                EmailAddress: {
                    type: 'string',
                    description: 'Filter by exact email address',
                },
                page: {
                    type: 'number',
                    description: 'Page number (default 1)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_contact',
        description: 'Get full details of a contact by ContactID.',
        inputSchema: {
            type: 'object',
            properties: {
                ContactID: {
                    type: 'string',
                    description: 'Xero ContactID (UUID format)',
                },
            },
            required: ['ContactID'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_contact',
        description: 'Create a new contact in Xero. Name is required.',
        inputSchema: {
            type: 'object',
            properties: {
                Name: {
                    type: 'string',
                    description: 'Contact name (required)',
                },
                EmailAddress: {
                    type: 'string',
                    description: 'Contact email address',
                },
                FirstName: {
                    type: 'string',
                    description: 'Contact first name',
                },
                LastName: {
                    type: 'string',
                    description: 'Contact last name',
                },
                IsSupplier: {
                    type: 'boolean',
                    description: 'Mark this contact as a supplier',
                },
                IsCustomer: {
                    type: 'boolean',
                    description: 'Mark this contact as a customer',
                },
                Phones: {
                    type: 'array',
                    description: 'Phone numbers array',
                    items: {
                        type: 'object',
                        properties: {
                            PhoneType: {
                                type: 'string',
                                enum: ['DEFAULT', 'DDI', 'MOBILE', 'FAX'],
                            },
                            PhoneNumber: { type: 'string' },
                        },
                    },
                },
                Addresses: {
                    type: 'array',
                    description: 'Addresses array',
                    items: {
                        type: 'object',
                        properties: {
                            AddressType: { type: 'string', enum: ['STREET', 'POBOX'] },
                            City: { type: 'string' },
                            Country: { type: 'string' },
                            PostalCode: { type: 'string' },
                        },
                    },
                },
            },
            required: ['Name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_contact',
        description: 'Update fields on an existing contact. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                ContactID: {
                    type: 'string',
                    description: 'Xero ContactID (required)',
                },
                Name: { type: 'string' },
                EmailAddress: { type: 'string' },
                FirstName: { type: 'string' },
                LastName: { type: 'string' },
                IsSupplier: { type: 'boolean' },
                IsCustomer: { type: 'boolean' },
            },
            required: ['ContactID'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'archive_contact',
        description: 'Archive a contact by setting ContactStatus to ARCHIVED.',
        inputSchema: {
            type: 'object',
            properties: {
                ContactID: {
                    type: 'string',
                    description: 'Xero ContactID to archive',
                },
            },
            required: ['ContactID'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 3 — Accounts & Organisation (4 tools) ───────────────────────────

    {
        name: 'get_organisation',
        description: 'Get the current organisation details: name, base currency, timezone, tax number, and financial year end.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_accounts',
        description: 'List the chart of accounts, optionally filtered by Type, Status, or Class.',
        inputSchema: {
            type: 'object',
            properties: {
                Type: {
                    type: 'string',
                    description: 'Account type (e.g. BANK, CURRENT, REVENUE, EXPENSE)',
                },
                Status: {
                    type: 'string',
                    description: 'Account status',
                    enum: ['ACTIVE', 'ARCHIVED'],
                },
                Class: {
                    type: 'string',
                    description: 'Account class',
                    enum: ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'],
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_account',
        description: 'Get a specific account from the chart of accounts by AccountID.',
        inputSchema: {
            type: 'object',
            properties: {
                AccountID: {
                    type: 'string',
                    description: 'Xero AccountID (UUID format)',
                },
            },
            required: ['AccountID'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_trial_balance',
        description: 'Get the trial balance report showing debit and credit balances for all accounts.',
        inputSchema: {
            type: 'object',
            properties: {
                date: {
                    type: 'string',
                    description: 'Report date in YYYY-MM-DD format (defaults to today)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Reports (4 tools) ───────────────────────────────────────────

    {
        name: 'get_profit_loss',
        description: 'Get the Profit and Loss report. Supports multi-period comparison.',
        inputSchema: {
            type: 'object',
            properties: {
                fromDate: {
                    type: 'string',
                    description: 'Report start date (YYYY-MM-DD)',
                },
                toDate: {
                    type: 'string',
                    description: 'Report end date (YYYY-MM-DD)',
                },
                periods: {
                    type: 'number',
                    description: 'Number of periods to compare (1-12)',
                },
                timeframe: {
                    type: 'string',
                    description: 'Period timeframe',
                    enum: ['MONTH', 'QUARTER', 'YEAR'],
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_balance_sheet',
        description: 'Get the Balance Sheet report showing assets, liabilities, and equity.',
        inputSchema: {
            type: 'object',
            properties: {
                date: {
                    type: 'string',
                    description: 'Report date (YYYY-MM-DD)',
                },
                periods: {
                    type: 'number',
                    description: 'Number of periods to compare (1-12)',
                },
                timeframe: {
                    type: 'string',
                    description: 'Period timeframe',
                    enum: ['MONTH', 'QUARTER', 'YEAR'],
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_cashflow',
        description: 'Get the Cash Flow Statement report.',
        inputSchema: {
            type: 'object',
            properties: {
                fromDate: {
                    type: 'string',
                    description: 'Report start date (YYYY-MM-DD)',
                },
                toDate: {
                    type: 'string',
                    description: 'Report end date (YYYY-MM-DD)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_aged_receivables',
        description: 'Get the Aged Receivables Outstanding report.',
        inputSchema: {
            type: 'object',
            properties: {
                date: {
                    type: 'string',
                    description: 'Report date (YYYY-MM-DD, defaults to today)',
                },
                contactID: {
                    type: 'string',
                    description: 'Optionally filter by a specific ContactID',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 5 — Payments & Banking (3 tools) ────────────────────────────────

    {
        name: 'list_payments',
        description: 'List payments with optional filters by status, type, and date range.',
        inputSchema: {
            type: 'object',
            properties: {
                Status: {
                    type: 'string',
                    description: 'Payment status filter',
                    enum: ['AUTHORISED', 'DELETED'],
                },
                PaymentType: {
                    type: 'string',
                    description: 'Type of payment',
                    enum: ['ACCRECPAYMENT', 'ACCPAYPAYMENT', 'ARCREDITPAYMENT', 'APCREDITPAYMENT'],
                },
                DateFrom: {
                    type: 'string',
                    description: 'Filter payments from this date (YYYY-MM-DD)',
                },
                DateTo: {
                    type: 'string',
                    description: 'Filter payments up to this date (YYYY-MM-DD)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_payment',
        description: 'Create a payment against an invoice. Links an invoice to a bank account with a payment amount.',
        inputSchema: {
            type: 'object',
            properties: {
                InvoiceID: {
                    type: 'string',
                    description: 'InvoiceID to apply payment to',
                },
                AccountID: {
                    type: 'string',
                    description: 'Bank account AccountID to pay from/into',
                },
                Date: {
                    type: 'string',
                    description: 'Payment date (YYYY-MM-DD)',
                },
                Amount: {
                    type: 'number',
                    description: 'Payment amount',
                },
                Reference: {
                    type: 'string',
                    description: 'Payment reference (e.g. transaction ID)',
                },
            },
            required: ['InvoiceID', 'AccountID', 'Date', 'Amount'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_bank_transactions',
        description: 'List bank transactions for a bank account, with optional date range and pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                BankAccountID: {
                    type: 'string',
                    description: 'AccountID of the bank account to query transactions for',
                },
                DateFrom: {
                    type: 'string',
                    description: 'Filter from date (YYYY-MM-DD)',
                },
                DateTo: {
                    type: 'string',
                    description: 'Filter to date (YYYY-MM-DD)',
                },
                page: {
                    type: 'number',
                    description: 'Page number (default 1)',
                },
            },
            required: ['BankAccountID'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    tenantId: string,
): Promise<unknown> {
    switch (name) {
        // ── Ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            return xeroFetch('/Organisation', token, tenantId);
        }

        // ── Invoices ────────────────────────────────────────────────────────────

        case 'list_invoices': {
            const params = new URLSearchParams();
            if (args.Status) params.set('Status', args.Status as string);
            if (args.ContactIDs) params.set('ContactIDs', args.ContactIDs as string);
            if (args.DateFrom) params.set('DateFrom', args.DateFrom as string);
            if (args.DateTo) params.set('DateTo', args.DateTo as string);
            if (args.page) params.set('page', String(args.page));
            if (args.pageSize) params.set('pageSize', String(args.pageSize));
            const qs = params.toString();
            return xeroFetch(`/Invoices${qs ? `?${qs}` : ''}`, token, tenantId);
        }

        case 'get_invoice': {
            validateRequired(args, ['InvoiceID']);
            return xeroFetch(`/Invoices/${args.InvoiceID}`, token, tenantId);
        }

        case 'create_invoice': {
            validateRequired(args, ['Type', 'ContactID', 'LineItems']);
            const body: Record<string, unknown> = {
                Type: args.Type,
                Contact: { ContactID: args.ContactID },
                LineItems: args.LineItems,
            };
            if (args.Date) body.Date = args.Date;
            if (args.DueDate) body.DueDate = args.DueDate;
            if (args.Status) body.Status = args.Status;
            if (args.InvoiceNumber) body.InvoiceNumber = args.InvoiceNumber;
            if (args.Reference) body.Reference = args.Reference;
            return xeroFetch('/Invoices', token, tenantId, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_invoice': {
            validateRequired(args, ['InvoiceID']);
            const { InvoiceID, ...rest } = args;
            const body: Record<string, unknown> = { InvoiceID };
            for (const key of ['Status', 'LineItems', 'DueDate', 'Reference']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return xeroFetch(`/Invoices/${InvoiceID}`, token, tenantId, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'email_invoice': {
            validateRequired(args, ['InvoiceID']);
            const emailBody: Record<string, unknown> = {};
            if (args.EmailAddress) emailBody.EmailAddress = args.EmailAddress;
            return xeroFetch(`/Invoices/${args.InvoiceID}/Email`, token, tenantId, {
                method: 'POST',
                body: JSON.stringify(emailBody),
            });
        }

        case 'void_invoice': {
            validateRequired(args, ['InvoiceID']);
            return xeroFetch(`/Invoices/${args.InvoiceID}`, token, tenantId, {
                method: 'POST',
                body: JSON.stringify({ InvoiceID: args.InvoiceID, Status: 'VOIDED' }),
            });
        }

        // ── Contacts ────────────────────────────────────────────────────────────

        case 'list_contacts': {
            const params = new URLSearchParams();
            if (args.ContactStatus) params.set('ContactStatus', args.ContactStatus as string);
            if (args.Name) params.set('Name', args.Name as string);
            if (args.EmailAddress) params.set('EmailAddress', args.EmailAddress as string);
            if (args.page) params.set('page', String(args.page));
            const qs = params.toString();
            return xeroFetch(`/Contacts${qs ? `?${qs}` : ''}`, token, tenantId);
        }

        case 'get_contact': {
            validateRequired(args, ['ContactID']);
            return xeroFetch(`/Contacts/${args.ContactID}`, token, tenantId);
        }

        case 'create_contact': {
            validateRequired(args, ['Name']);
            const body: Record<string, unknown> = { Name: args.Name };
            for (const key of ['EmailAddress', 'FirstName', 'LastName', 'IsSupplier', 'IsCustomer', 'Phones', 'Addresses']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return xeroFetch('/Contacts', token, tenantId, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_contact': {
            validateRequired(args, ['ContactID']);
            const { ContactID, ...rest } = args;
            const body: Record<string, unknown> = { ContactID };
            for (const key of ['Name', 'EmailAddress', 'FirstName', 'LastName', 'IsSupplier', 'IsCustomer']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return xeroFetch(`/Contacts/${ContactID}`, token, tenantId, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'archive_contact': {
            validateRequired(args, ['ContactID']);
            return xeroFetch(`/Contacts/${args.ContactID}`, token, tenantId, {
                method: 'POST',
                body: JSON.stringify({ ContactID: args.ContactID, ContactStatus: 'ARCHIVED' }),
            });
        }

        // ── Accounts & Organisation ──────────────────────────────────────────────

        case 'get_organisation': {
            return xeroFetch('/Organisation', token, tenantId);
        }

        case 'list_accounts': {
            const params = new URLSearchParams();
            if (args.Type) params.set('Type', args.Type as string);
            if (args.Status) params.set('Status', args.Status as string);
            if (args.Class) params.set('Class', args.Class as string);
            const qs = params.toString();
            return xeroFetch(`/Accounts${qs ? `?${qs}` : ''}`, token, tenantId);
        }

        case 'get_account': {
            validateRequired(args, ['AccountID']);
            return xeroFetch(`/Accounts/${args.AccountID}`, token, tenantId);
        }

        case 'get_trial_balance': {
            const params = new URLSearchParams();
            if (args.date) params.set('date', args.date as string);
            const qs = params.toString();
            return xeroFetch(`/Reports/TrialBalance${qs ? `?${qs}` : ''}`, token, tenantId);
        }

        // ── Reports ──────────────────────────────────────────────────────────────

        case 'get_profit_loss': {
            const params = new URLSearchParams();
            if (args.fromDate) params.set('fromDate', args.fromDate as string);
            if (args.toDate) params.set('toDate', args.toDate as string);
            if (args.periods) params.set('periods', String(args.periods));
            if (args.timeframe) params.set('timeframe', args.timeframe as string);
            const qs = params.toString();
            return xeroFetch(`/Reports/ProfitAndLoss${qs ? `?${qs}` : ''}`, token, tenantId);
        }

        case 'get_balance_sheet': {
            const params = new URLSearchParams();
            if (args.date) params.set('date', args.date as string);
            if (args.periods) params.set('periods', String(args.periods));
            if (args.timeframe) params.set('timeframe', args.timeframe as string);
            const qs = params.toString();
            return xeroFetch(`/Reports/BalanceSheet${qs ? `?${qs}` : ''}`, token, tenantId);
        }

        case 'get_cashflow': {
            const params = new URLSearchParams();
            if (args.fromDate) params.set('fromDate', args.fromDate as string);
            if (args.toDate) params.set('toDate', args.toDate as string);
            const qs = params.toString();
            return xeroFetch(`/Reports/CashSummary${qs ? `?${qs}` : ''}`, token, tenantId);
        }

        case 'get_aged_receivables': {
            const params = new URLSearchParams();
            if (args.date) params.set('date', args.date as string);
            if (args.contactID) params.set('contactID', args.contactID as string);
            const qs = params.toString();
            return xeroFetch(`/Reports/AgedReceivablesByContact${qs ? `?${qs}` : ''}`, token, tenantId);
        }

        // ── Payments & Banking ───────────────────────────────────────────────────

        case 'list_payments': {
            const params = new URLSearchParams();
            if (args.Status) params.set('Status', args.Status as string);
            if (args.PaymentType) params.set('PaymentType', args.PaymentType as string);
            if (args.DateFrom) params.set('DateFrom', args.DateFrom as string);
            if (args.DateTo) params.set('DateTo', args.DateTo as string);
            const qs = params.toString();
            return xeroFetch(`/Payments${qs ? `?${qs}` : ''}`, token, tenantId);
        }

        case 'create_payment': {
            validateRequired(args, ['InvoiceID', 'AccountID', 'Date', 'Amount']);
            const body: Record<string, unknown> = {
                Invoice: { InvoiceID: args.InvoiceID },
                Account: { AccountID: args.AccountID },
                Date: args.Date,
                Amount: args.Amount,
            };
            if (args.Reference) body.Reference = args.Reference;
            return xeroFetch('/Payments', token, tenantId, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_bank_transactions': {
            validateRequired(args, ['BankAccountID']);
            const params = new URLSearchParams();
            if (args.DateFrom) params.set('DateFrom', args.DateFrom as string);
            if (args.DateTo) params.set('DateTo', args.DateTo as string);
            if (args.page) params.set('page', String(args.page));
            const qs = params.toString();
            return xeroFetch(
                `/BankTransactions?BankAccountID=${args.BankAccountID}${qs ? `&${qs}` : ''}`,
                token,
                tenantId,
            );
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
                JSON.stringify({ status: 'ok', server: 'mcp-xero', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-xero', version: '1.0.0' },
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
            const { token, tenantId } = getSecrets(request);
            if (!token || !tenantId) {
                const missing = [];
                if (!token) missing.push('XERO_ACCESS_TOKEN (header: X-Mcp-Secret-XERO-ACCESS-TOKEN)');
                if (!tenantId) missing.push('XERO_TENANT_ID (header: X-Mcp-Secret-XERO-TENANT-ID)');
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                const result = await callTool(toolName, args, token, tenantId);
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
