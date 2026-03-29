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
    'X-Mcp-Secret-FOLK-API-KEY': 'test_folk_key',
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
        expect(body.server).toBe('mcp-folk');
        expect(body.version).toBe('1.0.0');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────
describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-folk');
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
        expect(names).toContain('add_to_group');
        expect(names).toContain('add_pipeline_item');
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
    it('returns -32001', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_people', arguments: {} }));
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
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ id: '1', name: 'Alice', email: 'alice@example.com' }],
            next_cursor: null,
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_people', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.people).toHaveLength(1);
        expect(result.people[0].name).toBe('Alice');
    });

    it('uses Bearer auth', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_people', arguments: {} }));
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers.Authorization).toBe('Bearer test_folk_key');
    });

    it('includes query param when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_people', arguments: { query: 'Alice' } }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('query=Alice');
    });
});

// ── create_person ─────────────────────────────────────────────────────────────
describe('create_person', () => {
    it('creates person', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'p1', name: 'Bob', email: 'bob@example.com' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_person',
            arguments: { name: 'Bob', email: 'bob@example.com', company: 'Acme' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.name).toBe('Bob');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_person', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── update_person ─────────────────────────────────────────────────────────────
describe('update_person', () => {
    it('uses PATCH method', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'p1', name: 'Bob Updated' }));
        await worker.fetch(makeReq('tools/call', {
            name: 'update_person',
            arguments: { id: 'p1', name: 'Bob Updated' },
        }));
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'update_person', arguments: { name: 'x' } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── delete_person ─────────────────────────────────────────────────────────────
describe('delete_person', () => {
    it('deletes and returns success', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({}, 200));
        const res = await worker.fetch(makeReq('tools/call', { name: 'delete_person', arguments: { id: 'p1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
    });
});

// ── create_group ──────────────────────────────────────────────────────────────
describe('create_group', () => {
    it('creates group', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'g1', name: 'VIPs' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_group',
            arguments: { name: 'VIPs', description: 'Top customers' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.name).toBe('VIPs');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_group', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── add_to_group ──────────────────────────────────────────────────────────────
describe('add_to_group', () => {
    it('adds people to group', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ added_count: 2 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'add_to_group',
            arguments: { group_id: 'g1', people_ids: ['p1', 'p2'] },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.added_count).toBe(2);
    });

    it('returns -32603 when group_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'add_to_group',
            arguments: { people_ids: ['p1'] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── create_company ────────────────────────────────────────────────────────────
describe('create_company', () => {
    it('creates company', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'c1', name: 'TechCorp', domain: 'techcorp.com' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_company',
            arguments: { name: 'TechCorp', domain: 'techcorp.com' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.name).toBe('TechCorp');
    });
});

// ── create_note ───────────────────────────────────────────────────────────────
describe('create_note', () => {
    it('creates note for person', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'n1', content: 'Called today' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_note',
            arguments: { person_id: 'p1', content: 'Called today' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.content).toBe('Called today');
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('/people/p1/notes');
    });

    it('returns -32603 when content missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_note',
            arguments: { person_id: 'p1' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── add_pipeline_item ─────────────────────────────────────────────────────────
describe('add_pipeline_item', () => {
    it('adds item to pipeline', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'pi1', person_id: 'p1', stage_id: 's1' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'add_pipeline_item',
            arguments: { pipeline_id: 'pl1', person_id: 'p1', stage_id: 's1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.person_id).toBe('p1');
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('/pipelines/pl1/items');
    });

    it('returns -32603 when stage_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'add_pipeline_item',
            arguments: { pipeline_id: 'pl1', person_id: 'p1' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
