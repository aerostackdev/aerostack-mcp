import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test_loops_api_key_def456';

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function withKey(extra: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-LOOPS-API-KEY': API_KEY, ...extra };
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
        expect(json.server).toBe('mcp-loops');
        expect(json.tools).toBe(7);
    });
});

describe('initialize', () => {
    it('returns correct protocol version and server info', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(json.result.protocolVersion).toBe('2024-11-05');
        expect(json.result.serverInfo.name).toBe('mcp-loops');
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
            params: { name: 'list_mailing_lists', arguments: {} },
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

describe('create_contact', () => {
    it('calls POST /contacts/create with contact data', async () => {
        mockOk({ success: true, id: 'cid_001' });
        const req = makeRequest({
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: {
                name: 'create_contact',
                arguments: { email: 'alice@example.com', firstName: 'Alice', lastName: 'Smith' },
            },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('cid_001');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://app.loops.so/api/v1/contacts/create',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('returns -32603 when email is missing', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 11, method: 'tools/call',
            params: { name: 'create_contact', arguments: { firstName: 'NoEmail' } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number; message: string } };
        expect(json.error.code).toBe(-32603);
        expect(json.error.message).toContain('email');
    });
});

describe('send_event', () => {
    it('calls POST /events/send with event name and properties', async () => {
        mockOk({ success: true });
        const req = makeRequest({
            jsonrpc: '2.0', id: 20, method: 'tools/call',
            params: {
                name: 'send_event',
                arguments: {
                    email: 'bob@example.com',
                    eventName: 'signup',
                    eventProperties: { plan: 'pro' },
                },
            },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('true');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://app.loops.so/api/v1/events/send',
            expect.objectContaining({ method: 'POST' }),
        );
    });
});

describe('send_transactional', () => {
    it('calls POST /transactional with template and email', async () => {
        mockOk({ success: true, id: 'email_sent_001' });
        const req = makeRequest({
            jsonrpc: '2.0', id: 30, method: 'tools/call',
            params: {
                name: 'send_transactional',
                arguments: {
                    transactionalId: 'tmpl_welcome',
                    email: 'carol@example.com',
                    dataVariables: { name: 'Carol', plan: 'starter' },
                },
            },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('email_sent_001');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://app.loops.so/api/v1/transactional',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('returns -32603 when transactionalId is missing', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 31, method: 'tools/call',
            params: { name: 'send_transactional', arguments: { email: 'x@x.com' } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { error: { code: number; message: string } };
        expect(json.error.code).toBe(-32603);
        expect(json.error.message).toContain('transactionalId');
    });
});

describe('find_contact', () => {
    it('calls GET /contacts/find with email query param', async () => {
        mockOk([{ id: 'cid_found', email: 'dave@example.com' }]);
        const req = makeRequest({
            jsonrpc: '2.0', id: 40, method: 'tools/call',
            params: { name: 'find_contact', arguments: { email: 'dave@example.com' } },
        }, withKey());
        const res = await worker.fetch(req);
        const json = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(json.result.content[0].text).toContain('cid_found');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://app.loops.so/api/v1/contacts/find?email=dave%40example.com',
            expect.any(Object),
        );
    });
});
