import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'test_qb_access_token_abc123';
const REALM_ID = '9341453306837889';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockInvoice = {
    Id: '145',
    DocNumber: 'INV-1001',
    SyncToken: '0',
    CustomerRef: { value: '58', name: 'Test Customer' },
    TotalAmt: 1500.00,
    Balance: 1500.00,
    DueDate: '2026-04-30',
    TxnDate: '2026-03-28',
    EmailStatus: 'NotSet',
    Line: [
        {
            Id: '1',
            Amount: 1500.00,
            DetailType: 'SalesItemLineDetail',
            Description: 'Consulting services',
        },
    ],
};

const mockCustomer = {
    Id: '58',
    SyncToken: '0',
    DisplayName: 'Acme Corp',
    PrimaryEmailAddr: { Address: 'billing@acme.com' },
    PrimaryPhone: { FreeFormNumber: '+1-555-100-2000' },
    Balance: 1500.00,
    CurrencyRef: { value: 'USD', name: 'United States Dollar' },
};

const mockItem = {
    Id: '12',
    Name: 'Consulting',
    Type: 'Service',
    UnitPrice: 150.00,
    Description: 'Professional consulting services',
    IncomeAccountRef: { value: '79', name: 'Services' },
};

const mockAccount = {
    Id: '79',
    Name: 'Services',
    AccountType: 'Income',
    AccountSubType: 'ServiceFeeIncome',
    CurrentBalance: 25000.00,
    Active: true,
};

const mockPurchase = {
    Id: '77',
    TxnDate: '2026-03-15',
    TotalAmt: 350.00,
    AccountRef: { value: '41', name: 'Checking' },
    PaymentType: 'Check',
    Line: [
        {
            Id: '1',
            Amount: 350.00,
            DetailType: 'AccountBasedExpenseLineDetail',
            Description: 'Office supplies',
        },
    ],
};

const mockPayment = {
    Id: '200',
    TxnDate: '2026-03-28',
    TotalAmt: 1500.00,
    CustomerRef: { value: '58', name: 'Acme Corp' },
};

const mockCompanyInfo = {
    CompanyInfo: {
        Id: REALM_ID,
        CompanyName: 'Test Company LLC',
        LegalName: 'Test Company LLC',
        CompanyAddr: { City: 'San Francisco', CountrySubDivisionCode: 'CA', Country: 'US' },
        FiscalYearStartMonth: 'January',
    },
    time: '2026-03-28T10:00:00.000-07:00',
};

const mockQueryResult = (entity: string, records: unknown[]) => ({
    QueryResponse: {
        [entity]: records,
        startPosition: 1,
        maxResults: records.length,
        totalCount: records.length,
    },
    time: '2026-03-28T10:00:00.000-07:00',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function qbOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function qbErr(fault: { Fault: { Error: Array<{ Detail: string; Message: string; code: string }> } }, status = 400) {
    return Promise.resolve(new Response(JSON.stringify(fault), {
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
        headers['X-Mcp-Secret-QUICKBOOKS-ACCESS-TOKEN'] = ACCESS_TOKEN;
    }
    if (!missingSecrets.includes('realmId')) {
        headers['X-Mcp-Secret-QUICKBOOKS-REALM-ID'] = REALM_ID;
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
    it('GET / returns status ok with server mcp-quickbooks and tools 23', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-quickbooks');
        expect(body.tools).toBe(23);
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
        expect(body.result.serverInfo.name).toBe('mcp-quickbooks');
    });

    it('tools/list returns exactly 23 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools).toHaveLength(23);
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
    it('missing token returns -32001 with QUICKBOOKS_ACCESS_TOKEN in message', async () => {
        const body = await callTool('list_invoices', {}, ['token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('QUICKBOOKS_ACCESS_TOKEN');
    });

    it('missing realmId returns -32001 with QUICKBOOKS_REALM_ID in message', async () => {
        const body = await callTool('list_invoices', {}, ['realmId']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('QUICKBOOKS_REALM_ID');
    });

    it('missing both secrets returns -32001', async () => {
        const body = await callTool('list_invoices', {}, ['token', 'realmId']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('Authorization header uses Bearer token format', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Invoice', [mockInvoice])));
        await callTool('list_invoices', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it('Accept header is application/json', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Invoice', [])));
        await callTool('list_invoices', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Accept']).toBe('application/json');
    });
});

// ── Invoices ──────────────────────────────────────────────────────────────────

describe('list_invoices', () => {
    it('returns query result with Invoice records', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Invoice', [mockInvoice])));
        const result = await getToolResult('list_invoices', {});
        expect(result.QueryResponse.Invoice).toHaveLength(1);
        expect(result.QueryResponse.Invoice[0].Id).toBe('145');
    });

    it('builds query URL with ORDERBY and MAXRESULTS', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Invoice', [])));
        await callTool('list_invoices', { max_results: 5 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/query');
        expect(url).toContain('Invoice');
        expect(url).toContain('MAXRESULTS%205');
    });

    it('includes customer filter in query when customer_id provided', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Invoice', [])));
        await callTool('list_invoices', { customer_id: '58' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('CustomerRef');
        expect(url).toContain('58');
    });

    it('includes date filters when start_date and end_date provided', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Invoice', [])));
        await callTool('list_invoices', { start_date: '2026-01-01', end_date: '2026-03-31' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('2026-01-01');
        expect(url).toContain('2026-03-31');
    });
});

describe('get_invoice', () => {
    it('returns full invoice object', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Invoice: mockInvoice, time: '2026-03-28T10:00:00Z' }));
        const result = await getToolResult('get_invoice', { id: '145' });
        expect(result.Invoice.Id).toBe('145');
        expect(result.Invoice.TotalAmt).toBe(1500.00);
    });

    it('fetches from /invoice/{id} endpoint', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Invoice: mockInvoice }));
        await callTool('get_invoice', { id: '145' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/invoice/145');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_invoice', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_invoice', () => {
    it('returns created invoice with Id and SyncToken', async () => {
        mockFetch.mockReturnValueOnce(qbOk({
            Invoice: { ...mockInvoice, Id: '146' },
            time: '2026-03-28T10:00:00Z',
        }));
        const result = await getToolResult('create_invoice', {
            customer_id: '58',
            line_items: [{ amount: 500, description: 'Service A' }],
        });
        expect(result.Invoice.Id).toBe('146');
    });

    it('sends POST to /invoice with CustomerRef and Line', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Invoice: mockInvoice }));
        await callTool('create_invoice', {
            customer_id: '58',
            line_items: [{ amount: 500, description: 'Test' }],
            due_date: '2026-04-30',
        });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/invoice');
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect((body.CustomerRef as { value: string }).value).toBe('58');
        expect(body.DueDate).toBe('2026-04-30');
        expect(Array.isArray(body.Line)).toBe(true);
    });

    it('missing customer_id returns validation error', async () => {
        const body = await callTool('create_invoice', { line_items: [{ amount: 100 }] });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('customer_id');
    });

    it('missing line_items returns validation error', async () => {
        const body = await callTool('create_invoice', { customer_id: '58' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('line_items');
    });

    it('sets BillEmail when provided', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Invoice: mockInvoice }));
        await callTool('create_invoice', {
            customer_id: '58',
            line_items: [{ amount: 100 }],
            bill_email: 'test@example.com',
        });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
        expect((body.BillEmail as { Address: string }).Address).toBe('test@example.com');
    });
});

describe('update_invoice', () => {
    it('fetches current invoice then sends sparse update', async () => {
        mockFetch
            .mockReturnValueOnce(qbOk({ Invoice: mockInvoice }))
            .mockReturnValueOnce(qbOk({ Invoice: { ...mockInvoice, DueDate: '2026-05-31' } }));
        const result = await getToolResult('update_invoice', { id: '145', due_date: '2026-05-31' });
        expect(result.Invoice.DueDate).toBe('2026-05-31');
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const updateCall = mockFetch.mock.calls[1];
        const body = JSON.parse(updateCall[1].body as string) as Record<string, unknown>;
        expect(body.sparse).toBe(true);
        expect(body.SyncToken).toBe('0');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('update_invoice', { due_date: '2026-05-01' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('send_invoice', () => {
    it('sends POST to /invoice/{id}/send', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Invoice: mockInvoice }));
        await callTool('send_invoice', { id: '145' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/invoice/145/send');
        expect((mockFetch.mock.calls[0][1] as { method: string }).method).toBe('POST');
    });

    it('appends sendTo query param when email provided', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Invoice: mockInvoice }));
        await callTool('send_invoice', { id: '145', email: 'cfo@acme.com' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('sendTo=');
        expect(url).toContain('cfo%40acme.com');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('send_invoice', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('void_invoice', () => {
    it('fetches current invoice then sends void operation', async () => {
        mockFetch
            .mockReturnValueOnce(qbOk({ Invoice: mockInvoice }))
            .mockReturnValueOnce(qbOk({ Invoice: { ...mockInvoice, Balance: 0 } }));
        const result = await getToolResult('void_invoice', { id: '145' });
        expect(result.Invoice.Balance).toBe(0);
        const voidUrl = mockFetch.mock.calls[1][0] as string;
        expect(voidUrl).toContain('operation=void');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('void_invoice', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Customers ─────────────────────────────────────────────────────────────────

describe('list_customers', () => {
    it('returns query result with Customer records', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Customer', [mockCustomer])));
        const result = await getToolResult('list_customers', {});
        expect(result.QueryResponse.Customer).toHaveLength(1);
        expect(result.QueryResponse.Customer[0].DisplayName).toBe('Acme Corp');
    });

    it('filters by active status when provided', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Customer', [])));
        await callTool('list_customers', { active: true });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('Active');
        expect(url).toContain('true');
    });

    it('applies start_position for pagination', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Customer', [])));
        await callTool('list_customers', { start_position: 21, max_results: 20 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('STARTPOSITION%2021');
    });
});

describe('get_customer', () => {
    it('returns full customer object', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Customer: mockCustomer, time: '2026-03-28T10:00:00Z' }));
        const result = await getToolResult('get_customer', { id: '58' });
        expect(result.Customer.Id).toBe('58');
        expect(result.Customer.DisplayName).toBe('Acme Corp');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_customer', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_customer', () => {
    it('returns created customer with Id', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Customer: { ...mockCustomer, Id: '60' } }));
        const result = await getToolResult('create_customer', { display_name: 'Beta Inc' });
        expect(result.Customer.Id).toBe('60');
    });

    it('sends POST to /customer with DisplayName', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Customer: mockCustomer }));
        await callTool('create_customer', {
            display_name: 'New Client',
            email: 'new@client.com',
            phone: '+1-555-200-3000',
        });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(body.DisplayName).toBe('New Client');
        expect((body.PrimaryEmailAddr as { Address: string }).Address).toBe('new@client.com');
    });

    it('sets billing address fields when provided', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Customer: mockCustomer }));
        await callTool('create_customer', {
            display_name: 'Test Corp',
            billing_line1: '100 Main St',
            billing_city: 'San Francisco',
            billing_state: 'CA',
            billing_postal_code: '94105',
            billing_country: 'US',
        });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { BillAddr: Record<string, string> };
        expect(body.BillAddr.Line1).toBe('100 Main St');
        expect(body.BillAddr.City).toBe('San Francisco');
        expect(body.BillAddr.PostalCode).toBe('94105');
    });

    it('missing display_name returns validation error', async () => {
        const body = await callTool('create_customer', { email: 'test@test.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('display_name');
    });
});

describe('update_customer', () => {
    it('fetches current customer then sends sparse update', async () => {
        mockFetch
            .mockReturnValueOnce(qbOk({ Customer: mockCustomer }))
            .mockReturnValueOnce(qbOk({ Customer: { ...mockCustomer, DisplayName: 'Acme Corp Updated' } }));
        const result = await getToolResult('update_customer', { id: '58', display_name: 'Acme Corp Updated' });
        expect(result.Customer.DisplayName).toBe('Acme Corp Updated');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('update_customer', { display_name: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('get_customer_balance', () => {
    it('returns balance query result', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Customer', [{ Id: '58', Balance: 1500.00 }])));
        const result = await getToolResult('get_customer_balance', { id: '58' });
        expect(result.QueryResponse.Customer[0].Balance).toBe(1500.00);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_customer_balance', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Expenses & Payments ───────────────────────────────────────────────────────

describe('list_expenses', () => {
    it('returns Purchase query result', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Purchase', [mockPurchase])));
        const result = await getToolResult('list_expenses', {});
        expect(result.QueryResponse.Purchase).toHaveLength(1);
        expect(result.QueryResponse.Purchase[0].Id).toBe('77');
    });

    it('applies date and account filters when provided', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Purchase', [])));
        await callTool('list_expenses', { start_date: '2026-01-01', account_id: '41', vendor_id: '99' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('Purchase');
        expect(url).toContain('2026-01-01');
    });
});

describe('create_expense', () => {
    it('returns created Purchase with Id', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Purchase: { ...mockPurchase, Id: '78' } }));
        const result = await getToolResult('create_expense', {
            account_id: '41',
            payment_type: 'Check',
            total_amount: 350,
            line_items: [{ amount: 350, account_id: '64', description: 'Office supplies' }],
        });
        expect(result.Purchase.Id).toBe('78');
    });

    it('sends POST to /purchase with AccountRef and PaymentType', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Purchase: mockPurchase }));
        await callTool('create_expense', {
            account_id: '41',
            payment_type: 'CreditCard',
            total_amount: 200,
            line_items: [{ amount: 200, account_id: '64' }],
        });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/purchase');
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect((body.AccountRef as { value: string }).value).toBe('41');
        expect(body.PaymentType).toBe('CreditCard');
    });

    it('missing account_id returns validation error', async () => {
        const body = await callTool('create_expense', {
            payment_type: 'Cash',
            total_amount: 100,
            line_items: [{ amount: 100, account_id: '64' }],
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('account_id');
    });

    it('missing line_items returns validation error', async () => {
        const body = await callTool('create_expense', {
            account_id: '41',
            payment_type: 'Cash',
            total_amount: 100,
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('line_items');
    });
});

describe('list_payments', () => {
    it('returns Payment query result', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Payment', [mockPayment])));
        const result = await getToolResult('list_payments', {});
        expect(result.QueryResponse.Payment).toHaveLength(1);
        expect(result.QueryResponse.Payment[0].Id).toBe('200');
    });

    it('filters by customer_id when provided', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Payment', [])));
        await callTool('list_payments', { customer_id: '58' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('CustomerRef');
        expect(url).toContain('58');
    });
});

describe('create_payment', () => {
    it('returns created Payment with Id', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Payment: { ...mockPayment, Id: '201' } }));
        const result = await getToolResult('create_payment', {
            customer_id: '58',
            total_amount: 1500,
            invoice_id: '145',
        });
        expect(result.Payment.Id).toBe('201');
    });

    it('sends POST to /payment with LinkedTxn invoice reference', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Payment: mockPayment }));
        await callTool('create_payment', {
            customer_id: '58',
            total_amount: 1500,
            invoice_id: '145',
        });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        const body = JSON.parse(call[1].body as string) as {
            Line: Array<{ LinkedTxn: Array<{ TxnId: string; TxnType: string }> }>;
        };
        expect(body.Line[0].LinkedTxn[0].TxnId).toBe('145');
        expect(body.Line[0].LinkedTxn[0].TxnType).toBe('Invoice');
    });

    it('missing customer_id returns validation error', async () => {
        const body = await callTool('create_payment', { total_amount: 100, invoice_id: '145' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('customer_id');
    });

    it('missing invoice_id returns validation error', async () => {
        const body = await callTool('create_payment', { customer_id: '58', total_amount: 100 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('invoice_id');
    });
});

describe('get_profit_loss', () => {
    it('returns report from /reports/ProfitAndLoss', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Header: { ReportName: 'ProfitAndLoss' }, Columns: {}, Rows: {} }));
        const result = await getToolResult('get_profit_loss', { start_date: '2026-01-01', end_date: '2026-03-31' });
        expect(result.Header.ReportName).toBe('ProfitAndLoss');
    });

    it('builds URL with correct date params', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Header: { ReportName: 'ProfitAndLoss' } }));
        await callTool('get_profit_loss', { start_date: '2026-01-01', end_date: '2026-03-31', summarize_column_by: 'Month' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('ProfitAndLoss');
        expect(url).toContain('start_date=2026-01-01');
        expect(url).toContain('summarize_column_by=Month');
    });

    it('missing start_date returns validation error', async () => {
        const body = await callTool('get_profit_loss', { end_date: '2026-03-31' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('start_date');
    });
});

// ── Items, Accounts & Reports ─────────────────────────────────────────────────

describe('list_items', () => {
    it('returns Item query result', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Item', [mockItem])));
        const result = await getToolResult('list_items', {});
        expect(result.QueryResponse.Item).toHaveLength(1);
        expect(result.QueryResponse.Item[0].Name).toBe('Consulting');
    });

    it('filters by type when provided', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Item', [])));
        await callTool('list_items', { type: 'Service' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('Type');
        expect(url).toContain('Service');
    });
});

describe('create_item', () => {
    it('returns created Item with Id', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Item: { ...mockItem, Id: '13' } }));
        const result = await getToolResult('create_item', {
            name: 'New Service',
            type: 'Service',
            income_account_id: '79',
            unit_price: 200,
        });
        expect(result.Item.Id).toBe('13');
    });

    it('sends POST to /item with Name, Type, IncomeAccountRef', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Item: mockItem }));
        await callTool('create_item', {
            name: 'Consulting',
            type: 'Service',
            income_account_id: '79',
            unit_price: 150,
        });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(body.Name).toBe('Consulting');
        expect(body.Type).toBe('Service');
        expect((body.IncomeAccountRef as { value: string }).value).toBe('79');
        expect(body.UnitPrice).toBe(150);
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_item', { type: 'Service', income_account_id: '79' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });

    it('missing income_account_id returns validation error', async () => {
        const body = await callTool('create_item', { name: 'Test', type: 'Service' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('income_account_id');
    });
});

describe('list_accounts', () => {
    it('returns Account query result', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Account', [mockAccount])));
        const result = await getToolResult('list_accounts', {});
        expect(result.QueryResponse.Account).toHaveLength(1);
        expect(result.QueryResponse.Account[0].AccountType).toBe('Income');
    });

    it('filters by account_type when provided', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Account', [])));
        await callTool('list_accounts', { account_type: 'Expense' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('AccountType');
        expect(url).toContain('Expense');
    });

    it('uses default max 50 results', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Account', [])));
        await callTool('list_accounts', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('MAXRESULTS%2050');
    });
});

describe('get_balance_sheet', () => {
    it('returns report from /reports/BalanceSheet', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Header: { ReportName: 'BalanceSheet' }, Columns: {}, Rows: {} }));
        const result = await getToolResult('get_balance_sheet', { as_of_date: '2026-03-31' });
        expect(result.Header.ReportName).toBe('BalanceSheet');
    });

    it('builds URL with end_date param', async () => {
        mockFetch.mockReturnValueOnce(qbOk({ Header: { ReportName: 'BalanceSheet' } }));
        await callTool('get_balance_sheet', { as_of_date: '2026-03-31' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('BalanceSheet');
        expect(url).toContain('end_date=2026-03-31');
    });

    it('missing as_of_date returns validation error', async () => {
        const body = await callTool('get_balance_sheet', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('as_of_date');
    });
});

describe('run_query', () => {
    it('returns raw query result', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Invoice', [mockInvoice])));
        const result = await getToolResult('run_query', { query: "SELECT * FROM Invoice MAXRESULTS 5" });
        expect(result.QueryResponse.Invoice).toBeDefined();
    });

    it('encodes the full query in the URL', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockQueryResult('Customer', [])));
        await callTool('run_query', { query: "SELECT * FROM Customer WHERE Active = true" });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/query');
        expect(url).toContain('Customer');
    });

    it('missing query returns validation error', async () => {
        const body = await callTool('run_query', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('query');
    });
});

describe('get_company_info', () => {
    it('returns CompanyInfo object', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockCompanyInfo));
        const result = await getToolResult('get_company_info', {});
        expect(result.CompanyInfo.CompanyName).toBe('Test Company LLC');
    });

    it('fetches from /companyinfo/{realmId} endpoint', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockCompanyInfo));
        await callTool('get_company_info', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`/companyinfo/${REALM_ID}`);
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns CompanyInfo on successful credentials', async () => {
        mockFetch.mockReturnValueOnce(qbOk(mockCompanyInfo));
        const result = await getToolResult('_ping', {});
        expect(result.CompanyInfo).toBeDefined();
        expect(result.CompanyInfo.Id).toBe(REALM_ID);
    });

    it('returns API error when credentials are invalid', async () => {
        mockFetch.mockReturnValueOnce(qbErr(
            { Fault: { Error: [{ Detail: 'AuthenticationFailed', Message: 'Invalid credentials', code: '401' }] } },
            401,
        ));
        const body = await callTool('_ping', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });
});

// ── API error handling ────────────────────────────────────────────────────────

describe('API error handling', () => {
    it('QuickBooks Fault error is surfaced in message', async () => {
        mockFetch.mockReturnValueOnce(qbErr(
            { Fault: { Error: [{ Detail: 'Duplicate Name Exists Error: The name supplied already exists', Message: 'Duplicate name', code: '6240' }] } },
            400,
        ));
        const body = await callTool('create_customer', { display_name: 'Acme Corp' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Duplicate');
    });

    it('unknown tool returns -32601', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
    });
});
