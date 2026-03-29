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
    return Promise.resolve(new Response(JSON.stringify({ message }), {
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
            'X-Mcp-Secret-BROWSERBASE-API-KEY': 'bb_test_key',
            'X-Mcp-Secret-BROWSERBASE-PROJECT-ID': 'proj_123',
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
    it('returns status ok with 7 tools', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-browserbase');
        expect(body.tools).toBe(7);
    });
});

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-browserbase');
    });
});

describe('tools/list', () => {
    it('returns exactly 7 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(7);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('create_session');
        expect(names).toContain('list_sessions');
        expect(names).toContain('delete_context');
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
    it('returns -32001 when no BROWSERBASE-API-KEY', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_sessions',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });

    it('returns -32001 when BROWSERBASE-PROJECT-ID missing', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-BROWSERBASE-API-KEY': 'bb_test_key',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_sessions', arguments: {} } }),
        });
        const res = await worker.fetch(req);
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('create_session', () => {
    it('returns new session with id', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'sess_abc',
            projectId: 'proj_123',
            status: 'RUNNING',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_session',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('sess_abc');
        expect(result.status).toBe('RUNNING');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(403, 'Forbidden'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_session',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_sessions', () => {
    it('returns sessions list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            { id: 'sess_1', status: 'RUNNING' },
            { id: 'sess_2', status: 'COMPLETED' },
        ]));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_sessions',
            arguments: { status: 'RUNNING' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(2);
    });
});

describe('get_session', () => {
    it('returns session details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'sess_abc',
            status: 'COMPLETED',
            duration: 30000,
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_session',
            arguments: { session_id: 'sess_abc' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('sess_abc');
        expect(result.status).toBe('COMPLETED');
    });
});

describe('list_contexts', () => {
    it('returns contexts list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            { id: 'ctx_abc', projectId: 'proj_123' },
        ]));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_contexts',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('ctx_abc');
    });
});
