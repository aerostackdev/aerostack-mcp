import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test_lattice_api_key_jkl012';

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function withKey(extra: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-LATTICE-API-KEY': API_KEY, ...extra };
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
        expect(json.server).toBe('mcp-lattice');
        expect(json.tools).toBe(7);
    });
});

describe('initialize', () => {
    it('returns correct protocol version and server info', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(json.result.protocolVersion).toBe('2024-11-05');
        expect(json.result.serverInfo.name).toBe('mcp-lattice');
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
            params: { name: 'list_users', arguments: {} },
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

describe('list_users', () => {
    it('calls GET /v1/users with limit param and returns users', async () => {
        mockOk({ results: [{ id: 'usr_001', name: 'Alice' }, { id: 'usr_002', name: 'Bob' }], total: 2 });
        const req = makeRequest({
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: { name: 'list_users', arguments: { limit: 10 } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('usr_001');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.us.lattice.com/v1/users?limit=10',
            expect.any(Object),
        );
    });
});

describe('create_goal', () => {
    it('calls POST /v1/goals with name and ownerId', async () => {
        mockOk({ id: 'goal_new_001', name: 'Launch Q3 Feature', ownerId: 'usr_001' });
        const req = makeRequest({
            jsonrpc: '2.0', id: 20, method: 'tools/call',
            params: {
                name: 'create_goal',
                arguments: {
                    name: 'Launch Q3 Feature',
                    ownerId: 'usr_001',
                    description: 'Ship the new analytics dashboard',
                    dueDate: '2026-09-30',
                },
            },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('goal_new_001');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.us.lattice.com/v1/goals',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('returns -32603 when ownerId is missing', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 21, method: 'tools/call',
            params: { name: 'create_goal', arguments: { name: 'Goal Without Owner' } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number; message: string } };
        expect(json.error.code).toBe(-32603);
        expect(json.error.message).toContain('ownerId');
    });
});

describe('update_goal', () => {
    it('calls PATCH /v1/goals/:id with update body', async () => {
        mockOk({ id: 'goal_001', status: 'completed', progress: 100 });
        const req = makeRequest({
            jsonrpc: '2.0', id: 30, method: 'tools/call',
            params: {
                name: 'update_goal',
                arguments: { goal_id: 'goal_001', status: 'completed', progress: 100 },
            },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('completed');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.us.lattice.com/v1/goals/goal_001',
            expect.objectContaining({ method: 'PATCH' }),
        );
    });
});

describe('list_review_cycles', () => {
    it('calls GET /v1/review-cycles with correct URL', async () => {
        mockOk({ results: [{ id: 'rc_001', name: 'Q1 2026 Reviews' }], total: 1 });
        const req = makeRequest({
            jsonrpc: '2.0', id: 40, method: 'tools/call',
            params: { name: 'list_review_cycles', arguments: { limit: 5 } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('rc_001');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.us.lattice.com/v1/review-cycles?limit=5',
            expect.any(Object),
        );
    });
});
