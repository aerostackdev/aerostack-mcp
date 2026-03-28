import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'test_google_access_token_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockSpace = {
    name: 'spaces/jQCFfuBOdN5z',
    meetingUri: 'https://meet.google.com/jqc-ffub-od5z',
    meetingCode: 'jqc-ffub-od5z',
    config: {
        accessType: 'OPEN',
        entryPointAccess: 'ALL',
    },
};

const mockConference = {
    name: 'spaces/jQCFfuBOdN5z/conferences/conf-abc123',
    startTime: '2026-03-01T14:00:00Z',
    endTime: '2026-03-01T15:00:00Z',
    expireTime: '2026-03-31T15:00:00Z',
};

const mockParticipant = {
    name: 'spaces/jQCFfuBOdN5z/conferences/conf-abc123/participants/p-001',
    earliestStartTime: '2026-03-01T14:01:00Z',
    latestEndTime: '2026-03-01T14:59:00Z',
    signedinUser: {
        user: 'users/abc123',
        displayName: 'Jane Smith',
    },
};

const mockRecording = {
    name: 'spaces/jQCFfuBOdN5z/conferences/conf-abc123/recordings/rec-001',
    state: 'ENDED',
    startTime: '2026-03-01T14:00:00Z',
    endTime: '2026-03-01T15:00:00Z',
    driveDestination: {
        file: 'files/drive_file_id',
        exportUri: 'https://drive.google.com/file/d/drive_file_id/view',
    },
};

const mockTranscript = {
    name: 'spaces/jQCFfuBOdN5z/conferences/conf-abc123/transcripts/tr-001',
    state: 'ENDED',
    startTime: '2026-03-01T14:00:00Z',
    endTime: '2026-03-01T15:00:00Z',
    docsDestination: {
        document: 'documents/doc_id',
        exportUri: 'https://docs.google.com/document/d/doc_id/view',
    },
};

const mockCalendarEvent = {
    id: 'event_abc123',
    summary: 'Q1 Planning Call',
    start: { dateTime: '2026-04-01T14:00:00-05:00', timeZone: 'America/Chicago' },
    end: { dateTime: '2026-04-01T15:00:00-05:00', timeZone: 'America/Chicago' },
    description: 'Discuss Q1 roadmap and goals',
    attendees: [
        { email: 'alice@example.com', responseStatus: 'accepted' },
        { email: 'bob@example.com', responseStatus: 'needsAction' },
    ],
    conferenceData: {
        entryPoints: [
            {
                entryPointType: 'video',
                uri: 'https://meet.google.com/abc-defg-hij',
                label: 'meet.google.com/abc-defg-hij',
            },
        ],
        conferenceSolution: { name: 'Google Meet' },
        conferenceId: 'abc-defg-hij',
    },
    htmlLink: 'https://calendar.google.com/calendar/event?eid=abc123',
};

const mockCalendar = {
    id: 'primary',
    summary: 'John Doe',
    timeZone: 'America/New_York',
    etag: '"abc123"',
};

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

function apiErr(message: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({
        error: { code: status, message, status: 'INVALID_ARGUMENT' },
    }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('token')) {
        headers['X-Mcp-Secret-GOOGLE-ACCESS-TOKEN'] = ACCESS_TOKEN;
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
    it('GET / returns status ok with server mcp-google-meet and tools 17', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-google-meet');
        expect(body.tools).toBe(17);
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
        expect(body.result.serverInfo.name).toBe('mcp-google-meet');
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
    it('missing token returns -32001 with GOOGLE_ACCESS_TOKEN in message', async () => {
        const body = await callTool('_ping', {}, ['token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('GOOGLE_ACCESS_TOKEN');
    });

    it('API calls use Bearer token', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendar));
        await callTool('_ping', {});
        const call = mockFetch.mock.calls[0];
        expect(call[1].headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });
});

// ── Meet Spaces ───────────────────────────────────────────────────────────────

describe('create_space', () => {
    it('creates a space and returns meetingUri', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSpace));
        const result = await getToolResult('create_space', {});
        expect(result.meetingUri).toBe('https://meet.google.com/jqc-ffub-od5z');
        expect(result.name).toBe('spaces/jQCFfuBOdN5z');
    });

    it('sends POST to /spaces', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSpace));
        await callTool('create_space', {});
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/v2/spaces');
    });

    it('creates space with config options', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSpace));
        await callTool('create_space', { config: { access_type: 'RESTRICTED' } });
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.config.accessType).toBe('RESTRICTED');
    });

    it('creates space without config', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSpace));
        await callTool('create_space', {});
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.config).toBeUndefined();
    });
});

describe('get_space', () => {
    it('returns space details', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSpace));
        const result = await getToolResult('get_space', { name: 'spaces/jQCFfuBOdN5z' });
        expect(result.meetingCode).toBe('jqc-ffub-od5z');
    });

    it('handles resource name format', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSpace));
        await callTool('get_space', { name: 'spaces/jQCFfuBOdN5z' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/spaces/jQCFfuBOdN5z');
    });

    it('handles meeting code format (without spaces/ prefix)', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSpace));
        await callTool('get_space', { name: 'jqcffubodnez' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/spaces/jqcffubodnez');
    });

    it('missing name returns error', async () => {
        const body = await callTool('get_space', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('end_active_conference', () => {
    it('sends POST to :endActiveConference endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk({}));
        await callTool('end_active_conference', { name: 'spaces/jQCFfuBOdN5z' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain(':endActiveConference');
    });

    it('missing name returns error', async () => {
        const body = await callTool('end_active_conference', {});
        expect(body.error).toBeDefined();
    });
});

describe('list_conferences', () => {
    it('returns conference list', async () => {
        const response = { conferences: [mockConference], nextPageToken: '' };
        mockFetch.mockReturnValueOnce(apiOk(response));
        const result = await getToolResult('list_conferences', { parent: 'spaces/jQCFfuBOdN5z' });
        expect(result.conferences).toHaveLength(1);
        expect(result.conferences[0].name).toBe('spaces/jQCFfuBOdN5z/conferences/conf-abc123');
    });

    it('calls /spaces/{id}/conferences endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ conferences: [] }));
        await callTool('list_conferences', { parent: 'spaces/jQCFfuBOdN5z' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/spaces/jQCFfuBOdN5z/conferences');
    });

    it('passes pagination params', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ conferences: [] }));
        await callTool('list_conferences', { parent: 'spaces/jQCFfuBOdN5z', page_size: 10, page_token: 'tok123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('pageSize=10');
        expect(url).toContain('pageToken=tok123');
    });

    it('missing parent returns error', async () => {
        const body = await callTool('list_conferences', {});
        expect(body.error).toBeDefined();
    });
});

describe('get_conference', () => {
    it('returns conference details', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockConference));
        const result = await getToolResult('get_conference', { name: 'spaces/jQCFfuBOdN5z/conferences/conf-abc123' });
        expect(result.startTime).toBe('2026-03-01T14:00:00Z');
        expect(result.endTime).toBe('2026-03-01T15:00:00Z');
    });

    it('missing name returns error', async () => {
        const body = await callTool('get_conference', {});
        expect(body.error).toBeDefined();
    });
});

// ── Participants & Recording ───────────────────────────────────────────────────

describe('list_participants', () => {
    it('returns participant list', async () => {
        const response = { participants: [mockParticipant], nextPageToken: '' };
        mockFetch.mockReturnValueOnce(apiOk(response));
        const result = await getToolResult('list_participants', {
            parent: 'spaces/jQCFfuBOdN5z/conferences/conf-abc123',
        });
        expect(result.participants).toHaveLength(1);
        expect(result.participants[0].signedinUser.displayName).toBe('Jane Smith');
    });

    it('calls /participants endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ participants: [] }));
        await callTool('list_participants', { parent: 'spaces/jQCFfuBOdN5z/conferences/conf-abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/participants');
    });

    it('missing parent returns error', async () => {
        const body = await callTool('list_participants', {});
        expect(body.error).toBeDefined();
    });
});

describe('get_participant', () => {
    it('returns participant details', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockParticipant));
        const result = await getToolResult('get_participant', { name: mockParticipant.name });
        expect(result.signedinUser.displayName).toBe('Jane Smith');
        expect(result.earliestStartTime).toBe('2026-03-01T14:01:00Z');
    });

    it('missing name returns error', async () => {
        const body = await callTool('get_participant', {});
        expect(body.error).toBeDefined();
    });
});

describe('list_recordings (meet)', () => {
    it('returns recording list', async () => {
        const response = { recordings: [mockRecording], nextPageToken: '' };
        mockFetch.mockReturnValueOnce(apiOk(response));
        const result = await getToolResult('list_recordings', {
            parent: 'spaces/jQCFfuBOdN5z/conferences/conf-abc123',
        });
        expect(result.recordings).toHaveLength(1);
        expect(result.recordings[0].state).toBe('ENDED');
    });

    it('calls /recordings endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ recordings: [] }));
        await callTool('list_recordings', { parent: 'spaces/jQCFfuBOdN5z/conferences/conf-abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/recordings');
    });

    it('missing parent returns error', async () => {
        const body = await callTool('list_recordings', {});
        expect(body.error).toBeDefined();
    });
});

describe('get_recording', () => {
    it('returns recording details with driveDestination', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockRecording));
        const result = await getToolResult('get_recording', { name: mockRecording.name });
        expect(result.driveDestination.exportUri).toContain('drive.google.com');
        expect(result.startTime).toBe('2026-03-01T14:00:00Z');
    });

    it('missing name returns error', async () => {
        const body = await callTool('get_recording', {});
        expect(body.error).toBeDefined();
    });
});

// ── Calendar Integration ──────────────────────────────────────────────────────

describe('create_meeting_event', () => {
    it('creates calendar event with Meet link', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendarEvent));
        const result = await getToolResult('create_meeting_event', {
            summary: 'Q1 Planning Call',
            start: '2026-04-01T14:00:00-05:00',
            end: '2026-04-01T15:00:00-05:00',
        });
        expect(result.id).toBe('event_abc123');
        expect(result.conferenceData.conferenceId).toBe('abc-defg-hij');
    });

    it('includes attendees in event', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendarEvent));
        await callTool('create_meeting_event', {
            summary: 'Test',
            start: '2026-04-01T14:00:00Z',
            end: '2026-04-01T15:00:00Z',
            attendees: ['alice@example.com', 'bob@example.com'],
        });
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.attendees).toHaveLength(2);
        expect(sentBody.attendees[0].email).toBe('alice@example.com');
    });

    it('includes conference data request in body', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendarEvent));
        await callTool('create_meeting_event', {
            summary: 'Test',
            start: '2026-04-01T14:00:00Z',
            end: '2026-04-01T15:00:00Z',
        });
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
    });

    it('passes conferenceDataVersion=1 query param', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendarEvent));
        await callTool('create_meeting_event', {
            summary: 'Test',
            start: '2026-04-01T14:00:00Z',
            end: '2026-04-01T15:00:00Z',
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('conferenceDataVersion=1');
    });

    it('missing summary returns error', async () => {
        const body = await callTool('create_meeting_event', {
            start: '2026-04-01T14:00:00Z',
            end: '2026-04-01T15:00:00Z',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('summary');
    });

    it('missing start returns error', async () => {
        const body = await callTool('create_meeting_event', {
            summary: 'Test',
            end: '2026-04-01T15:00:00Z',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('start');
    });

    it('missing end returns error', async () => {
        const body = await callTool('create_meeting_event', {
            summary: 'Test',
            start: '2026-04-01T14:00:00Z',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('end');
    });
});

describe('get_event', () => {
    it('returns event details with Meet link', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendarEvent));
        const result = await getToolResult('get_event', { event_id: 'event_abc123' });
        expect(result.summary).toBe('Q1 Planning Call');
        expect(result.conferenceData.entryPoints[0].uri).toContain('meet.google.com');
    });

    it('calls correct calendar events endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendarEvent));
        await callTool('get_event', { event_id: 'event_abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/calendars/primary/events/event_abc123');
    });

    it('uses custom calendar_id when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendarEvent));
        await callTool('get_event', { event_id: 'event_abc123', calendar_id: 'team@example.com' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('team%40example.com');
    });

    it('missing event_id returns error', async () => {
        const body = await callTool('get_event', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('event_id');
    });
});

describe('list_upcoming_meetings', () => {
    it('returns upcoming events list', async () => {
        const response = {
            items: [mockCalendarEvent],
            nextPageToken: '',
            summary: 'Primary',
        };
        mockFetch.mockReturnValueOnce(apiOk(response));
        const result = await getToolResult('list_upcoming_meetings', {});
        expect(result.items).toHaveLength(1);
        expect(result.items[0].summary).toBe('Q1 Planning Call');
    });

    it('sets singleEvents=true and orderBy=startTime', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ items: [] }));
        await callTool('list_upcoming_meetings', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('singleEvents=true');
        expect(url).toContain('orderBy=startTime');
    });

    it('filters for meet.google.com events', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ items: [] }));
        await callTool('list_upcoming_meetings', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('meet.google.com');
    });

    it('respects max_results param', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ items: [] }));
        await callTool('list_upcoming_meetings', { max_results: 10 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('maxResults=10');
    });
});

describe('update_meeting_event', () => {
    it('fetches event then patches it', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockCalendarEvent))  // GET event
            .mockReturnValueOnce(apiOk({ ...mockCalendarEvent, summary: 'Updated Title' }));  // PATCH
        const result = await getToolResult('update_meeting_event', {
            event_id: 'event_abc123',
            summary: 'Updated Title',
        });
        expect(result.summary).toBe('Updated Title');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('sends PATCH to correct endpoint', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockCalendarEvent))
            .mockReturnValueOnce(apiOk(mockCalendarEvent));
        await callTool('update_meeting_event', { event_id: 'event_abc123', summary: 'New Title' });
        const patchCall = mockFetch.mock.calls[1];
        expect(patchCall[1].method).toBe('PATCH');
        expect(patchCall[0]).toContain('/calendars/primary/events/event_abc123');
    });

    it('only sends changed fields', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockCalendarEvent))
            .mockReturnValueOnce(apiOk(mockCalendarEvent));
        await callTool('update_meeting_event', { event_id: 'event_abc123', description: 'New agenda' });
        const sentBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
        expect(sentBody.description).toBe('New agenda');
        expect(sentBody.summary).toBeUndefined();
    });

    it('converts attendees array to email objects', async () => {
        mockFetch
            .mockReturnValueOnce(apiOk(mockCalendarEvent))
            .mockReturnValueOnce(apiOk(mockCalendarEvent));
        await callTool('update_meeting_event', {
            event_id: 'event_abc123',
            attendees: ['charlie@example.com'],
        });
        const sentBody = JSON.parse(mockFetch.mock.calls[1][1].body as string);
        expect(sentBody.attendees[0].email).toBe('charlie@example.com');
    });

    it('missing event_id returns error', async () => {
        const body = await callTool('update_meeting_event', { summary: 'Test' });
        expect(body.error).toBeDefined();
    });
});

describe('delete_meeting_event', () => {
    it('sends DELETE to correct endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await callTool('delete_meeting_event', { event_id: 'event_abc123' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('DELETE');
        expect(call[0]).toContain('/calendars/primary/events/event_abc123');
    });

    it('defaults sendUpdates to all', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await callTool('delete_meeting_event', { event_id: 'event_abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('sendUpdates=all');
    });

    it('passes custom sendUpdates param', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await callTool('delete_meeting_event', { event_id: 'event_abc123', send_updates: 'none' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('sendUpdates=none');
    });

    it('missing event_id returns error', async () => {
        const body = await callTool('delete_meeting_event', {});
        expect(body.error).toBeDefined();
    });
});

// ── Transcripts ───────────────────────────────────────────────────────────────

describe('list_transcripts', () => {
    it('returns transcript list', async () => {
        const response = { transcripts: [mockTranscript], nextPageToken: '' };
        mockFetch.mockReturnValueOnce(apiOk(response));
        const result = await getToolResult('list_transcripts', {
            parent: 'spaces/jQCFfuBOdN5z/conferences/conf-abc123',
        });
        expect(result.transcripts).toHaveLength(1);
        expect(result.transcripts[0].state).toBe('ENDED');
    });

    it('calls /transcripts endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ transcripts: [] }));
        await callTool('list_transcripts', { parent: 'spaces/jQCFfuBOdN5z/conferences/conf-abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/transcripts');
    });

    it('passes pagination params', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ transcripts: [] }));
        await callTool('list_transcripts', {
            parent: 'spaces/jQCFfuBOdN5z/conferences/conf-abc123',
            page_size: 5,
            page_token: 'nexttoken',
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('pageSize=5');
        expect(url).toContain('pageToken=nexttoken');
    });

    it('missing parent returns error', async () => {
        const body = await callTool('list_transcripts', {});
        expect(body.error).toBeDefined();
    });
});

describe('get_transcript', () => {
    it('returns transcript with docsDestination', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTranscript));
        const result = await getToolResult('get_transcript', { name: mockTranscript.name });
        expect(result.docsDestination.exportUri).toContain('docs.google.com');
        expect(result.state).toBe('ENDED');
    });

    it('missing name returns error', async () => {
        const body = await callTool('get_transcript', {});
        expect(body.error).toBeDefined();
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns primary calendar info', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendar));
        const result = await getToolResult('_ping', {});
        expect(result.id).toBe('primary');
        expect(result.timeZone).toBe('America/New_York');
    });

    it('calls /calendars/primary endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendar));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/calendars/primary');
    });
});

// ── API error handling ────────────────────────────────────────────────────────

describe('API error handling', () => {
    it('Google API 404 returns -32603 with error message', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Space not found', 404));
        const body = await callTool('get_space', { name: 'spaces/nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('Space not found');
    });

    it('Google API 401 returns -32603 with auth error', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Invalid Credentials', 401));
        const body = await callTool('_ping', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });

    it('unknown tool returns -32601', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
    });
});
