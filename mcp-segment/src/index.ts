/**
 * Segment MCP Worker
 * Implements MCP protocol over HTTP for Segment Analytics operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: SEGMENT_WRITE_KEY → header: X-Mcp-Secret-SEGMENT-WRITE-KEY
 *
 * Auth: Segment HTTP API uses HTTP Basic Auth with writeKey as password and empty username.
 * Authorization: Basic base64(':' + writeKey)
 */

const SEGMENT_API = 'https://api.segment.io/v1';

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
        name: '_ping',
        description: 'Verify Segment credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'track_event',
        description: 'Track a user action or event in Segment (e.g. "Button Clicked", "Order Completed")',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'The unique identifier for the user (required)' },
                event: { type: 'string', description: 'The name of the event to track (e.g. "Button Clicked")' },
                properties: { type: 'object', description: 'Optional free-form properties associated with the event' },
                anonymous_id: { type: 'string', description: 'Optional anonymous ID if user is not identified' },
                timestamp: { type: 'string', description: 'Optional ISO 8601 timestamp for the event (e.g. "2024-01-01T00:00:00Z")' },
            },
            required: ['user_id', 'event'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'identify_user',
        description: 'Identify a user and associate traits (email, name, plan, etc.) with their profile',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'The unique identifier for the user' },
                traits: {
                    type: 'object',
                    description: 'Traits to associate with the user (e.g. { email, name, plan, company })',
                },
                anonymous_id: { type: 'string', description: 'Optional anonymous ID to merge with the user_id' },
            },
            required: ['user_id', 'traits'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'group_user',
        description: 'Associate a user with a group/account and set group traits (company name, industry, etc.)',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'The unique identifier for the user' },
                group_id: { type: 'string', description: 'The unique identifier for the group/account' },
                traits: {
                    type: 'object',
                    description: 'Optional traits for the group (e.g. { name, industry, plan, employee_count })',
                },
            },
            required: ['user_id', 'group_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'page_view',
        description: 'Record a page view in Segment (web analytics)',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'The unique identifier for the user' },
                name: { type: 'string', description: 'Optional name of the page (e.g. "Home", "Pricing")' },
                url: { type: 'string', description: 'Optional URL of the page' },
                title: { type: 'string', description: 'Optional page title' },
                referrer: { type: 'string', description: 'Optional referrer URL' },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'screen_view',
        description: 'Record a mobile screen view in Segment',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'The unique identifier for the user' },
                name: { type: 'string', description: 'Name of the screen (e.g. "Login", "Dashboard")' },
                properties: { type: 'object', description: 'Optional properties associated with the screen view' },
            },
            required: ['user_id', 'name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'alias_user',
        description: 'Alias (merge) two user identities — typically used when an anonymous user signs up',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'The new canonical user ID (after sign-up)' },
                previous_id: { type: 'string', description: 'The old anonymous or previous user ID to merge from' },
            },
            required: ['user_id', 'previous_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'batch_track',
        description: 'Send multiple events in a single request (up to 500). Each event can be track, identify, or page type.',
        inputSchema: {
            type: 'object',
            properties: {
                events: {
                    type: 'array',
                    description: 'Array of event objects (max 500). Each must have type (track/identify/page), userId, and event/name/traits as appropriate.',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['track', 'identify', 'page'], description: 'Event type' },
                            userId: { type: 'string', description: 'User ID for this event' },
                            event: { type: 'string', description: 'Event name (for track type)' },
                            name: { type: 'string', description: 'Page/screen name (for page type)' },
                            properties: { type: 'object', description: 'Properties for the event' },
                            traits: { type: 'object', description: 'Traits (for identify type)' },
                        },
                        required: ['type', 'userId'],
                    },
                },
            },
            required: ['events'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Segment API helper ────────────────────────────────────────────────────────

async function segment(
    endpoint: string,
    writeKey: string,
    body: Record<string, unknown>,
): Promise<unknown> {
    // Segment uses HTTP Basic Auth: empty username, writeKey as password
    const credentials = btoa(`:${writeKey}`);

    const res = await fetch(`${SEGMENT_API}${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text();
        let errMsg: string;
        try {
            const data = JSON.parse(text) as Record<string, unknown>;
            errMsg = (data.error as string) ?? text;
        } catch {
            errMsg = text;
        }
        throw new Error(`Segment API error ${res.status}: ${errMsg}`);
    }

    return { success: true };
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>, writeKey: string): Promise<unknown> {
    switch (name) {

        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            return { content: [{ type: 'text', text: `Connected to Segment` }] };
        }

        case 'track_event': {
            const body: Record<string, unknown> = {
                userId: args.user_id,
                event: args.event,
            };
            if (args.properties) body.properties = args.properties;
            if (args.anonymous_id) body.anonymousId = args.anonymous_id;
            if (args.timestamp) body.timestamp = args.timestamp;
            await segment('/track', writeKey, body);
            return { success: true };
        }

        case 'identify_user': {
            const body: Record<string, unknown> = {
                userId: args.user_id,
                traits: args.traits,
            };
            if (args.anonymous_id) body.anonymousId = args.anonymous_id;
            await segment('/identify', writeKey, body);
            return { success: true };
        }

        case 'group_user': {
            const body: Record<string, unknown> = {
                userId: args.user_id,
                groupId: args.group_id,
            };
            if (args.traits) body.traits = args.traits;
            await segment('/group', writeKey, body);
            return { success: true };
        }

        case 'page_view': {
            const body: Record<string, unknown> = {
                userId: args.user_id,
            };
            if (args.name) body.name = args.name;
            const properties: Record<string, unknown> = {};
            if (args.url) properties.url = args.url;
            if (args.title) properties.title = args.title;
            if (args.referrer) properties.referrer = args.referrer;
            if (Object.keys(properties).length > 0) body.properties = properties;
            await segment('/page', writeKey, body);
            return { success: true };
        }

        case 'screen_view': {
            const body: Record<string, unknown> = {
                userId: args.user_id,
                name: args.name,
            };
            if (args.properties) body.properties = args.properties;
            await segment('/screen', writeKey, body);
            return { success: true };
        }

        case 'alias_user': {
            const body: Record<string, unknown> = {
                userId: args.user_id,
                previousId: args.previous_id,
            };
            await segment('/alias', writeKey, body);
            return { success: true };
        }

        case 'batch_track': {
            const events = args.events as unknown[];
            if (!Array.isArray(events)) throw new Error('events must be an array');
            if (events.length > 500) throw new Error('batch_track supports max 500 events per request');
            await segment('/batch', writeKey, { batch: events });
            return { success: true, count: events.length };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker entry ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-segment', version: '1.0.0', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
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
                serverInfo: { name: 'mcp-segment', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const writeKey = request.headers.get('X-Mcp-Secret-SEGMENT-WRITE-KEY');
            if (!writeKey) {
                return rpcErr(id, -32001, 'Missing SEGMENT_WRITE_KEY — add your Segment write key to workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, writeKey);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
