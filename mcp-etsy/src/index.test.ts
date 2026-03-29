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

const AUTH = { 'X-Mcp-Secret-ETSY-API-KEY': 'test-api-key' };

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
        expect(body.server).toBe('etsy-mcp');
    });
});

describe('method not allowed', () => {
    it('returns 405 for GET on root', async () => {
        const res = await worker.fetch(new Request('https://worker.test/'));
        expect(res.status).toBe(405);
    });
});

describe('parse error', () => {
    it('returns -32700 for invalid JSON', async () => {
        const res = await worker.fetch(new Request('https://worker.test/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'bad-json{',
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
    });
});

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('etsy-mcp');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 12 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(12);
    });
    it('all tools have readOnlyHint annotation', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        for (const tool of body.result.tools) {
            expect(tool.annotations.readOnlyHint).toBe(true);
        }
    });
    it('includes expected tool names', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('get_shop');
        expect(names).toContain('find_shops');
        expect(names).toContain('list_listings');
        expect(names).toContain('get_listing');
        expect(names).toContain('find_all_listings');
    });
});

describe('missing auth', () => {
    it('returns -32001 when API key missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_shop', arguments: { shop_id: '123' } }, {}));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('some/unknown'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('unknown tool', () => {
    it('returns -32603', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'does_not_exist', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_shop', () => {
    it('returns shop data', async () => {
        mockFetch.mockResolvedValue(apiOk({ shop_id: 12345, shop_name: 'HandmadeGoods' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_shop', arguments: { shop_id: '12345' } }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.shop_name).toBe('HandmadeGoods');
    });
    it('returns -32603 when shop_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_shop', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('find_shops', () => {
    it('finds shops by name', async () => {
        mockFetch.mockResolvedValue(apiOk({ results: [{ shop_id: 1, shop_name: 'CraftyShop' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'find_shops', arguments: { name: 'Crafty' } }));
        const body = await res.json() as any;
        expect(body.result.content[0].type).toBe('text');
    });
});

describe('list_listings', () => {
    it('lists shop listings', async () => {
        mockFetch.mockResolvedValue(apiOk({ results: [{ listing_id: 99, title: 'Handmade Mug' }], count: 1 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_listings', arguments: { shop_id: '12345' } }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.results[0].title).toBe('Handmade Mug');
    });
});

describe('get_listing', () => {
    it('returns listing details', async () => {
        mockFetch.mockResolvedValue(apiOk({ listing_id: 99, title: 'Handmade Mug', price: { amount: 20 } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_listing', arguments: { listing_id: 99 } }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.listing_id).toBe(99);
    });
});

describe('find_all_listings', () => {
    it('searches active listings', async () => {
        mockFetch.mockResolvedValue(apiOk({ results: [{ listing_id: 5, title: 'Ceramic Vase' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'find_all_listings', arguments: { keywords: 'ceramic' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('ceramic'),
            expect.any(Object)
        );
    });
});

describe('get_shop_reviews', () => {
    it('returns shop reviews', async () => {
        mockFetch.mockResolvedValue(apiOk({ results: [{ review_id: 1, rating: 5 }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_shop_reviews', arguments: { shop_id: '12345' } }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.results[0].rating).toBe(5);
    });
});

describe('get_listing_inventory', () => {
    it('returns inventory', async () => {
        mockFetch.mockResolvedValue(apiOk({ products: [{ product_id: 1, sku: 'MUG-001' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_listing_inventory', arguments: { listing_id: 99 } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('list_shop_receipts', () => {
    it('lists receipts', async () => {
        mockFetch.mockResolvedValue(apiOk({ results: [{ receipt_id: 200, total_price: { amount: 50 } }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_shop_receipts', arguments: { shop_id: '12345' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});
