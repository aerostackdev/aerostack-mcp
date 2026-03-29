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
    'X-Mcp-Secret-COPPER-API-KEY': 'test_api_key',
    'X-Mcp-Secret-COPPER-USER-EMAIL': 'user@example.com',
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
        expect(body.server).toBe('mcp-copper');
        expect(body.version).toBe('1.0.0');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────
describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-copper');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 16 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(16);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_people');
        expect(names).toContain('create_opportunity');
        expect(names).toContain('search_records');
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
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_people', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });

    it('returns -32001 when only API key', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Mcp-Secret-COPPER-API-KEY': 'key' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_people', arguments: {} } }),
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

// ── list_people ───────────────────────────────────────────────────────────────
describe('list_people', () => {
    it('returns people array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([{ id: 1, name: 'John Doe' }, { id: 2, name: 'Jane Smith' }]));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_people', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('John Doe');
    });

    it('sends all three auth headers', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([]));
        await worker.fetch(makeReq('tools/call', { name: 'list_people', arguments: {} }));
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['X-PW-AccessToken']).toBe('test_api_key');
        expect(headers['X-PW-Application']).toBe('developer_api');
        expect(headers['X-PW-UserEmail']).toBe('user@example.com');
    });

    it('uses POST /people/search', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([]));
        await worker.fetch(makeReq('tools/call', { name: 'list_people', arguments: { page_size: 10 } }));
        const url = mockFetch.mock.calls[0][0];
        const method = mockFetch.mock.calls[0][1].method;
        expect(url).toContain('/people/search');
        expect(method).toBe('POST');
    });
});

// ── create_person ─────────────────────────────────────────────────────────────
describe('create_person', () => {
    it('creates person', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 101, name: 'Alice' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_person',
            arguments: { name: 'Alice', emails: [{ email: 'alice@example.com', category: 'work' }] },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe(101);
        expect(result.name).toBe('Alice');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_person', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── get_person ────────────────────────────────────────────────────────────────
describe('get_person', () => {
    it('returns person', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 42, name: 'Bob' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_person', arguments: { id: '42' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe(42);
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_person', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── delete_person ─────────────────────────────────────────────────────────────
describe('delete_person', () => {
    it('deletes and returns success', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({}, 200));
        const res = await worker.fetch(makeReq('tools/call', { name: 'delete_person', arguments: { id: '42' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
    });
});

// ── create_company ────────────────────────────────────────────────────────────
describe('create_company', () => {
    it('creates company', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 200, name: 'Acme Corp' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_company',
            arguments: { name: 'Acme Corp', industry: 'Technology' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe(200);
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_company', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_opportunities ────────────────────────────────────────────────────────
describe('list_opportunities', () => {
    it('returns opportunities', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([{ id: 1, name: 'Big Deal', status: 'Open' }]));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_opportunities', arguments: { status: 'Open' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result[0].name).toBe('Big Deal');
    });

    it('sends POST to /opportunities/search', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([]));
        await worker.fetch(makeReq('tools/call', { name: 'list_opportunities', arguments: {} }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('/opportunities/search');
    });
});

// ── create_opportunity ────────────────────────────────────────────────────────
describe('create_opportunity', () => {
    it('creates opportunity with default status', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 300, name: 'Enterprise', status: 'Open' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_opportunity',
            arguments: { name: 'Enterprise', monetary_value: 50000 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe(300);
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.status).toBe('Open');
    });
});

// ── create_task ───────────────────────────────────────────────────────────────
describe('create_task', () => {
    it('creates task with default status and priority', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 400, name: 'Call client' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_task',
            arguments: { name: 'Call client', due_date: 1700000000 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe(400);
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.status).toBe('Open');
        expect(reqBody.priority).toBe('None');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_task', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── search_records ────────────────────────────────────────────────────────────
describe('search_records', () => {
    it('searches by entity', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([{ id: 1, name: 'Acme' }]));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_records',
            arguments: { entity: 'companies', name: 'Acme' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result[0].name).toBe('Acme');
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('/companies/search');
    });

    it('returns -32603 when entity missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'search_records', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
