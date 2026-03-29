import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test_novu_api_key_abc123';

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function withKey(extra: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-NOVU-API-KEY': API_KEY, ...extra };
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
        expect(json.server).toBe('mcp-novu');
        expect(json.tools).toBe(8);
    });
});

describe('initialize', () => {
    it('returns correct protocol version and server info', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(json.result.protocolVersion).toBe('2024-11-05');
        expect(json.result.serverInfo.name).toBe('mcp-novu');
    });
});

describe('tools/list', () => {
    it('returns all 8 tools', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { tools: unknown[] } };
        expect(json.result.tools).toHaveLength(8);
    });
});

describe('missing secret', () => {
    it('returns -32001 when API key header is absent', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'list_subscribers', arguments: {} },
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

describe('trigger_event', () => {
    it('calls POST /events/trigger with correct body and returns result', async () => {
        mockOk({ data: { transactionId: 'txn_abc123' } });
        const req = makeRequest({
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: {
                name: 'trigger_event',
                arguments: { name: 'welcome-email', subscriberId: 'user_001', payload: { name: 'Alice' } },
            },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('txn_abc123');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.novu.co/v1/events/trigger',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('returns -32603 when required field subscriberId is missing', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 11, method: 'tools/call',
            params: { name: 'trigger_event', arguments: { name: 'welcome-email' } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number; message: string } };
        expect(json.error.code).toBe(-32603);
        expect(json.error.message).toContain('subscriberId');
    });
});

describe('list_subscribers', () => {
    it('calls GET /subscribers with pagination params', async () => {
        mockOk({ data: [{ subscriberId: 'sub_1' }, { subscriberId: 'sub_2' }], totalCount: 2 });
        const req = makeRequest({
            jsonrpc: '2.0', id: 20, method: 'tools/call',
            params: { name: 'list_subscribers', arguments: { page: 0, limit: 10 } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('sub_1');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.novu.co/v1/subscribers?page=0&limit=10',
            expect.any(Object),
        );
    });
});

describe('create_subscriber', () => {
    it('calls POST /subscribers with subscriber data', async () => {
        mockOk({ data: { _id: 'abc123', subscriberId: 'user_new', email: 'new@example.com' } });
        const req = makeRequest({
            jsonrpc: '2.0', id: 30, method: 'tools/call',
            params: {
                name: 'create_subscriber',
                arguments: { subscriberId: 'user_new', email: 'new@example.com', firstName: 'Bob' },
            },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('user_new');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.novu.co/v1/subscribers',
            expect.objectContaining({ method: 'POST' }),
        );
    });
});

describe('delete_subscriber', () => {
    it('calls DELETE /subscribers/:id and returns 204 success', async () => {
        mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
        const req = makeRequest({
            jsonrpc: '2.0', id: 40, method: 'tools/call',
            params: { name: 'delete_subscriber', arguments: { subscriber_id: 'sub_old' } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('success');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.novu.co/v1/subscribers/sub_old',
            expect.objectContaining({ method: 'DELETE' }),
        );
    });
});

describe('cancel_event', () => {
    it('calls DELETE /events/cancel/:id', async () => {
        mockOk({ data: { transactionId: 'txn_cancel_001' } });
        const req = makeRequest({
            jsonrpc: '2.0', id: 50, method: 'tools/call',
            params: { name: 'cancel_event', arguments: { transaction_id: 'txn_cancel_001' } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('txn_cancel_001');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.novu.co/v1/events/cancel/txn_cancel_001',
            expect.objectContaining({ method: 'DELETE' }),
        );
    });
});
