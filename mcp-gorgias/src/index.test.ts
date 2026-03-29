import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const EMAIL = 'agent@store.com';
const API_KEY = 'test-gorgias-key';
const DOMAIN = 'mystore';
const AUTH_HEADERS = {
    'X-Mcp-Secret-GORGIAS-EMAIL': EMAIL,
    'X-Mcp-Secret-GORGIAS-API-KEY': API_KEY,
    'X-Mcp-Secret-GORGIAS-DOMAIN': DOMAIN,
};

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
        const res = await worker.fetch(new Request('http://localhost/health'));
        expect(res.status).toBe(200);
        const body = await res.json() as { status: string };
        expect(body.status).toBe('ok');
    });

    it('GET / returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns -32700', async () => {
        const req = new Request('http://localhost/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{{bad' });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns protocol version', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        const body = await res.json() as { result: { protocolVersion: string } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });

    it('tools/list returns 12 tools', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(12);
    });

    it('unknown method returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 3, method: 'bad/method' }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('tools/call without any secrets returns -32001', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_tickets', arguments: {} } }));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('GORGIAS_EMAIL');
    });

    it('tools/call with partial secrets returns -32001 listing missing', async () => {
        const res = await worker.fetch(makeReq(
            { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_tickets', arguments: {} } },
            { 'X-Mcp-Secret-GORGIAS-EMAIL': EMAIL },
        ));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('GORGIAS_API_KEY');
    });

    it('all tools have annotations', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 6, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
        for (const tool of body.result.tools) {
            expect(tool.annotations).toBeDefined();
        }
    });
});

describe('list_tickets', () => {
    it('returns tickets', async () => {
        mockApiResponse({ data: [{ id: 1, subject: 'Order issue', status: 'open' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_tickets', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.data).toHaveLength(1);
    });

    it('passes status filter', async () => {
        mockApiResponse({ data: [] });
        await worker.fetch(makeReq({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'list_tickets', arguments: { status: 'closed' } } }, AUTH_HEADERS));
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('status=closed'), expect.any(Object));
    });
});

describe('get_ticket', () => {
    it('fetches ticket by id', async () => {
        mockApiResponse({ id: 42, subject: 'Refund request' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'get_ticket', arguments: { ticketId: 42 } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe(42);
    });

    it('errors without ticketId', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'get_ticket', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_ticket', () => {
    it('creates ticket', async () => {
        mockApiResponse({ id: 100, subject: 'New issue' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'create_ticket', arguments: { subject: 'New issue', customerEmail: 'cust@example.com', bodyText: 'My order is missing' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe(100);
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST' }));
    });

    it('errors without required fields', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'create_ticket', arguments: { subject: 'Test' } } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('update_ticket', () => {
    it('updates ticket', async () => {
        mockApiResponse({ id: 42, status: 'closed' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'update_ticket', arguments: { ticketId: 42, status: 'closed' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).status).toBe('closed');
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'PUT' }));
    });
});

describe('create_message', () => {
    it('creates message', async () => {
        mockApiResponse({ id: 200, body_text: 'Thank you' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'create_message', arguments: { ticketId: 42, agentEmail: 'agent@store.com', bodyText: 'Thank you' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe(200);
    });
});

describe('list_customers', () => {
    it('returns customers', async () => {
        mockApiResponse({ data: [{ id: 1, email: 'cust@example.com' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 18, method: 'tools/call', params: { name: 'list_customers', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).data).toHaveLength(1);
    });
});

describe('list_tags', () => {
    it('returns tags', async () => {
        mockApiResponse({ data: [{ id: 1, name: 'urgent' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'list_tags', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).data).toHaveLength(1);
    });
});

describe('get_stats', () => {
    it('returns stats', async () => {
        mockApiResponse({ open_tickets: 12, closed_today: 5 });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'get_stats', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.open_tickets).toBe(12);
    });
});

describe('list_users', () => {
    it('returns users', async () => {
        mockApiResponse({ data: [{ id: 1, email: 'agent@store.com' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'list_users', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).data).toHaveLength(1);
    });
});

describe('unknown tool', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'bad_tool', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

describe('domain in URL', () => {
    it('uses domain in API URL', async () => {
        mockApiResponse({ data: [] });
        await worker.fetch(makeReq({ jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'list_tickets', arguments: {} } }, AUTH_HEADERS));
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('mystore.gorgias.com'), expect.any(Object));
    });
});
