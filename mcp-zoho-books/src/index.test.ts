import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-ZOHO-BOOKS-ACCESS-TOKEN': 'test_token',
    'X-Mcp-Secret-ZOHO-BOOKS-ORGANIZATION-ID': 'org_123',
};

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: TEST_HEADERS,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeReqNoAuth(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

// ── Health ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
    it('returns ok', async () => {
        const res = await worker.fetch(new Request('http://localhost/health'));
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('zoho-books-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('zoho-books-mcp');
    });
});

describe('tools/list', () => {
    it('returns 20 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(20);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('create_invoice');
        expect(names).toContain('get_balance_sheet');
        expect(names).toContain('get_organization');
    });
});

describe('missing auth', () => {
    it('returns -32001', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_contacts', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_contacts', () => {
    it('returns contacts', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ contacts: [{ contact_id: 'c1', contact_name: 'Acme Inc' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_contacts', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.contacts[0].contact_name).toBe('Acme Inc');
    });

    it('includes organization_id in URL', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ contacts: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_contacts', arguments: {} }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('organization_id=org_123');
    });

    it('uses Zoho-oauthtoken auth', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ contacts: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_contacts', arguments: {} }));
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Authorization']).toBe('Zoho-oauthtoken test_token');
    });
});

describe('create_contact', () => {
    it('creates contact', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ contact: { contact_id: 'c2', contact_name: 'New Corp' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_contact',
            arguments: { contact_name: 'New Corp', contact_type: 'customer', email: 'corp@example.com' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.contact.contact_name).toBe('New Corp');
    });

    it('returns -32603 when contact_name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_contact', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_invoice', () => {
    it('creates invoice', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ invoice: { invoice_id: 'inv1', total: 1000 } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_invoice',
            arguments: {
                customer_id: 'c1',
                line_items: [{ name: 'Service', rate: 500, quantity: 2 }],
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.invoice.total).toBe(1000);
    });

    it('returns -32603 when customer_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_invoice', arguments: { line_items: [] } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('email_invoice', () => {
    it('emails invoice', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ message: 'Invoice sent' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'email_invoice',
            arguments: { invoice_id: 'inv1', to_mail_ids: ['client@example.com'] },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('create_bill', () => {
    it('creates bill', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ bill: { bill_id: 'bill1' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_bill',
            arguments: { vendor_id: 'v1', line_items: [{ name: 'Software', rate: 99 }] },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('returns -32603 when vendor_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_bill', arguments: { line_items: [] } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_expense', () => {
    it('creates expense', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ expense: { expense_id: 'exp1' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_expense',
            arguments: { account_id: 'acc1', date: '2024-01-15', total: 250 },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('returns -32603 when account_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_expense', arguments: { date: '2024-01-01', total: 100 } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_balance_sheet', () => {
    it('returns balance sheet', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ balance_sheet: { assets: [], liabilities: [] } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_balance_sheet', arguments: { date: '2024-12-31' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('date=2024-12-31');
    });

    it('returns -32603 when date missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_balance_sheet', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_profit_loss', () => {
    it('returns P&L report', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ profit_and_loss: { income: 50000, expense: 20000 } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_profit_loss',
            arguments: { from_date: '2024-01-01', to_date: '2024-12-31' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('create_payment', () => {
    it('records payment', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ payment: { payment_id: 'pay1' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_payment',
            arguments: { customer_id: 'c1', payment_mode: 'Cash', amount: 500, date: '2024-03-01' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});
