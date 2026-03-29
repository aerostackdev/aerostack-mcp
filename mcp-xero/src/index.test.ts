import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'test_xero_access_token_abc123';
const TENANT_ID = 'test-tenant-uuid-1234-5678-abcd';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockOrg = {
    Organisations: [{
        OrganisationID: 'org-uuid-1234',
        Name: 'Acme Accounting Ltd',
        BaseCurrency: 'AUD',
        CountryCode: 'AU',
    }],
};

const mockInvoice = {
    InvoiceID: 'inv-uuid-1234',
    Type: 'ACCREC',
    Status: 'AUTHORISED',
    InvoiceNumber: 'INV-001',
    AmountDue: 1100.00,
    AmountPaid: 0,
    Total: 1100.00,
    Contact: { ContactID: 'cont-uuid-1234', Name: 'Test Customer' },
    LineItems: [
        { Description: 'Consulting', Quantity: 10, UnitAmount: 100, AccountCode: '200' },
    ],
};

const mockContact = {
    ContactID: 'cont-uuid-1234',
    Name: 'Test Customer',
    EmailAddress: 'test@customer.com',
    IsCustomer: true,
    IsSupplier: false,
};

const mockAccount = {
    AccountID: 'acct-uuid-5678',
    Code: '200',
    Name: 'Sales',
    Type: 'REVENUE',
    Class: 'INCOME',
    Status: 'ACTIVE',
};

const mockPayment = {
    PaymentID: 'pay-uuid-1234',
    Invoice: { InvoiceID: 'inv-uuid-1234' },
    Account: { AccountID: 'acct-uuid-5678' },
    Date: '/Date(1700000000000+0000)/',
    Amount: 1100.00,
    Status: 'AUTHORISED',
};

const mockReport = {
    Reports: [{
        ReportID: 'ProfitAndLoss',
        ReportName: 'Profit and Loss',
        ReportType: 'ProfitAndLoss',
        ReportTitles: ['Profit and Loss', 'Acme Accounting Ltd', '1 January 2026 to 31 December 2026'],
        Rows: [],
    }],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function xeroOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function xeroErr(detail: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ Detail: detail, Type: 'ValidationException' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('token')) {
        headers['X-Mcp-Secret-XERO-ACCESS-TOKEN'] = ACCESS_TOKEN;
    }
    if (!missingSecrets.includes('tenantId')) {
        headers['X-Mcp-Secret-XERO-TENANT-ID'] = TENANT_ID;
    }
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingSecrets);
}

async function callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    const req = makeToolReq(toolName, args, missingSecrets);
    const res = await worker.fetch(req);
    return res.json() as Promise<{
        jsonrpc: string;
        id: number;
        result?: { content: [{ type: string; text: string }] };
        error?: { code: number; message: string };
    }>;
}

async function getToolResult(toolName: string, args: Record<string, unknown> = {}) {
    const body = await callTool(toolName, args);
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    return JSON.parse(body.result!.content[0].text);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-xero and tool count', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-xero');
        expect(body.tools).toBeGreaterThan(0);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json{{{',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { protocolVersion: string; serverInfo: { name: string } }
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-xero');
    });

    it('tools/list returns tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools.length).toBeGreaterThan(0);
        for (const tool of body.result.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
        }
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq('unknown/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing token returns -32001 with XERO_ACCESS_TOKEN in message', async () => {
        const body = await callTool('list_invoices', {}, ['token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('XERO_ACCESS_TOKEN');
    });

    it('missing tenantId returns -32001 with XERO_TENANT_ID in message', async () => {
        const body = await callTool('list_invoices', {}, ['tenantId']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('XERO_TENANT_ID');
    });

    it('missing both secrets returns -32001', async () => {
        const body = await callTool('list_invoices', {}, ['token', 'tenantId']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('Authorization header uses Bearer format', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [] }));
        await callTool('list_invoices', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it('Xero-Tenant-Id header is sent on every request', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [] }));
        await callTool('list_invoices', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Xero-Tenant-Id']).toBe(TENANT_ID);
    });

    it('Accept: application/json header is sent on every request', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [] }));
        await callTool('list_invoices', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Accept']).toBe('application/json');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns org data on success', async () => {
        mockFetch.mockReturnValueOnce(xeroOk(mockOrg));
        const result = await getToolResult('_ping');
        expect(result.Organisations[0].Name).toBe('Acme Accounting Ltd');
    });

    it('calls /Organisation endpoint', async () => {
        mockFetch.mockReturnValueOnce(xeroOk(mockOrg));
        await callTool('_ping');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/Organisation');
    });

    it('returns API error on 401', async () => {
        mockFetch.mockReturnValueOnce(xeroErr('AuthenticationUnsuccessful', 401));
        const body = await callTool('_ping');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('401');
    });
});

// ── Invoices ──────────────────────────────────────────────────────────────────

describe('list_invoices', () => {
    it('returns invoices array', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [mockInvoice] }));
        const result = await getToolResult('list_invoices', {});
        expect(result.Invoices).toHaveLength(1);
        expect(result.Invoices[0].InvoiceID).toBe('inv-uuid-1234');
    });

    it('passes Status filter as query param', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [] }));
        await callTool('list_invoices', { Status: 'AUTHORISED' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('Status=AUTHORISED');
    });

    it('passes DateFrom and DateTo as query params', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [] }));
        await callTool('list_invoices', { DateFrom: '2026-01-01', DateTo: '2026-03-31' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('DateFrom=2026-01-01');
        expect(url).toContain('DateTo=2026-03-31');
    });
});

describe('get_invoice', () => {
    it('fetches invoice by InvoiceID', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [mockInvoice] }));
        const result = await getToolResult('get_invoice', { InvoiceID: 'inv-uuid-1234' });
        expect(result.Invoices[0].InvoiceID).toBe('inv-uuid-1234');
    });

    it('calls correct URL with InvoiceID', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [mockInvoice] }));
        await callTool('get_invoice', { InvoiceID: 'inv-uuid-1234' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/Invoices/inv-uuid-1234');
    });

    it('returns error when InvoiceID is missing', async () => {
        const body = await callTool('get_invoice', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('InvoiceID');
    });
});

describe('create_invoice', () => {
    it('creates invoice and returns result', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [mockInvoice] }));
        const result = await getToolResult('create_invoice', {
            Type: 'ACCREC',
            ContactID: 'cont-uuid-1234',
            LineItems: [{ Description: 'Consulting', UnitAmount: 100 }],
        });
        expect(result.Invoices[0].Type).toBe('ACCREC');
    });

    it('uses POST method', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [mockInvoice] }));
        await callTool('create_invoice', {
            Type: 'ACCREC',
            ContactID: 'cont-uuid-1234',
            LineItems: [{ Description: 'Test', UnitAmount: 50 }],
        });
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callOpts.method).toBe('POST');
    });

    it('wraps ContactID in Contact object', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [mockInvoice] }));
        await callTool('create_invoice', {
            Type: 'ACCREC',
            ContactID: 'cont-uuid-1234',
            LineItems: [{ Description: 'Test', UnitAmount: 50 }],
        });
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        const sentBody = JSON.parse(callOpts.body as string);
        expect(sentBody.Contact.ContactID).toBe('cont-uuid-1234');
    });

    it('returns error when Type is missing', async () => {
        const body = await callTool('create_invoice', {
            ContactID: 'cont-uuid-1234',
            LineItems: [{ Description: 'Test', UnitAmount: 50 }],
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Type');
    });

    it('returns error on Xero API error', async () => {
        mockFetch.mockReturnValueOnce(xeroErr('Invoice number already exists', 400));
        const body = await callTool('create_invoice', {
            Type: 'ACCREC',
            ContactID: 'cont-uuid-1234',
            LineItems: [{ Description: 'Test', UnitAmount: 50 }],
        });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });
});

describe('update_invoice', () => {
    it('sends POST to /Invoices/:id', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [mockInvoice] }));
        await callTool('update_invoice', { InvoiceID: 'inv-uuid-1234', Status: 'AUTHORISED' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/Invoices/inv-uuid-1234');
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callOpts.method).toBe('POST');
    });

    it('returns error when InvoiceID is missing', async () => {
        const body = await callTool('update_invoice', { Status: 'AUTHORISED' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('InvoiceID');
    });
});

describe('email_invoice', () => {
    it('calls /Invoices/:id/Email endpoint', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({}));
        await callTool('email_invoice', { InvoiceID: 'inv-uuid-1234' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/Invoices/inv-uuid-1234/Email');
    });

    it('returns error when InvoiceID is missing', async () => {
        const body = await callTool('email_invoice', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('InvoiceID');
    });
});

describe('void_invoice', () => {
    it('sends Status VOIDED in request body', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Invoices: [{ ...mockInvoice, Status: 'VOIDED' }] }));
        await callTool('void_invoice', { InvoiceID: 'inv-uuid-1234' });
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        const sentBody = JSON.parse(callOpts.body as string);
        expect(sentBody.Status).toBe('VOIDED');
    });

    it('returns error when InvoiceID is missing', async () => {
        const body = await callTool('void_invoice', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('InvoiceID');
    });
});

// ── Contacts ──────────────────────────────────────────────────────────────────

describe('list_contacts', () => {
    it('returns contacts array', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Contacts: [mockContact] }));
        const result = await getToolResult('list_contacts', {});
        expect(result.Contacts).toHaveLength(1);
        expect(result.Contacts[0].Name).toBe('Test Customer');
    });

    it('passes ContactStatus filter as query param', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Contacts: [] }));
        await callTool('list_contacts', { ContactStatus: 'ACTIVE' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('ContactStatus=ACTIVE');
    });
});

describe('get_contact', () => {
    it('fetches contact by ContactID', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Contacts: [mockContact] }));
        const result = await getToolResult('get_contact', { ContactID: 'cont-uuid-1234' });
        expect(result.Contacts[0].ContactID).toBe('cont-uuid-1234');
    });

    it('returns error when ContactID is missing', async () => {
        const body = await callTool('get_contact', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('ContactID');
    });
});

describe('create_contact', () => {
    it('creates contact and returns result', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Contacts: [mockContact] }));
        const result = await getToolResult('create_contact', { Name: 'Test Customer', EmailAddress: 'test@customer.com' });
        expect(result.Contacts[0].Name).toBe('Test Customer');
    });

    it('returns error when Name is missing', async () => {
        const body = await callTool('create_contact', { EmailAddress: 'test@test.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Name');
    });
});

describe('update_contact', () => {
    it('sends POST to /Contacts/:id', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Contacts: [mockContact] }));
        await callTool('update_contact', { ContactID: 'cont-uuid-1234', Name: 'Updated Name' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/Contacts/cont-uuid-1234');
    });

    it('returns error when ContactID is missing', async () => {
        const body = await callTool('update_contact', { Name: 'Updated Name' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('ContactID');
    });
});

describe('archive_contact', () => {
    it('sends ContactStatus ARCHIVED in request body', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Contacts: [{ ...mockContact, ContactStatus: 'ARCHIVED' }] }));
        await callTool('archive_contact', { ContactID: 'cont-uuid-1234' });
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        const sentBody = JSON.parse(callOpts.body as string);
        expect(sentBody.ContactStatus).toBe('ARCHIVED');
    });
});

// ── Accounts & Organisation ───────────────────────────────────────────────────

describe('get_organisation', () => {
    it('returns organisation details', async () => {
        mockFetch.mockReturnValueOnce(xeroOk(mockOrg));
        const result = await getToolResult('get_organisation');
        expect(result.Organisations[0].Name).toBe('Acme Accounting Ltd');
    });
});

describe('list_accounts', () => {
    it('returns accounts array', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Accounts: [mockAccount] }));
        const result = await getToolResult('list_accounts', {});
        expect(result.Accounts[0].Code).toBe('200');
    });

    it('passes Class filter as query param', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Accounts: [] }));
        await callTool('list_accounts', { Class: 'INCOME' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('Class=INCOME');
    });
});

describe('get_account', () => {
    it('fetches account by AccountID', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Accounts: [mockAccount] }));
        const result = await getToolResult('get_account', { AccountID: 'acct-uuid-5678' });
        expect(result.Accounts[0].Name).toBe('Sales');
    });

    it('returns error when AccountID is missing', async () => {
        const body = await callTool('get_account', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('AccountID');
    });
});

describe('get_trial_balance', () => {
    it('calls /Reports/TrialBalance endpoint', async () => {
        mockFetch.mockReturnValueOnce(xeroOk(mockReport));
        await callTool('get_trial_balance', { date: '2026-03-31' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/Reports/TrialBalance');
        expect(url).toContain('date=2026-03-31');
    });
});

// ── Reports ───────────────────────────────────────────────────────────────────

describe('get_profit_loss', () => {
    it('calls /Reports/ProfitAndLoss with date range', async () => {
        mockFetch.mockReturnValueOnce(xeroOk(mockReport));
        await callTool('get_profit_loss', { fromDate: '2026-01-01', toDate: '2026-03-31' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/Reports/ProfitAndLoss');
        expect(url).toContain('fromDate=2026-01-01');
    });
});

describe('get_balance_sheet', () => {
    it('calls /Reports/BalanceSheet endpoint', async () => {
        mockFetch.mockReturnValueOnce(xeroOk(mockReport));
        await callTool('get_balance_sheet', { date: '2026-03-31' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/Reports/BalanceSheet');
    });
});

describe('get_cashflow', () => {
    it('calls /Reports/CashSummary endpoint', async () => {
        mockFetch.mockReturnValueOnce(xeroOk(mockReport));
        await callTool('get_cashflow', { fromDate: '2026-01-01', toDate: '2026-03-31' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/Reports/CashSummary');
    });
});

describe('get_aged_receivables', () => {
    it('calls /Reports/AgedReceivablesByContact endpoint', async () => {
        mockFetch.mockReturnValueOnce(xeroOk(mockReport));
        await callTool('get_aged_receivables', { date: '2026-03-31' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/Reports/AgedReceivablesByContact');
    });

    it('passes optional contactID filter', async () => {
        mockFetch.mockReturnValueOnce(xeroOk(mockReport));
        await callTool('get_aged_receivables', { contactID: 'cont-uuid-1234' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('contactID=cont-uuid-1234');
    });
});

// ── Payments & Banking ────────────────────────────────────────────────────────

describe('list_payments', () => {
    it('returns payments array', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Payments: [mockPayment] }));
        const result = await getToolResult('list_payments', {});
        expect(result.Payments).toHaveLength(1);
        expect(result.Payments[0].PaymentID).toBe('pay-uuid-1234');
    });

    it('passes PaymentType filter', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Payments: [] }));
        await callTool('list_payments', { PaymentType: 'ACCRECPAYMENT' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('PaymentType=ACCRECPAYMENT');
    });
});

describe('create_payment', () => {
    it('creates payment and returns result', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Payments: [mockPayment] }));
        const result = await getToolResult('create_payment', {
            InvoiceID: 'inv-uuid-1234',
            AccountID: 'acct-uuid-5678',
            Date: '2026-03-28',
            Amount: 1100.00,
        });
        expect(result.Payments[0].Amount).toBe(1100.00);
    });

    it('wraps InvoiceID and AccountID in nested objects', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ Payments: [mockPayment] }));
        await callTool('create_payment', {
            InvoiceID: 'inv-uuid-1234',
            AccountID: 'acct-uuid-5678',
            Date: '2026-03-28',
            Amount: 1100.00,
        });
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        const sentBody = JSON.parse(callOpts.body as string);
        expect(sentBody.Invoice.InvoiceID).toBe('inv-uuid-1234');
        expect(sentBody.Account.AccountID).toBe('acct-uuid-5678');
    });

    it('returns error when required params are missing', async () => {
        const body = await callTool('create_payment', { InvoiceID: 'inv-uuid-1234' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('AccountID');
    });
});

describe('get_bank_transactions', () => {
    it('calls /BankTransactions with BankAccountID', async () => {
        mockFetch.mockReturnValueOnce(xeroOk({ BankTransactions: [] }));
        await callTool('get_bank_transactions', { BankAccountID: 'bank-acct-uuid' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/BankTransactions');
        expect(url).toContain('BankAccountID=bank-acct-uuid');
    });

    it('returns error when BankAccountID is missing', async () => {
        const body = await callTool('get_bank_transactions', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('BankAccountID');
    });
});

// ── Unknown tool ──────────────────────────────────────────────────────────────

describe('Unknown tool', () => {
    it('returns -32601 for unknown tool name', async () => {
        const body = await callTool('does_not_exist', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
        expect(body.error!.message).toContain('does_not_exist');
    });
});
