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
    return Promise.resolve(new Response(JSON.stringify({ error: message }), {
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
            'X-Mcp-Secret-PIPEDREAM-API-KEY': 'pd_test_key',
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
    it('returns status ok', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-pipedream');
        expect(body.tools).toBe(6);
    });
});

describe('initialize', () => {
    it('returns correct protocolVersion', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-pipedream');
    });
});

describe('tools/list', () => {
    it('returns exactly 6 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(6);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_sources');
        expect(names).toContain('get_me');
        expect(names).toContain('list_apps');
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
    it('returns -32001 when no PIPEDREAM-API-KEY header', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'get_me',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_sources', () => {
    it('returns sources list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ id: 'src_abc', name: 'My Source', active: true }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_sources',
            arguments: { limit: 5 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('src_abc');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(401, 'Unauthorized'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_sources',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_source', () => {
    it('returns source details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: { id: 'src_abc', name: 'My Source', active: true, type: 'webhook' },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_source',
            arguments: { source_id: 'src_abc' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('src_abc');
        expect(result.type).toBe('webhook');
    });
});

describe('list_source_events', () => {
    it('returns event summaries', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ id: 'evt_1', ts: 1234567890 }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_source_events',
            arguments: { source_id: 'src_abc' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('evt_1');
    });
});

describe('get_me', () => {
    it('returns user info', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: { id: 'u_abc', username: 'testuser', email: 'test@example.com' },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_me',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.username).toBe('testuser');
    });
});

describe('list_apps', () => {
    it('returns matching apps', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ id: 'app_slack', name: 'Slack', name_slug: 'slack' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_apps',
            arguments: { query: 'slack' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].name_slug).toBe('slack');
    });
});

describe('list_workflows', () => {
    it('returns workflows list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ id: 'p_abc', name: 'My Workflow' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_workflows',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('p_abc');
    });
});
