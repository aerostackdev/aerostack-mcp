/**
 * Zoom MCP Worker
 * Implements MCP protocol over HTTP for Zoom video conferencing operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   ZOOM_ACCOUNT_ID     → X-Mcp-Secret-ZOOM-ACCOUNT-ID     (Server-to-Server OAuth account ID)
 *   ZOOM_CLIENT_ID      → X-Mcp-Secret-ZOOM-CLIENT-ID      (OAuth app client ID)
 *   ZOOM_CLIENT_SECRET  → X-Mcp-Secret-ZOOM-CLIENT-SECRET  (OAuth app client secret)
 *
 * Auth format: Server-to-Server OAuth — exchange account_id + client_id:client_secret for access token
 *              POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id={ACCOUNT_ID}
 *              Authorization: Basic base64(client_id:client_secret)
 *
 * Covers: Meetings (8), Webinars (4), Users (4), Reports & Cloud (4) = 20 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const ZOOM_API_BASE = 'https://api.zoom.us/v2';
const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';

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

function getSecrets(request: Request): {
    accountId: string | null;
    clientId: string | null;
    clientSecret: string | null;
} {
    return {
        accountId: request.headers.get('X-Mcp-Secret-ZOOM-ACCOUNT-ID'),
        clientId: request.headers.get('X-Mcp-Secret-ZOOM-CLIENT-ID'),
        clientSecret: request.headers.get('X-Mcp-Secret-ZOOM-CLIENT-SECRET'),
    };
}

async function getAccessToken(accountId: string, clientId: string, clientSecret: string): Promise<string> {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    const url = `${ZOOM_TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Zoom token exchange failed: ${text}` };
    }

    if (!res.ok) {
        const d = data as { reason?: string; message?: string };
        throw { code: -32001, message: `Zoom OAuth error: ${d.reason || d.message || res.statusText}` };
    }

    const tokenData = data as { access_token: string };
    if (!tokenData.access_token) {
        throw { code: -32001, message: 'Zoom OAuth did not return an access token' };
    }
    return tokenData.access_token;
}

async function zoomFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${ZOOM_API_BASE}${path}`;
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
        throw { code: -32603, message: `Zoom HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        const d = data as { message?: string; reason?: string };
        const msg = d.message || d.reason || res.statusText;
        throw { code: -32603, message: `Zoom API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Meetings (8 tools) ──────────────────────────────────────────

    {
        name: 'list_meetings',
        description: 'List meetings for the authenticated Zoom user. Filter by type: scheduled, live, or upcoming.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    description: 'Meeting type filter',
                    enum: ['scheduled', 'live', 'upcoming', 'upcoming_meetings', 'previous_meetings'],
                },
                page_size: {
                    type: 'number',
                    description: 'Number of results per page (max 300, default 30)',
                },
                next_page_token: {
                    type: 'string',
                    description: 'Pagination token for next page of results',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_meeting',
        description: 'Get full details of a specific Zoom meeting by ID. Returns topic, start_time, duration, join_url, password, agenda, and settings.',
        inputSchema: {
            type: 'object',
            properties: {
                meeting_id: {
                    type: 'string',
                    description: 'The Zoom meeting ID (numeric string)',
                },
            },
            required: ['meeting_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_meeting',
        description: 'Create a new Zoom meeting. Returns the meeting ID, join URL, and password.',
        inputSchema: {
            type: 'object',
            properties: {
                topic: {
                    type: 'string',
                    description: 'Meeting topic/title (required)',
                },
                start_time: {
                    type: 'string',
                    description: 'Meeting start time in ISO 8601 format (e.g. 2026-04-01T14:00:00Z). Omit for an instant meeting.',
                },
                duration_minutes: {
                    type: 'number',
                    description: 'Meeting duration in minutes (default 60)',
                },
                timezone: {
                    type: 'string',
                    description: 'Timezone for the meeting (e.g. America/New_York, UTC)',
                },
                agenda: {
                    type: 'string',
                    description: 'Meeting agenda/description',
                },
                password: {
                    type: 'string',
                    description: 'Meeting passcode (max 10 chars, letters and numbers only)',
                },
                host_video: {
                    type: 'boolean',
                    description: 'Start with host video on (default true)',
                },
                participant_video: {
                    type: 'boolean',
                    description: 'Start with participant video on (default false)',
                },
                waiting_room: {
                    type: 'boolean',
                    description: 'Enable waiting room (default false)',
                },
            },
            required: ['topic'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_meeting',
        description: 'Update an existing Zoom meeting. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                meeting_id: {
                    type: 'string',
                    description: 'The Zoom meeting ID to update (required)',
                },
                topic: { type: 'string', description: 'Updated meeting topic' },
                start_time: { type: 'string', description: 'Updated start time (ISO 8601)' },
                duration_minutes: { type: 'number', description: 'Updated duration in minutes' },
                timezone: { type: 'string', description: 'Updated timezone' },
                agenda: { type: 'string', description: 'Updated agenda' },
                password: { type: 'string', description: 'Updated passcode' },
            },
            required: ['meeting_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_meeting',
        description: 'Delete a Zoom meeting by ID. The meeting will be permanently removed.',
        inputSchema: {
            type: 'object',
            properties: {
                meeting_id: {
                    type: 'string',
                    description: 'The Zoom meeting ID to delete',
                },
            },
            required: ['meeting_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_meeting_participants',
        description: 'Get the list of participants from a past (ended) Zoom meeting.',
        inputSchema: {
            type: 'object',
            properties: {
                meeting_id: {
                    type: 'string',
                    description: 'The past meeting UUID or meeting ID',
                },
                page_size: {
                    type: 'number',
                    description: 'Number of results per page (max 300, default 30)',
                },
                next_page_token: {
                    type: 'string',
                    description: 'Pagination token for next page',
                },
            },
            required: ['meeting_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_meeting_recordings',
        description: 'Get cloud recordings for a specific Zoom meeting.',
        inputSchema: {
            type: 'object',
            properties: {
                meeting_id: {
                    type: 'string',
                    description: 'The meeting ID or UUID to get recordings for',
                },
            },
            required: ['meeting_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_past_meetings',
        description: 'List past meetings for the authenticated user with summary statistics (participants, duration).',
        inputSchema: {
            type: 'object',
            properties: {
                page_size: {
                    type: 'number',
                    description: 'Number of results per page (max 300, default 30)',
                },
                next_page_token: {
                    type: 'string',
                    description: 'Pagination token for next page',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Webinars (4 tools) ──────────────────────────────────────────

    {
        name: 'list_webinars',
        description: 'List all scheduled webinars for the authenticated Zoom user.',
        inputSchema: {
            type: 'object',
            properties: {
                page_size: {
                    type: 'number',
                    description: 'Number of results per page (max 300, default 30)',
                },
                page_number: {
                    type: 'number',
                    description: 'Page number of results (default 1)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_webinar',
        description: 'Get full details of a specific Zoom webinar by ID, including topic, start time, registrants count, and settings.',
        inputSchema: {
            type: 'object',
            properties: {
                webinar_id: {
                    type: 'string',
                    description: 'The Zoom webinar ID',
                },
            },
            required: ['webinar_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_webinar',
        description: 'Create a new Zoom webinar for the authenticated host.',
        inputSchema: {
            type: 'object',
            properties: {
                topic: {
                    type: 'string',
                    description: 'Webinar topic/title (required)',
                },
                start_time: {
                    type: 'string',
                    description: 'Webinar start time in ISO 8601 format (required)',
                },
                duration_minutes: {
                    type: 'number',
                    description: 'Webinar duration in minutes (default 60)',
                },
                agenda: {
                    type: 'string',
                    description: 'Webinar description/agenda',
                },
                timezone: {
                    type: 'string',
                    description: 'Timezone for the webinar (e.g. America/New_York)',
                },
            },
            required: ['topic', 'start_time'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_webinar_registrants',
        description: 'Get the list of registrants for a Zoom webinar.',
        inputSchema: {
            type: 'object',
            properties: {
                webinar_id: {
                    type: 'string',
                    description: 'The Zoom webinar ID',
                },
                status: {
                    type: 'string',
                    description: 'Registrant status filter',
                    enum: ['pending', 'approved', 'denied'],
                },
                page_size: {
                    type: 'number',
                    description: 'Number of results per page (max 300, default 30)',
                },
            },
            required: ['webinar_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Users (4 tools) ──────────────────────────────────────────────

    {
        name: 'get_user',
        description: 'Get a Zoom user profile by user ID or email address. Use "me" to get the authenticated user.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'Zoom user ID, email address, or "me" for the authenticated user',
                },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_users',
        description: 'List all users in the Zoom account. Requires account-level permissions.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    description: 'User status filter',
                    enum: ['active', 'inactive', 'pending'],
                },
                page_size: {
                    type: 'number',
                    description: 'Number of results per page (max 300, default 30)',
                },
                next_page_token: {
                    type: 'string',
                    description: 'Pagination token for next page',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_user',
        description: 'Update a Zoom user profile. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'Zoom user ID, email, or "me"',
                },
                first_name: { type: 'string', description: 'User first name' },
                last_name: { type: 'string', description: 'User last name' },
                job_title: { type: 'string', description: 'User job title' },
                dept: { type: 'string', description: 'User department' },
                company: { type: 'string', description: 'Company name' },
                phone_number: { type: 'string', description: 'Phone number with country code' },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_user_settings',
        description: 'Get user-level Zoom settings including meeting defaults, recording preferences, and security settings.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'Zoom user ID, email address, or "me"',
                },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Reports & Cloud (4 tools) ───────────────────────────────────

    {
        name: 'get_account_reports',
        description: 'Get daily usage reports for the Zoom account over a date range. Returns meeting counts, participants, and minutes.',
        inputSchema: {
            type: 'object',
            properties: {
                from: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format (required)',
                },
                to: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format (required, max 1 month range)',
                },
            },
            required: ['from', 'to'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_meeting_summary',
        description: 'Get the AI-generated summary for a completed Zoom meeting, including topics discussed and action items.',
        inputSchema: {
            type: 'object',
            properties: {
                meeting_id: {
                    type: 'string',
                    description: 'The meeting UUID or meeting ID of the completed meeting',
                },
            },
            required: ['meeting_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_recordings',
        description: 'List all cloud recordings for the authenticated Zoom user within a date range.',
        inputSchema: {
            type: 'object',
            properties: {
                from: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format (default: 1 month ago)',
                },
                to: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format (default: today)',
                },
                page_size: {
                    type: 'number',
                    description: 'Number of results per page (max 300, default 30)',
                },
                next_page_token: {
                    type: 'string',
                    description: 'Pagination token for next page',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_recording',
        description: 'Delete a cloud recording file from a Zoom meeting.',
        inputSchema: {
            type: 'object',
            properties: {
                meeting_id: {
                    type: 'string',
                    description: 'The meeting UUID that contains the recording',
                },
                recording_id: {
                    type: 'string',
                    description: 'The specific recording file ID to delete',
                },
                action: {
                    type: 'string',
                    description: 'Delete action: "trash" (moves to trash, recoverable) or "delete" (permanent)',
                    enum: ['trash', 'delete'],
                },
            },
            required: ['meeting_id', 'recording_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── _ping ─────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify Zoom credentials by fetching the authenticated user profile. Returns user email and account status.',
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
        // ── Meetings ────────────────────────────────────────────────────────────

        case 'list_meetings': {
            const params = new URLSearchParams();
            if (args.type) params.set('type', args.type as string);
            if (args.page_size) params.set('page_size', String(args.page_size));
            if (args.next_page_token) params.set('next_page_token', args.next_page_token as string);
            const qs = params.toString() ? `?${params}` : '';
            return zoomFetch(`/users/me/meetings${qs}`, token);
        }

        case 'get_meeting': {
            validateRequired(args, ['meeting_id']);
            return zoomFetch(`/meetings/${encodeURIComponent(args.meeting_id as string)}`, token);
        }

        case 'create_meeting': {
            validateRequired(args, ['topic']);
            const body: Record<string, unknown> = {
                topic: args.topic,
                type: args.start_time ? 2 : 1, // 1=instant, 2=scheduled
            };
            if (args.start_time) body.start_time = args.start_time;
            if (args.duration_minutes !== undefined) body.duration = args.duration_minutes;
            if (args.timezone) body.timezone = args.timezone;
            if (args.agenda) body.agenda = args.agenda;
            if (args.password) body.password = args.password;
            const settings: Record<string, unknown> = {};
            if (args.host_video !== undefined) settings.host_video = args.host_video;
            if (args.participant_video !== undefined) settings.participant_video = args.participant_video;
            if (args.waiting_room !== undefined) settings.waiting_room = args.waiting_room;
            if (Object.keys(settings).length > 0) body.settings = settings;
            return zoomFetch('/users/me/meetings', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_meeting': {
            validateRequired(args, ['meeting_id']);
            const { meeting_id, ...rest } = args;
            const body: Record<string, unknown> = {};
            if (rest.topic !== undefined) body.topic = rest.topic;
            if (rest.start_time !== undefined) body.start_time = rest.start_time;
            if (rest.duration_minutes !== undefined) body.duration = rest.duration_minutes;
            if (rest.timezone !== undefined) body.timezone = rest.timezone;
            if (rest.agenda !== undefined) body.agenda = rest.agenda;
            if (rest.password !== undefined) body.password = rest.password;
            return zoomFetch(`/meetings/${encodeURIComponent(meeting_id as string)}`, token, {
                method: 'PATCH',
                body: JSON.stringify(body),
            });
        }

        case 'delete_meeting': {
            validateRequired(args, ['meeting_id']);
            return zoomFetch(`/meetings/${encodeURIComponent(args.meeting_id as string)}`, token, {
                method: 'DELETE',
            });
        }

        case 'get_meeting_participants': {
            validateRequired(args, ['meeting_id']);
            const params = new URLSearchParams();
            if (args.page_size) params.set('page_size', String(args.page_size));
            if (args.next_page_token) params.set('next_page_token', args.next_page_token as string);
            const qs = params.toString() ? `?${params}` : '';
            return zoomFetch(`/past_meetings/${encodeURIComponent(args.meeting_id as string)}/participants${qs}`, token);
        }

        case 'get_meeting_recordings': {
            validateRequired(args, ['meeting_id']);
            return zoomFetch(`/meetings/${encodeURIComponent(args.meeting_id as string)}/recordings`, token);
        }

        case 'list_past_meetings': {
            const params = new URLSearchParams();
            if (args.page_size) params.set('page_size', String(args.page_size));
            if (args.next_page_token) params.set('next_page_token', args.next_page_token as string);
            const qs = params.toString() ? `?${params}` : '';
            return zoomFetch(`/users/me/meetings${qs ? qs + '&' : '?'}type=previous_meetings`, token);
        }

        // ── Webinars ────────────────────────────────────────────────────────────

        case 'list_webinars': {
            const params = new URLSearchParams();
            if (args.page_size) params.set('page_size', String(args.page_size));
            if (args.page_number) params.set('page_number', String(args.page_number));
            const qs = params.toString() ? `?${params}` : '';
            return zoomFetch(`/users/me/webinars${qs}`, token);
        }

        case 'get_webinar': {
            validateRequired(args, ['webinar_id']);
            return zoomFetch(`/webinars/${encodeURIComponent(args.webinar_id as string)}`, token);
        }

        case 'create_webinar': {
            validateRequired(args, ['topic', 'start_time']);
            const body: Record<string, unknown> = {
                topic: args.topic,
                start_time: args.start_time,
            };
            if (args.duration_minutes !== undefined) body.duration = args.duration_minutes;
            if (args.agenda) body.agenda = args.agenda;
            if (args.timezone) body.timezone = args.timezone;
            return zoomFetch('/users/me/webinars', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_webinar_registrants': {
            validateRequired(args, ['webinar_id']);
            const params = new URLSearchParams();
            if (args.status) params.set('status', args.status as string);
            if (args.page_size) params.set('page_size', String(args.page_size));
            const qs = params.toString() ? `?${params}` : '';
            return zoomFetch(`/webinars/${encodeURIComponent(args.webinar_id as string)}/registrants${qs}`, token);
        }

        // ── Users ───────────────────────────────────────────────────────────────

        case 'get_user': {
            validateRequired(args, ['user_id']);
            return zoomFetch(`/users/${encodeURIComponent(args.user_id as string)}`, token);
        }

        case 'list_users': {
            const params = new URLSearchParams();
            if (args.status) params.set('status', args.status as string);
            if (args.page_size) params.set('page_size', String(args.page_size));
            if (args.next_page_token) params.set('next_page_token', args.next_page_token as string);
            const qs = params.toString() ? `?${params}` : '';
            return zoomFetch(`/users${qs}`, token);
        }

        case 'update_user': {
            validateRequired(args, ['user_id']);
            const { user_id, ...rest } = args;
            const body: Record<string, unknown> = {};
            if (rest.first_name !== undefined) body.first_name = rest.first_name;
            if (rest.last_name !== undefined) body.last_name = rest.last_name;
            if (rest.job_title !== undefined) body.job_title = rest.job_title;
            if (rest.dept !== undefined) body.dept = rest.dept;
            if (rest.company !== undefined) body.company = rest.company;
            if (rest.phone_number !== undefined) body.phone_number = rest.phone_number;
            return zoomFetch(`/users/${encodeURIComponent(user_id as string)}`, token, {
                method: 'PATCH',
                body: JSON.stringify(body),
            });
        }

        case 'get_user_settings': {
            validateRequired(args, ['user_id']);
            return zoomFetch(`/users/${encodeURIComponent(args.user_id as string)}/settings`, token);
        }

        // ── Reports & Cloud ─────────────────────────────────────────────────────

        case 'get_account_reports': {
            validateRequired(args, ['from', 'to']);
            const params = new URLSearchParams();
            params.set('from', args.from as string);
            params.set('to', args.to as string);
            return zoomFetch(`/report/daily?${params}`, token);
        }

        case 'get_meeting_summary': {
            validateRequired(args, ['meeting_id']);
            return zoomFetch(`/meetings/${encodeURIComponent(args.meeting_id as string)}/meeting_summary`, token);
        }

        case 'list_recordings': {
            const params = new URLSearchParams();
            if (args.from) params.set('from', args.from as string);
            if (args.to) params.set('to', args.to as string);
            if (args.page_size) params.set('page_size', String(args.page_size));
            if (args.next_page_token) params.set('next_page_token', args.next_page_token as string);
            const qs = params.toString() ? `?${params}` : '';
            return zoomFetch(`/users/me/recordings${qs}`, token);
        }

        case 'delete_recording': {
            validateRequired(args, ['meeting_id', 'recording_id']);
            const action = (args.action as string) || 'trash';
            return zoomFetch(
                `/meetings/${encodeURIComponent(args.meeting_id as string)}/recordings/${encodeURIComponent(args.recording_id as string)}?action=${action}`,
                token,
                { method: 'DELETE' },
            );
        }

        case '_ping': {
            return zoomFetch('/users/me', token);
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
                JSON.stringify({ status: 'ok', server: 'mcp-zoom', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-zoom', version: '1.0.0' },
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
            const { accountId, clientId, clientSecret } = getSecrets(request);
            const missing: string[] = [];
            if (!accountId) missing.push('ZOOM_ACCOUNT_ID (header: X-Mcp-Secret-ZOOM-ACCOUNT-ID)');
            if (!clientId) missing.push('ZOOM_CLIENT_ID (header: X-Mcp-Secret-ZOOM-CLIENT-ID)');
            if (!clientSecret) missing.push('ZOOM_CLIENT_SECRET (header: X-Mcp-Secret-ZOOM-CLIENT-SECRET)');
            if (missing.length > 0) {
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                // Exchange credentials for a fresh access token
                const token = await getAccessToken(accountId!, clientId!, clientSecret!);
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
