import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test_courier_api_key_xyz789';

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function withKey(extra: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-COURIER-API-KEY': API_KEY, ...extra };
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
        expect(json.server).toBe('mcp-courier');
        expect(json.tools).toBe(7);
    });
});

describe('initialize', () => {
    it('returns correct protocol version and server info', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(json.result.protocolVersion).toBe('2024-11-05');
        expect(json.result.serverInfo.name).toBe('mcp-courier');
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
            params: { name: 'list_messages', arguments: {} },
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

describe('send', () => {
    it('calls POST /send with message envelope', async () => {
        mockOk({ requestId: 'req_courier_001' });
        const req = makeRequest({
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: {
                name: 'send',
                arguments: {
                    to_email: 'alice@example.com',
                    template: 'welcome-tmpl',
                    title: 'Welcome!',
                    body: 'Thanks for signing up.',
                },
            },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('req_courier_001');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.courier.com/send',
            expect.objectContaining({ method: 'POST' }),
        );
    });
});

describe('get_message', () => {
    it('calls GET /messages/:id with correct URL', async () => {
        mockOk({ id: 'msg_abc', status: 'DELIVERED' });
        const req = makeRequest({
            jsonrpc: '2.0', id: 20, method: 'tools/call',
            params: { name: 'get_message', arguments: { message_id: 'msg_abc' } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('DELIVERED');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.courier.com/messages/msg_abc',
            expect.any(Object),
        );
    });

    it('returns -32603 when message_id is missing', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 21, method: 'tools/call',
            params: { name: 'get_message', arguments: {} },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number; message: string } };
        expect(json.error.code).toBe(-32603);
        expect(json.error.message).toContain('message_id');
    });
});

describe('upsert_profile', () => {
    it('calls POST /profiles/:id with profile body', async () => {
        mockOk({ status: 200 });
        const req = makeRequest({
            jsonrpc: '2.0', id: 30, method: 'tools/call',
            params: {
                name: 'upsert_profile',
                arguments: { recipient_id: 'user_001', email: 'user@example.com', phone_number: '+15555550100' },
            },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('200');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.courier.com/profiles/user_001',
            expect.objectContaining({ method: 'POST' }),
        );
    });
});

describe('list_templates', () => {
    it('calls GET /notifications with limit param', async () => {
        mockOk({ results: [{ id: 'tmpl_1', title: 'Welcome Email' }], total: 1 });
        const req = makeRequest({
            jsonrpc: '2.0', id: 40, method: 'tools/call',
            params: { name: 'list_templates', arguments: { limit: 10 } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('Welcome Email');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.courier.com/notifications?limit=10',
            expect.any(Object),
        );
    });
});
