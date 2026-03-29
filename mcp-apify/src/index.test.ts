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
function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ error: { message } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-APIFY-API-TOKEN': 'apify_test_token',
        },
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

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('GET /', () => {
    it('returns status ok with 8 tools', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-apify');
        expect(body.tools).toBe(8);
    });
});

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-apify');
    });
});

describe('tools/list', () => {
    it('returns exactly 8 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(8);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_actors');
        expect(names).toContain('run_actor');
        expect(names).toContain('get_dataset_items');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('noop'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('missing auth', () => {
    it('returns -32001 when no APIFY-API-TOKEN header', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_actors',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_actors', () => {
    it('returns actors list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: { items: [{ id: 'actor1', name: 'My Actor', username: 'user' }] },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_actors',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('actor1');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(401, 'Unauthorized'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_actors',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_actor', () => {
    it('returns actor details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: { id: 'actor1', name: 'My Actor', stats: { totalRuns: 10 } },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_actor',
            arguments: { actor_id: 'actor1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('actor1');
    });
});

describe('run_actor', () => {
    it('returns run data', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: { id: 'run_abc', status: 'RUNNING', actId: 'actor1' },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'run_actor',
            arguments: { actor_id: 'actor1', input: { url: 'https://example.com' } },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('run_abc');
        expect(result.status).toBe('RUNNING');
    });
});

describe('get_run', () => {
    it('returns run details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: { id: 'run_abc', status: 'SUCCEEDED', finishedAt: '2024-01-01' },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_run',
            arguments: { run_id: 'run_abc' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.status).toBe('SUCCEEDED');
    });
});

describe('get_dataset_items', () => {
    it('returns items array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            { url: 'https://example.com', title: 'Example' },
        ]));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_dataset_items',
            arguments: { dataset_id: 'ds_abc', limit: 10 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('https://example.com');
    });
});
