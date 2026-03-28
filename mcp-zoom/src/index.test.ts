import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCOUNT_ID = 'test_account_id_abc';
const CLIENT_ID = 'test_client_id_xyz';
const CLIENT_SECRET = 'test_client_secret_123';
const ACCESS_TOKEN = 'test_zoom_access_token_abc';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockTokenResponse = {
    access_token: ACCESS_TOKEN,
    token_type: 'bearer',
    expires_in: 3599,
};

const mockMeeting = {
    id: 123456789,
    uuid: 'a1b2c3d4e5f6==',
    topic: 'Q1 Planning Call',
    type: 2,
    start_time: '2026-04-01T14:00:00Z',
    duration: 60,
    timezone: 'America/New_York',
    agenda: 'Discuss Q1 roadmap',
    join_url: 'https://zoom.us/j/123456789',
    password: 'abc123',
};

const mockWebinar = {
    id: 987654321,
    uuid: 'w1e2b3i4n5a6==',
    topic: 'Product Launch Webinar',
    type: 5,
    start_time: '2026-04-15T18:00:00Z',
    duration: 90,
    registrants_count: 150,
};

const mockUser = {
    id: 'user_abc123',
    email: 'john@example.com',
    first_name: 'John',
    last_name: 'Doe',
    type: 2,
    status: 'active',
    job_title: 'Engineering Manager',
    dept: 'Engineering',
};

const mockParticipant = {
    id: 'participant_001',
    user_id: 'user_abc123',
    name: 'Jane Smith',
    email: 'jane@example.com',
    join_time: '2026-03-01T14:02:00Z',
    leave_time: '2026-03-01T15:01:00Z',
    duration: 3540,
};

const mockRecording = {
    id: 'recording_001',
    meeting_id: 'a1b2c3d4e5f6==',
    topic: 'Q1 Planning Call',
    start_time: '2026-03-01T14:00:00Z',
    recording_files: [
        {
            id: 'file_001',
            file_type: 'MP4',
            download_url: 'https://zoom.us/recording/download/file_001',
            play_url: 'https://zoom.us/recording/play/file_001',
            file_size: 104857600,
        },
    ],
};

const mockListResult = (meetings: unknown[]) => ({
    meetings,
    total_records: meetings.length,
    page_count: 1,
    page_number: 1,
    page_size: 30,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function apiErr(data: { message: string; code?: number }, status = 400) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

// mockFetch is called first for token exchange, then for API call
function setupMockWithToken(apiResponse: Promise<Response>) {
    mockFetch
        .mockReturnValueOnce(apiOk(mockTokenResponse))
        .mockReturnValueOnce(apiResponse);
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('accountId')) {
        headers['X-Mcp-Secret-ZOOM-ACCOUNT-ID'] = ACCOUNT_ID;
    }
    if (!missingSecrets.includes('clientId')) {
        headers['X-Mcp-Secret-ZOOM-CLIENT-ID'] = CLIENT_ID;
    }
    if (!missingSecrets.includes('clientSecret')) {
        headers['X-Mcp-Secret-ZOOM-CLIENT-SECRET'] = CLIENT_SECRET;
    }
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingSecrets);
}

async function callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    const req = makeToolReq(toolName, args, missingSecrets);
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

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-zoom and tools 21', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-zoom');
        expect(body.tools).toBe(21);
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
        const body = await res.json() as {
            result: { protocolVersion: string; serverInfo: { name: string } }
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-zoom');
    });

    it('tools/list returns all tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools.length).toBeGreaterThan(0);
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
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing accountId returns -32001 with ZOOM_ACCOUNT_ID in message', async () => {
        const body = await callTool('get_user', { user_id: 'me' }, ['accountId']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('ZOOM_ACCOUNT_ID');
    });

    it('missing clientId returns -32001 with ZOOM_CLIENT_ID in message', async () => {
        const body = await callTool('get_user', { user_id: 'me' }, ['clientId']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('ZOOM_CLIENT_ID');
    });

    it('missing clientSecret returns -32001 with ZOOM_CLIENT_SECRET in message', async () => {
        const body = await callTool('get_user', { user_id: 'me' }, ['clientSecret']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('ZOOM_CLIENT_SECRET');
    });

    it('missing all secrets returns -32001', async () => {
        const body = await callTool('get_user', { user_id: 'me' }, ['accountId', 'clientId', 'clientSecret']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('token exchange uses Basic auth with base64(client_id:client_secret)', async () => {
        setupMockWithToken(apiOk(mockUser));
        await callTool('get_user', { user_id: 'me' });
        const tokenCall = mockFetch.mock.calls[0];
        const expectedCreds = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
        expect(tokenCall[1].headers['Authorization']).toBe(`Basic ${expectedCreds}`);
    });

    it('API call uses Bearer token from token exchange', async () => {
        setupMockWithToken(apiOk(mockUser));
        await callTool('get_user', { user_id: 'me' });
        const apiCall = mockFetch.mock.calls[1];
        expect(apiCall[1].headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it('token exchange failure returns -32001 error', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ message: 'Invalid client credentials' }, 401));
        const body = await callTool('get_user', { user_id: 'me' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });
});

// ── Meetings ──────────────────────────────────────────────────────────────────

describe('list_meetings', () => {
    it('returns meeting list', async () => {
        setupMockWithToken(apiOk(mockListResult([mockMeeting])));
        const result = await getToolResult('list_meetings', {});
        expect(result.meetings).toHaveLength(1);
        expect(result.meetings[0].id).toBe(123456789);
    });

    it('passes type filter as query param', async () => {
        setupMockWithToken(apiOk(mockListResult([])));
        await callTool('list_meetings', { type: 'live' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('type=live');
    });

    it('passes page_size query param', async () => {
        setupMockWithToken(apiOk(mockListResult([])));
        await callTool('list_meetings', { page_size: 10 });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('page_size=10');
    });
});

describe('get_meeting', () => {
    it('returns meeting details', async () => {
        setupMockWithToken(apiOk(mockMeeting));
        const result = await getToolResult('get_meeting', { meeting_id: '123456789' });
        expect(result.id).toBe(123456789);
        expect(result.topic).toBe('Q1 Planning Call');
        expect(result.join_url).toBe('https://zoom.us/j/123456789');
    });

    it('missing meeting_id returns error', async () => {
        const body = await callTool('get_meeting', {});
        // No token call should happen since validation fails before API
        // But here validation happens inside callTool, so error is thrown
        expect(body.error).toBeDefined();
    });

    it('calls correct endpoint with meeting_id', async () => {
        setupMockWithToken(apiOk(mockMeeting));
        await callTool('get_meeting', { meeting_id: '123456789' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('/meetings/123456789');
    });
});

describe('create_meeting', () => {
    it('creates meeting and returns join_url', async () => {
        setupMockWithToken(apiOk(mockMeeting));
        const result = await getToolResult('create_meeting', {
            topic: 'Q1 Planning Call',
            start_time: '2026-04-01T14:00:00Z',
            duration_minutes: 60,
        });
        expect(result.join_url).toBe('https://zoom.us/j/123456789');
    });

    it('missing topic returns error', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenResponse));
        const body = await callTool('create_meeting', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('topic');
    });

    it('sends topic in POST body', async () => {
        setupMockWithToken(apiOk(mockMeeting));
        await callTool('create_meeting', { topic: 'Test Meeting' });
        const apiCall = mockFetch.mock.calls[1];
        const sentBody = JSON.parse(apiCall[1].body as string);
        expect(sentBody.topic).toBe('Test Meeting');
    });

    it('sets type=2 for scheduled meetings with start_time', async () => {
        setupMockWithToken(apiOk(mockMeeting));
        await callTool('create_meeting', { topic: 'Scheduled', start_time: '2026-04-01T14:00:00Z' });
        const apiCall = mockFetch.mock.calls[1];
        const sentBody = JSON.parse(apiCall[1].body as string);
        expect(sentBody.type).toBe(2);
    });

    it('sets type=1 for instant meetings without start_time', async () => {
        setupMockWithToken(apiOk(mockMeeting));
        await callTool('create_meeting', { topic: 'Instant Meeting' });
        const apiCall = mockFetch.mock.calls[1];
        const sentBody = JSON.parse(apiCall[1].body as string);
        expect(sentBody.type).toBe(1);
    });

    it('includes settings block when host_video specified', async () => {
        setupMockWithToken(apiOk(mockMeeting));
        await callTool('create_meeting', { topic: 'Test', host_video: true, waiting_room: true });
        const apiCall = mockFetch.mock.calls[1];
        const sentBody = JSON.parse(apiCall[1].body as string);
        expect(sentBody.settings.host_video).toBe(true);
        expect(sentBody.settings.waiting_room).toBe(true);
    });
});

describe('update_meeting', () => {
    it('sends PATCH to correct endpoint', async () => {
        setupMockWithToken(apiOk204());
        await callTool('update_meeting', { meeting_id: '123456789', topic: 'Updated Topic' });
        const apiCall = mockFetch.mock.calls[1];
        expect(apiCall[1].method).toBe('PATCH');
        expect(apiCall[0]).toContain('/meetings/123456789');
    });

    it('only sends provided fields', async () => {
        setupMockWithToken(apiOk204());
        await callTool('update_meeting', { meeting_id: '123456789', topic: 'New Topic' });
        const sentBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
        expect(sentBody.topic).toBe('New Topic');
        expect(sentBody.duration).toBeUndefined();
    });

    it('missing meeting_id returns error', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenResponse));
        const body = await callTool('update_meeting', { topic: 'Updated' });
        expect(body.error).toBeDefined();
    });
});

describe('delete_meeting', () => {
    it('sends DELETE to correct endpoint', async () => {
        setupMockWithToken(apiOk204());
        await callTool('delete_meeting', { meeting_id: '123456789' });
        const apiCall = mockFetch.mock.calls[1];
        expect(apiCall[1].method).toBe('DELETE');
        expect(apiCall[0]).toContain('/meetings/123456789');
    });

    it('missing meeting_id returns error', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenResponse));
        const body = await callTool('delete_meeting', {});
        expect(body.error).toBeDefined();
    });
});

describe('get_meeting_participants', () => {
    it('returns participant list', async () => {
        const response = { participants: [mockParticipant], total_records: 1 };
        setupMockWithToken(apiOk(response));
        const result = await getToolResult('get_meeting_participants', { meeting_id: 'a1b2c3d4==' });
        expect(result.participants).toHaveLength(1);
        expect(result.participants[0].name).toBe('Jane Smith');
    });

    it('calls past_meetings endpoint', async () => {
        setupMockWithToken(apiOk({ participants: [] }));
        await callTool('get_meeting_participants', { meeting_id: 'a1b2c3d4==' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('/past_meetings/');
        expect(url).toContain('/participants');
    });
});

describe('get_meeting_recordings', () => {
    it('returns recording data', async () => {
        setupMockWithToken(apiOk(mockRecording));
        const result = await getToolResult('get_meeting_recordings', { meeting_id: 'a1b2c3d4==' });
        expect(result.recording_files).toHaveLength(1);
        expect(result.recording_files[0].file_type).toBe('MP4');
    });

    it('calls recordings endpoint', async () => {
        setupMockWithToken(apiOk(mockRecording));
        await callTool('get_meeting_recordings', { meeting_id: '123456789' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('/meetings/123456789/recordings');
    });
});

describe('list_past_meetings', () => {
    it('returns past meeting list', async () => {
        setupMockWithToken(apiOk(mockListResult([mockMeeting])));
        const result = await getToolResult('list_past_meetings', {});
        expect(result.meetings).toHaveLength(1);
    });

    it('uses previous_meetings type filter', async () => {
        setupMockWithToken(apiOk(mockListResult([])));
        await callTool('list_past_meetings', {});
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('previous_meetings');
    });
});

// ── Webinars ──────────────────────────────────────────────────────────────────

describe('list_webinars', () => {
    it('returns webinar list', async () => {
        const response = { webinars: [mockWebinar], total_records: 1 };
        setupMockWithToken(apiOk(response));
        const result = await getToolResult('list_webinars', {});
        expect(result.webinars).toHaveLength(1);
        expect(result.webinars[0].topic).toBe('Product Launch Webinar');
    });

    it('calls /users/me/webinars endpoint', async () => {
        setupMockWithToken(apiOk({ webinars: [] }));
        await callTool('list_webinars', {});
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('/users/me/webinars');
    });
});

describe('get_webinar', () => {
    it('returns webinar details', async () => {
        setupMockWithToken(apiOk(mockWebinar));
        const result = await getToolResult('get_webinar', { webinar_id: '987654321' });
        expect(result.id).toBe(987654321);
        expect(result.registrants_count).toBe(150);
    });

    it('missing webinar_id returns error', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenResponse));
        const body = await callTool('get_webinar', {});
        expect(body.error).toBeDefined();
    });
});

describe('create_webinar', () => {
    it('creates webinar and returns details', async () => {
        setupMockWithToken(apiOk(mockWebinar));
        const result = await getToolResult('create_webinar', {
            topic: 'Product Launch',
            start_time: '2026-04-15T18:00:00Z',
        });
        expect(result.topic).toBe('Product Launch Webinar');
    });

    it('missing topic returns error', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenResponse));
        const body = await callTool('create_webinar', { start_time: '2026-04-15T18:00:00Z' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('topic');
    });

    it('missing start_time returns error', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenResponse));
        const body = await callTool('create_webinar', { topic: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('start_time');
    });

    it('sends POST to /users/me/webinars', async () => {
        setupMockWithToken(apiOk(mockWebinar));
        await callTool('create_webinar', { topic: 'Test', start_time: '2026-04-01T10:00:00Z' });
        const apiCall = mockFetch.mock.calls[1];
        expect(apiCall[1].method).toBe('POST');
        expect(apiCall[0]).toContain('/users/me/webinars');
    });
});

describe('get_webinar_registrants', () => {
    it('returns registrant list', async () => {
        const response = {
            registrants: [{ id: 'reg_001', email: 'user@example.com', first_name: 'Alice' }],
            total_records: 1,
        };
        setupMockWithToken(apiOk(response));
        const result = await getToolResult('get_webinar_registrants', { webinar_id: '987654321' });
        expect(result.registrants).toHaveLength(1);
    });

    it('passes status filter', async () => {
        setupMockWithToken(apiOk({ registrants: [] }));
        await callTool('get_webinar_registrants', { webinar_id: '987654321', status: 'approved' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('status=approved');
    });
});

// ── Users ─────────────────────────────────────────────────────────────────────

describe('get_user', () => {
    it('returns user profile', async () => {
        setupMockWithToken(apiOk(mockUser));
        const result = await getToolResult('get_user', { user_id: 'me' });
        expect(result.email).toBe('john@example.com');
        expect(result.first_name).toBe('John');
    });

    it('uses "me" keyword for authenticated user', async () => {
        setupMockWithToken(apiOk(mockUser));
        await callTool('get_user', { user_id: 'me' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('/users/me');
    });

    it('can look up user by email', async () => {
        setupMockWithToken(apiOk(mockUser));
        await callTool('get_user', { user_id: 'john@example.com' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('/users/');
    });

    it('missing user_id returns error', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenResponse));
        const body = await callTool('get_user', {});
        expect(body.error).toBeDefined();
    });
});

describe('list_users', () => {
    it('returns user list', async () => {
        const response = { users: [mockUser], total_records: 1, page_count: 1 };
        setupMockWithToken(apiOk(response));
        const result = await getToolResult('list_users', {});
        expect(result.users).toHaveLength(1);
    });

    it('passes status filter', async () => {
        setupMockWithToken(apiOk({ users: [] }));
        await callTool('list_users', { status: 'active' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('status=active');
    });
});

describe('update_user', () => {
    it('sends PATCH to correct endpoint', async () => {
        setupMockWithToken(apiOk204());
        await callTool('update_user', { user_id: 'me', job_title: 'Senior Engineer' });
        const apiCall = mockFetch.mock.calls[1];
        expect(apiCall[1].method).toBe('PATCH');
        expect(apiCall[0]).toContain('/users/me');
    });

    it('only sends provided fields in body', async () => {
        setupMockWithToken(apiOk204());
        await callTool('update_user', { user_id: 'me', first_name: 'Jane' });
        const sentBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
        expect(sentBody.first_name).toBe('Jane');
        expect(sentBody.last_name).toBeUndefined();
    });

    it('missing user_id returns error', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenResponse));
        const body = await callTool('update_user', { first_name: 'Jane' });
        expect(body.error).toBeDefined();
    });
});

describe('get_user_settings', () => {
    it('returns user settings', async () => {
        const settings = { meeting: { host_video: true }, recording: { cloud_recording: true } };
        setupMockWithToken(apiOk(settings));
        const result = await getToolResult('get_user_settings', { user_id: 'me' });
        expect(result.meeting.host_video).toBe(true);
    });

    it('calls /users/{id}/settings endpoint', async () => {
        setupMockWithToken(apiOk({}));
        await callTool('get_user_settings', { user_id: 'me' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('/users/me/settings');
    });
});

// ── Reports & Cloud ───────────────────────────────────────────────────────────

describe('get_account_reports', () => {
    it('returns daily usage report', async () => {
        const report = {
            dates: [
                { date: '2026-03-01', new_user: 0, meetings: 5, participants: 15, meeting_minutes: 300 },
            ],
        };
        setupMockWithToken(apiOk(report));
        const result = await getToolResult('get_account_reports', { from: '2026-03-01', to: '2026-03-31' });
        expect(result.dates).toHaveLength(1);
        expect(result.dates[0].meetings).toBe(5);
    });

    it('passes from and to params', async () => {
        setupMockWithToken(apiOk({ dates: [] }));
        await callTool('get_account_reports', { from: '2026-03-01', to: '2026-03-31' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('from=2026-03-01');
        expect(url).toContain('to=2026-03-31');
    });

    it('missing from returns error', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenResponse));
        const body = await callTool('get_account_reports', { to: '2026-03-31' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('from');
    });

    it('missing to returns error', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenResponse));
        const body = await callTool('get_account_reports', { from: '2026-03-01' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('to');
    });
});

describe('get_meeting_summary', () => {
    it('returns meeting summary with AI-generated content', async () => {
        const summary = {
            meeting_uuid: 'a1b2c3d4==',
            summary_start_time: '2026-03-01T14:00:00Z',
            summary_content: 'The team discussed Q1 goals and roadmap.',
        };
        setupMockWithToken(apiOk(summary));
        const result = await getToolResult('get_meeting_summary', { meeting_id: 'a1b2c3d4==' });
        expect(result.summary_content).toContain('Q1 goals');
    });

    it('calls /meetings/{id}/meeting_summary endpoint', async () => {
        setupMockWithToken(apiOk({}));
        await callTool('get_meeting_summary', { meeting_id: '123456789' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('/meetings/123456789/meeting_summary');
    });
});

describe('list_recordings', () => {
    it('returns recordings list', async () => {
        const response = { meetings: [mockRecording], total_records: 1 };
        setupMockWithToken(apiOk(response));
        const result = await getToolResult('list_recordings', {});
        expect(result.meetings).toHaveLength(1);
    });

    it('passes date range params', async () => {
        setupMockWithToken(apiOk({ meetings: [] }));
        await callTool('list_recordings', { from: '2026-03-01', to: '2026-03-31' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('from=2026-03-01');
        expect(url).toContain('to=2026-03-31');
    });
});

describe('delete_recording', () => {
    it('sends DELETE to correct endpoint', async () => {
        setupMockWithToken(apiOk204());
        await callTool('delete_recording', { meeting_id: 'a1b2c3d4==', recording_id: 'file_001' });
        const apiCall = mockFetch.mock.calls[1];
        expect(apiCall[1].method).toBe('DELETE');
        expect(apiCall[0]).toContain('/recordings/file_001');
    });

    it('defaults to trash action', async () => {
        setupMockWithToken(apiOk204());
        await callTool('delete_recording', { meeting_id: 'a1b2c3d4==', recording_id: 'file_001' });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('action=trash');
    });

    it('passes explicit delete action', async () => {
        setupMockWithToken(apiOk204());
        await callTool('delete_recording', {
            meeting_id: 'a1b2c3d4==',
            recording_id: 'file_001',
            action: 'delete',
        });
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('action=delete');
    });

    it('missing recording_id returns error', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTokenResponse));
        const body = await callTool('delete_recording', { meeting_id: 'a1b2c3d4==' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('recording_id');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns user profile from /users/me', async () => {
        setupMockWithToken(apiOk(mockUser));
        const result = await getToolResult('_ping', {});
        expect(result.email).toBe('john@example.com');
    });

    it('calls /users/me endpoint', async () => {
        setupMockWithToken(apiOk(mockUser));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[1][0] as string;
        expect(url).toContain('/users/me');
    });
});

// ── API error handling ────────────────────────────────────────────────────────

describe('API error handling', () => {
    it('Zoom API 404 returns -32603 with error message', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockTokenResponse))
            .mockReturnValueOnce(apiErr({ message: 'Meeting not found', code: 3001 }, 404));
        const body = await callTool('get_meeting', { meeting_id: '999999999' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('Meeting not found');
    });

    it('unknown tool returns -32601', async () => {
        setupMockWithToken(apiOk({}));
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
    });
});
