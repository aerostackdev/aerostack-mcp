import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test-luma-api-key';
const AUTH_HEADERS = { 'X-Mcp-Secret-LUMA-API-KEY': API_KEY };

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
        const body = await res.json() as { status: string; mcp: string };
        expect(body.status).toBe('ok');
        expect(body.mcp).toBe('mcp-luma');
    });

    it('GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns -32700', async () => {
        const req = new Request('http://localhost/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{{' });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns server info', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        const body = await res.json() as { result: { serverInfo: { name: string } } };
        expect(body.result.serverInfo.name).toBe('mcp-luma');
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

    it('tools/call without api key returns -32001', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_events', arguments: {} } }));
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

describe('list_events', () => {
    it('returns events', async () => {
        mockApiResponse({ entries: [{ event: { api_id: 'evt_1', name: 'Hack Night' } }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_events', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).entries).toHaveLength(1);
    });

    it('passes pagination limit', async () => {
        mockApiResponse({ entries: [] });
        await worker.fetch(makeReq({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'list_events', arguments: { pagination_limit: 10 } } }, AUTH_HEADERS));
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('pagination_limit=10'), expect.any(Object));
    });

    it('uses x-luma-api-key header', async () => {
        mockApiResponse({ entries: [] });
        await worker.fetch(makeReq({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'list_events', arguments: {} } }, AUTH_HEADERS));
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
            headers: expect.objectContaining({ 'x-luma-api-key': API_KEY }),
        }));
    });
});

describe('get_event', () => {
    it('returns event details', async () => {
        mockApiResponse({ api_id: 'evt_1', name: 'Hack Night' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'get_event', arguments: { eventId: 'evt_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).api_id).toBe('evt_1');
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('api_id=evt_1'), expect.any(Object));
    });

    it('errors without eventId', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'get_event', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_event', () => {
    it('creates event', async () => {
        mockApiResponse({ api_id: 'evt_new', name: 'New Meetup' });
        const res = await worker.fetch(makeReq({
            jsonrpc: '2.0', id: 15, method: 'tools/call', params: {
                name: 'create_event', arguments: {
                    name: 'New Meetup', start_at: '2026-05-01T18:00:00Z', end_at: '2026-05-01T21:00:00Z', timezone: 'America/New_York',
                },
            },
        }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).api_id).toBe('evt_new');
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/event/create'), expect.objectContaining({ method: 'POST' }));
    });

    it('errors without required fields', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'create_event', arguments: { name: 'Test' } } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('invite_guest', () => {
    it('invites guest', async () => {
        mockApiResponse({ invited: [{ email: 'alice@example.com' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'invite_guest', arguments: { eventId: 'evt_1', email: 'alice@example.com' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).invited).toHaveLength(1);
    });
});

describe('list_guests', () => {
    it('returns guests', async () => {
        mockApiResponse({ entries: [{ guest: { api_id: 'g_1', email: 'bob@example.com' } }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 18, method: 'tools/call', params: { name: 'list_guests', arguments: { eventId: 'evt_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).entries).toHaveLength(1);
    });
});

describe('list_calendars', () => {
    it('returns calendars', async () => {
        mockApiResponse({ entries: [{ calendar: { api_id: 'cal_1', name: 'Tech Events' } }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'list_calendars', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).entries).toHaveLength(1);
    });
});

describe('create_calendar', () => {
    it('creates calendar', async () => {
        mockApiResponse({ api_id: 'cal_new', name: 'My Calendar' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'create_calendar', arguments: { name: 'My Calendar' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).api_id).toBe('cal_new');
    });

    it('errors without name', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'create_calendar', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_person', () => {
    it('returns person by email', async () => {
        mockApiResponse({ api_id: 'ppl_1', email: 'alice@example.com' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'get_person', arguments: { email: 'alice@example.com' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).email).toBe('alice@example.com');
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('email='), expect.any(Object));
    });
});

describe('unknown tool', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'bad_tool', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});
