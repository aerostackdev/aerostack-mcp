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
    'X-Mcp-Secret-OMNISEND-API-KEY': 'test_api_key',
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
        expect(body.server).toBe('omnisend-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('omnisend-mcp');
    });
});

describe('tools/list', () => {
    it('returns 16 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(16);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_contacts');
        expect(names).toContain('track_event');
        expect(names).toContain('get_account_info');
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
        mockFetch.mockResolvedValueOnce(apiOk({ contacts: [{ contactID: 'c1', email: 'a@b.com' }], paging: {} }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_contacts', arguments: { limit: 10 } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.contacts).toHaveLength(1);
    });

    it('uses X-API-KEY header', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ contacts: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_contacts', arguments: {} }));
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['X-API-KEY']).toBe('test_api_key');
    });
});

describe('create_contact', () => {
    it('creates contact', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ contactID: 'c2', email: 'new@shop.com' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_contact',
            arguments: { email: 'new@shop.com', firstName: 'Jane' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.email).toBe('new@shop.com');
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_contact', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_contact', () => {
    it('returns contact by ID', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ contactID: 'c1', email: 'a@b.com' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_contact', arguments: { id: 'c1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.contactID).toBe('c1');
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_contact', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('track_event', () => {
    it('tracks an event', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ success: true }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'track_event',
            arguments: { email: 'buyer@shop.com', event_name: 'Placed Order', fields: { total: 99.99 } },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('returns -32603 when event_name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'track_event', arguments: { email: 'a@b.com' } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_batch', () => {
    it('creates batch', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ batchID: 'bat1', scheduled: true }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_batch',
            arguments: { type: 'contacts', operation: 'add', items: [{ email: 'a@b.com' }] },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.batchID).toBe('bat1');
    });

    it('returns -32603 when items missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_batch', arguments: { type: 'contacts', operation: 'add' } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_batch_status', () => {
    it('returns batch status', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ batchID: 'bat1', status: 'done', count: 5 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_batch_status', arguments: { batchID: 'bat1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.status).toBe('done');
    });
});

describe('list_segments', () => {
    it('returns segments', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ segments: [{ segmentID: 'seg1', name: 'VIP' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_segments', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.segments[0].name).toBe('VIP');
    });
});

describe('list_campaigns', () => {
    it('returns campaigns', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ campaigns: [{ campaignID: 'camp1', name: 'Spring Sale' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_campaigns', arguments: {} }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('list_forms', () => {
    it('returns forms', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ forms: [{ formID: 'f1', name: 'Popup' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_forms', arguments: {} }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('get_account_info', () => {
    it('returns account info', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ name: 'My Shop', currency: 'USD' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_account_info', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.name).toBe('My Shop');
    });
});
