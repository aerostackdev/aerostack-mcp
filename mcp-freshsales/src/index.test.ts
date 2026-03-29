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
    'X-Mcp-Secret-FRESHSALES-API-KEY': 'test_api_key',
    'X-Mcp-Secret-FRESHSALES-DOMAIN': 'testcompany',
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
    it('returns status ok', async () => {
        const req = new Request('http://localhost/health');
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-freshsales');
        expect(body.version).toBe('1.0.0');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────
describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-freshsales');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 18 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(18);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_contacts');
        expect(names).toContain('create_deal');
        expect(names).toContain('search');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('unknown/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('missing auth', () => {
    it('returns -32001 when no secrets', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_contacts', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });

    it('returns -32001 when only API key provided', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Mcp-Secret-FRESHSALES-API-KEY': 'key' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_contacts', arguments: {} } }),
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

describe('invalid JSON', () => {
    it('returns -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-json',
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
    });
});

// ── list_contacts ─────────────────────────────────────────────────────────────
describe('list_contacts', () => {
    it('returns contacts array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            contacts: [{ id: 1, email: 'john@example.com', first_name: 'John' }],
            meta: { total_pages: 1 },
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_contacts', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.contacts).toHaveLength(1);
        expect(result.contacts[0].email).toBe('john@example.com');
    });

    it('uses domain in URL', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ contacts: [], meta: {} }));
        await worker.fetch(makeReq('tools/call', { name: 'list_contacts', arguments: {} }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('testcompany.myfreshworks.com');
    });
});

// ── create_contact ────────────────────────────────────────────────────────────
describe('create_contact', () => {
    it('creates contact and returns object', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            contact: { id: 101, email: 'new@example.com', first_name: 'New' },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_contact',
            arguments: { email: 'new@example.com', first_name: 'New', last_name: 'User' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe(101);
        expect(result.email).toBe('new@example.com');
    });

    it('wraps body in contact key', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ contact: { id: 1 } }));
        await worker.fetch(makeReq('tools/call', {
            name: 'create_contact',
            arguments: { email: 'x@x.com' },
        }));
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.contact).toBeDefined();
        expect(reqBody.contact.email).toBe('x@x.com');
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_contact',
            arguments: { first_name: 'No Email' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── get_contact ───────────────────────────────────────────────────────────────
describe('get_contact', () => {
    it('returns contact', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ contact: { id: 42, email: 'test@example.com' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_contact', arguments: { id: '42' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe(42);
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_contact', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── delete_contact ────────────────────────────────────────────────────────────
describe('delete_contact', () => {
    it('deletes and returns success', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({}, 200));
        const res = await worker.fetch(makeReq('tools/call', { name: 'delete_contact', arguments: { id: '42' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.id).toBe('42');
    });
});

// ── create_lead ───────────────────────────────────────────────────────────────
describe('create_lead', () => {
    it('creates lead', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ lead: { id: 201, email: 'lead@example.com' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_lead',
            arguments: { email: 'lead@example.com', first_name: 'Jane' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe(201);
    });

    it('wraps body in lead key', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ lead: { id: 1 } }));
        await worker.fetch(makeReq('tools/call', {
            name: 'create_lead',
            arguments: { email: 'x@x.com' },
        }));
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.lead).toBeDefined();
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_lead', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── create_deal ───────────────────────────────────────────────────────────────
describe('create_deal', () => {
    it('creates deal', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ deal: { id: 301, name: 'Enterprise Deal' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_deal',
            arguments: { name: 'Enterprise Deal', amount: 100000 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe(301);
        expect(result.name).toBe('Enterprise Deal');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_deal', arguments: { amount: 100 } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── create_account ────────────────────────────────────────────────────────────
describe('create_account', () => {
    it('creates account', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ sales_account: { id: 401, name: 'Acme' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_account',
            arguments: { name: 'Acme' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe(401);
    });
});

// ── create_note ───────────────────────────────────────────────────────────────
describe('create_note', () => {
    it('creates note', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ note: { id: 501, description: 'Follow up' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_note',
            arguments: { description: 'Follow up', targetable_type: 'Contact', targetable_id: '42' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe(501);
    });

    it('returns -32603 when description missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_note',
            arguments: { targetable_type: 'Contact', targetable_id: '1' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── search ────────────────────────────────────────────────────────────────────
describe('search', () => {
    it('returns search results', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            contact: [{ id: 1, email: 'found@example.com' }],
            lead: [],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search',
            arguments: { query: 'found@example.com' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.contact).toHaveLength(1);
    });

    it('uses default include modules', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({}));
        await worker.fetch(makeReq('tools/call', {
            name: 'search',
            arguments: { query: 'test' },
        }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('contact%2Clead%2Cdeal%2Csales_account');
    });

    it('returns -32603 when query missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'search', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
