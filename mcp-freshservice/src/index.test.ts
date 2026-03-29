import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test-freshservice-key';
const DOMAIN = 'mycompany';
const AUTH_HEADERS = {
    'X-Mcp-Secret-FRESHSERVICE-API-KEY': API_KEY,
    'X-Mcp-Secret-FRESHSERVICE-DOMAIN': DOMAIN,
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

    it('GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns -32700', async () => {
        const req = new Request('http://localhost/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'notjson' });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns server info', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        const body = await res.json() as { result: { serverInfo: { name: string }; protocolVersion: string } };
        expect(body.result.serverInfo.name).toBe('mcp-freshservice');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });

    it('tools/list returns 14 tools', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(14);
    });

    it('unknown method returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 3, method: 'foo/bar' }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('tools/call without secrets returns -32001 with both secrets named', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_tickets', arguments: {} } }));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('FRESHSERVICE_API_KEY');
        expect(body.error.message).toContain('FRESHSERVICE_DOMAIN');
    });

    it('all tools have annotations', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 5, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
        for (const tool of body.result.tools) {
            expect(tool.annotations).toBeDefined();
        }
    });
});

describe('list_tickets', () => {
    it('returns tickets', async () => {
        mockApiResponse({ tickets: [{ id: 1, subject: 'Laptop issue' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_tickets', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).tickets).toHaveLength(1);
    });

    it('passes pagination params', async () => {
        mockApiResponse({ tickets: [] });
        await worker.fetch(makeReq({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'list_tickets', arguments: { page: 2, per_page: 10 } } }, AUTH_HEADERS));
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.any(Object));
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('per_page=10'), expect.any(Object));
    });
});

describe('get_ticket', () => {
    it('returns ticket', async () => {
        mockApiResponse({ ticket: { id: 5, subject: 'VPN issue' } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'get_ticket', arguments: { ticketId: 5 } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).ticket.id).toBe(5);
    });

    it('errors without ticketId', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'get_ticket', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_ticket', () => {
    it('creates ticket', async () => {
        mockApiResponse({ ticket: { id: 100, subject: 'New ticket' } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'create_ticket', arguments: { subject: 'New ticket', email: 'user@co.com' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).ticket.id).toBe(100);
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST' }));
    });

    it('errors without email', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'create_ticket', arguments: { subject: 'Test' } } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('update_ticket', () => {
    it('updates ticket', async () => {
        mockApiResponse({ ticket: { id: 5, status: 4 } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'update_ticket', arguments: { ticketId: 5, status: 4 } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).ticket.status).toBe(4);
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'PUT' }));
    });
});

describe('delete_ticket', () => {
    it('deletes ticket and returns deleted:true', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'delete_ticket', arguments: { ticketId: 5 } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).deleted).toBe(true);
    });
});

describe('reply_to_ticket', () => {
    it('sends reply', async () => {
        mockApiResponse({ conversation: { id: 200, body: 'Hello' } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 18, method: 'tools/call', params: { name: 'reply_to_ticket', arguments: { ticketId: 5, body: 'Hello' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).conversation.id).toBe(200);
    });
});

describe('list_assets', () => {
    it('returns assets', async () => {
        mockApiResponse({ assets: [{ id: 1, name: 'MacBook' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'list_assets', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).assets).toHaveLength(1);
    });
});

describe('list_agents', () => {
    it('returns agents', async () => {
        mockApiResponse({ agents: [{ id: 1, email: 'agent@co.com' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'list_agents', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).agents).toHaveLength(1);
    });
});

describe('list_departments', () => {
    it('returns departments', async () => {
        mockApiResponse({ departments: [{ id: 1, name: 'IT' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'list_departments', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).departments).toHaveLength(1);
    });
});

describe('domain in URL', () => {
    it('uses domain in request URL', async () => {
        mockApiResponse({ tickets: [] });
        await worker.fetch(makeReq({ jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'list_tickets', arguments: {} } }, AUTH_HEADERS));
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('mycompany.freshservice.com'), expect.any(Object));
    });
});

describe('unknown tool', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'bad_tool', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});
