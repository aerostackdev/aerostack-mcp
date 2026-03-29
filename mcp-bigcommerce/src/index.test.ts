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

const AUTH = {
    'X-Mcp-Secret-BIGCOMMERCE-ACCESS-TOKEN': 'test-token',
    'X-Mcp-Secret-BIGCOMMERCE-STORE-HASH': 'abc123',
};

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
        expect(body.server).toBe('bigcommerce-mcp');
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
            body: 'not-json',
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
    });
});

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('bigcommerce-mcp');
        expect(body.result.serverInfo.version).toBe('1.0.0');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 14 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(14);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_products');
        expect(names).toContain('get_product');
        expect(names).toContain('list_orders');
        expect(names).toContain('get_store_info');
    });
    it('all tools have annotations', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        for (const tool of body.result.tools) {
            expect(tool.annotations).toBeDefined();
            expect(typeof tool.annotations.readOnlyHint).toBe('boolean');
        }
    });
});

describe('missing auth', () => {
    it('returns -32001 when secrets are missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_products', arguments: {} }, {}));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('foo/bar'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('unknown tool', () => {
    it('returns -32603', async () => {
        mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'nonexistent_tool', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_products', () => {
    it('returns product list', async () => {
        mockFetch.mockResolvedValue(apiOk({ data: [{ id: 1, name: 'Widget' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_products', arguments: {} }));
        const body = await res.json() as any;
        expect(body.result.content[0].type).toBe('text');
        const data = JSON.parse(body.result.content[0].text);
        expect(data[0].name).toBe('Widget');
    });
});

describe('get_product', () => {
    it('returns a product', async () => {
        mockFetch.mockResolvedValue(apiOk({ data: { id: 5, name: 'Gadget', price: '9.99' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_product', arguments: { productId: 5 } }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.id).toBe(5);
    });
    it('returns -32603 when productId missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_product', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_product', () => {
    it('creates a product successfully', async () => {
        mockFetch.mockResolvedValue(apiOk({ data: { id: 10, name: 'New Product' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_product',
            arguments: { name: 'New Product', type: 'physical', weight: 1.5, price: 19.99 },
        }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.id).toBe(10);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/catalog/products'),
            expect.objectContaining({ method: 'POST' })
        );
    });
});

describe('list_orders', () => {
    it('returns order list', async () => {
        mockFetch.mockResolvedValue(apiOk([{ id: 100, status: 'Completed' }]));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_orders', arguments: { limit: 5 } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('get_order', () => {
    it('returns an order', async () => {
        mockFetch.mockResolvedValue(apiOk({ id: 100, status_id: 2 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_order', arguments: { orderId: 100 } }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.id).toBe(100);
    });
});

describe('update_order_status', () => {
    it('updates order status', async () => {
        mockFetch.mockResolvedValue(apiOk({ id: 100, status_id: 3 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_order_status',
            arguments: { orderId: 100, status_id: 3 },
        }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.status_id).toBe(3);
    });
});

describe('get_store_info', () => {
    it('returns store info', async () => {
        mockFetch.mockResolvedValue(apiOk({ id: 'store-abc', name: 'My Store' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_store_info', arguments: {} }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.name).toBe('My Store');
    });
});

describe('delete_product', () => {
    it('deletes a product', async () => {
        mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'delete_product', arguments: { productId: 5 } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('list_categories', () => {
    it('returns categories', async () => {
        mockFetch.mockResolvedValue(apiOk({ data: [{ id: 1, name: 'Electronics' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_categories', arguments: {} }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data[0].name).toBe('Electronics');
    });
});
