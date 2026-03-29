import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test_deel_api_key_ghi789';

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function withKey(extra: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-DEEL-API-KEY': API_KEY, ...extra };
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
        expect(json.server).toBe('mcp-deel');
        expect(json.tools).toBe(7);
    });
});

describe('initialize', () => {
    it('returns correct protocol version and server info', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(json.result.protocolVersion).toBe('2024-11-05');
        expect(json.result.serverInfo.name).toBe('mcp-deel');
    });
});

describe('tools/list', () => {
    it('returns all 7 tools', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { tools: unknown[] } };
        expect(json.result.tools).toHaveLength(7);
    });
});

describe('missing secret', () => {
    it('returns -32001 when API key header is absent', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'list_contracts', arguments: {} },
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
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number; message: string } };
        expect(json.error.code).toBe(-32601);
        expect(json.error.message).toContain('nonexistent_tool');
    });
});

describe('unknown method', () => {
    it('returns -32601 for unrecognized JSON-RPC method', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 5, method: 'ping' }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number } };
        expect(json.error.code).toBe(-32601);
    });
});

// ── Tool-specific tests ───────────────────────────────────────────────────────

describe('list_contracts', () => {
    it('calls GET /contracts with limit param and returns data', async () => {
        mockOk({ data: [{ id: 'ctr_001', type: 'contractor' }, { id: 'ctr_002', type: 'employee' }] });
        const req = makeRequest({
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: { name: 'list_contracts', arguments: { limit: 10 } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('ctr_001');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.letsdeel.com/rest/v2/contracts?limit=10',
            expect.any(Object),
        );
    });
});

describe('get_contract', () => {
    it('calls GET /contracts/:id and returns contract details', async () => {
        mockOk({ data: { id: 'ctr_abc', status: 'active', worker: { name: 'Jane Doe' } } });
        const req = makeRequest({
            jsonrpc: '2.0', id: 20, method: 'tools/call',
            params: { name: 'get_contract', arguments: { contract_id: 'ctr_abc' } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('Jane Doe');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.letsdeel.com/rest/v2/contracts/ctr_abc',
            expect.any(Object),
        );
    });

    it('returns -32603 when contract_id is missing', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 21, method: 'tools/call',
            params: { name: 'get_contract', arguments: {} },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number; message: string } };
        expect(json.error.code).toBe(-32603);
        expect(json.error.message).toContain('contract_id');
    });
});

describe('list_people', () => {
    it('calls GET /people with correct URL', async () => {
        mockOk({ data: [{ id: 'ppl_001', name: 'Alice' }], total: 1 });
        const req = makeRequest({
            jsonrpc: '2.0', id: 30, method: 'tools/call',
            params: { name: 'list_people', arguments: { limit: 5 } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('ppl_001');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.letsdeel.com/rest/v2/people?limit=5',
            expect.any(Object),
        );
    });
});

describe('list_invoices', () => {
    it('calls GET /invoices with default limit', async () => {
        mockOk({ data: [{ id: 'inv_001', amount: 5000, currency: 'USD' }] });
        const req = makeRequest({
            jsonrpc: '2.0', id: 40, method: 'tools/call',
            params: { name: 'list_invoices', arguments: {} },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('inv_001');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.letsdeel.com/rest/v2/invoices?limit=20',
            expect.any(Object),
        );
    });
});
