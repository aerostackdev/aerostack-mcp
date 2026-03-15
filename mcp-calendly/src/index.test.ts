import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ────────────────────────────────────────────────────────────────

const TOKEN = 'test_calendly_token_abc123';
const USER_URI = 'https://api.calendly.com/users/ABC123';
const ORG_URI = 'https://api.calendly.com/organizations/ORG456';

// ── Mock data ────────────────────────────────────────────────────────────────

const mockUser = {
    uri: USER_URI,
    name: 'Jane Doe',
    email: 'jane@example.com',
    scheduling_url: 'https://calendly.com/jane-doe',
    timezone: 'America/New_York',
    avatar_url: null,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    current_organization: ORG_URI,
};

const mockOrganization = {
    uri: ORG_URI,
    name: 'Acme Corp',
    plan: 'teams',
    stage: 'paid',
    created_at: '2022-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
};

const mockEventType = {
    uri: 'https://api.calendly.com/event_types/ET001',
    name: '30 Minute Meeting',
    active: true,
    slug: '30min',
    scheduling_url: 'https://calendly.com/jane-doe/30min',
    duration: 30,
    kind: 'solo',
    pooling_type: null,
    type: 'StandardEventType',
    color: '#0069FF',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    description_plain: 'A 30 minute meeting',
    description_html: '<p>A 30 minute meeting</p>',
    profile: { type: 'User', name: 'Jane Doe', owner: USER_URI },
    secret: false,
    booking_method: 'instant',
    custom_questions: [],
    deleted_at: null,
};

const mockScheduledEvent = {
    uri: 'https://api.calendly.com/scheduled_events/EV001',
    name: '30 Minute Meeting',
    status: 'active',
    start_time: '2024-03-15T14:00:00Z',
    end_time: '2024-03-15T14:30:00Z',
    event_type: 'https://api.calendly.com/event_types/ET001',
    location: { type: 'zoom', join_url: 'https://zoom.us/j/123456' },
    invitees_counter: { total: 1, active: 1, limit: 1 },
    created_at: '2024-03-10T09:00:00Z',
    updated_at: '2024-03-10T09:00:00Z',
    event_memberships: [{ user: USER_URI, user_name: 'Jane Doe', user_email: 'jane@example.com', user_slug: 'jane-doe' }],
    calendar_event: { kind: 'google', external_id: 'cal123' },
};

const mockInvitee = {
    uri: 'https://api.calendly.com/invitees/INV001',
    email: 'bob@client.com',
    name: 'Bob Smith',
    status: 'active',
    timezone: 'America/Chicago',
    created_at: '2024-03-10T09:00:00Z',
    updated_at: '2024-03-10T09:00:00Z',
    event: 'https://api.calendly.com/scheduled_events/EV001',
    text_reminder_number: null,
    rescheduled: false,
    old_invitee: null,
    new_invitee: null,
    cancel_url: 'https://calendly.com/cancellations/INV001',
    reschedule_url: 'https://calendly.com/reschedulings/INV001',
    questions_and_answers: [{ question: 'What is your goal?', answer: 'Learn more about the product', position: 0 }],
    routing_form_submission: null,
};

const mockWebhook = {
    uri: 'https://api.calendly.com/webhook_subscriptions/WH001',
    callback_url: 'https://myapp.com/webhooks/calendly',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    retry_started_at: null,
    state: 'active',
    events: ['invitee.created', 'invitee.canceled'],
    scope: 'organization',
    organization: ORG_URI,
    user: null,
    creator: USER_URI,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function calendlyOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function calendlyErr(message: string, status = 422) {
    return Promise.resolve(new Response(JSON.stringify({ message, title: 'Error' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function calendlyNoContent() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

/**
 * Returns a mock fetch response that first returns user /me data, then a
 * second response for the actual API call. This handles tools that auto-fetch
 * the current user URI.
 */
function withUserMe(secondResponse: Promise<Response>) {
    mockFetch
        .mockReturnValueOnce(calendlyOk({ resource: mockUser }))
        .mockReturnValueOnce(secondResponse);
}

function makeReq(method: string, params?: unknown, noToken = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!noToken) headers['X-Mcp-Secret-CALENDLY-API-TOKEN'] = TOKEN;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(toolName: string, args: Record<string, unknown> = {}, noToken = false) {
    return makeReq('tools/call', { name: toolName, arguments: args }, noToken);
}

async function callWorkerTool(toolName: string, args: Record<string, unknown> = {}, noToken = false) {
    const req = makeToolReq(toolName, args, noToken);
    const res = await worker.fetch(req);
    return res.json() as Promise<{
        jsonrpc: string;
        id: number;
        result?: { content: [{ type: string; text: string }] };
        error?: { code: number; message: string };
    }>;
}

async function getToolResult(toolName: string, args: Record<string, unknown> = {}) {
    const body = await callWorkerTool(toolName, args);
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    return JSON.parse(body.result!.content[0].text);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-calendly and tools 15', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-calendly');
        expect(body.tools).toBe(15);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json{{{',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-calendly');
    });

    it('tools/list returns exactly 15 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(15);
        for (const tool of body.result.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
        }
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq('unknown/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('notifications/initialized returns ok', async () => {
        const req = makeReq('notifications/initialized');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: unknown };
        expect(body.result).toBeDefined();
    });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing token returns -32001 with helpful message', async () => {
        const body = await callWorkerTool('get_current_user', {}, true);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('CALENDLY_API_TOKEN');
    });

    it('Calendly 401 maps to Authentication failed message', async () => {
        mockFetch.mockReturnValueOnce(calendlyErr('Unauthorized', 401));
        const body = await callWorkerTool('get_current_user');
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Authentication failed');
    });

    it('Calendly 403 maps to Permission denied message', async () => {
        mockFetch.mockReturnValueOnce(calendlyErr('Forbidden', 403));
        const body = await callWorkerTool('get_current_user');
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Permission denied');
    });

    it('Calendly 404 maps to Not found message', async () => {
        mockFetch.mockReturnValueOnce(calendlyErr('Not found', 404));
        const body = await callWorkerTool('get_event_type', { event_type_uuid: 'missing' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Not found');
    });

    it('auth header uses Bearer token format', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ resource: mockUser }));
        await callWorkerTool('get_current_user');
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });
});

// ── User & Organization ────────────────────────────────────────────────────────

describe('get_current_user', () => {
    it('returns shaped user with uri, uuid, name, email, timezone, org fields', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ resource: mockUser }));
        const result = await getToolResult('get_current_user');
        expect(result.uri).toBe(USER_URI);
        expect(result.uuid).toBe('ABC123');
        expect(result.name).toBe('Jane Doe');
        expect(result.email).toBe('jane@example.com');
        expect(result.timezone).toBe('America/New_York');
        expect(result.current_organization).toBe(ORG_URI);
        expect(result.org_uuid).toBe('ORG456');
        expect(result.scheduling_url).toBe('https://calendly.com/jane-doe');
    });

    it('calls GET /users/me endpoint', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ resource: mockUser }));
        await getToolResult('get_current_user');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/users/me');
    });
});

describe('get_organization', () => {
    it('with explicit uuid returns org details', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ resource: mockOrganization }));
        const result = await getToolResult('get_organization', { organization_uuid: 'ORG456' });
        expect(result.uri).toBe(ORG_URI);
        expect(result.uuid).toBe('ORG456');
        expect(result.name).toBe('Acme Corp');
        expect(result.plan).toBe('teams');
    });

    it('without uuid fetches /users/me first then org', async () => {
        mockFetch
            .mockReturnValueOnce(calendlyOk({ resource: mockUser }))
            .mockReturnValueOnce(calendlyOk({ resource: mockOrganization }));
        const result = await getToolResult('get_organization');
        expect(result.name).toBe('Acme Corp');
        expect(mockFetch).toHaveBeenCalledTimes(2);
        const firstUrl = mockFetch.mock.calls[0][0] as string;
        expect(firstUrl).toContain('/users/me');
    });
});

// ── Event Types ────────────────────────────────────────────────────────────────

describe('list_event_types', () => {
    it('returns shaped array of event types', async () => {
        withUserMe(calendlyOk({ collection: [mockEventType] }));
        const result = await getToolResult('list_event_types');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].uuid).toBe('ET001');
        expect(result[0].name).toBe('30 Minute Meeting');
        expect(result[0].duration).toBe(30);
        expect(result[0].kind).toBe('solo');
        expect(result[0].scheduling_url).toBeTruthy();
    });

    it('with user_uri provided does not call /users/me', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ collection: [mockEventType] }));
        await getToolResult('list_event_types', { user_uri: USER_URI });
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('user=');
    });

    it('default count is 20 in query params', async () => {
        withUserMe(calendlyOk({ collection: [] }));
        await getToolResult('list_event_types');
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('count=20');
    });

    it('custom count is passed as query param', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ collection: [] }));
        await getToolResult('list_event_types', { user_uri: USER_URI, count: 50 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('count=50');
    });
});

describe('get_event_type', () => {
    it('returns full event type details', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ resource: mockEventType }));
        const result = await getToolResult('get_event_type', { event_type_uuid: 'ET001' });
        expect(result.uuid).toBe('ET001');
        expect(result.name).toBe('30 Minute Meeting');
        expect(result.duration).toBe(30);
        expect(result.description_plain).toBe('A 30 minute meeting');
        expect(result.booking_method).toBe('instant');
        expect(Array.isArray(result.custom_questions)).toBe(true);
    });

    it('missing event_type_uuid returns validation error', async () => {
        const body = await callWorkerTool('get_event_type', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('event_type_uuid');
    });

    it('calls correct API path', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ resource: mockEventType }));
        await getToolResult('get_event_type', { event_type_uuid: 'ET001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/event_types/ET001');
    });
});

describe('get_event_type_availability', () => {
    it('returns available time slots', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({
            collection: [
                { status: 'available', start_time: '2024-03-15T14:00:00Z', invitees_remaining: 1 },
                { status: 'available', start_time: '2024-03-15T14:30:00Z', invitees_remaining: 1 },
            ],
        }));
        const result = await getToolResult('get_event_type_availability', {
            event_type_uri: 'https://api.calendly.com/event_types/ET001',
            start_time: '2024-03-15T00:00:00Z',
            end_time: '2024-03-16T00:00:00Z',
        });
        expect(result.available_times).toHaveLength(2);
        expect(result.available_times[0].status).toBe('available');
        expect(result.available_times[0].start_time).toBe('2024-03-15T14:00:00Z');
        expect(result.available_times[0].invitees_remaining).toBe(1);
    });

    it('missing event_type_uri returns validation error', async () => {
        const body = await callWorkerTool('get_event_type_availability', {
            start_time: '2024-03-15T00:00:00Z',
            end_time: '2024-03-16T00:00:00Z',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('event_type_uri');
    });

    it('missing start_time returns validation error', async () => {
        const body = await callWorkerTool('get_event_type_availability', {
            event_type_uri: 'https://api.calendly.com/event_types/ET001',
            end_time: '2024-03-16T00:00:00Z',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('start_time');
    });

    it('calls event_type_available_times endpoint with correct params', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ collection: [] }));
        await getToolResult('get_event_type_availability', {
            event_type_uri: 'https://api.calendly.com/event_types/ET001',
            start_time: '2024-03-15T00:00:00Z',
            end_time: '2024-03-16T00:00:00Z',
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('event_type_available_times');
        expect(url).toContain('event_type=');
        expect(url).toContain('start_time=');
        expect(url).toContain('end_time=');
    });
});

// ── Scheduled Events ──────────────────────────────────────────────────────────

describe('list_scheduled_events', () => {
    it('returns shaped array of events', async () => {
        withUserMe(calendlyOk({ collection: [mockScheduledEvent] }));
        const result = await getToolResult('list_scheduled_events');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].uuid).toBe('EV001');
        expect(result[0].name).toBe('30 Minute Meeting');
        expect(result[0].status).toBe('active');
        expect(result[0].start_time).toBe('2024-03-15T14:00:00Z');
        expect(result[0].location).toBeDefined();
        expect(result[0].invitees_counter).toBeDefined();
    });

    it('default status is active in query params', async () => {
        withUserMe(calendlyOk({ collection: [] }));
        await getToolResult('list_scheduled_events');
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('status=active');
    });

    it('min_start_time param is passed if provided', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ collection: [] }));
        await getToolResult('list_scheduled_events', {
            user_uri: USER_URI,
            min_start_time: '2024-01-01T00:00:00Z',
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('min_start_time=');
    });

    it('max_start_time param is passed if provided', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ collection: [] }));
        await getToolResult('list_scheduled_events', {
            user_uri: USER_URI,
            max_start_time: '2024-12-31T23:59:59Z',
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('max_start_time=');
    });

    it('with user_uri does not call /users/me', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ collection: [] }));
        await getToolResult('list_scheduled_events', { user_uri: USER_URI });
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});

describe('get_scheduled_event', () => {
    it('returns full event details with memberships', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ resource: mockScheduledEvent }));
        const result = await getToolResult('get_scheduled_event', { event_uuid: 'EV001' });
        expect(result.uuid).toBe('EV001');
        expect(result.name).toBe('30 Minute Meeting');
        expect(result.status).toBe('active');
        expect(result.event_memberships).toHaveLength(1);
        expect(result.calendar_event).toBeDefined();
    });

    it('missing event_uuid returns validation error', async () => {
        const body = await callWorkerTool('get_scheduled_event', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('event_uuid');
    });
});

describe('list_event_invitees', () => {
    it('returns shaped array of invitees', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ collection: [mockInvitee] }));
        const result = await getToolResult('list_event_invitees', { event_uuid: 'EV001' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].uuid).toBe('INV001');
        expect(result[0].email).toBe('bob@client.com');
        expect(result[0].name).toBe('Bob Smith');
        expect(result[0].status).toBe('active');
        expect(result[0].questions_and_answers).toHaveLength(1);
    });

    it('missing event_uuid returns validation error', async () => {
        const body = await callWorkerTool('list_event_invitees', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('event_uuid');
    });

    it('calls correct endpoint with event uuid', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ collection: [] }));
        await getToolResult('list_event_invitees', { event_uuid: 'EV001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/scheduled_events/EV001/invitees');
    });
});

describe('cancel_event', () => {
    it('returns success with event_uuid and reason', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({
            resource: { canceler_type: 'host', reason: 'Custom reason', created_at: '2024-03-15T10:00:00Z' },
        }));
        const result = await getToolResult('cancel_event', {
            event_uuid: 'EV001',
            reason: 'Schedule conflict',
        });
        expect(result.success).toBe(true);
        expect(result.event_uuid).toBe('EV001');
        expect(result.reason).toBe('Schedule conflict');
    });

    it('uses default reason if not provided', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ resource: {} }));
        await getToolResult('cancel_event', { event_uuid: 'EV001' });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { reason: string };
        expect(reqBody.reason).toBe('Cancelled via MCP');
    });

    it('calls POST /cancellation endpoint', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ resource: {} }));
        await getToolResult('cancel_event', { event_uuid: 'EV001' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/scheduled_events/EV001/cancellation');
        expect(call[1].method).toBe('POST');
    });

    it('missing event_uuid returns validation error', async () => {
        const body = await callWorkerTool('cancel_event', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('event_uuid');
    });
});

describe('get_invitee', () => {
    it('returns full invitee details', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ resource: mockInvitee }));
        const result = await getToolResult('get_invitee', { invitee_uuid: 'INV001' });
        expect(result.uuid).toBe('INV001');
        expect(result.email).toBe('bob@client.com');
        expect(result.name).toBe('Bob Smith');
        expect(result.cancel_url).toBe('https://calendly.com/cancellations/INV001');
        expect(result.reschedule_url).toBe('https://calendly.com/reschedulings/INV001');
        expect(result.questions_and_answers).toHaveLength(1);
    });

    it('missing invitee_uuid returns validation error', async () => {
        const body = await callWorkerTool('get_invitee', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('invitee_uuid');
    });

    it('calls /invitees/{uuid} endpoint', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ resource: mockInvitee }));
        await getToolResult('get_invitee', { invitee_uuid: 'INV001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/invitees/INV001');
    });
});

// ── Scheduling Links ──────────────────────────────────────────────────────────

describe('create_scheduling_link', () => {
    it('returns booking_url and owner details', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({
            resource: {
                booking_url: 'https://calendly.com/jane-doe/30min?token=abc',
                owner: 'https://api.calendly.com/event_types/ET001',
                owner_type: 'EventType',
            },
        }));
        const result = await getToolResult('create_scheduling_link', {
            event_type_uri: 'https://api.calendly.com/event_types/ET001',
        });
        expect(result.booking_url).toContain('calendly.com');
        expect(result.owner_type).toBe('EventType');
        expect(result.max_event_count).toBe(1);
    });

    it('passes max_event_count and period_type to API', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({
            resource: {
                booking_url: 'https://calendly.com/jane-doe/30min?token=xyz',
                owner: 'https://api.calendly.com/event_types/ET001',
                owner_type: 'EventType',
            },
        }));
        await getToolResult('create_scheduling_link', {
            event_type_uri: 'https://api.calendly.com/event_types/ET001',
            max_event_count: 3,
            period_type: 'rolling',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as {
            max_event_count: number;
            period_type: string;
            owner_type: string;
        };
        expect(reqBody.max_event_count).toBe(3);
        expect(reqBody.period_type).toBe('rolling');
        expect(reqBody.owner_type).toBe('EventType');
    });

    it('missing event_type_uri returns validation error', async () => {
        const body = await callWorkerTool('create_scheduling_link', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('event_type_uri');
    });
});

describe('list_scheduling_links', () => {
    it('returns array of scheduling links', async () => {
        withUserMe(calendlyOk({
            collection: [{
                booking_url: 'https://calendly.com/jane-doe/30min?token=abc',
                owner: USER_URI,
                owner_type: 'User',
            }],
        }));
        const result = await getToolResult('list_scheduling_links');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].booking_url).toContain('calendly.com');
        expect(result[0].owner_type).toBe('User');
    });

    it('with user_uri does not call /users/me', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ collection: [] }));
        await getToolResult('list_scheduling_links', { user_uri: USER_URI });
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});

// ── Webhooks ──────────────────────────────────────────────────────────────────

describe('list_webhooks', () => {
    it('returns shaped array of webhooks', async () => {
        mockFetch
            .mockReturnValueOnce(calendlyOk({ resource: mockUser }))
            .mockReturnValueOnce(calendlyOk({ collection: [mockWebhook] }));
        const result = await getToolResult('list_webhooks');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].uuid).toBe('WH001');
        expect(result[0].callback_url).toBe('https://myapp.com/webhooks/calendly');
        expect(result[0].state).toBe('active');
        expect(result[0].events).toContain('invitee.created');
    });

    it('with explicit org_uri does not call /users/me', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({ collection: [mockWebhook] }));
        await getToolResult('list_webhooks', { org_uri: ORG_URI });
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('organization=');
        expect(url).toContain('scope=organization');
    });
});

describe('create_webhook', () => {
    it('returns created webhook details', async () => {
        mockFetch
            .mockReturnValueOnce(calendlyOk({ resource: mockUser }))
            .mockReturnValueOnce(calendlyOk({
                resource: {
                    uri: 'https://api.calendly.com/webhook_subscriptions/WH002',
                    callback_url: 'https://myapp.com/new-webhook',
                    created_at: '2024-03-15T10:00:00Z',
                    updated_at: '2024-03-15T10:00:00Z',
                    state: 'active',
                    events: ['invitee.created'],
                    scope: 'organization',
                    organization: ORG_URI,
                },
            }));
        const result = await getToolResult('create_webhook', {
            url: 'https://myapp.com/new-webhook',
            events: ['invitee.created'],
        });
        expect(result.uuid).toBe('WH002');
        expect(result.callback_url).toBe('https://myapp.com/new-webhook');
        expect(result.state).toBe('active');
        expect(result.events).toContain('invitee.created');
    });

    it('passes signing_key if provided', async () => {
        mockFetch
            .mockReturnValueOnce(calendlyOk({ resource: mockUser }))
            .mockReturnValueOnce(calendlyOk({
                resource: {
                    uri: 'https://api.calendly.com/webhook_subscriptions/WH003',
                    callback_url: 'https://myapp.com/webhook',
                    created_at: '2024-03-15T10:00:00Z',
                    updated_at: '2024-03-15T10:00:00Z',
                    state: 'active',
                    events: ['invitee.created'],
                    scope: 'organization',
                    organization: ORG_URI,
                },
            }));
        await getToolResult('create_webhook', {
            url: 'https://myapp.com/webhook',
            events: ['invitee.created'],
            signing_key: 'my-secret-key',
        });
        const call = mockFetch.mock.calls[1];
        const reqBody = JSON.parse(call[1].body as string) as { signing_key?: string };
        expect(reqBody.signing_key).toBe('my-secret-key');
    });

    it('with explicit organization does not call /users/me', async () => {
        mockFetch.mockReturnValueOnce(calendlyOk({
            resource: {
                uri: 'https://api.calendly.com/webhook_subscriptions/WH004',
                callback_url: 'https://myapp.com/webhook',
                created_at: '2024-03-15T10:00:00Z',
                updated_at: '2024-03-15T10:00:00Z',
                state: 'active',
                events: ['invitee.created'],
                scope: 'organization',
                organization: ORG_URI,
            },
        }));
        await getToolResult('create_webhook', {
            url: 'https://myapp.com/webhook',
            events: ['invitee.created'],
            organization: ORG_URI,
        });
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('missing url returns validation error', async () => {
        const body = await callWorkerTool('create_webhook', { events: ['invitee.created'] });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('url');
    });

    it('missing events returns validation error', async () => {
        const body = await callWorkerTool('create_webhook', { url: 'https://myapp.com/webhook' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('events');
    });
});

describe('delete_webhook', () => {
    it('returns success with deleted uuid', async () => {
        mockFetch.mockReturnValueOnce(calendlyNoContent());
        const result = await getToolResult('delete_webhook', { webhook_uuid: 'WH001' });
        expect(result.success).toBe(true);
        expect(result.deleted_uuid).toBe('WH001');
    });

    it('calls DELETE on the correct endpoint', async () => {
        mockFetch.mockReturnValueOnce(calendlyNoContent());
        await getToolResult('delete_webhook', { webhook_uuid: 'WH001' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/webhook_subscriptions/WH001');
        expect(call[1].method).toBe('DELETE');
    });

    it('missing webhook_uuid returns validation error', async () => {
        const body = await callWorkerTool('delete_webhook', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('webhook_uuid');
    });
});

// ── Unknown tool ──────────────────────────────────────────────────────────────

describe('Unknown tool', () => {
    it('unknown tool name returns error with message', async () => {
        const body = await callWorkerTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Unknown tool');
    });
});

// ── E2E (skipped — requires real CALENDLY_API_TOKEN) ─────────────────────────

describe.skip('E2E — requires real CALENDLY_API_TOKEN', () => {
    it('E2E: get_current_user returns real user data', async () => {
        // Set process.env.CALENDLY_API_TOKEN before running
    });

    it('E2E: list_event_types returns active event types', async () => {
        // Set process.env.CALENDLY_API_TOKEN before running
    });

    it('E2E: list_scheduled_events returns recent events', async () => {
        // Set process.env.CALENDLY_API_TOKEN before running
    });
});
