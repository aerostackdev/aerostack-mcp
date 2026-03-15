import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ────────────────────────────────────────────────────────────────

const API_KEY = 'cal_live_test_key_abc123';

// ── Mock data ────────────────────────────────────────────────────────────────

const mockEventType = {
    id: 1,
    title: 'Test Event',
    slug: 'test-event',
    length: 30,
    description: 'A test event type',
};

const mockBooking = {
    uid: 'booking-uid-abc123',
    title: 'Test Meeting',
    start: '2024-08-13T10:00:00Z',
    end: '2024-08-13T10:30:00Z',
    status: 'accepted',
    attendees: [{ name: 'Alice Smith', email: 'alice@example.com', timeZone: 'UTC' }],
};

const mockMe = {
    id: 42,
    name: 'Test User',
    email: 'test@example.com',
    timeZone: 'UTC',
    weekStart: 'Monday',
    timeFormat: 24,
};

const mockSchedule = {
    id: 10,
    name: 'Working Hours',
    timeZone: 'America/New_York',
    isDefault: true,
};

const mockSlots = {
    slots: {
        '2024-08-13': [
            { time: '2024-08-13T09:00:00Z' },
            { time: '2024-08-13T09:30:00Z' },
        ],
        '2024-08-14': [
            { time: '2024-08-14T10:00:00Z' },
        ],
    },
};

const mockBusy = {
    busy: [
        { start: '2024-08-13T09:00:00Z', end: '2024-08-13T10:00:00Z', title: 'Existing meeting' },
    ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function calOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify({ status: 'success', data }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function calOkRaw(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function calErr(message: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ status: 'error', message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function cal204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function makeReq(method: string, params?: unknown, omitToken = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!omitToken) headers['X-Mcp-Secret-CAL-COM-API-KEY'] = API_KEY;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(toolName: string, args: Record<string, unknown> = {}, omitToken = false) {
    return makeReq('tools/call', { name: toolName, arguments: args }, omitToken);
}

async function callTool(toolName: string, args: Record<string, unknown> = {}, omitToken = false) {
    const req = makeToolReq(toolName, args, omitToken);
    const res = await worker.fetch(req);
    return res.json() as Promise<{
        jsonrpc: string;
        id: number;
        result?: { content: [{ type: string; text: string }] };
        error?: { code: number; message: string };
    }>;
}

async function getToolResult(toolName: string, args: Record<string, unknown> = {}) {
    const body = await callTool(toolName, args);
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    return JSON.parse(body.result!.content[0].text);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('protocol', () => {
    it('GET health check returns ok', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        expect(res.status).toBe(200);
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-cal-com');
        expect(body.tools).toBe(15);
    });

    it('initialize returns server info', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { protocolVersion: string; serverInfo: { name: string } }
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-cal-com');
    });

    it('tools/list returns exactly 15 tools', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(15);
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq('unknown/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('missing auth token returns -32001', async () => {
        const body = await callTool('get_me', {}, true);
        expect(body.error?.code).toBe(-32001);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });
});

// ── Event Types ───────────────────────────────────────────────────────────────

describe('event types', () => {
    it('list_event_types happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk([mockEventType]));
        const result = await getToolResult('list_event_types');
        expect(result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cal.com/v2/event-types',
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${API_KEY}`,
                    'cal-api-version': '2024-08-13',
                }),
            }),
        );
    });

    it('get_event_type happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk(mockEventType));
        const result = await getToolResult('get_event_type', { event_type_id: 1 });
        expect(result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cal.com/v2/event-types/1',
            expect.anything(),
        );
    });

    it('get_event_type missing event_type_id returns error', async () => {
        const body = await callTool('get_event_type', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('event_type_id');
    });

    it('create_event_type happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk(mockEventType));
        const result = await getToolResult('create_event_type', {
            title: 'Test Event',
            slug: 'test-event',
            length: 30,
            description: 'A test event type',
        });
        expect(result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cal.com/v2/event-types',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('create_event_type missing required params returns error', async () => {
        const body = await callTool('create_event_type', { title: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('slug');
    });

    it('delete_event_type happy path — mock 204 returns {}', async () => {
        mockFetch.mockReturnValueOnce(cal204());
        const result = await getToolResult('delete_event_type', { event_type_id: 1 });
        expect(result).toEqual({});
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cal.com/v2/event-types/1',
            expect.objectContaining({ method: 'DELETE' }),
        );
    });

    it('delete_event_type missing event_type_id returns error', async () => {
        const body = await callTool('delete_event_type', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('event_type_id');
    });
});

// ── Bookings ──────────────────────────────────────────────────────────────────

describe('bookings', () => {
    it('list_bookings happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk({ bookings: [mockBooking] }));
        const result = await getToolResult('list_bookings');
        expect(result).toBeDefined();
    });

    it('list_bookings with filters', async () => {
        mockFetch.mockReturnValueOnce(calOk({ bookings: [] }));
        await getToolResult('list_bookings', {
            take: 10,
            skip: 5,
            status: 'upcoming',
            attendee_email: 'alice@example.com',
        });
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('take=10');
        expect(calledUrl).toContain('skip=5');
        expect(calledUrl).toContain('status=upcoming');
        expect(calledUrl).toContain('attendeeEmail=alice%40example.com');
    });

    it('get_booking happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk(mockBooking));
        const result = await getToolResult('get_booking', { booking_uid: 'booking-uid-abc123' });
        expect(result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cal.com/v2/bookings/booking-uid-abc123',
            expect.anything(),
        );
    });

    it('get_booking missing booking_uid returns error', async () => {
        const body = await callTool('get_booking', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('booking_uid');
    });

    it('create_booking happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk(mockBooking));
        const result = await getToolResult('create_booking', {
            event_type_id: 1,
            start: '2024-08-13T10:00:00Z',
            attendee_name: 'Alice Smith',
            attendee_email: 'alice@example.com',
            attendee_time_zone: 'UTC',
        });
        expect(result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cal.com/v2/bookings',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('create_booking missing required params returns error', async () => {
        const body = await callTool('create_booking', { event_type_id: 1 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('start');
    });

    it('reschedule_booking happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk(mockBooking));
        const result = await getToolResult('reschedule_booking', {
            booking_uid: 'booking-uid-abc123',
            start: '2024-08-14T11:00:00Z',
            rescheduled_reason: 'Schedule conflict',
        });
        expect(result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cal.com/v2/bookings/booking-uid-abc123/reschedule',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('reschedule_booking missing booking_uid returns error', async () => {
        const body = await callTool('reschedule_booking', { start: '2024-08-14T11:00:00Z' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('booking_uid');
    });

    it('cancel_booking happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk({ status: 'cancelled' }));
        const result = await getToolResult('cancel_booking', {
            booking_uid: 'booking-uid-abc123',
            cancellation_reason: 'No longer needed',
        });
        expect(result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cal.com/v2/bookings/booking-uid-abc123/cancel',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('cancel_booking missing booking_uid returns error', async () => {
        const body = await callTool('cancel_booking', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('booking_uid');
    });

    it('mark_no_show happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk({ noShowHost: true }));
        const result = await getToolResult('mark_no_show', { booking_uid: 'booking-uid-abc123' });
        expect(result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cal.com/v2/bookings/booking-uid-abc123/no-show',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('mark_no_show missing booking_uid returns error', async () => {
        const body = await callTool('mark_no_show', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('booking_uid');
    });
});

// ── Availability ──────────────────────────────────────────────────────────────

describe('availability', () => {
    it('get_availability happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk(mockSlots));
        const result = await getToolResult('get_availability', {
            event_type_id: 1,
            start_time: '2024-08-13T00:00:00Z',
            end_time: '2024-08-20T23:59:59Z',
        });
        expect(result).toBeDefined();
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/slots/available');
        expect(calledUrl).toContain('eventTypeId=1');
        expect(calledUrl).toContain('timeZone=UTC');
    });

    it('get_availability with custom time zone', async () => {
        mockFetch.mockReturnValueOnce(calOk(mockSlots));
        await getToolResult('get_availability', {
            event_type_id: 1,
            start_time: '2024-08-13T00:00:00Z',
            end_time: '2024-08-20T23:59:59Z',
            time_zone: 'America/New_York',
        });
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('timeZone=America%2FNew_York');
    });

    it('get_availability missing required params returns error', async () => {
        const body = await callTool('get_availability', { event_type_id: 1 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('start_time');
    });

    it('get_busy_times happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk(mockBusy));
        const result = await getToolResult('get_busy_times', {
            user_id: 42,
            date_from: '2024-08-13',
            date_to: '2024-08-20',
        });
        expect(result).toBeDefined();
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/busy');
        expect(calledUrl).toContain('userId=42');
    });

    it('get_busy_times missing user_id returns error', async () => {
        const body = await callTool('get_busy_times', {
            date_from: '2024-08-13',
            date_to: '2024-08-20',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('user_id');
    });

    it('list_schedules happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk([mockSchedule]));
        const result = await getToolResult('list_schedules');
        expect(result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cal.com/v2/schedules',
            expect.anything(),
        );
    });
});

// ── Users & Me ────────────────────────────────────────────────────────────────

describe('users & me', () => {
    it('get_me happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk(mockMe));
        const result = await getToolResult('get_me');
        expect(result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cal.com/v2/me',
            expect.anything(),
        );
    });

    it('update_me happy path', async () => {
        mockFetch.mockReturnValueOnce(calOk({ ...mockMe, timeZone: 'America/Chicago' }));
        const result = await getToolResult('update_me', {
            time_zone: 'America/Chicago',
            week_start: 'Monday',
        });
        expect(result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.cal.com/v2/me',
            expect.objectContaining({ method: 'PATCH' }),
        );
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('error handling', () => {
    it('Cal.com API error propagates correctly', async () => {
        mockFetch.mockReturnValueOnce(calErr('Event type not found', 404));
        const body = await callTool('get_event_type', { event_type_id: 9999 });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('404');
    });

    it('unknown tool name returns error', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Unknown tool');
    });

    it('invalid JSON body returns parse error', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-CAL-COM-API-KEY': API_KEY,
            },
            body: 'not valid json {',
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });
});

// ── E2E (skipped — require live Cal.com credentials) ─────────────────────────

describe.skip('E2E: live Cal.com API', () => {
    const LIVE_TOKEN = process.env['CAL_COM_API_KEY'] ?? '';

    it('E2E: get_me returns authenticated user', async () => {
        const res = await fetch('https://api.cal.com/v2/me', {
            headers: {
                'Authorization': `Bearer ${LIVE_TOKEN}`,
                'cal-api-version': '2024-08-13',
            },
        });
        expect(res.ok).toBe(true);
        const body = await res.json() as { status: string };
        expect(body.status).toBe('success');
    });

    it('E2E: list_event_types returns array', async () => {
        const res = await fetch('https://api.cal.com/v2/event-types', {
            headers: {
                'Authorization': `Bearer ${LIVE_TOKEN}`,
                'cal-api-version': '2024-08-13',
            },
        });
        expect(res.ok).toBe(true);
    });

    it('E2E: list_bookings returns bookings', async () => {
        const res = await fetch('https://api.cal.com/v2/bookings?take=5', {
            headers: {
                'Authorization': `Bearer ${LIVE_TOKEN}`,
                'cal-api-version': '2024-08-13',
            },
        });
        expect(res.ok).toBe(true);
    });
});
