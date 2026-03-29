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
            'X-Mcp-Secret-HOOKDECK-API-KEY': 'hd_test_key',
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
        expect(body.server).toBe('mcp-hookdeck');
        expect(body.tools).toBe(8);
    });
});

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-hookdeck');
    });
});

describe('tools/list', () => {
    it('returns exactly 8 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(8);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_connections');
        expect(names).toContain('create_connection');
        expect(names).toContain('retry_event');
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
    it('returns -32001 when no HOOKDECK-API-KEY header', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_connections',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_connections', () => {
    it('returns connections list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            models: [
                { id: 'con_1', name: 'My Connection', paused: false },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_connections',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('con_1');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(401, 'Unauthorized'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_connections',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_connection', () => {
    it('returns connection details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'con_1',
            name: 'My Connection',
            paused: false,
            source: { name: 'github' },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_connection',
            arguments: { id: 'con_1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('con_1');
        expect(result.source.name).toBe('github');
    });
});

describe('create_connection', () => {
    it('returns new connection', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'con_new',
            name: 'New Connection',
            paused: false,
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_connection',
            arguments: {
                name: 'New Connection',
                source_name: 'github',
                destination_name: 'my-api',
                destination_url: 'https://example.com/webhook',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('con_new');
    });
});

describe('list_events', () => {
    it('returns events list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            models: [
                { id: 'evt_1', status: 'SUCCESSFUL', created_at: '2024-01-01' },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_events',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('evt_1');
    });
});

describe('retry_event', () => {
    it('returns retry response', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'evt_1', status: 'QUEUED' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'retry_event',
            arguments: { id: 'evt_1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.status).toBe('QUEUED');
    });
});
