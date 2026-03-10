/**
 * Google Calendar MCP Worker
 * Implements MCP protocol over HTTP for Google Calendar API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: GOOGLE_ACCESS_TOKEN -> header: X-Mcp-Secret-GOOGLE-ACCESS-TOKEN
 */

const GCAL_API = 'https://www.googleapis.com/calendar/v3';

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

const TOOLS = [
    {
        name: 'list_calendars',
        description: 'List all calendars for the authenticated user',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'list_events',
        description: 'List events in a calendar within an optional time range',
        inputSchema: {
            type: 'object',
            properties: {
                calendarId: { type: 'string', description: 'Calendar ID (default "primary")' },
                timeMin: { type: 'string', description: 'Lower bound (RFC3339 timestamp, e.g. 2024-01-01T00:00:00Z)' },
                timeMax: { type: 'string', description: 'Upper bound (RFC3339 timestamp)' },
                maxResults: { type: 'number', description: 'Maximum number of events (default 10, max 50)' },
            },
        },
    },
    {
        name: 'get_event',
        description: 'Get details of a specific calendar event',
        inputSchema: {
            type: 'object',
            properties: {
                calendarId: { type: 'string', description: 'Calendar ID (default "primary")' },
                eventId: { type: 'string', description: 'Event ID' },
            },
            required: ['eventId'],
        },
    },
    {
        name: 'create_event',
        description: 'Create a new calendar event',
        inputSchema: {
            type: 'object',
            properties: {
                calendarId: { type: 'string', description: 'Calendar ID (default "primary")' },
                summary: { type: 'string', description: 'Event title' },
                description: { type: 'string', description: 'Event description' },
                startDateTime: { type: 'string', description: 'Start time (RFC3339 timestamp, e.g. 2024-06-15T09:00:00-07:00)' },
                endDateTime: { type: 'string', description: 'End time (RFC3339 timestamp)' },
                timeZone: { type: 'string', description: 'Time zone (e.g. America/Los_Angeles). Applies to both start and end.' },
                attendees: { type: 'array', items: { type: 'string' }, description: 'List of attendee email addresses' },
                location: { type: 'string', description: 'Event location' },
            },
            required: ['summary', 'startDateTime', 'endDateTime'],
        },
    },
    {
        name: 'update_event',
        description: 'Update an existing calendar event (partial update)',
        inputSchema: {
            type: 'object',
            properties: {
                calendarId: { type: 'string', description: 'Calendar ID (default "primary")' },
                eventId: { type: 'string', description: 'Event ID to update' },
                summary: { type: 'string', description: 'New event title' },
                description: { type: 'string', description: 'New event description' },
                startDateTime: { type: 'string', description: 'New start time (RFC3339 timestamp)' },
                endDateTime: { type: 'string', description: 'New end time (RFC3339 timestamp)' },
                timeZone: { type: 'string', description: 'Time zone (e.g. America/Los_Angeles)' },
                attendees: { type: 'array', items: { type: 'string' }, description: 'Updated list of attendee emails' },
                location: { type: 'string', description: 'New event location' },
            },
            required: ['eventId'],
        },
    },
    {
        name: 'delete_event',
        description: 'Delete a calendar event',
        inputSchema: {
            type: 'object',
            properties: {
                calendarId: { type: 'string', description: 'Calendar ID (default "primary")' },
                eventId: { type: 'string', description: 'Event ID to delete' },
            },
            required: ['eventId'],
        },
    },
    {
        name: 'quick_add',
        description: 'Quick-add an event using natural language text (e.g. "Lunch with Bob at noon tomorrow")',
        inputSchema: {
            type: 'object',
            properties: {
                calendarId: { type: 'string', description: 'Calendar ID (default "primary")' },
                text: { type: 'string', description: 'Natural language event description' },
            },
            required: ['text'],
        },
    },
];

async function gcal(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${GCAL_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Aerostack-MCP/1.0',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Google Calendar API ${res.status}: ${err}`);
    }
    // DELETE returns 204 with no body
    if (res.status === 204) return { deleted: true };
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'list_calendars': {
            const data = await gcal('/users/me/calendarList', token) as any;
            return (data.items ?? []).map((c: any) => ({
                id: c.id,
                summary: c.summary,
                description: c.description,
                timeZone: c.timeZone,
                primary: c.primary ?? false,
                accessRole: c.accessRole,
                backgroundColor: c.backgroundColor,
            }));
        }

        case 'list_events': {
            const calendarId = encodeURIComponent((args.calendarId as string) ?? 'primary');
            const maxResults = Math.min(Number(args.maxResults ?? 10), 50);
            const params = new URLSearchParams({
                maxResults: String(maxResults),
                singleEvents: 'true',
                orderBy: 'startTime',
            });
            if (args.timeMin) params.set('timeMin', args.timeMin as string);
            if (args.timeMax) params.set('timeMax', args.timeMax as string);

            const data = await gcal(`/calendars/${calendarId}/events?${params.toString()}`, token) as any;
            return (data.items ?? []).map((e: any) => ({
                id: e.id,
                summary: e.summary,
                status: e.status,
                start: e.start?.dateTime ?? e.start?.date,
                end: e.end?.dateTime ?? e.end?.date,
                location: e.location,
                organizer: e.organizer?.email,
                htmlLink: e.htmlLink,
            }));
        }

        case 'get_event': {
            const calendarId = encodeURIComponent((args.calendarId as string) ?? 'primary');
            const event = await gcal(`/calendars/${calendarId}/events/${args.eventId}`, token) as any;
            return {
                id: event.id,
                summary: event.summary,
                description: event.description,
                status: event.status,
                start: event.start?.dateTime ?? event.start?.date,
                end: event.end?.dateTime ?? event.end?.date,
                timeZone: event.start?.timeZone,
                location: event.location,
                attendees: event.attendees?.map((a: any) => ({
                    email: a.email,
                    responseStatus: a.responseStatus,
                })) ?? [],
                organizer: event.organizer?.email,
                htmlLink: event.htmlLink,
                created: event.created,
                updated: event.updated,
            };
        }

        case 'create_event': {
            const calendarId = encodeURIComponent((args.calendarId as string) ?? 'primary');
            const body: Record<string, unknown> = {
                summary: args.summary,
                start: {
                    dateTime: args.startDateTime,
                    timeZone: args.timeZone,
                },
                end: {
                    dateTime: args.endDateTime,
                    timeZone: args.timeZone,
                },
            };
            if (args.description) body.description = args.description;
            if (args.location) body.location = args.location;
            if (args.attendees) {
                body.attendees = (args.attendees as string[]).map(email => ({ email }));
            }

            const event = await gcal(`/calendars/${calendarId}/events`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;
            return {
                id: event.id,
                summary: event.summary,
                start: event.start?.dateTime ?? event.start?.date,
                end: event.end?.dateTime ?? event.end?.date,
                htmlLink: event.htmlLink,
            };
        }

        case 'update_event': {
            const calendarId = encodeURIComponent((args.calendarId as string) ?? 'primary');
            const body: Record<string, unknown> = {};
            if (args.summary) body.summary = args.summary;
            if (args.description) body.description = args.description;
            if (args.location) body.location = args.location;
            if (args.startDateTime) {
                body.start = { dateTime: args.startDateTime, timeZone: args.timeZone };
            }
            if (args.endDateTime) {
                body.end = { dateTime: args.endDateTime, timeZone: args.timeZone };
            }
            if (args.attendees) {
                body.attendees = (args.attendees as string[]).map(email => ({ email }));
            }

            const event = await gcal(`/calendars/${calendarId}/events/${args.eventId}`, token, {
                method: 'PATCH',
                body: JSON.stringify(body),
            }) as any;
            return {
                id: event.id,
                summary: event.summary,
                start: event.start?.dateTime ?? event.start?.date,
                end: event.end?.dateTime ?? event.end?.date,
                htmlLink: event.htmlLink,
                updated: event.updated,
            };
        }

        case 'delete_event': {
            const calendarId = encodeURIComponent((args.calendarId as string) ?? 'primary');
            await gcal(`/calendars/${calendarId}/events/${args.eventId}`, token, {
                method: 'DELETE',
            });
            return { deleted: true, eventId: args.eventId };
        }

        case 'quick_add': {
            const calendarId = encodeURIComponent((args.calendarId as string) ?? 'primary');
            const text = encodeURIComponent(args.text as string);
            const event = await gcal(`/calendars/${calendarId}/events/quickAdd?text=${text}`, token, {
                method: 'POST',
            }) as any;
            return {
                id: event.id,
                summary: event.summary,
                start: event.start?.dateTime ?? event.start?.date,
                end: event.end?.dateTime ?? event.end?.date,
                htmlLink: event.htmlLink,
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'google-calendar-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'google-calendar-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            // Read token from injected secret header (underscore key -> hyphen header)
            const token = request.headers.get('X-Mcp-Secret-GOOGLE-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing GOOGLE_ACCESS_TOKEN secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
