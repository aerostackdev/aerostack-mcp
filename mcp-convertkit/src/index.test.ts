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
    'X-Mcp-Secret-CONVERTKIT-API-KEY': 'test_api_key',
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
        expect(body.server).toBe('convertkit-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('convertkit-mcp');
    });
});

describe('tools/list', () => {
    it('returns 18 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(18);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_subscribers');
        expect(names).toContain('tag_subscriber');
        expect(names).toContain('get_account_info');
    });
});

describe('missing auth', () => {
    it('returns -32001', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_subscribers', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_subscribers', () => {
    it('returns subscribers', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ subscribers: [{ id: '1', email_address: 'a@b.com' }], pagination: {} }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_subscribers', arguments: {} }));
        const body = await res.json() as any;
        expect(body.result.content[0].text).toBeDefined();
    });

    it('passes status filter', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ subscribers: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_subscribers', arguments: { status: 'active' } }));
        expect(mockFetch.mock.calls[0][0]).toContain('status=active');
    });
});

describe('create_subscriber', () => {
    it('creates subscriber', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ subscriber: { id: '1', email_address: 'new@kit.com' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_subscriber',
            arguments: { email_address: 'new@kit.com', first_name: 'John' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.subscriber.email_address).toBe('new@kit.com');
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_subscriber', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_subscriber', () => {
    it('returns subscriber', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ subscriber: { id: '1' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_subscriber', arguments: { id: '1' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_subscriber', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('bulk_create_subscribers', () => {
    it('bulk creates subscribers', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ created_count: 2, failures: [] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'bulk_create_subscribers',
            arguments: { subscribers: [{ email_address: 'a@b.com' }, { email_address: 'c@d.com' }] },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.created_count).toBe(2);
    });

    it('returns -32603 when subscribers missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'bulk_create_subscribers', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_broadcasts', () => {
    it('returns broadcasts', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ broadcasts: [{ id: 'b1', subject: 'Hello' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_broadcasts', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.broadcasts).toHaveLength(1);
    });
});

describe('create_broadcast', () => {
    it('creates broadcast', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ broadcast: { id: 'b2', subject: 'Test' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_broadcast',
            arguments: { content: '<p>Hello</p>', subject: 'Test' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.broadcast.subject).toBe('Test');
    });

    it('returns -32603 when content missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_broadcast', arguments: { subject: 'X' } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_tags', () => {
    it('returns tags', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ tags: [{ id: 't1', name: 'buyer' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_tags', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.tags[0].name).toBe('buyer');
    });
});

describe('create_tag', () => {
    it('creates a tag', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ tag: { id: 't2', name: 'vip' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_tag', arguments: { name: 'vip' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.tag.name).toBe('vip');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_tag', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('tag_subscriber', () => {
    it('tags a subscriber', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ subscriber: { id: 's1' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'tag_subscriber',
            arguments: { id: 't1', email_address: 'user@example.com' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('list_sequences', () => {
    it('returns sequences', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ sequences: [{ id: 'seq1', name: 'Welcome' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_sequences', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.sequences[0].name).toBe('Welcome');
    });
});

describe('get_account_info', () => {
    it('returns account', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ account: { name: 'Creator Co', plan_type: 'pro' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_account_info', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.account.plan_type).toBe('pro');
    });
});
