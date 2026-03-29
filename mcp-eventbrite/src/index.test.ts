import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TOKEN = 'test-eventbrite-token';
const AUTH_HEADERS = { 'X-Mcp-Secret-EVENTBRITE-TOKEN': TOKEN };

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
        const req = new Request('http://localhost/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
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

    it('tools/call without token returns -32001', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_organizations', arguments: {} } }));
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

describe('list_organizations', () => {
    it('returns organizations', async () => {
        mockApiResponse({ organizations: [{ id: 'org_1', name: 'Acme Events' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_organizations', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).organizations).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/users/me/organizations/'), expect.any(Object));
    });
});

describe('list_events', () => {
    it('returns events for org', async () => {
        mockApiResponse({ events: [{ id: 'evt_1', name: { text: 'Tech Summit' } }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'list_events', arguments: { organizationId: 'org_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).events).toHaveLength(1);
    });

    it('errors without organizationId', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'list_events', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_event', () => {
    it('returns event', async () => {
        mockApiResponse({ id: 'evt_1', name: { text: 'Tech Summit' } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'get_event', arguments: { eventId: 'evt_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('evt_1');
    });
});

describe('create_event', () => {
    it('creates event', async () => {
        mockApiResponse({ id: 'evt_new', name: { text: 'New Conference' } });
        const res = await worker.fetch(makeReq({
            jsonrpc: '2.0', id: 14, method: 'tools/call', params: {
                name: 'create_event', arguments: {
                    organizationId: 'org_1', name: 'New Conference',
                    startUtc: '2026-06-01T18:00:00Z', endUtc: '2026-06-01T21:00:00Z',
                    timezone: 'America/New_York', currency: 'USD',
                },
            },
        }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('evt_new');
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST' }));
    });

    it('errors without required fields', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'create_event', arguments: { organizationId: 'org_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('publish_event', () => {
    it('publishes event', async () => {
        mockApiResponse({ published: true });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'publish_event', arguments: { eventId: 'evt_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).published).toBe(true);
    });
});

describe('cancel_event', () => {
    it('cancels event', async () => {
        mockApiResponse({ cancelled: true });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'cancel_event', arguments: { eventId: 'evt_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).cancelled).toBe(true);
    });
});

describe('list_attendees', () => {
    it('returns attendees', async () => {
        mockApiResponse({ attendees: [{ id: 'att_1', profile: { name: 'Alice' } }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 18, method: 'tools/call', params: { name: 'list_attendees', arguments: { eventId: 'evt_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).attendees).toHaveLength(1);
    });
});

describe('list_orders', () => {
    it('returns orders', async () => {
        mockApiResponse({ orders: [{ id: 'ord_1', status: 'placed' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'list_orders', arguments: { eventId: 'evt_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).orders).toHaveLength(1);
    });
});

describe('get_event_summary', () => {
    it('returns summary', async () => {
        mockApiResponse({ tickets_sold: 100, gross: { value: 5000 } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'get_event_summary', arguments: { eventId: 'evt_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).tickets_sold).toBe(100);
    });
});

describe('unknown tool', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'bad_tool', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});
