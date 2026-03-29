import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}

function makeReq(body: unknown, headers: Record<string, string> = {}) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

const SECRETS = {
    'X-Mcp-Secret-PADDLE-API-KEY': 'pdl_live_abc123xyz',
};

const mockProductsList = {
    data: [{ id: 'pro_01abc', name: 'Pro Plan', status: 'active', tax_category: 'saas' }],
    meta: { pagination: { total: 1 } },
};

const mockProduct = {
    data: { id: 'pro_01abc', name: 'Pro Plan', status: 'active', description: 'The pro plan' },
};

const mockPricesList = {
    data: [{ id: 'pri_01abc', product_id: 'pro_01abc', unit_price: { amount: '1999', currency_code: 'USD' } }],
};

const mockCustomersList = {
    data: [{ id: 'ctm_01abc', name: 'Alice', email: 'alice@example.com', status: 'active' }],
};

const mockCustomer = {
    data: { id: 'ctm_01abc', name: 'Alice', email: 'alice@example.com', status: 'active' },
};

const mockSubscriptionsList = {
    data: [{ id: 'sub_01abc', status: 'active', customer_id: 'ctm_01abc', next_billed_at: '2026-04-01' }],
};

const mockSubscription = {
    data: { id: 'sub_01abc', status: 'active', customer_id: 'ctm_01abc', next_billed_at: '2026-04-01' },
};

const mockCancelResult = {
    data: { id: 'sub_01abc', status: 'canceled', canceled_at: '2026-03-29' },
};

const mockTransactions = {
    data: [{ id: 'txn_01abc', status: 'completed', customer_id: 'ctm_01abc', total: '1999' }],
};

beforeEach(() => { mockFetch.mockReset(); });

describe('mcp-paddle', () => {
    // ── Protocol tests ────────────────────────────────────────────────────────

    it('GET health check returns status ok with 9 tools', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-paddle');
        expect(body.tools).toBe(9);
    });

    it('initialize returns protocolVersion 2024-11-05', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-paddle');
    });

    it('tools/list returns all 9 tools', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(9);
    });

    it('tools/call with missing API key returns -32001', async () => {
        const req = makeReq({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_products', arguments: {} },
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('PADDLE_API_KEY');
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'ping' }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('unknown tool returns -32601', async () => {
        const req = makeReq({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_product', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    // ── Tool-specific tests ───────────────────────────────────────────────────

    it('list_products calls /products with per_page and Bearer auth', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProductsList));
        const req = makeReq({
            jsonrpc: '2.0', id: 2, method: 'tools/call',
            params: { name: 'list_products', arguments: { limit: 20 } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(res.status).toBe(200);
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data[0].id).toBe('pro_01abc');
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
        expect(url).toContain('api.paddle.com/products');
        expect(url).toContain('per_page=20');
        expect(opts.headers['Authorization']).toBe('Bearer pdl_live_abc123xyz');
    });

    it('get_product calls /products/{id}', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProduct));
        const req = makeReq({
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'get_product', arguments: { id: 'pro_01abc' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data.name).toBe('Pro Plan');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/products/pro_01abc');
    });

    it('list_customers returns customer list', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCustomersList));
        const req = makeReq({
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'list_customers', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data[0].email).toBe('alice@example.com');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/customers');
    });

    it('get_customer returns single customer', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCustomer));
        const req = makeReq({
            jsonrpc: '2.0', id: 5, method: 'tools/call',
            params: { name: 'get_customer', arguments: { id: 'ctm_01abc' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data.name).toBe('Alice');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/customers/ctm_01abc');
    });

    it('cancel_subscription POSTs to /subscriptions/{id}/cancel', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCancelResult));
        const req = makeReq({
            jsonrpc: '2.0', id: 6, method: 'tools/call',
            params: { name: 'cancel_subscription', arguments: { id: 'sub_01abc' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(res.status).toBe(200);
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data.status).toBe('canceled');
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(opts.method).toBe('POST');
        expect(url).toContain('/subscriptions/sub_01abc/cancel');
        const sentBody = JSON.parse(opts.body as string) as { effective_from: string };
        expect(sentBody.effective_from).toBe('next_billing_period');
    });

    it('list_subscriptions includes per_page param', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSubscriptionsList));
        const req = makeReq({
            jsonrpc: '2.0', id: 7, method: 'tools/call',
            params: { name: 'list_subscriptions', arguments: { limit: 5 } },
        }, SECRETS);
        await worker.fetch(req);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/subscriptions');
        expect(url).toContain('per_page=5');
    });

    it('list_transactions calls /transactions with per_page', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTransactions));
        const req = makeReq({
            jsonrpc: '2.0', id: 8, method: 'tools/call',
            params: { name: 'list_transactions', arguments: { limit: 10 } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data[0].status).toBe('completed');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/transactions');
        expect(url).toContain('per_page=10');
    });

    it('list_prices calls /prices with per_page', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockPricesList));
        const req = makeReq({
            jsonrpc: '2.0', id: 9, method: 'tools/call',
            params: { name: 'list_prices', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data[0].product_id).toBe('pro_01abc');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/prices');
    });
});
