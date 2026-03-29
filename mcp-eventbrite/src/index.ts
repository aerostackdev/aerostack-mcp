/**
 * Eventbrite MCP Worker
 * Implements MCP protocol over HTTP for Eventbrite event management operations.
 * Secrets received via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   EVENTBRITE_TOKEN → X-Mcp-Secret-EVENTBRITE-TOKEN
 *
 * Auth: Authorization: Bearer {token}
 * Base URL: https://www.eventbriteapi.com/v3
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpcOk(id: string | number | null, result: unknown): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: string | number | null, code: number, message: string): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    const missing = fields.filter(f => args[f] === undefined || args[f] === null || args[f] === '');
    if (missing.length > 0) throw new Error(`Missing required fields: ${missing.join(', ')}`);
}

const API_BASE = 'https://www.eventbriteapi.com/v3';

async function ebFetch(token: string, path: string, options: RequestInit = {}): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });
    if (res.status === 204) return {};
    const text = await res.text();
    if (!text) return {};
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw { code: -32603, message: `Eventbrite HTTP ${res.status}: ${text}` }; }
    if (!res.ok) {
        const d = data as Record<string, unknown>;
        const msg = (d?.error_description as string) || (d?.description as string) || res.statusText;
        throw { code: -32603, message: `Eventbrite API error ${res.status}: ${msg}` };
    }
    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_organizations',
        description: 'List all organizations the authenticated user belongs to.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_events',
        description: 'List events for an organization.',
        inputSchema: {
            type: 'object',
            properties: {
                organizationId: { type: 'string', description: 'Organization ID' },
                status: { type: 'string', description: 'Filter: live, draft, canceled, ended (default: live)' },
            },
            required: ['organizationId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_event',
        description: 'Get detailed information about a specific event.',
        inputSchema: {
            type: 'object',
            properties: { eventId: { type: 'string', description: 'Eventbrite event ID' } },
            required: ['eventId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_event',
        description: 'Create a new event in an organization.',
        inputSchema: {
            type: 'object',
            properties: {
                organizationId: { type: 'string', description: 'Organization ID to create event in' },
                name: { type: 'string', description: 'Event name (HTML)' },
                startUtc: { type: 'string', description: 'Start datetime in UTC (e.g. 2026-06-01T18:00:00Z)' },
                endUtc: { type: 'string', description: 'End datetime in UTC' },
                timezone: { type: 'string', description: 'Timezone (e.g. America/New_York)' },
                currency: { type: 'string', description: 'Currency code (e.g. USD)' },
                onlineEvent: { type: 'boolean', description: 'Is this an online event?' },
                venueId: { type: 'string', description: 'Venue ID for in-person events' },
            },
            required: ['organizationId', 'name', 'startUtc', 'endUtc', 'timezone', 'currency'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_event',
        description: 'Update event details.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string', description: 'Event ID to update' },
                name: { type: 'string', description: 'Updated event name' },
                startUtc: { type: 'string', description: 'Updated start time in UTC' },
                endUtc: { type: 'string', description: 'Updated end time in UTC' },
                timezone: { type: 'string', description: 'Updated timezone' },
            },
            required: ['eventId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'publish_event',
        description: 'Publish an event to make it publicly visible.',
        inputSchema: {
            type: 'object',
            properties: { eventId: { type: 'string', description: 'Event ID to publish' } },
            required: ['eventId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'cancel_event',
        description: 'Cancel a live event.',
        inputSchema: {
            type: 'object',
            properties: { eventId: { type: 'string', description: 'Event ID to cancel' } },
            required: ['eventId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_attendees',
        description: 'List attendees for an event.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string', description: 'Event ID' },
                page: { type: 'number', description: 'Page number (default: 1)' },
            },
            required: ['eventId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_attendee',
        description: 'Get details of a specific attendee.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string', description: 'Event ID' },
                attendeeId: { type: 'string', description: 'Attendee ID' },
            },
            required: ['eventId', 'attendeeId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_orders',
        description: 'List orders for an event.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string', description: 'Event ID' },
                page: { type: 'number', description: 'Page number (default: 1)' },
            },
            required: ['eventId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_venues',
        description: 'List venues for an organization.',
        inputSchema: {
            type: 'object',
            properties: { organizationId: { type: 'string', description: 'Organization ID' } },
            required: ['organizationId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_event_summary',
        description: 'Get summary statistics for an event including sales and attendance.',
        inputSchema: {
            type: 'object',
            properties: { eventId: { type: 'string', description: 'Event ID' } },
            required: ['eventId'],
        },
        annotations: { readOnlyHint: true },
    },
];

// ── Request handler ───────────────────────────────────────────────────────────

async function handleRequest(request: Request): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', mcp: 'mcp-eventbrite' }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    let body: { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
    try {
        body = await request.json() as typeof body;
    } catch {
        return rpcErr(null, -32700, 'Parse error: invalid JSON');
    }

    const id = body.id ?? null;

    if (body.method === 'initialize') {
        return rpcOk(id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'mcp-eventbrite', version: '1.0.0' },
        });
    }

    if (body.method === 'tools/list') {
        return rpcOk(id, { tools: TOOLS });
    }

    if (body.method === 'tools/call') {
        const token = request.headers.get('X-Mcp-Secret-EVENTBRITE-TOKEN');
        if (!token) return rpcErr(id, -32001, 'Missing required secret: EVENTBRITE_TOKEN');

        const toolName = (body.params?.name ?? '') as string;
        const args = (body.params?.arguments ?? {}) as Record<string, unknown>;

        try {
            const result = await dispatchTool(token, toolName, args);
            return rpcOk(id, result);
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err) {
                const e = err as { code: number; message: string };
                return rpcErr(id, e.code, e.message);
            }
            return rpcErr(id, -32603, err instanceof Error ? err.message : String(err));
        }
    }

    return rpcErr(id, -32601, `Method not found: ${body.method}`);
}

async function dispatchTool(token: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case 'list_organizations': {
            const data = await ebFetch(token, '/users/me/organizations/');
            return toolOk(data);
        }
        case 'list_events': {
            validateRequired(args, ['organizationId']);
            const status = (args.status as string) ?? 'live';
            const data = await ebFetch(token, `/organizations/${args.organizationId}/events/?status=${status}&order_by=start_asc`);
            return toolOk(data);
        }
        case 'get_event': {
            validateRequired(args, ['eventId']);
            const data = await ebFetch(token, `/events/${args.eventId}/`);
            return toolOk(data);
        }
        case 'create_event': {
            validateRequired(args, ['organizationId', 'name', 'startUtc', 'endUtc', 'timezone', 'currency']);
            const eventBody: Record<string, unknown> = {
                event: {
                    name: { html: args.name },
                    start: { timezone: args.timezone, utc: args.startUtc },
                    end: { timezone: args.timezone, utc: args.endUtc },
                    currency: args.currency,
                },
            };
            if (args.onlineEvent !== undefined) (eventBody.event as Record<string, unknown>).online_event = args.onlineEvent;
            if (args.venueId) (eventBody.event as Record<string, unknown>).venue_id = args.venueId;
            const data = await ebFetch(token, `/organizations/${args.organizationId}/events/`, {
                method: 'POST',
                body: JSON.stringify(eventBody),
            });
            return toolOk(data);
        }
        case 'update_event': {
            validateRequired(args, ['eventId']);
            const { eventId, ...fields } = args;
            const eventUpdate: Record<string, unknown> = {};
            if (fields.name) eventUpdate.name = { html: fields.name };
            if (fields.startUtc && fields.timezone) eventUpdate.start = { timezone: fields.timezone, utc: fields.startUtc };
            if (fields.endUtc && fields.timezone) eventUpdate.end = { timezone: fields.timezone, utc: fields.endUtc };
            const data = await ebFetch(token, `/events/${eventId}/`, {
                method: 'POST',
                body: JSON.stringify({ event: eventUpdate }),
            });
            return toolOk(data);
        }
        case 'publish_event': {
            validateRequired(args, ['eventId']);
            const data = await ebFetch(token, `/events/${args.eventId}/publish/`, { method: 'POST', body: JSON.stringify({}) });
            return toolOk(data);
        }
        case 'cancel_event': {
            validateRequired(args, ['eventId']);
            const data = await ebFetch(token, `/events/${args.eventId}/cancel/`, { method: 'POST', body: JSON.stringify({}) });
            return toolOk(data);
        }
        case 'list_attendees': {
            validateRequired(args, ['eventId']);
            const page = (args.page as number) ?? 1;
            const data = await ebFetch(token, `/events/${args.eventId}/attendees/?page=${page}`);
            return toolOk(data);
        }
        case 'get_attendee': {
            validateRequired(args, ['eventId', 'attendeeId']);
            const data = await ebFetch(token, `/events/${args.eventId}/attendees/${args.attendeeId}/`);
            return toolOk(data);
        }
        case 'list_orders': {
            validateRequired(args, ['eventId']);
            const page = (args.page as number) ?? 1;
            const data = await ebFetch(token, `/events/${args.eventId}/orders/?page=${page}`);
            return toolOk(data);
        }
        case 'list_venues': {
            validateRequired(args, ['organizationId']);
            const data = await ebFetch(token, `/organizations/${args.organizationId}/venues/`);
            return toolOk(data);
        }
        case 'get_event_summary': {
            validateRequired(args, ['eventId']);
            const data = await ebFetch(token, `/events/${args.eventId}/summary/`);
            return toolOk(data);
        }
        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

export default { fetch: handleRequest };
