import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}
function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ error: { message } }), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-GOOGLE-ACCESS-TOKEN': 'ya29.test_token',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-google-calendar', () => {
    describe('GET /health', () => {
        it('returns status ok', async () => {
            const req = new Request('http://localhost/health', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('google-calendar-mcp');
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('google-calendar-mcp');
            expect(body.result.serverInfo.version).toBe('1.0.0');
            expect(body.result.protocolVersion).toBe('2024-11-05');
        });
    });

    describe('tools/list', () => {
        it('returns exactly 7 tools', async () => {
            const res = await worker.fetch(makeReq('tools/list'));
            const body = await res.json() as any;
            expect(body.result.tools).toHaveLength(7);
            const names = body.result.tools.map((t: any) => t.name);
            expect(names).toContain('list_calendars');
            expect(names).toContain('list_events');
            expect(names).toContain('get_event');
            expect(names).toContain('create_event');
            expect(names).toContain('update_event');
            expect(names).toContain('delete_event');
            expect(names).toContain('quick_add');
        });
    });

    describe('unknown method', () => {
        it('returns -32601', async () => {
            const res = await worker.fetch(makeReq('unknown/method'));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32601);
        });
    });

    describe('missing auth secret', () => {
        it('returns -32001 when token missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_calendars', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('list_calendars', () => {
        it('happy path returns calendars', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                items: [{ id: 'primary', summary: 'Personal', primary: true, accessRole: 'owner' }]
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_calendars', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data).toHaveLength(1);
            expect(data[0].id).toBe('primary');
            expect(data[0].primary).toBe(true);
        });

        it('returns -32603 on Google 401 invalid auth', async () => {
            mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
                JSON.stringify({ error: { code: 401, message: 'Request had invalid authentication credentials', status: 'UNAUTHENTICATED' } }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            )));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_calendars', arguments: {} }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });

        it('returns -32603 on 403 forbidden', async () => {
            mockFetch.mockReturnValueOnce(apiErr(403, 'Access denied'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_calendars', arguments: {} }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('list_events', () => {
        it('happy path returns events', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                items: [{ id: 'evt_1', summary: 'Team standup', start: { dateTime: '2024-01-15T09:00:00Z' }, end: { dateTime: '2024-01-15T09:30:00Z' }, status: 'confirmed' }]
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_events', arguments: { calendarId: 'primary' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data[0].id).toBe('evt_1');
            expect(data[0].summary).toBe('Team standup');
        });

        it('returns -32603 on API error', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'Calendar not found'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_events', arguments: { calendarId: 'bad_cal' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('get_event', () => {
        it('happy path returns event details', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                id: 'evt_1', summary: 'Team standup', description: 'Daily sync',
                start: { dateTime: '2024-01-15T09:00:00Z' }, end: { dateTime: '2024-01-15T09:30:00Z' }, attendees: []
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_event', arguments: { calendarId: 'primary', eventId: 'evt_1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.id).toBe('evt_1');
            expect(data.description).toBe('Daily sync');
        });

        it('returns -32603 on 404', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'Event not found'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_event', arguments: { calendarId: 'primary', eventId: 'bad' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('create_event', () => {
        it('happy path creates event', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                id: 'evt_2', summary: 'New Meeting',
                start: { dateTime: '2024-01-16T10:00:00Z' }, end: { dateTime: '2024-01-16T11:00:00Z' }
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'create_event', arguments: {
                summary: 'New Meeting',
                startDateTime: '2024-01-16T10:00:00Z',
                endDateTime: '2024-01-16T11:00:00Z'
            }}));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.id).toBe('evt_2');
            expect(data.summary).toBe('New Meeting');
        });

        it('returns -32603 on Google 401 UNAUTHENTICATED', async () => {
            mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
                JSON.stringify({ error: { code: 401, message: 'Request had invalid authentication credentials', status: 'UNAUTHENTICATED' } }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            )));
            const res = await worker.fetch(makeReq('tools/call', { name: 'create_event', arguments: {
                summary: 'Test', startDateTime: '2024-01-16T10:00:00Z', endDateTime: '2024-01-16T11:00:00Z'
            }}));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });

        it('returns -32603 on 400 bad request', async () => {
            mockFetch.mockReturnValueOnce(apiErr(400, 'Invalid time format'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'create_event', arguments: {
                summary: 'Test', startDateTime: 'not-a-date', endDateTime: 'not-a-date'
            }}));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('update_event', () => {
        it('happy path updates event', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ id: 'evt_1', summary: 'Updated Meeting' }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'update_event', arguments: { eventId: 'evt_1', summary: 'Updated Meeting' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.summary).toBe('Updated Meeting');
        });

        it('returns -32603 on 404', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'Event not found'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'update_event', arguments: { eventId: 'bad', summary: 'X' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('delete_event', () => {
        it('happy path deletes event', async () => {
            mockFetch.mockReturnValueOnce(Promise.resolve(new Response(null, { status: 204 })));
            const res = await worker.fetch(makeReq('tools/call', { name: 'delete_event', arguments: { calendarId: 'primary', eventId: 'evt_1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.deleted).toBe(true);
            expect(data.eventId).toBe('evt_1');
        });

        it('returns -32603 on 404', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'Event not found'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'delete_event', arguments: { calendarId: 'primary', eventId: 'bad' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('quick_add', () => {
        it('happy path quick adds event', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ id: 'evt_3', summary: 'Lunch tomorrow at noon' }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'quick_add', arguments: { calendarId: 'primary', text: 'Lunch tomorrow at noon' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.id).toBe('evt_3');
            expect(data.summary).toBe('Lunch tomorrow at noon');
        });

        it('returns -32603 on API error', async () => {
            mockFetch.mockReturnValueOnce(apiErr(400, 'Cannot parse event text'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'quick_add', arguments: { text: '!!!' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe.skip('E2E', () => {
        it('list_calendars with real Google token', async () => {
            // Requires GOOGLE_ACCESS_TOKEN env var — skip in CI
        });
    });
});
