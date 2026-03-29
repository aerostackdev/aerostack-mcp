import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}

function api204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function makeReq(body: unknown, headers: Record<string, string> = {}) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

const SECRETS = {
    'X-Mcp-Secret-LEMONSQUEEZY-API-KEY': 'ls_live_abc123xyz',
};

const mockStores = { data: [{ id: '1', type: 'stores', attributes: { name: 'My Store', slug: 'my-store' } }] };
const mockProducts = { data: [{ id: '10', type: 'products', attributes: { name: 'Pro Plan', price: 1999 } }] };
const mockProduct = { data: { id: '10', type: 'products', attributes: { name: 'Pro Plan', price: 1999 } } };
const mockOrders = { data: [{ id: '100', type: 'orders', attributes: { total: 1999, status: 'paid' } }], meta: { page: { total: 1 } } };
const mockOrder = { data: { id: '100', type: 'orders', attributes: { total: 1999, status: 'paid', user_email: 'alice@example.com' } } };
const mockSubscriptions = { data: [{ id: '200', type: 'subscriptions', attributes: { status: 'active', renews_at: '2026-04-01' } }] };
const mockSubscription = { data: { id: '200', type: 'subscriptions', attributes: { status: 'active', renews_at: '2026-04-01' } } };
const mockCustomers = { data: [{ id: '300', type: 'customers', attributes: { name: 'Alice', email: 'alice@example.com' } }] };

beforeEach(() => { mockFetch.mockReset(); });

describe('mcp-lemon-squeezy', () => {
    // ── Protocol tests ────────────────────────────────────────────────────────

    it('GET health check returns status ok with 9 tools', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-lemon-squeezy');
        expect(body.tools).toBe(9);
    });

    it('initialize returns protocolVersion 2024-11-05', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-lemon-squeezy');
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
            params: { name: 'list_stores', arguments: {} },
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('LEMONSQUEEZY_API_KEY');
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

    it('list_stores calls /v1/stores with Bearer auth', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockStores));
        const req = makeReq({
            jsonrpc: '2.0', id: 2, method: 'tools/call',
            params: { name: 'list_stores', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(res.status).toBe(200);
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data[0].attributes.name).toBe('My Store');
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
        expect(url).toContain('api.lemonsqueezy.com/v1/stores');
        expect(opts.headers['Authorization']).toBe('Bearer ls_live_abc123xyz');
    });

    it('list_products filters by store_id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProducts));
        const req = makeReq({
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'list_products', arguments: { store_id: '1' } },
        }, SECRETS);
        await worker.fetch(req);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('filter[store_id]=1');
    });

    it('get_product returns single product', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProduct));
        const req = makeReq({
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'get_product', arguments: { id: '10' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data.attributes.name).toBe('Pro Plan');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v1/products/10');
    });

    it('list_orders filters by store_id and page size', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockOrders));
        const req = makeReq({
            jsonrpc: '2.0', id: 5, method: 'tools/call',
            params: { name: 'list_orders', arguments: { store_id: '1', limit: 5 } },
        }, SECRETS);
        await worker.fetch(req);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('filter[store_id]=1');
        expect(url).toContain('page[size]=5');
    });

    it('cancel_subscription sends DELETE to /v1/subscriptions/{id}', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const req = makeReq({
            jsonrpc: '2.0', id: 6, method: 'tools/call',
            params: { name: 'cancel_subscription', arguments: { id: '200' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const opts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(opts.method).toBe('DELETE');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v1/subscriptions/200');
    });

    it('list_subscriptions returns subscription list', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSubscriptions));
        const req = makeReq({
            jsonrpc: '2.0', id: 7, method: 'tools/call',
            params: { name: 'list_subscriptions', arguments: { limit: 5 } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data[0].attributes.status).toBe('active');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('page[size]=5');
    });

    it('list_customers returns customer list', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCustomers));
        const req = makeReq({
            jsonrpc: '2.0', id: 8, method: 'tools/call',
            params: { name: 'list_customers', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data[0].attributes.email).toBe('alice@example.com');
    });

    it('get_order returns single order', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockOrder));
        const req = makeReq({
            jsonrpc: '2.0', id: 9, method: 'tools/call',
            params: { name: 'get_order', arguments: { id: '100' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data.attributes.user_email).toBe('alice@example.com');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v1/orders/100');
    });

    it('get_subscription returns single subscription', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSubscription));
        const req = makeReq({
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: { name: 'get_subscription', arguments: { id: '200' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data.id).toBe('200');
    });
});
