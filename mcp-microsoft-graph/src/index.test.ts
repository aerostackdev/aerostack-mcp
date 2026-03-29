import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

function apiErr(status: number, code = 'GeneralException', message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ error: { code, message } }), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

function api204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

beforeEach(() => { mockFetch.mockReset(); });

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://mcp-microsoft-graph.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function withToken(headers: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-MICROSOFT-ACCESS-TOKEN': 'mock-access-token', ...headers };
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(makeRequest(body, headers ?? withToken()));
    return res.json() as Promise<any>;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockTeam = { id: 'team1', displayName: 'Engineering', description: 'Engineering team', webUrl: 'https://teams.microsoft.com/team1' };
const mockChannel = { id: 'ch1', displayName: 'General', description: 'General channel', membershipType: 'standard', webUrl: 'https://teams.microsoft.com/ch1' };
const mockTeamsMessage = { id: 'msg1', createdDateTime: '2025-01-01T10:00:00Z', webUrl: 'https://teams.microsoft.com/msg1' };
const mockTeamsMessages = [
    { id: 'msg1', body: { contentType: 'text', content: 'Hello' }, from: { user: { displayName: 'Alice' } }, createdDateTime: '2025-01-01T10:00:00Z' },
];
const mockEmail = {
    id: 'email1',
    subject: 'Test Subject',
    from: { emailAddress: { name: 'Alice', address: 'alice@example.com' } },
    receivedDateTime: '2025-01-01T10:00:00Z',
    isRead: false,
    bodyPreview: 'Hello world',
};
const mockEmailFull = {
    ...mockEmail,
    body: { contentType: 'text', content: 'Hello world full body' },
    toRecipients: [{ emailAddress: { name: 'Bob', address: 'bob@example.com' } }],
};
const mockCalendarEvent = {
    id: 'event1',
    subject: 'Team Meeting',
    start: { dateTime: '2025-06-01T10:00:00', timeZone: 'UTC' },
    end: { dateTime: '2025-06-01T11:00:00', timeZone: 'UTC' },
    location: { displayName: 'Conference Room A' },
    organizer: { emailAddress: { name: 'Alice', address: 'alice@example.com' } },
    isAllDay: false,
    webLink: 'https://outlook.office365.com/event1',
};
const mockDriveItem = {
    id: 'item1',
    name: 'report.pdf',
    size: 102400,
    lastModifiedDateTime: '2025-01-01T10:00:00Z',
    webUrl: 'https://onedrive.live.com/item1',
    file: { mimeType: 'application/pdf' },
};
const mockFolderItem = {
    id: 'folder1',
    name: 'Documents',
    size: null,
    lastModifiedDateTime: '2025-01-01T09:00:00Z',
    webUrl: 'https://onedrive.live.com/folder1',
    folder: { childCount: 5 },
};

// ── Protocol tests ────────────────────────────────────────────────────────────

describe('Protocol', () => {
    it('GET / health check returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-microsoft-graph.workers.dev/', { method: 'GET' }));
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-microsoft-graph');
        expect(body.tools).toBe(35);
    });

    it('initialize returns protocol info', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        expect(data.result.protocolVersion).toBe('2024-11-05');
        expect(data.result.serverInfo.name).toBe('mcp-microsoft-graph');
    });

    it('tools/list returns exactly 35 tools', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        expect(data.result.tools).toHaveLength(35);
        const names = data.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_teams');
        expect(names).toContain('send_email');
        expect(names).toContain('create_calendar_event');
        expect(names).toContain('search_drive_files');
        // New tools
        expect(names).toContain('create_team_channel');
        expect(names).toContain('send_chat_message');
        expect(names).toContain('forward_email');
        expect(names).toContain('mark_email_read');
        expect(names).toContain('get_current_user');
        expect(names).toContain('list_org_users');
        expect(names).toContain('get_user');
    });

    it('unknown method returns -32601', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 2, method: 'unknown/method' });
        expect(data.error.code).toBe(-32601);
    });

    it('parse error returns -32700', async () => {
        const res = await worker.fetch(new Request('https://mcp-microsoft-graph.workers.dev/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-json{',
        }));
        const data = await res.json() as any;
        expect(data.error.code).toBe(-32700);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('https://mcp-microsoft-graph.workers.dev/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });
});

// ── Auth tests ────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing token header returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_teams', arguments: {} } },
            {} // no token header
        );
        expect(data.error.code).toBe(-32001);
        expect(data.error.message).toContain('MICROSOFT_ACCESS_TOKEN');
    });
});

// ── Tool: list_teams ──────────────────────────────────────────────────────────

describe('Tool: list_teams', () => {
    it('returns mapped teams list', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [mockTeam] }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_teams', arguments: {} } });
        expect(data.result.content[0].type).toBe('text');
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('team1');
        expect(result[0].displayName).toBe('Engineering');
        expect(result[0].webUrl).toBe('https://teams.microsoft.com/team1');
    });

    it('returns empty array when no teams', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [] }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_teams', arguments: {} } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(0);
    });

    it('401 maps to -32603 with invalid token message', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ error: { code: 'InvalidAuthenticationToken', message: 'Access token is empty.' } }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        )));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_teams', arguments: {} } });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Invalid or expired access token');
    });
});

// ── Tool: list_team_channels ──────────────────────────────────────────────────

describe('Tool: list_team_channels', () => {
    it('returns channel list for a team', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [mockChannel] }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_team_channels', arguments: { team_id: 'team1' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('ch1');
        expect(result[0].displayName).toBe('General');
        expect(result[0].membershipType).toBe('standard');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/teams/team1/channels');
    });
});

// ── Tool: send_teams_message ──────────────────────────────────────────────────

describe('Tool: send_teams_message', () => {
    it('sends message with default text content type', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTeamsMessage));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_teams_message', arguments: { team_id: 'team1', channel_id: 'ch1', content: 'Hello Teams!' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('msg1');
        expect(result.createdDateTime).toBe('2025-01-01T10:00:00Z');

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/teams/team1/channels/ch1/messages');
        const body = JSON.parse(opts.body);
        expect(body.body.contentType).toBe('text');
        expect(body.body.content).toBe('Hello Teams!');
    });

    it('sends HTML message when content_type is html', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTeamsMessage));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_teams_message', arguments: { team_id: 'team1', channel_id: 'ch1', content: '<b>Bold</b>', content_type: 'html' } }
        });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.body.contentType).toBe('html');
    });
});

// ── Tool: list_team_messages ──────────────────────────────────────────────────

describe('Tool: list_team_messages', () => {
    it('returns message list with body and from', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: mockTeamsMessages }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_team_messages', arguments: { team_id: 'team1', channel_id: 'ch1' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('msg1');
        expect(result[0].body.content).toBe('Hello');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('$top=20');
    });
});

// ── Tool: send_email ──────────────────────────────────────────────────────────

describe('Tool: send_email', () => {
    it('sends email and returns success', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_email', arguments: { to: 'bob@example.com', subject: 'Hello', body: 'World' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.to).toBe('bob@example.com');

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/sendMail');
        const body = JSON.parse(opts.body);
        expect(body.message.toRecipients[0].emailAddress.address).toBe('bob@example.com');
        expect(body.message.subject).toBe('Hello');
    });

    it('sends to multiple recipients when comma-separated', async () => {
        mockFetch.mockReturnValueOnce(api204());
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_email', arguments: { to: 'alice@example.com, bob@example.com', subject: 'Hi', body: 'Test' } }
        });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.message.toRecipients).toHaveLength(2);
        expect(body.message.toRecipients[1].emailAddress.address).toBe('bob@example.com');
    });

    it('includes CC recipients when provided', async () => {
        mockFetch.mockReturnValueOnce(api204());
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_email', arguments: { to: 'bob@example.com', subject: 'Hi', body: 'Test', cc: 'carol@example.com' } }
        });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.message.ccRecipients[0].emailAddress.address).toBe('carol@example.com');
    });
});

// ── Tool: list_emails ─────────────────────────────────────────────────────────

describe('Tool: list_emails', () => {
    it('lists inbox emails by default', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [mockEmail] }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_emails', arguments: {} }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('email1');
        expect(result[0].subject).toBe('Test Subject');
        expect(result[0].isRead).toBe(false);

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/mailFolders/Inbox/messages');
    });

    it('uses SentItems folder for sent', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [] }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_emails', arguments: { folder: 'sent' } }
        });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/mailFolders/SentItems/messages');
    });

    it('uses Drafts folder for drafts', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [] }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_emails', arguments: { folder: 'drafts' } }
        });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/mailFolders/Drafts/messages');
    });

    it('adds $search param when search provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [] }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_emails', arguments: { search: 'invoice' } }
        });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('%24search');
    });
});

// ── Tool: get_email ───────────────────────────────────────────────────────────

describe('Tool: get_email', () => {
    it('returns full email with body', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockEmailFull));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_email', arguments: { message_id: 'email1' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('email1');
        expect(result.body.content).toBe('Hello world full body');
        expect(result.toRecipients[0].address).toBe('bob@example.com');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/messages/email1');
    });

    it('404 maps to -32603 with not found message', async () => {
        mockFetch.mockReturnValueOnce(apiErr(404, 'ErrorItemNotFound', 'The specified object was not found'));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_email', arguments: { message_id: 'bad-id' } }
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Not found');
    });
});

// ── Tool: reply_to_email ──────────────────────────────────────────────────────

describe('Tool: reply_to_email', () => {
    it('posts reply and returns success', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'reply_to_email', arguments: { message_id: 'email1', comment: 'Thanks!' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.replied_to_message_id).toBe('email1');

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/messages/email1/reply');
        const body = JSON.parse(opts.body);
        expect(body.comment).toBe('Thanks!');
    });
});

// ── Tool: list_calendar_events ────────────────────────────────────────────────

describe('Tool: list_calendar_events', () => {
    it('returns event list with required fields', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [mockCalendarEvent] }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_calendar_events', arguments: {} }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('event1');
        expect(result[0].subject).toBe('Team Meeting');
        expect(result[0].location).toBe('Conference Room A');
        expect(result[0].isAllDay).toBe(false);
    });

    it('adds date filter when start_date and end_date provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [] }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_calendar_events', arguments: { start_date: '2025-06-01T00:00:00', end_date: '2025-06-30T23:59:59' } }
        });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('%24filter');
        expect(url).toContain('2025-06-01');
    });
});

// ── Tool: create_calendar_event ───────────────────────────────────────────────

describe('Tool: create_calendar_event', () => {
    it('creates event with required fields', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendarEvent));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_calendar_event', arguments: { subject: 'Team Meeting', start: '2025-06-01T10:00:00', end: '2025-06-01T11:00:00' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('event1');
        expect(result.subject).toBe('Team Meeting');

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/events');
        const body = JSON.parse(opts.body);
        expect(body.start.timeZone).toBe('UTC');
        expect(body.end.timeZone).toBe('UTC');
    });

    it('formats attendees correctly', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendarEvent));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_calendar_event', arguments: { subject: 'Meeting', start: '2025-06-01T10:00:00', end: '2025-06-01T11:00:00', attendees: ['alice@example.com', 'bob@example.com'] } }
        });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.attendees).toHaveLength(2);
        expect(body.attendees[0].emailAddress.address).toBe('alice@example.com');
        expect(body.attendees[0].type).toBe('required');
    });

    it('uses custom timezone when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCalendarEvent));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_calendar_event', arguments: { subject: 'Meeting', start: '2025-06-01T10:00:00', end: '2025-06-01T11:00:00', timezone: 'America/New_York' } }
        });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.start.timeZone).toBe('America/New_York');
    });
});

// ── Tool: update_calendar_event ───────────────────────────────────────────────

describe('Tool: update_calendar_event', () => {
    it('patches event with provided fields', async () => {
        const updated = { id: 'event1', subject: 'Updated Meeting', start: mockCalendarEvent.start, end: mockCalendarEvent.end };
        mockFetch.mockReturnValueOnce(apiOk(updated));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'update_calendar_event', arguments: { event_id: 'event1', subject: 'Updated Meeting' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('event1');
        expect(result.subject).toBe('Updated Meeting');

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/events/event1');
        const body = JSON.parse(opts.body);
        expect(body.subject).toBe('Updated Meeting');
        // Only subject was provided — other fields should not be in body
        expect(body.start).toBeUndefined();
    });
});

// ── Tool: delete_calendar_event ───────────────────────────────────────────────

describe('Tool: delete_calendar_event', () => {
    it('returns success on 204', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'delete_calendar_event', arguments: { event_id: 'event1' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.deleted_event_id).toBe('event1');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/events/event1');
    });
});

// ── Tool: list_drive_files ────────────────────────────────────────────────────

describe('Tool: list_drive_files', () => {
    it('lists root files by default', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [mockDriveItem, mockFolderItem] }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_drive_files', arguments: {} }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('report.pdf');
        expect(result[0].type).toBe('file');
        expect(result[1].name).toBe('Documents');
        expect(result[1].type).toBe('folder');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/drive/root/children');
    });

    it('lists specific folder when folder_id provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [mockDriveItem] }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_drive_files', arguments: { folder_id: 'folder1' } }
        });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/drive/items/folder1/children');
    });
});

// ── Tool: search_drive_files ──────────────────────────────────────────────────

describe('Tool: search_drive_files', () => {
    it('returns matching files and folders', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [mockDriveItem] }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'search_drive_files', arguments: { query: 'report' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].name).toBe('report.pdf');
        expect(result[0].size).toBe(102400);

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/drive/search');
        expect(url).toContain('report');
    });

    it('respects custom limit', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [] }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'search_drive_files', arguments: { query: 'test', limit: 5 } }
        });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('$top=5');
    });
});

// ── Error edge cases ──────────────────────────────────────────────────────────

describe('Error cases', () => {
    it('403 Forbidden maps to missing permission error', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ error: { code: 'Forbidden', message: 'Insufficient privileges' } }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
        )));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_teams', arguments: {} }
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Missing Microsoft 365 permission');
    });

    it('429 Rate limit maps to retry message', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ error: { code: 'TooManyRequests', message: 'Too many requests' } }),
            { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } }
        )));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_teams', arguments: {} }
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Rate limited');
    });

    it('unknown tool name returns -32603', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'nonexistent_tool', arguments: {} }
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Unknown tool');
    });
});

// ── Tool: get_drive_item ──────────────────────────────────────────────────────

describe('Tool: get_drive_item', () => {
    it('returns full item metadata', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockDriveItem, '@microsoft.graph.downloadUrl': 'https://download.example.com/file' }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_drive_item', arguments: { item_id: 'item1' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('item1');
        expect(result.name).toBe('report.pdf');
        expect(result.type).toBe('file');
        expect(result.mimeType).toBe('application/pdf');
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/drive/items/item1');
    });
});

// ── Tool: create_folder ───────────────────────────────────────────────────────

describe('Tool: create_folder', () => {
    it('creates folder in root by default', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: 'newFolder1', name: 'NewFolder', webUrl: 'https://onedrive.live.com/new', createdDateTime: '2025-01-01T10:00:00Z' }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_folder', arguments: { name: 'NewFolder' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('newFolder1');
        expect(result.name).toBe('NewFolder');
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/drive/root/children');
        const body = JSON.parse(opts.body);
        expect(body.name).toBe('NewFolder');
        expect(body.folder).toBeDefined();
    });

    it('creates folder inside parent when parent_id provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: 'newFolder2', name: 'Sub', webUrl: 'https://onedrive.live.com/sub', createdDateTime: '2025-01-01T10:00:00Z' }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_folder', arguments: { name: 'Sub', parent_id: 'folder1' } }
        });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/drive/items/folder1/children');
    });
});

// ── Tool: delete_drive_item ───────────────────────────────────────────────────

describe('Tool: delete_drive_item', () => {
    it('returns success on 204', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'delete_drive_item', arguments: { item_id: 'item1' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.deleted_item_id).toBe('item1');
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/drive/items/item1');
    });
});

// ── Tool: share_drive_item ────────────────────────────────────────────────────

describe('Tool: share_drive_item', () => {
    it('creates view link by default', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ link: { webUrl: 'https://onedrive.live.com/share', type: 'view', scope: 'anonymous' } }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'share_drive_item', arguments: { item_id: 'item1' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.webUrl).toBe('https://onedrive.live.com/share');
        expect(result.type).toBe('view');
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/drive/items/item1/createLink');
        const body = JSON.parse(opts.body);
        expect(body.type).toBe('view');
    });
});

// ── Tool: create_team_channel ─────────────────────────────────────────────────

describe('Tool: create_team_channel', () => {
    it('creates a standard channel', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: 'ch2', displayName: 'Dev Talk', description: null, webUrl: 'https://teams.microsoft.com/ch2', membershipType: 'standard' }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_team_channel', arguments: { team_id: 'team1', display_name: 'Dev Talk' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('ch2');
        expect(result.displayName).toBe('Dev Talk');
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/teams/team1/channels');
        const body = JSON.parse(opts.body);
        expect(body.displayName).toBe('Dev Talk');
        expect(body.membershipType).toBe('standard');
    });
});

// ── Tool: reply_to_teams_message ──────────────────────────────────────────────

describe('Tool: reply_to_teams_message', () => {
    it('posts reply to channel message', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: 'reply1', createdDateTime: '2025-01-01T11:00:00Z', webUrl: null }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'reply_to_teams_message', arguments: { team_id: 'team1', channel_id: 'ch1', message_id: 'msg1', content: 'Got it!' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('reply1');
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/teams/team1/channels/ch1/messages/msg1/replies');
        const body = JSON.parse(opts.body);
        expect(body.body.content).toBe('Got it!');
    });
});

// ── Tool: list_chats ──────────────────────────────────────────────────────────

describe('Tool: list_chats', () => {
    it('returns chat list', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [{ id: 'chat1', topic: null, chatType: 'oneOnOne', createdDateTime: '2025-01-01T09:00:00Z', lastUpdatedDateTime: '2025-01-01T10:00:00Z', webUrl: null }] }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_chats', arguments: {} }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('chat1');
        expect(result[0].chatType).toBe('oneOnOne');
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/chats');
    });
});

// ── Tool: list_chat_messages ──────────────────────────────────────────────────

describe('Tool: list_chat_messages', () => {
    it('returns messages in a chat', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [{ id: 'cmsg1', body: { content: 'Hi!' }, from: { user: { displayName: 'Alice' } }, createdDateTime: '2025-01-01T10:00:00Z', lastModifiedDateTime: '2025-01-01T10:00:00Z' }] }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_chat_messages', arguments: { chat_id: 'chat1' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('cmsg1');
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/chats/chat1/messages');
    });
});

// ── Tool: send_chat_message ───────────────────────────────────────────────────

describe('Tool: send_chat_message', () => {
    it('sends message to chat', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: 'cmsg2', createdDateTime: '2025-01-01T11:00:00Z', webUrl: null }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_chat_message', arguments: { chat_id: 'chat1', content: 'Hello!' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('cmsg2');
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/chats/chat1/messages');
        const body = JSON.parse(opts.body);
        expect(body.body.content).toBe('Hello!');
        expect(body.body.contentType).toBe('text');
    });
});

// ── Tool: list_team_members ───────────────────────────────────────────────────

describe('Tool: list_team_members', () => {
    it('returns team members', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [{ id: 'mem1', displayName: 'Alice', email: 'alice@example.com', roles: ['owner'] }] }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_team_members', arguments: { team_id: 'team1' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('mem1');
        expect(result[0].roles).toContain('owner');
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/teams/team1/members');
    });
});

// ── Tool: forward_email ───────────────────────────────────────────────────────

describe('Tool: forward_email', () => {
    it('forwards email and returns success', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'forward_email', arguments: { message_id: 'email1', to: 'carol@example.com', comment: 'FYI' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.forwarded_message_id).toBe('email1');
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/messages/email1/forward');
        const body = JSON.parse(opts.body);
        expect(body.toRecipients[0].emailAddress.address).toBe('carol@example.com');
        expect(body.comment).toBe('FYI');
    });
});

// ── Tool: mark_email_read ─────────────────────────────────────────────────────

describe('Tool: mark_email_read', () => {
    it('marks email as read by default', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: 'email1', isRead: true }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'mark_email_read', arguments: { message_id: 'email1' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.isRead).toBe(true);
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/messages/email1');
        expect(JSON.parse(opts.body).isRead).toBe(true);
    });

    it('marks email as unread when is_read=false', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: 'email1', isRead: false }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'mark_email_read', arguments: { message_id: 'email1', is_read: false } }
        });
        const [, opts] = mockFetch.mock.calls[0];
        expect(JSON.parse(opts.body).isRead).toBe(false);
    });
});

// ── Tool: delete_email ────────────────────────────────────────────────────────

describe('Tool: delete_email', () => {
    it('deletes email and returns success', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'delete_email', arguments: { message_id: 'email1' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.deleted_message_id).toBe('email1');
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/messages/email1');
    });
});

// ── Tool: create_draft ────────────────────────────────────────────────────────

describe('Tool: create_draft', () => {
    it('creates draft and returns id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: 'draft1', subject: 'Draft Subject', createdDateTime: '2025-01-01T10:00:00Z' }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_draft', arguments: { to: 'bob@example.com', subject: 'Draft Subject', body: 'Hello draft' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('draft1');
        expect(result.isDraft).toBe(true);
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/messages');
    });
});

// ── Tool: list_contacts ───────────────────────────────────────────────────────

describe('Tool: list_contacts', () => {
    it('returns contacts list', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [{ id: 'c1', displayName: 'Alice', emailAddresses: [{ address: 'alice@example.com' }], mobilePhone: null, jobTitle: 'Engineer', companyName: 'Acme' }] }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_contacts', arguments: {} }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('c1');
        expect(result[0].displayName).toBe('Alice');
        expect(result[0].jobTitle).toBe('Engineer');
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/contacts');
    });
});

// ── Tool: get_calendar_event ──────────────────────────────────────────────────

describe('Tool: get_calendar_event', () => {
    it('returns full event details with attendees', async () => {
        const fullEvent = {
            ...mockCalendarEvent,
            body: { contentType: 'text', content: 'Team sync' },
            attendees: [{ emailAddress: { name: 'Bob', address: 'bob@example.com' }, status: { response: 'accepted' }, type: 'required' }],
            isCancelled: false,
            onlineMeeting: null,
        };
        mockFetch.mockReturnValueOnce(apiOk(fullEvent));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_calendar_event', arguments: { event_id: 'event1' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('event1');
        expect(result.attendees).toHaveLength(1);
        expect(result.attendees[0].emailAddress.address).toBe('bob@example.com');
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/events/event1');
    });
});

// ── Tool: respond_to_event ────────────────────────────────────────────────────

describe('Tool: respond_to_event', () => {
    it('accepts event and returns success', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'respond_to_event', arguments: { event_id: 'event1', response: 'accept', comment: 'See you there!' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.response).toBe('accept');
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/events/event1/accept');
        const body = JSON.parse(opts.body);
        expect(body.comment).toBe('See you there!');
        expect(body.sendResponse).toBe(true);
    });

    it('declines event', async () => {
        mockFetch.mockReturnValueOnce(api204());
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'respond_to_event', arguments: { event_id: 'event1', response: 'decline' } }
        });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/events/event1/decline');
    });

    it('rejects invalid response value', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'respond_to_event', arguments: { event_id: 'event1', response: '../../../users' } }
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Invalid response value');
    });
});

// ── Tool: list_calendars ──────────────────────────────────────────────────────

describe('Tool: list_calendars', () => {
    it('returns list of calendars', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [{ id: 'cal1', name: 'Calendar', color: 'auto', isDefaultCalendar: true, canEdit: true, owner: { name: 'Alice', address: 'alice@example.com' } }] }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_calendars', arguments: {} }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('cal1');
        expect(result[0].isDefaultCalendar).toBe(true);
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me/calendars');
    });
});

// ── Tool: get_current_user ────────────────────────────────────────────────────

describe('Tool: get_current_user', () => {
    it('returns authenticated user profile', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: 'user1', displayName: 'Alice Smith', mail: 'alice@example.com', userPrincipalName: 'alice@example.com', jobTitle: 'Engineer', department: 'Engineering', officeLocation: 'HQ', mobilePhone: null, businessPhones: ['+1234567890'] }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_current_user', arguments: {} }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('user1');
        expect(result.displayName).toBe('Alice Smith');
        expect(result.mail).toBe('alice@example.com');
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/me');
    });
});

// ── Tool: list_org_users ──────────────────────────────────────────────────────

describe('Tool: list_org_users', () => {
    it('returns users list from directory', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ value: [{ id: 'user2', displayName: 'Bob Jones', mail: 'bob@example.com', userPrincipalName: 'bob@example.com', jobTitle: 'PM', department: 'Product' }] }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_org_users', arguments: {} }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('user2');
        expect(result[0].displayName).toBe('Bob Jones');
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/users');
    });

    it('surfaces graph error when 403 returned', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ error: { code: 'Authorization_RequestDenied', message: 'Insufficient privileges' } }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
        )));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_org_users', arguments: {} }
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Missing Microsoft 365 permission');
    });
});

// ── Tool: get_user ────────────────────────────────────────────────────────────

describe('Tool: get_user', () => {
    it('returns specific user by ID', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: 'user2', displayName: 'Bob Jones', mail: 'bob@example.com', userPrincipalName: 'bob@example.com', jobTitle: 'PM', department: 'Product', officeLocation: null, mobilePhone: null, businessPhones: [], accountEnabled: true }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_user', arguments: { user_id: 'user2' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('user2');
        expect(result.accountEnabled).toBe(true);
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/users/user2');
    });
});

// ── E2E (skipped unless env var set) ─────────────────────────────────────────

describe.skipIf(!process.env.MICROSOFT_ACCESS_TOKEN)('E2E', () => {
    it('health check works', async () => {
        const res = await worker.fetch(new Request('https://mcp-microsoft-graph.workers.dev/', { method: 'GET' }));
        expect(res.status).toBe(200);
    });
});
