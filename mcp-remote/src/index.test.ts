import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const ACCESS_TOKEN = 'test_remote_token_mno345';

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function withToken(extra: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-REMOTE-ACCESS-TOKEN': ACCESS_TOKEN, ...extra };
}

function mockOk(data: unknown) {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(data), { status: 200 }));
}

beforeEach(() => { mockFetch.mockReset(); });

// ── Protocol tests ────────────────────────────────────────────────────────────

describe('GET health check', () => {
    it('returns status ok with server name and tool count', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const json = await res.json() as { status: string; server: string; tools: number };
        expect(json.status).toBe('ok');
        expect(json.server).toBe('mcp-remote');
        expect(json.tools).toBe(6);
    });
});

describe('initialize', () => {
    it('returns correct protocol version and server info', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(json.result.protocolVersion).toBe('2024-11-05');
        expect(json.result.serverInfo.name).toBe('mcp-remote');
    });
});

describe('tools/list', () => {
    it('returns all 6 tools', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { tools: unknown[] } };
        expect(json.result.tools).toHaveLength(6);
    });
});

describe('missing secret', () => {
    it('returns -32001 when access token header is absent', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'list_employments', arguments: {} },
        });
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number } };
        expect(json.error.code).toBe(-32001);
    });
});

describe('unknown tool', () => {
    it('returns -32601 for unrecognized tool name', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'nonexistent_tool', arguments: {} },
        }, withToken());
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number; message: string } };
        expect(json.error.code).toBe(-32601);
        expect(json.error.message).toContain('nonexistent_tool');
    });
});

describe('unknown method', () => {
    it('returns -32601 for unrecognized JSON-RPC method', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 5, method: 'ping' }, withToken());
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number } };
        expect(json.error.code).toBe(-32601);
    });
});

// ── Tool-specific tests ───────────────────────────────────────────────────────

describe('list_employments', () => {
    it('calls GET /employments with pagination params', async () => {
        mockOk({ data: [{ id: 'emp_001', status: 'active' }, { id: 'emp_002', status: 'active' }], total: 2 });
        const req = makeRequest({
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: { name: 'list_employments', arguments: { page: 1, limit: 10 } },
        }, withToken());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('emp_001');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://gateway.remote.com/v1/employments?page=1&page_size=10',
            expect.any(Object),
        );
    });
});

describe('get_employment', () => {
    it('calls GET /employments/:id and returns employment details', async () => {
        mockOk({ data: { id: 'emp_abc', country: 'DE', status: 'active', employee: { name: 'Klaus' } } });
        const req = makeRequest({
            jsonrpc: '2.0', id: 20, method: 'tools/call',
            params: { name: 'get_employment', arguments: { employment_id: 'emp_abc' } },
        }, withToken());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('Klaus');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://gateway.remote.com/v1/employments/emp_abc',
            expect.any(Object),
        );
    });

    it('returns -32603 when employment_id is missing', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 21, method: 'tools/call',
            params: { name: 'get_employment', arguments: {} },
        }, withToken());
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number; message: string } };
        expect(json.error.code).toBe(-32603);
        expect(json.error.message).toContain('employment_id');
    });
});

describe('create_time_off', () => {
    it('calls POST /timeoffs with all required fields', async () => {
        mockOk({ data: { id: 'toff_001', status: 'pending', type: 'vacation' } });
        const req = makeRequest({
            jsonrpc: '2.0', id: 30, method: 'tools/call',
            params: {
                name: 'create_time_off',
                arguments: {
                    employment_id: 'emp_001',
                    type: 'vacation',
                    start_date: '2026-07-14',
                    end_date: '2026-07-18',
                    notes: 'Summer holiday',
                },
            },
        }, withToken());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('toff_001');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://gateway.remote.com/v1/timeoffs',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('returns -32603 when end_date is missing', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 31, method: 'tools/call',
            params: {
                name: 'create_time_off',
                arguments: { employment_id: 'emp_001', type: 'sick', start_date: '2026-05-01' },
            },
        }, withToken());
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number; message: string } };
        expect(json.error.code).toBe(-32603);
        expect(json.error.message).toContain('end_date');
    });
});

describe('list_countries', () => {
    it('calls GET /countries and returns country list', async () => {
        mockOk({ data: [{ code: 'DE', name: 'Germany' }, { code: 'GB', name: 'United Kingdom' }] });
        const req = makeRequest({
            jsonrpc: '2.0', id: 40, method: 'tools/call',
            params: { name: 'list_countries', arguments: {} },
        }, withToken());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('Germany');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://gateway.remote.com/v1/countries',
            expect.any(Object),
        );
    });
});
