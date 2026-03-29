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
function apiNoContent() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

beforeEach(() => { mockFetch.mockReset(); });

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-E2B-API-KEY': 'e2b_test_key',
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
    it('returns status ok with 5 tools', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-e2b');
        expect(body.tools).toBe(5);
    });
});

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-e2b');
    });
});

describe('tools/list', () => {
    it('returns exactly 5 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(5);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_templates');
        expect(names).toContain('create_sandbox');
        expect(names).toContain('kill_sandbox');
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
    it('returns -32001 when no E2B-API-KEY header', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_sandboxes',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_templates', () => {
    it('returns templates list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            { templateID: 'base', name: 'Base', buildStatus: 'ready' },
        ]));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_templates',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].templateID).toBe('base');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(401, 'Invalid API key'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_templates',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_sandbox', () => {
    it('returns sandbox details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            sandboxID: 'sbx_abc',
            templateID: 'base',
            status: 'running',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_sandbox',
            arguments: { template_id: 'base', timeout: 300 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.sandboxID).toBe('sbx_abc');
        expect(result.status).toBe('running');
    });
});

describe('list_sandboxes', () => {
    it('returns sandboxes list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            { sandboxID: 'sbx_1', status: 'running' },
            { sandboxID: 'sbx_2', status: 'paused' },
        ]));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_sandboxes',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(2);
    });
});

describe('kill_sandbox', () => {
    it('returns success on 204', async () => {
        mockFetch.mockResolvedValueOnce(apiNoContent());
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'kill_sandbox',
            arguments: { sandbox_id: 'sbx_abc' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
    });

    it('returns -32603 on 404', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(404, 'Sandbox not found'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'kill_sandbox',
            arguments: { sandbox_id: 'bad_id' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
