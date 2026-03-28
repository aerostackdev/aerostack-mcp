/**
 * Google Meet MCP Worker
 * Implements MCP protocol over HTTP for Google Meet and Google Calendar operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   GOOGLE_ACCESS_TOKEN  → X-Mcp-Secret-GOOGLE-ACCESS-TOKEN  (OAuth 2.0 access token)
 *
 * Auth format: Authorization: Bearer {access_token}
 *
 * APIs used:
 *   Google Meet REST API:   https://meet.googleapis.com/v2
 *   Google Calendar API:    https://www.googleapis.com/calendar/v3
 *
 * Covers: Meet Spaces (5), Participants & Recording (4), Calendar Integration (5), Transcripts (2) = 16 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const MEET_API_BASE = 'https://meet.googleapis.com/v2';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpcOk(id: number | string, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: number | string | null, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

function getSecrets(request: Request): { token: string | null } {
    return {
        token: request.headers.get('X-Mcp-Secret-GOOGLE-ACCESS-TOKEN'),
    };
}

async function apiFetch(
    baseUrl: string,
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Google API HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        const d = data as { error?: { message?: string; status?: string } };
        const msg = d.error?.message || res.statusText;
        throw { code: -32603, message: `Google API error ${res.status}: ${msg}` };
    }

    return data;
}

function meetFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
    return apiFetch(MEET_API_BASE, path, token, options);
}

function calFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
    return apiFetch(CALENDAR_API_BASE, path, token, options);
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Meet Spaces (5 tools) ───────────────────────────────────────

    {
        name: 'create_space',
        description: 'Create a new Google Meet space. Returns the meetingUri, meetingCode, and space name for sharing.',
        inputSchema: {
            type: 'object',
            properties: {
                config: {
                    type: 'object',
                    description: 'Optional space configuration (access type, entry point access)',
                    properties: {
                        access_type: {
                            type: 'string',
                            description: 'Who can join the space',
                            enum: ['ACCESS_TYPE_UNSPECIFIED', 'OPEN', 'TRUSTED', 'RESTRICTED'],
                        },
                        entry_point_access: {
                            type: 'string',
                            description: 'Which entry points are allowed',
                            enum: ['ENTRY_POINT_ACCESS_UNSPECIFIED', 'ALL', 'CREATOR_APP_ONLY'],
                        },
                    },
                },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_space',
        description: 'Get details of a Google Meet space by its resource name or meeting code.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'The space resource name (e.g. "spaces/jQCFfuBOdN5z") or meeting code (e.g. "jqcffubodnez")',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'end_active_conference',
        description: 'End an active conference in a Google Meet space, disconnecting all participants.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'The space resource name (e.g. "spaces/jQCFfuBOdN5z")',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_conferences',
        description: 'List past conferences that occurred in a specific Google Meet space.',
        inputSchema: {
            type: 'object',
            properties: {
                parent: {
                    type: 'string',
                    description: 'The space resource name to list conferences for (e.g. "spaces/jQCFfuBOdN5z")',
                },
                page_size: {
                    type: 'number',
                    description: 'Maximum number of conferences to return (default 20)',
                },
                page_token: {
                    type: 'string',
                    description: 'Pagination token for next page of results',
                },
            },
            required: ['parent'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_conference',
        description: 'Get details of a specific Google Meet conference including start/end time and participant count.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'The conference resource name (e.g. "spaces/jQCFfuBOdN5z/conferences/conf-abc123")',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Participants & Recording (4 tools) ───────────────────────────

    {
        name: 'list_participants',
        description: 'List participants in a Google Meet conference session.',
        inputSchema: {
            type: 'object',
            properties: {
                parent: {
                    type: 'string',
                    description: 'The conference resource name (e.g. "spaces/{space}/conferences/{conference}")',
                },
                page_size: {
                    type: 'number',
                    description: 'Maximum number of participants to return (default 100)',
                },
                page_token: {
                    type: 'string',
                    description: 'Pagination token for next page',
                },
            },
            required: ['parent'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_participant',
        description: 'Get details of a specific conference participant including display name, join/leave time, and phone number.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'The participant resource name (e.g. "spaces/{space}/conferences/{conference}/participants/{participant}")',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_recordings',
        description: 'List recordings for a specific Google Meet conference.',
        inputSchema: {
            type: 'object',
            properties: {
                parent: {
                    type: 'string',
                    description: 'The conference resource name to list recordings for',
                },
                page_size: {
                    type: 'number',
                    description: 'Maximum number of recordings to return (default 20)',
                },
                page_token: {
                    type: 'string',
                    description: 'Pagination token for next page',
                },
            },
            required: ['parent'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_recording',
        description: 'Get details of a specific Google Meet recording, including download URI and start/end time.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'The recording resource name',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Calendar Integration (5 tools) ──────────────────────────────

    {
        name: 'create_meeting_event',
        description: 'Create a Google Calendar event with a Google Meet conference link. Returns the event ID, Meet URL, and calendar link.',
        inputSchema: {
            type: 'object',
            properties: {
                summary: {
                    type: 'string',
                    description: 'Event title/summary (required)',
                },
                start: {
                    type: 'string',
                    description: 'Event start time in ISO 8601 format (e.g. 2026-04-01T14:00:00-05:00) (required)',
                },
                end: {
                    type: 'string',
                    description: 'Event end time in ISO 8601 format (required)',
                },
                attendees: {
                    type: 'array',
                    description: 'List of attendee email addresses',
                    items: { type: 'string' },
                },
                description: {
                    type: 'string',
                    description: 'Event description/agenda',
                },
                timezone: {
                    type: 'string',
                    description: 'Timezone for start/end times (e.g. America/New_York, UTC)',
                },
                calendar_id: {
                    type: 'string',
                    description: 'Calendar ID to create event in (default: primary)',
                },
            },
            required: ['summary', 'start', 'end'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_event',
        description: 'Get a Google Calendar event by event ID, including the Meet link if present.',
        inputSchema: {
            type: 'object',
            properties: {
                event_id: {
                    type: 'string',
                    description: 'The Google Calendar event ID (required)',
                },
                calendar_id: {
                    type: 'string',
                    description: 'Calendar ID containing the event (default: primary)',
                },
            },
            required: ['event_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_upcoming_meetings',
        description: 'List upcoming Google Calendar events that have Google Meet links. Returns up to 25 upcoming meetings.',
        inputSchema: {
            type: 'object',
            properties: {
                max_results: {
                    type: 'number',
                    description: 'Maximum number of events to return (default 25, max 250)',
                },
                time_min: {
                    type: 'string',
                    description: 'Lower bound for event start time (ISO 8601, default: now)',
                },
                time_max: {
                    type: 'string',
                    description: 'Upper bound for event start time (ISO 8601)',
                },
                calendar_id: {
                    type: 'string',
                    description: 'Calendar ID to query (default: primary)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_meeting_event',
        description: 'Update an existing Google Calendar meeting event. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                event_id: {
                    type: 'string',
                    description: 'The Google Calendar event ID to update (required)',
                },
                summary: { type: 'string', description: 'Updated event title' },
                start: { type: 'string', description: 'Updated start time (ISO 8601)' },
                end: { type: 'string', description: 'Updated end time (ISO 8601)' },
                description: { type: 'string', description: 'Updated event description' },
                attendees: {
                    type: 'array',
                    description: 'Updated list of attendee email addresses (replaces existing list)',
                    items: { type: 'string' },
                },
                calendar_id: {
                    type: 'string',
                    description: 'Calendar ID containing the event (default: primary)',
                },
            },
            required: ['event_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_meeting_event',
        description: 'Delete a Google Calendar meeting event. Attendees will receive cancellation notifications.',
        inputSchema: {
            type: 'object',
            properties: {
                event_id: {
                    type: 'string',
                    description: 'The Google Calendar event ID to delete (required)',
                },
                calendar_id: {
                    type: 'string',
                    description: 'Calendar ID containing the event (default: primary)',
                },
                send_updates: {
                    type: 'string',
                    description: 'Whether to send cancellation notifications to attendees',
                    enum: ['all', 'externalOnly', 'none'],
                },
            },
            required: ['event_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 4 — Transcripts (2 tools) ───────────────────────────────────────

    {
        name: 'list_transcripts',
        description: 'List transcripts for a specific Google Meet conference.',
        inputSchema: {
            type: 'object',
            properties: {
                parent: {
                    type: 'string',
                    description: 'The conference resource name to list transcripts for (e.g. "spaces/{space}/conferences/{conference}")',
                },
                page_size: {
                    type: 'number',
                    description: 'Maximum number of transcripts to return (default 20)',
                },
                page_token: {
                    type: 'string',
                    description: 'Pagination token for next page',
                },
            },
            required: ['parent'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_transcript',
        description: 'Get a specific Google Meet transcript with all entries (speaker turns, timestamps).',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'The transcript resource name',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ─────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify Google credentials by fetching the primary calendar info. Returns calendar summary and timezone.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        // ── Meet Spaces ─────────────────────────────────────────────────────────

        case 'create_space': {
            const body: Record<string, unknown> = {};
            if (args.config) {
                const cfg = args.config as { access_type?: string; entry_point_access?: string };
                const spaceConfig: Record<string, unknown> = {};
                if (cfg.access_type) spaceConfig.accessType = cfg.access_type;
                if (cfg.entry_point_access) spaceConfig.entryPointAccess = cfg.entry_point_access;
                if (Object.keys(spaceConfig).length > 0) body.config = spaceConfig;
            }
            return meetFetch('/spaces', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_space': {
            validateRequired(args, ['name']);
            const spaceName = args.name as string;
            // Support both resource names and meeting codes
            const path = spaceName.startsWith('spaces/') ? `/${spaceName}` : `/spaces/${spaceName}`;
            return meetFetch(path, token);
        }

        case 'end_active_conference': {
            validateRequired(args, ['name']);
            const spaceName = args.name as string;
            const path = spaceName.startsWith('spaces/') ? `/${spaceName}:endActiveConference` : `/spaces/${spaceName}:endActiveConference`;
            return meetFetch(path, token, {
                method: 'POST',
                body: JSON.stringify({}),
            });
        }

        case 'list_conferences': {
            validateRequired(args, ['parent']);
            const params = new URLSearchParams();
            if (args.page_size) params.set('pageSize', String(args.page_size));
            if (args.page_token) params.set('pageToken', args.page_token as string);
            const qs = params.toString() ? `?${params}` : '';
            const parent = args.parent as string;
            const basePath = parent.startsWith('spaces/') ? `/${parent}` : `/spaces/${parent}`;
            return meetFetch(`${basePath}/conferences${qs}`, token);
        }

        case 'get_conference': {
            validateRequired(args, ['name']);
            const confName = args.name as string;
            const path = confName.startsWith('spaces/') ? `/${confName}` : `/spaces/${confName}`;
            return meetFetch(path, token);
        }

        // ── Participants & Recording ─────────────────────────────────────────────

        case 'list_participants': {
            validateRequired(args, ['parent']);
            const parent = args.parent as string;
            if (!parent.startsWith('spaces/')) throw new Error('parent must start with "spaces/"');
            const params = new URLSearchParams();
            if (args.page_size) params.set('pageSize', String(args.page_size));
            if (args.page_token) params.set('pageToken', args.page_token as string);
            const qs = params.toString() ? `?${params}` : '';
            return meetFetch(`/${parent}/participants${qs}`, token);
        }

        case 'get_participant': {
            validateRequired(args, ['name']);
            const partName = args.name as string;
            if (!partName.startsWith('spaces/')) throw new Error('name must start with "spaces/"');
            return meetFetch(`/${partName}`, token);
        }

        case 'list_recordings': {
            validateRequired(args, ['parent']);
            const recParent = args.parent as string;
            if (!recParent.startsWith('spaces/')) throw new Error('parent must start with "spaces/"');
            const params = new URLSearchParams();
            if (args.page_size) params.set('pageSize', String(args.page_size));
            if (args.page_token) params.set('pageToken', args.page_token as string);
            const qs = params.toString() ? `?${params}` : '';
            return meetFetch(`/${recParent}/recordings${qs}`, token);
        }

        case 'get_recording': {
            validateRequired(args, ['name']);
            const recName = args.name as string;
            if (!recName.startsWith('spaces/')) throw new Error('name must start with "spaces/"');
            return meetFetch(`/${recName}`, token);
        }

        // ── Calendar Integration ─────────────────────────────────────────────────

        case 'create_meeting_event': {
            validateRequired(args, ['summary', 'start', 'end']);
            const calendarId = (args.calendar_id as string) || 'primary';
            const timezone = (args.timezone as string) || 'UTC';
            const body: Record<string, unknown> = {
                summary: args.summary,
                start: { dateTime: args.start, timeZone: timezone },
                end: { dateTime: args.end, timeZone: timezone },
                conferenceData: {
                    createRequest: {
                        requestId: `aerostack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        conferenceSolutionKey: { type: 'hangoutsMeet' },
                    },
                },
            };
            if (args.description) body.description = args.description;
            if (args.attendees && Array.isArray(args.attendees)) {
                body.attendees = (args.attendees as string[]).map((email) => ({ email }));
            }
            const params = new URLSearchParams({ conferenceDataVersion: '1' });
            return calFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_event': {
            validateRequired(args, ['event_id']);
            const calendarId = (args.calendar_id as string) || 'primary';
            return calFetch(
                `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(args.event_id as string)}`,
                token,
            );
        }

        case 'list_upcoming_meetings': {
            const calendarId = (args.calendar_id as string) || 'primary';
            const params = new URLSearchParams();
            params.set('maxResults', String((args.max_results as number) || 25));
            params.set('singleEvents', 'true');
            params.set('orderBy', 'startTime');
            params.set('timeMin', (args.time_min as string) || new Date().toISOString());
            if (args.time_max) params.set('timeMax', args.time_max as string);
            // Filter for events with a Meet link
            params.set('q', 'meet.google.com');
            return calFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`, token);
        }

        case 'update_meeting_event': {
            validateRequired(args, ['event_id']);
            const calendarId = (args.calendar_id as string) || 'primary';
            // Fetch the current event first for PATCH (partial update)
            const existing = await calFetch(
                `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(args.event_id as string)}`,
                token,
            ) as Record<string, unknown>;

            const patch: Record<string, unknown> = {};
            if (args.summary !== undefined) patch.summary = args.summary;
            if (args.description !== undefined) patch.description = args.description;
            if (args.start !== undefined) {
                const existingStart = existing.start as { timeZone?: string } | undefined;
                patch.start = { dateTime: args.start, timeZone: existingStart?.timeZone || 'UTC' };
            }
            if (args.end !== undefined) {
                const existingEnd = existing.end as { timeZone?: string } | undefined;
                patch.end = { dateTime: args.end, timeZone: existingEnd?.timeZone || 'UTC' };
            }
            if (args.attendees !== undefined && Array.isArray(args.attendees)) {
                patch.attendees = (args.attendees as string[]).map((email) => ({ email }));
            }

            return calFetch(
                `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(args.event_id as string)}`,
                token,
                { method: 'PATCH', body: JSON.stringify(patch) },
            );
        }

        case 'delete_meeting_event': {
            validateRequired(args, ['event_id']);
            const calendarId = (args.calendar_id as string) || 'primary';
            const sendUpdates = (args.send_updates as string) || 'all';
            const params = new URLSearchParams({ sendUpdates });
            return calFetch(
                `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(args.event_id as string)}?${params}`,
                token,
                { method: 'DELETE' },
            );
        }

        // ── Transcripts ──────────────────────────────────────────────────────────

        case 'list_transcripts': {
            validateRequired(args, ['parent']);
            const params = new URLSearchParams();
            if (args.page_size) params.set('pageSize', String(args.page_size));
            if (args.page_token) params.set('pageToken', args.page_token as string);
            const qs = params.toString() ? `?${params}` : '';
            return meetFetch(`/${args.parent}/transcripts${qs}`, token);
        }

        case 'get_transcript': {
            validateRequired(args, ['name']);
            return meetFetch(`/${args.name}`, token);
        }

        case '_ping': {
            return calFetch('/calendars/primary', token);
        }

        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-google-meet', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        // ── MCP protocol methods ──────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-google-meet', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            // Validate secrets
            const { token } = getSecrets(request);
            if (!token) {
                return rpcErr(id, -32001, 'Missing required secrets: GOOGLE_ACCESS_TOKEN (header: X-Mcp-Secret-GOOGLE-ACCESS-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, token);
                return rpcOk(id, toolOk(result));
            } catch (err: unknown) {
                if (err && typeof err === 'object' && 'code' in err) {
                    const e = err as { code: number; message: string };
                    return rpcErr(id, e.code, e.message);
                }
                if (err instanceof Error) {
                    return rpcErr(id, -32603, err.message);
                }
                return rpcErr(id, -32603, 'Internal error');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
