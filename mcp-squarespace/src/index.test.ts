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

const AUTH = { 'X-Mcp-Secret-SQUARESPACE-API-KEY': 'test-key' };

function makeReq(method: string, params?: unknown, headers: Record<string, string> = AUTH) {
    return new Request('https://worker.test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('GET /health', () => {
    it('returns status ok', async () => {
        const res = await worker.fetch(new Request('https://worker.test/health'));
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('squarespace-mcp');
    });
});

describe('method not allowed', () => {
    it('returns 405 for GET', async () => {
        const res = await worker.fetch(new Request('https://worker.test/'));
        expect(res.status).toBe(405);
    });
});

describe('parse error', () => {
    it('returns -32700', async () => {
        const res = await worker.fetch(new Request('https://worker.test/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'oops',
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
    });
});

describe('initialize', () => {
    it('returns serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('squarespace-mcp');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 12 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(12);
    });
    it('includes expected tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_products');
        expect(names).toContain('list_orders');
        expect(names).toContain('fulfill_order');
        expect(names).toContain('get_website');
    });
    it('all tools have annotations', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        for (const t of body.result.tools) {
            expect(t.annotations).toBeDefined();
        }
    });
});

describe('missing auth', () => {
    it('returns -32001', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_products', arguments: {} }, {}));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('x/y'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('unknown tool', () => {
    it('returns -32603', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'ghost_tool', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_products', () => {
    it('returns product list', async () => {
        mockFetch.mockResolvedValue(apiOk({ products: [{ id: 'p1', name: 'T-Shirt' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_products', arguments: {} }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.products[0].name).toBe('T-Shirt');
    });
});

describe('get_product', () => {
    it('returns a product', async () => {
        mockFetch.mockResolvedValue(apiOk({ id: 'p1', name: 'T-Shirt', variants: [] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_product', arguments: { productId: 'p1' } }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.id).toBe('p1');
    });
    it('requires productId', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_product', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_orders', () => {
    it('returns orders', async () => {
        mockFetch.mockResolvedValue(apiOk({ result: [{ id: 'o1', fulfillmentStatus: 'PENDING' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_orders', arguments: {} }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('fulfill_order', () => {
    it('fulfills an order', async () => {
        mockFetch.mockResolvedValue(apiOk({ id: 'o1', fulfillmentStatus: 'FULFILLED' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'fulfill_order',
            arguments: { orderId: 'o1', shouldSendNotification: true, trackingNumber: 'TRACK123', carrierName: 'UPS' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/fulfillments'),
            expect.objectContaining({ method: 'POST' })
        );
    });
});

describe('get_website', () => {
    it('returns website info', async () => {
        mockFetch.mockResolvedValue(apiOk({ siteTitle: 'My Shop', baseUrl: 'https://myshop.com' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_website', arguments: {} }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.siteTitle).toBe('My Shop');
    });
});

describe('list_blog_posts', () => {
    it('lists blog posts', async () => {
        mockFetch.mockResolvedValue(apiOk({ posts: [{ id: 'bp1', title: 'Hello World' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_blog_posts', arguments: {} }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.posts[0].title).toBe('Hello World');
    });
});

describe('update_inventory', () => {
    it('updates inventory', async () => {
        mockFetch.mockResolvedValue(apiOk({ variants: [{ variantId: 'v1', quantity: 10 }] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_inventory',
            arguments: { variants: [{ variantId: 'v1', quantity: 10 }] },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});
