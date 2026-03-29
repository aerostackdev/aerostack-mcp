import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TOKEN = 'test-front-token';
const AUTH_HEADERS = { 'X-Mcp-Secret-FRONT-API-TOKEN': TOKEN };

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function mockApiResponse(data: unknown, status = 200) {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(data), { status }));
}

beforeEach(() => { mockFetch.mockReset(); });

describe('Infrastructure', () => {
    it('GET /health returns ok', async () => {
        const req = new Request('http://localhost/health');
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as { status: string };
        expect(body.status).toBe('ok');
    });

    it('GET / returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns -32700', async () => {
        const req = new Request('http://localhost/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json' });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns server info', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        const body = await res.json() as { result: { serverInfo: { name: string } } };
        expect(body.result.serverInfo.name).toBe('mcp-front');
    });

    it('tools/list returns 14 tools', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(14);
    });

    it('unknown method returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 3, method: 'bad/method' }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('tools/call without token returns -32001', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_conversations', arguments: {} } }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32001);
    });

    it('all tools have annotations', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 5, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
        for (const tool of body.result.tools) {
            expect(tool.annotations).toBeDefined();
        }
    });
});

describe('list_conversations', () => {
    it('returns conversations', async () => {
        mockApiResponse({ _results: [{ id: 'cnv_1', subject: 'Hello' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_conversations', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data._results).toHaveLength(1);
    });

    it('passes limit param', async () => {
        mockApiResponse({ _results: [] });
        await worker.fetch(makeReq({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'list_conversations', arguments: { limit: 10 } } }, AUTH_HEADERS));
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('limit=10'), expect.any(Object));
    });
});

describe('get_conversation', () => {
    it('fetches conversation by id', async () => {
        mockApiResponse({ id: 'cnv_abc', subject: 'Test' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'get_conversation', arguments: { conversationId: 'cnv_abc' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('cnv_abc');
    });

    it('errors without conversationId', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'get_conversation', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_messages', () => {
    it('returns messages for conversation', async () => {
        mockApiResponse({ _results: [{ id: 'msg_1', body: 'Hi' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'list_messages', arguments: { conversationId: 'cnv_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)._results).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/conversations/cnv_1/messages'), expect.any(Object));
    });
});

describe('send_reply', () => {
    it('sends reply', async () => {
        mockApiResponse({ id: 'msg_2', type: 'email' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'send_reply', arguments: { conversationId: 'cnv_1', authorEmail: 'agent@co.com', body: 'Hello!', toHandle: 'user@example.com' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('msg_2');
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST' }));
    });

    it('errors when required fields missing', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'send_reply', arguments: { conversationId: 'cnv_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('update_conversation', () => {
    it('patches conversation', async () => {
        mockApiResponse({ id: 'cnv_1', status: 'archived' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'update_conversation', arguments: { conversationId: 'cnv_1', status: 'archived' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).status).toBe('archived');
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'PATCH' }));
    });
});

describe('list_inboxes', () => {
    it('returns inboxes', async () => {
        mockApiResponse({ _results: [{ id: 'inb_1', name: 'Support' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 18, method: 'tools/call', params: { name: 'list_inboxes', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)._results).toHaveLength(1);
    });
});

describe('create_contact', () => {
    it('creates contact', async () => {
        mockApiResponse({ id: 'crd_1', name: 'Alice' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'create_contact', arguments: { name: 'Alice', email: 'alice@example.com' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('crd_1');
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST' }));
    });

    it('errors without required fields', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'create_contact', arguments: { name: 'Test' } } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_teammates', () => {
    it('returns teammates', async () => {
        mockApiResponse({ _results: [{ id: 'tea_1', email: 'agent@co.com' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'list_teammates', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)._results).toHaveLength(1);
    });
});

describe('create_conversation_note', () => {
    it('creates note', async () => {
        mockApiResponse({ id: 'com_1', body: 'Internal note' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'create_conversation_note', arguments: { conversationId: 'cnv_1', authorEmail: 'agent@co.com', body: 'Internal note' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('com_1');
    });
});

describe('unknown tool', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'bad_tool', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});
