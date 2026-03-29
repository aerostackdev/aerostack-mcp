import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function gqlOk(data: unknown) {
    return Promise.resolve(new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function gqlErr(errors: unknown[]) {
    return Promise.resolve(new Response(JSON.stringify({ errors }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-WAVE-ACCESS-TOKEN': 'test_token',
    'X-Mcp-Secret-WAVE-BUSINESS-ID': 'biz_123',
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
        expect(body.server).toBe('wave-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('wave-mcp');
    });
});

describe('tools/list', () => {
    it('returns 14 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(14);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_invoices');
        expect(names).toContain('create_customer');
        expect(names).toContain('get_business');
    });
});

describe('missing auth', () => {
    it('returns -32001 when both secrets missing', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_invoices', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });

    it('returns -32001 when business ID missing', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Mcp-Secret-WAVE-ACCESS-TOKEN': 'tok' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_invoices', arguments: {} } }),
        });
        const res = await worker.fetch(req);
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_invoices', () => {
    it('returns invoices via GraphQL', async () => {
        mockFetch.mockResolvedValueOnce(gqlOk({
            business: {
                invoices: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    edges: [{ node: { id: 'inv1', invoiceNumber: 'INV-001', status: 'SAVED' } }],
                },
            },
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_invoices', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.business.invoices.edges).toHaveLength(1);
    });

    it('sends POST to GraphQL endpoint', async () => {
        mockFetch.mockResolvedValueOnce(gqlOk({ business: { invoices: { edges: [] } } }));
        await worker.fetch(makeReq('tools/call', { name: 'list_invoices', arguments: {} }));
        expect(mockFetch.mock.calls[0][0]).toBe('https://gql.waveapps.com/graphql/public');
        expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });
});

describe('get_invoice', () => {
    it('queries for single invoice', async () => {
        mockFetch.mockResolvedValueOnce(gqlOk({ business: { invoice: { id: 'inv1', status: 'PAID' } } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_invoice', arguments: { id: 'inv1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.business.invoice.id).toBe('inv1');
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_invoice', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_invoice', () => {
    it('creates invoice via mutation', async () => {
        mockFetch.mockResolvedValueOnce(gqlOk({
            invoiceCreate: { didSucceed: true, inputErrors: [], invoice: { id: 'inv2', invoiceNumber: 'INV-002', status: 'DRAFT' } },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_invoice',
            arguments: {
                customer_id: 'cust1',
                invoice_date: '2024-03-01',
                items: [{ description: 'Consulting', quantity: 1, unit_price: 500 }],
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.invoiceCreate.didSucceed).toBe(true);
    });

    it('returns -32603 when customer_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_invoice',
            arguments: { invoice_date: '2024-01-01', items: [] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_customers', () => {
    it('returns customers', async () => {
        mockFetch.mockResolvedValueOnce(gqlOk({
            business: { customers: { pageInfo: {}, edges: [{ node: { id: 'c1', name: 'Jane Doe' } }] } },
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_customers', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.business.customers.edges[0].node.name).toBe('Jane Doe');
    });
});

describe('create_customer', () => {
    it('creates customer via mutation', async () => {
        mockFetch.mockResolvedValueOnce(gqlOk({
            customerCreate: { didSucceed: true, customer: { id: 'c2', name: 'Acme Corp' } },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_customer',
            arguments: { name: 'Acme Corp', email: 'billing@acme.com' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.customerCreate.customer.name).toBe('Acme Corp');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_customer', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_income_transaction', () => {
    it('creates income transaction', async () => {
        mockFetch.mockResolvedValueOnce(gqlOk({
            moneyTransactionCreate: { didSucceed: true, transaction: { id: 'tx1' } },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_income_transaction',
            arguments: { account_id: 'acc1', amount: 1000, date: '2024-03-15', description: 'Payment received' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.moneyTransactionCreate.didSucceed).toBe(true);
    });

    it('returns -32603 when amount missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_income_transaction',
            arguments: { account_id: 'acc1', date: '2024-01-01' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('GraphQL error handling', () => {
    it('returns -32603 on GraphQL error', async () => {
        mockFetch.mockResolvedValueOnce(gqlErr([{ message: 'Not authorized' }]));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_invoices', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_business', () => {
    it('returns business info', async () => {
        mockFetch.mockResolvedValueOnce(gqlOk({
            business: { id: 'biz_123', name: 'My Business', currency: { code: 'USD' } },
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_business', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.business.name).toBe('My Business');
    });
});

describe('list_accounts', () => {
    it('returns chart of accounts', async () => {
        mockFetch.mockResolvedValueOnce(gqlOk({
            business: { accounts: { edges: [{ node: { id: 'acct1', name: 'Cash' } }] } },
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_accounts', arguments: {} }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});
