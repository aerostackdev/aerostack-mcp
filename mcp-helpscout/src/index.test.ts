import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TOKEN = 'test-helpscout-token';
const AUTH_HEADERS = { 'X-Mcp-Secret-HELPSCOUT-ACCESS-TOKEN': TOKEN };

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
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        expect(res.status).toBe(405);
    });

    it('POST invalid JSON returns -32700', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{bad json',
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns protocol version', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        const body = await res.json() as { result: { protocolVersion: string } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });

    it('tools/list returns 14 tools', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(14);
    });

    it('unknown method returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 3, method: 'unknown/method' }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('tools/call without token returns -32001', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_conversations', arguments: {} } }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32001);
    });

    it('tools/list has annotations on every tool', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 5, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
        for (const tool of body.result.tools) {
            expect(tool.annotations).toBeDefined();
        }
    });
});

describe('list_conversations', () => {
    it('returns conversations list', async () => {
        mockApiResponse({ _embedded: { conversations: [{ id: 1, subject: 'Help' }] } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_conversations', arguments: { status: 'active', page: 1 } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data._embedded.conversations).toHaveLength(1);
    });

    it('defaults to active status', async () => {
        mockApiResponse({ _embedded: { conversations: [] } });
        await worker.fetch(makeReq({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'list_conversations', arguments: {} } }, AUTH_HEADERS));
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('status=active'), expect.any(Object));
    });
});

describe('get_conversation', () => {
    it('returns conversation details', async () => {
        mockApiResponse({ id: 42, subject: 'Order issue', status: 'active' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'get_conversation', arguments: { conversationId: 42 } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.id).toBe(42);
    });

    it('errors when conversationId missing', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'get_conversation', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_conversation', () => {
    it('creates a conversation', async () => {
        mockApiResponse({ id: 100, subject: 'New ticket' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'create_conversation', arguments: { subject: 'New ticket', customerEmail: 'user@example.com', mailboxId: 5, text: 'Hello' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.id).toBe(100);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/conversations'), expect.objectContaining({ method: 'POST' }));
    });

    it('errors when required fields missing', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'create_conversation', arguments: { subject: 'test' } } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('reply_to_conversation', () => {
    it('sends a reply', async () => {
        mockApiResponse({ id: 200, type: 'reply' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'reply_to_conversation', arguments: { conversationId: 42, text: 'Thanks!' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe(200);
    });
});

describe('update_conversation', () => {
    it('updates conversation status', async () => {
        mockApiResponse({ id: 42, status: 'closed' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'update_conversation', arguments: { conversationId: 42, status: 'closed' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).status).toBe('closed');
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'PATCH' }));
    });
});

describe('delete_conversation', () => {
    it('deletes and returns deleted:true', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 18, method: 'tools/call', params: { name: 'delete_conversation', arguments: { conversationId: 42 } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.deleted).toBe(true);
    });
});

describe('list_mailboxes', () => {
    it('returns mailboxes', async () => {
        mockApiResponse({ _embedded: { mailboxes: [{ id: 1, name: 'Support' }] } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'list_mailboxes', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data._embedded.mailboxes).toHaveLength(1);
    });
});

describe('list_customers', () => {
    it('returns customers list', async () => {
        mockApiResponse({ _embedded: { customers: [{ id: 1, firstName: 'Alice' }] } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'list_customers', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data._embedded.customers).toHaveLength(1);
    });
});

describe('create_customer', () => {
    it('creates customer', async () => {
        mockApiResponse({ id: 50, firstName: 'Bob' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'create_customer', arguments: { email: 'bob@example.com', firstName: 'Bob' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe(50);
    });

    it('errors without email', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'create_customer', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('search_conversations', () => {
    it('searches conversations', async () => {
        mockApiResponse({ _embedded: { conversations: [{ id: 9, subject: 'Refund' }] } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'search_conversations', arguments: { query: 'refund' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data._embedded.conversations[0].subject).toBe('Refund');
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('query='), expect.any(Object));
    });
});

describe('list_tags', () => {
    it('returns tags', async () => {
        mockApiResponse({ _embedded: { tags: [{ id: 1, name: 'urgent' }] } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 24, method: 'tools/call', params: { name: 'list_tags', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)._embedded.tags).toHaveLength(1);
    });
});

describe('unknown tool', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 25, method: 'tools/call', params: { name: 'nonexistent_tool', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});
