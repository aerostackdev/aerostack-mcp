/**
 * Cal.com MCP Worker
 * Implements MCP protocol over HTTP for Cal.com scheduling operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   CAL_COM_API_KEY → X-Mcp-Secret-CAL-COM-API-KEY (Settings → Developer → API Keys)
 *
 * Auth format: Bearer token
 * Cal.com v2 API — base: https://api.cal.com/v2, version header: 2024-08-13
 *
 * Covers: Event Types (4), Bookings (6), Availability (3), Users & Me (2) = 15 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const CAL_API_BASE = 'https://api.cal.com/v2';
const CAL_API_VERSION = '2024-08-13';

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

function getToken(request: Request): string | null {
    return request.headers.get('X-Mcp-Secret-CAL-COM-API-KEY');
}

async function calFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${CAL_API_BASE}${path}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'cal-api-version': CAL_API_VERSION,
            ...((options.headers as Record<string, string>) ?? {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Cal.com HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        const d = data as Record<string, unknown>;
        const msg = (d?.message as string) || (d?.error as string) || res.statusText;
        throw { code: -32603, message: `Cal.com API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── _ping ─────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify Cal.com credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 1 — Event Types (4 tools) ──────────────────────────────────────

    {
        name: 'list_event_types',
        description: 'List all event types for the authenticated user. Event types define bookable slots — e.g. "30 min call", "1 hour consultation". Returns id, title, slug, length (minutes), and description.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_event_type',
        description: 'Get full details of a specific event type by ID, including locations, scheduling constraints, and metadata.',
        inputSchema: {
            type: 'object',
            properties: {
                event_type_id: {
                    type: 'number',
                    description: 'Cal.com numeric event type ID (e.g. 123)',
                },
            },
            required: ['event_type_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_event_type',
        description: 'Create a new bookable event type. Defines a meeting template with title, URL slug, duration (minutes), optional description, and meeting locations (in-person address, video link, or integration like Google Meet).',
        inputSchema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Display name of the event (e.g. "30 Minute Call")',
                },
                slug: {
                    type: 'string',
                    description: 'URL-friendly slug for the booking page (e.g. "30min-call"). Must be lowercase, no spaces.',
                },
                length: {
                    type: 'number',
                    description: 'Duration of the meeting in minutes (e.g. 30, 60)',
                },
                description: {
                    type: 'string',
                    description: 'Optional description shown on the booking page',
                },
                locations: {
                    type: 'array',
                    description: 'Meeting location options. Each item: { type: "inPerson"|"link"|"integration", address?: string, link?: string }',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['inPerson', 'link', 'integration'] },
                            address: { type: 'string', description: 'Physical address (for inPerson)' },
                            link: { type: 'string', description: 'Video call URL (for link type)' },
                        },
                        required: ['type'],
                    },
                },
            },
            required: ['title', 'slug', 'length'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_event_type',
        description: 'Delete an event type by ID. This removes the booking page and prevents future bookings. Existing bookings are NOT cancelled.',
        inputSchema: {
            type: 'object',
            properties: {
                event_type_id: {
                    type: 'number',
                    description: 'Cal.com numeric event type ID to delete',
                },
            },
            required: ['event_type_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 2 — Bookings (6 tools) ──────────────────────────────────────────

    {
        name: 'list_bookings',
        description: 'List bookings with optional filters for status, attendee email, pagination. Returns booking UID, title, start/end times, attendees, and status.',
        inputSchema: {
            type: 'object',
            properties: {
                take: {
                    type: 'number',
                    description: 'Number of bookings to return (default 20)',
                },
                skip: {
                    type: 'number',
                    description: 'Number of bookings to skip for pagination (default 0)',
                },
                status: {
                    type: 'string',
                    enum: ['upcoming', 'recurring', 'past', 'cancelled', 'unconfirmed'],
                    description: 'Filter by booking status',
                },
                attendee_email: {
                    type: 'string',
                    description: 'Filter bookings by attendee email address',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_booking',
        description: 'Get full details of a specific booking by UID — attendees, event type, start/end, location, metadata, and status.',
        inputSchema: {
            type: 'object',
            properties: {
                booking_uid: {
                    type: 'string',
                    description: 'Cal.com booking UID (e.g. "abc123xyz")',
                },
            },
            required: ['booking_uid'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_booking',
        description: 'Create a new booking for an event type. Requires the event type ID, start time (ISO 8601), and attendee details. Use get_availability first to find open slots.',
        inputSchema: {
            type: 'object',
            properties: {
                event_type_id: {
                    type: 'number',
                    description: 'ID of the event type to book',
                },
                start: {
                    type: 'string',
                    description: 'Start time as ISO 8601 datetime (e.g. "2024-08-13T10:00:00Z")',
                },
                attendee_name: {
                    type: 'string',
                    description: "Attendee's full name",
                },
                attendee_email: {
                    type: 'string',
                    description: "Attendee's email address",
                },
                attendee_time_zone: {
                    type: 'string',
                    description: "Attendee's IANA time zone (e.g. \"America/New_York\", \"Europe/London\")",
                },
                metadata: {
                    type: 'object',
                    description: 'Optional key-value metadata to attach to the booking (e.g. { "source": "chatbot" })',
                    additionalProperties: true,
                },
            },
            required: ['event_type_id', 'start', 'attendee_name', 'attendee_email', 'attendee_time_zone'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'reschedule_booking',
        description: 'Reschedule an existing booking to a new start time. Provide a rescheduling reason and the new ISO 8601 start datetime. Use get_availability to find open slots first.',
        inputSchema: {
            type: 'object',
            properties: {
                booking_uid: {
                    type: 'string',
                    description: 'Cal.com booking UID to reschedule',
                },
                start: {
                    type: 'string',
                    description: 'New start time as ISO 8601 datetime (e.g. "2024-08-14T11:00:00Z")',
                },
                rescheduled_reason: {
                    type: 'string',
                    description: 'Reason for rescheduling (optional but recommended)',
                },
            },
            required: ['booking_uid', 'start'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'cancel_booking',
        description: 'Cancel an existing booking by UID. Optionally provide a cancellation reason.',
        inputSchema: {
            type: 'object',
            properties: {
                booking_uid: {
                    type: 'string',
                    description: 'Cal.com booking UID to cancel',
                },
                cancellation_reason: {
                    type: 'string',
                    description: 'Reason for cancellation (optional)',
                },
            },
            required: ['booking_uid'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'mark_no_show',
        description: 'Mark the host as a no-show for a booking. Sets noShowHost=true on the booking record.',
        inputSchema: {
            type: 'object',
            properties: {
                booking_uid: {
                    type: 'string',
                    description: 'Cal.com booking UID to mark as no-show',
                },
            },
            required: ['booking_uid'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 3 — Availability (3 tools) ─────────────────────────────────────

    {
        name: 'get_availability',
        description: 'Get available time slots for an event type within a date range. Returns slots grouped by date. Use this before create_booking to find open times.',
        inputSchema: {
            type: 'object',
            properties: {
                event_type_id: {
                    type: 'number',
                    description: 'Event type ID to check availability for',
                },
                start_time: {
                    type: 'string',
                    description: 'Start of date range as ISO 8601 (e.g. "2024-08-13T00:00:00Z")',
                },
                end_time: {
                    type: 'string',
                    description: 'End of date range as ISO 8601 (e.g. "2024-08-20T23:59:59Z")',
                },
                time_zone: {
                    type: 'string',
                    description: 'IANA time zone for slot display (default: "UTC")',
                },
            },
            required: ['event_type_id', 'start_time', 'end_time'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_busy_times',
        description: 'Get busy/blocked time periods for a user within a date range. Useful for calendar conflict detection.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'number',
                    description: 'Cal.com user ID to check busy times for',
                },
                date_from: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format (e.g. "2024-08-13")',
                },
                date_to: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format (e.g. "2024-08-20")',
                },
                time_zone: {
                    type: 'string',
                    description: 'IANA time zone (default: "UTC")',
                },
            },
            required: ['user_id', 'date_from', 'date_to'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_schedules',
        description: 'List all availability schedules for the authenticated user. Schedules define recurring weekly availability windows (e.g. Mon-Fri 9am-5pm).',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Users & Me (2 tools) ────────────────────────────────────────

    {
        name: 'get_me',
        description: 'Get the profile of the authenticated Cal.com user — name, email, time zone, week start, time format, and account settings.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_me',
        description: 'Update profile settings for the authenticated user — name, time zone, week start day, or time format (12/24h).',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Display name',
                },
                time_zone: {
                    type: 'string',
                    description: 'IANA time zone (e.g. "America/New_York")',
                },
                week_start: {
                    type: 'string',
                    enum: ['Sunday', 'Monday', 'Saturday'],
                    description: 'First day of the week for calendar display',
                },
                time_format: {
                    type: 'number',
                    enum: [12, 24],
                    description: 'Time display format — 12 or 24 hour',
                },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {

        case '_ping': {
            return calFetch('/me', token);
        }

        // ── Event Types ───────────────────────────────────────────────────────

        case 'list_event_types': {
            return calFetch('/event-types', token);
        }

        case 'get_event_type': {
            validateRequired(args, ['event_type_id']);
            return calFetch(`/event-types/${args.event_type_id as number}`, token);
        }

        case 'create_event_type': {
            validateRequired(args, ['title', 'slug', 'length']);
            const body: Record<string, unknown> = {
                title: args.title,
                slug: args.slug,
                length: args.length,
            };
            if (args.description !== undefined) body.description = args.description;
            if (args.locations !== undefined) body.locations = args.locations;
            return calFetch('/event-types', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'delete_event_type': {
            validateRequired(args, ['event_type_id']);
            return calFetch(`/event-types/${args.event_type_id as number}`, token, {
                method: 'DELETE',
            });
        }

        // ── Bookings ──────────────────────────────────────────────────────────

        case 'list_bookings': {
            const params = new URLSearchParams();
            params.set('take', String((args.take as number) ?? 20));
            params.set('skip', String((args.skip as number) ?? 0));
            if (args.status) params.set('status', args.status as string);
            if (args.attendee_email) params.set('attendeeEmail', args.attendee_email as string);
            return calFetch(`/bookings?${params}`, token);
        }

        case 'get_booking': {
            validateRequired(args, ['booking_uid']);
            return calFetch(`/bookings/${args.booking_uid as string}`, token);
        }

        case 'create_booking': {
            validateRequired(args, ['event_type_id', 'start', 'attendee_name', 'attendee_email', 'attendee_time_zone']);
            const body: Record<string, unknown> = {
                eventTypeId: args.event_type_id,
                start: args.start,
                attendee: {
                    name: args.attendee_name,
                    email: args.attendee_email,
                    timeZone: args.attendee_time_zone,
                },
                metadata: (args.metadata as Record<string, unknown>) ?? {},
            };
            return calFetch('/bookings', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'reschedule_booking': {
            validateRequired(args, ['booking_uid', 'start']);
            const body: Record<string, unknown> = {
                start: args.start,
            };
            if (args.rescheduled_reason !== undefined) body.rescheduledReason = args.rescheduled_reason;
            return calFetch(`/bookings/${args.booking_uid as string}/reschedule`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'cancel_booking': {
            validateRequired(args, ['booking_uid']);
            const body: Record<string, unknown> = {};
            if (args.cancellation_reason !== undefined) body.cancellationReason = args.cancellation_reason;
            return calFetch(`/bookings/${args.booking_uid as string}/cancel`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'mark_no_show': {
            validateRequired(args, ['booking_uid']);
            return calFetch(`/bookings/${args.booking_uid as string}/no-show`, token, {
                method: 'POST',
                body: JSON.stringify({ noShowHost: true }),
            });
        }

        // ── Availability ──────────────────────────────────────────────────────

        case 'get_availability': {
            validateRequired(args, ['event_type_id', 'start_time', 'end_time']);
            const params = new URLSearchParams({
                eventTypeId: String(args.event_type_id),
                startTime: args.start_time as string,
                endTime: args.end_time as string,
                timeZone: (args.time_zone as string) || 'UTC',
            });
            return calFetch(`/slots/available?${params}`, token);
        }

        case 'get_busy_times': {
            validateRequired(args, ['user_id', 'date_from', 'date_to']);
            const params = new URLSearchParams({
                userId: String(args.user_id),
                dateFrom: args.date_from as string,
                dateTo: args.date_to as string,
                timeZone: (args.time_zone as string) || 'UTC',
            });
            return calFetch(`/busy?${params}`, token);
        }

        case 'list_schedules': {
            return calFetch('/schedules', token);
        }

        // ── Users & Me ────────────────────────────────────────────────────────

        case 'get_me': {
            return calFetch('/me', token);
        }

        case 'update_me': {
            const body: Record<string, unknown> = {};
            if (args.name !== undefined) body.name = args.name;
            if (args.time_zone !== undefined) body.timeZone = args.time_zone;
            if (args.week_start !== undefined) body.weekStart = args.week_start;
            if (args.time_format !== undefined) body.timeFormat = args.time_format;
            return calFetch('/me', token, {
                method: 'PATCH',
                body: JSON.stringify(body),
            });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-cal-com', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        // Parse JSON-RPC body
        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error — invalid JSON');
        }

        const { id, method, params } = body;

        // ── Protocol methods ──────────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-cal-com', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'notifications/initialized') {
            return rpcOk(id, {});
        }

        if (method !== 'tools/call') {
            return rpcErr(id, -32601, `Method not found: ${method}`);
        }

        // ── tools/call ────────────────────────────────────────────────────────

        // Extract secret from header
        const token = getToken(request);

        if (!token) {
            return rpcErr(
                id,
                -32001,
                'Missing required secret — add CAL_COM_API_KEY to workspace secrets',
            );
        }

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        try {
            const result = await callTool(toolName, args, token);
            return rpcOk(id, toolOk(result));
        } catch (err) {
            const isRpcError = err !== null && typeof err === 'object' && 'code' in err;
            if (isRpcError) {
                const e = err as { code: number; message: string };
                return rpcErr(id, e.code, e.message);
            }
            const msg = err instanceof Error ? err.message : String(err);
            return rpcErr(id, -32603, msg);
        }
    },
};
