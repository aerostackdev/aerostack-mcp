/**
 * Luma MCP Worker
 * Implements MCP protocol over HTTP for Luma event management operations.
 * Secrets received via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   LUMA_API_KEY → X-Mcp-Secret-LUMA-API-KEY
 *
 * Auth: x-luma-api-key: {apiKey} (custom header)
 * Base URL: https://api.lu.ma/public/v1
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

const API_BASE = 'https://api.lu.ma/public/v1';

async function lumaFetch(apiKey: string, path: string, options: RequestInit = {}): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'x-luma-api-key': apiKey,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });
    if (res.status === 204) return {};
    const text = await res.text();
    if (!text) return {};
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw { code: -32603, message: `Luma HTTP ${res.status}: ${text}` }; }
    if (!res.ok) {
        const d = data as Record<string, unknown>;
        const msg = (d?.error as string) || (d?.message as string) || res.statusText;
        throw { code: -32603, message: `Luma API error ${res.status}: ${msg}` };
    }
    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_events',
        description: 'List upcoming events in the account.',
        inputSchema: {
            type: 'object',
            properties: {
                pagination_limit: { type: 'number', description: 'Max results to return (default: 25)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_event',
        description: 'Get details of a specific event by API ID.',
        inputSchema: {
            type: 'object',
            properties: { eventId: { type: 'string', description: 'Luma event API ID (e.g. evt-abc123)' } },
            required: ['eventId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_event',
        description: 'Create a new event.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Event name/title' },
                start_at: { type: 'string', description: 'Start time in ISO 8601 format' },
                end_at: { type: 'string', description: 'End time in ISO 8601 format' },
                timezone: { type: 'string', description: 'Timezone (e.g. America/New_York)' },
                description: { type: 'string', description: 'Event description (HTML)' },
                geo_address_visibility: { type: 'string', description: 'Address visibility: public or private' },
            },
            required: ['name', 'start_at', 'end_at', 'timezone'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_event',
        description: 'Update event details.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string', description: 'Event API ID to update' },
                name: { type: 'string', description: 'Updated event name' },
                start_at: { type: 'string', description: 'Updated start time' },
                end_at: { type: 'string', description: 'Updated end time' },
                description: { type: 'string', description: 'Updated description' },
                cover_url: { type: 'string', description: 'Cover image URL' },
            },
            required: ['eventId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_guests',
        description: 'List guests for an event.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string', description: 'Event API ID' },
                pagination_limit: { type: 'number', description: 'Max results (default: 50)' },
            },
            required: ['eventId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'invite_guest',
        description: 'Invite guests to an event by email.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string', description: 'Event API ID' },
                email: { type: 'string', description: 'Guest email to invite' },
                name: { type: 'string', description: 'Guest name (optional)' },
            },
            required: ['eventId', 'email'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_calendars',
        description: 'List all calendars in the account.',
        inputSchema: {
            type: 'object',
            properties: {
                pagination_limit: { type: 'number', description: 'Max results (default: 25)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_calendar',
        description: 'Get details of a specific calendar.',
        inputSchema: {
            type: 'object',
            properties: { calendarId: { type: 'string', description: 'Calendar API ID' } },
            required: ['calendarId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_calendar',
        description: 'Create a new calendar.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Calendar name' },
                description: { type: 'string', description: 'Calendar description' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_calendar_events',
        description: 'List events in a specific calendar.',
        inputSchema: {
            type: 'object',
            properties: {
                calendarId: { type: 'string', description: 'Calendar API ID' },
                pagination_limit: { type: 'number', description: 'Max results (default: 25)' },
            },
            required: ['calendarId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_people',
        description: 'List people in the community.',
        inputSchema: {
            type: 'object',
            properties: {
                pagination_limit: { type: 'number', description: 'Max results (default: 25)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_person',
        description: 'Get details of a person by email address.',
        inputSchema: {
            type: 'object',
            properties: { email: { type: 'string', description: 'Person email address' } },
            required: ['email'],
        },
        annotations: { readOnlyHint: true },
    },
];

// ── Request handler ───────────────────────────────────────────────────────────

async function handleRequest(request: Request): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', mcp: 'mcp-luma' }), {
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
            serverInfo: { name: 'mcp-luma', version: '1.0.0' },
        });
    }

    if (body.method === 'tools/list') {
        return rpcOk(id, { tools: TOOLS });
    }

    if (body.method === 'tools/call') {
        const apiKey = request.headers.get('X-Mcp-Secret-LUMA-API-KEY');
        if (!apiKey) return rpcErr(id, -32001, 'Missing required secret: LUMA_API_KEY');

        const toolName = (body.params?.name ?? '') as string;
        const args = (body.params?.arguments ?? {}) as Record<string, unknown>;

        try {
            const result = await dispatchTool(apiKey, toolName, args);
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

async function dispatchTool(apiKey: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
        case 'list_events': {
            const limit = (args.pagination_limit as number) ?? 25;
            const data = await lumaFetch(apiKey, `/event/list?pagination_limit=${limit}`);
            return toolOk(data);
        }
        case 'get_event': {
            validateRequired(args, ['eventId']);
            const data = await lumaFetch(apiKey, `/event/get?api_id=${args.eventId}`);
            return toolOk(data);
        }
        case 'create_event': {
            validateRequired(args, ['name', 'start_at', 'end_at', 'timezone']);
            const body: Record<string, unknown> = {
                name: args.name,
                start_at: args.start_at,
                end_at: args.end_at,
                timezone: args.timezone,
            };
            if (args.description) body.description = args.description;
            if (args.geo_address_visibility) body.geo_address_visibility = args.geo_address_visibility;
            const data = await lumaFetch(apiKey, '/event/create', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            return toolOk(data);
        }
        case 'update_event': {
            validateRequired(args, ['eventId']);
            const { eventId, ...rest } = args;
            const body: Record<string, unknown> = { api_id: eventId, ...rest };
            const data = await lumaFetch(apiKey, '/event/update', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            return toolOk(data);
        }
        case 'list_guests': {
            validateRequired(args, ['eventId']);
            const limit = (args.pagination_limit as number) ?? 50;
            const data = await lumaFetch(apiKey, `/event/get-guests?event_api_id=${args.eventId}&pagination_limit=${limit}`);
            return toolOk(data);
        }
        case 'invite_guest': {
            validateRequired(args, ['eventId', 'email']);
            const invitee: Record<string, unknown> = { email: args.email };
            if (args.name) invitee.name = args.name;
            const data = await lumaFetch(apiKey, '/event/invite-guests', {
                method: 'POST',
                body: JSON.stringify({ event_api_id: args.eventId, invitees: [invitee] }),
            });
            return toolOk(data);
        }
        case 'list_calendars': {
            const limit = (args.pagination_limit as number) ?? 25;
            const data = await lumaFetch(apiKey, `/calendar/list?pagination_limit=${limit}`);
            return toolOk(data);
        }
        case 'get_calendar': {
            validateRequired(args, ['calendarId']);
            const data = await lumaFetch(apiKey, `/calendar/get?api_id=${args.calendarId}`);
            return toolOk(data);
        }
        case 'create_calendar': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.description) body.description = args.description;
            const data = await lumaFetch(apiKey, '/calendar/create', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            return toolOk(data);
        }
        case 'list_calendar_events': {
            validateRequired(args, ['calendarId']);
            const limit = (args.pagination_limit as number) ?? 25;
            const data = await lumaFetch(apiKey, `/calendar/list-events?calendar_api_id=${args.calendarId}&pagination_limit=${limit}`);
            return toolOk(data);
        }
        case 'get_people': {
            const limit = (args.pagination_limit as number) ?? 25;
            const data = await lumaFetch(apiKey, `/people/list?pagination_limit=${limit}`);
            return toolOk(data);
        }
        case 'get_person': {
            validateRequired(args, ['email']);
            const data = await lumaFetch(apiKey, `/people/get?email=${encodeURIComponent(args.email as string)}`);
            return toolOk(data);
        }
        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

export default { fetch: handleRequest };
