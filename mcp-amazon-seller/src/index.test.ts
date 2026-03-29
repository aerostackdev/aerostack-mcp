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

const AUTH = { 'X-Mcp-Secret-AMAZON-SP-ACCESS-TOKEN': 'test-access-token' };

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
        expect(body.server).toBe('amazon-seller-mcp');
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
            body: '{bad-json',
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
    });
});

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('amazon-seller-mcp');
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
        expect(names).toContain('list_catalog_items');
        expect(names).toContain('list_orders');
        expect(names).toContain('get_pricing');
        expect(names).toContain('create_report');
    });
    it('all tools have annotations', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        for (const tool of body.result.tools) {
            expect(tool.annotations).toBeDefined();
        }
    });
});

describe('missing auth', () => {
    it('returns -32001 when token missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_orders', arguments: {} }, {}));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('not/a/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('unknown tool', () => {
    it('returns -32603', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'fake_tool', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_catalog_items', () => {
    it('searches catalog', async () => {
        mockFetch.mockResolvedValue(apiOk({ items: [{ asin: 'B001', summaries: [{ title: 'Widget' }] }] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_catalog_items',
            arguments: { marketplaceId: 'ATVPDKIKX0DER', keywords: 'widget' },
        }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.items[0].asin).toBe('B001');
    });
    it('requires marketplaceId and keywords', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_catalog_items', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_orders', () => {
    it('lists orders', async () => {
        mockFetch.mockResolvedValue(apiOk({ Orders: [{ AmazonOrderId: '123', OrderStatus: 'Shipped' }] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_orders',
            arguments: { marketplaceId: 'ATVPDKIKX0DER', createdAfter: '2024-01-01T00:00:00Z' },
        }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.Orders[0].AmazonOrderId).toBe('123');
    });
});

describe('get_order', () => {
    it('gets an order', async () => {
        mockFetch.mockResolvedValue(apiOk({ payload: { AmazonOrderId: '123-456', OrderStatus: 'Pending' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_order', arguments: { orderId: '123-456' } }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.payload.AmazonOrderId).toBe('123-456');
    });
});

describe('create_report', () => {
    it('creates a report', async () => {
        mockFetch.mockResolvedValue(apiOk({ reportId: 'R001' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_report',
            arguments: { reportType: 'GET_FLAT_FILE_OPEN_LISTINGS_DATA', marketplaceIds: ['ATVPDKIKX0DER'] },
        }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.reportId).toBe('R001');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/reports/2021-06-30/reports'),
            expect.objectContaining({ method: 'POST' })
        );
    });
});

describe('get_pricing', () => {
    it('returns pricing data', async () => {
        mockFetch.mockResolvedValue(apiOk({ payload: [{ ASIN: 'B001', Product: {} }] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_pricing',
            arguments: { marketplaceId: 'ATVPDKIKX0DER', asins: 'B001' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('list_financial_events', () => {
    it('returns financial events', async () => {
        mockFetch.mockResolvedValue(apiOk({ payload: { FinancialEvents: { ShipmentEventList: [] } } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_financial_events',
            arguments: { postedAfter: '2024-01-01T00:00:00Z' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});
