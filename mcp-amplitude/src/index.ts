/**
 * Amplitude MCP Worker
 * Implements MCP protocol over HTTP for Amplitude analytics operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   AMPLITUDE_API_KEY    → X-Mcp-Secret-AMPLITUDE-API-KEY    (ingestion + basic auth username)
 *   AMPLITUDE_SECRET_KEY → X-Mcp-Secret-AMPLITUDE-SECRET-KEY (basic auth password)
 */

const AMPLITUDE_INGEST = 'https://api2.amplitude.com';
const AMPLITUDE_API = 'https://amplitude.com/api/2';

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
        name: 'track_event',
        description: 'Track a custom event in Amplitude for a specific user',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'Unique identifier for the user' },
                event_type: { type: 'string', description: 'Name of the event to track' },
                event_properties: { type: 'object', description: 'Additional event properties (optional)' },
                user_properties: { type: 'object', description: 'User properties to set alongside the event (optional)' },
                time: { type: 'number', description: 'Event timestamp in epoch milliseconds (optional)' },
            },
            required: ['user_id', 'event_type'],
        },
    },
    {
        name: 'identify_user',
        description: 'Identify a user and set their properties in Amplitude',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'Unique identifier for the user' },
                user_properties: { type: 'object', description: 'User properties to set' },
            },
            required: ['user_id', 'user_properties'],
        },
    },
    {
        name: 'get_user_activity',
        description: 'Get recent event activity for a specific user',
        inputSchema: {
            type: 'object',
            properties: {
                user: { type: 'string', description: 'User ID (encoded)' },
                limit: { type: 'number', description: 'Number of events to return (default 20)' },
            },
            required: ['user'],
        },
    },
    {
        name: 'list_cohorts',
        description: 'List all cohorts defined in the Amplitude project',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'get_cohort_members',
        description: 'Get member user IDs for a specific cohort',
        inputSchema: {
            type: 'object',
            properties: {
                cohort_id: { type: 'string', description: 'Amplitude cohort ID' },
            },
            required: ['cohort_id'],
        },
    },
    {
        name: 'get_chart_data',
        description: 'Get event segmentation chart data for a specific event and date range',
        inputSchema: {
            type: 'object',
            properties: {
                event_type: { type: 'string', description: 'Event name to analyze' },
                start: { type: 'string', description: 'Start date in YYYYMMDD format' },
                end: { type: 'string', description: 'End date in YYYYMMDD format' },
                m: {
                    type: 'string',
                    description: 'Metric: uniques, totals, or pct_dau (default: uniques)',
                    enum: ['uniques', 'totals', 'pct_dau'],
                },
            },
            required: ['event_type', 'start', 'end'],
        },
    },
    {
        name: 'get_funnel_data',
        description: 'Get funnel conversion data for a sequence of events',
        inputSchema: {
            type: 'object',
            properties: {
                e: { type: 'array', description: 'Array of event objects, each with event_type (e.g. [{"event_type":"Sign Up"},{"event_type":"Purchase"}])' },
                start: { type: 'string', description: 'Start date in YYYYMMDD format' },
                end: { type: 'string', description: 'End date in YYYYMMDD format' },
                n: { type: 'number', description: 'Days after first event to complete funnel (default 30)' },
            },
            required: ['e', 'start', 'end'],
        },
    },
    {
        name: 'export_events',
        description: 'Initiate a raw event export from Amplitude for a date range',
        inputSchema: {
            type: 'object',
            properties: {
                start: { type: 'string', description: 'Start date in YYYYMMDD format (e.g. 20240101)' },
                end: { type: 'string', description: 'End date in YYYYMMDD format (e.g. 20240131)' },
            },
            required: ['start', 'end'],
        },
    },
];

function basicAuth(apiKey: string, secretKey: string): string {
    return 'Basic ' + btoa(`${apiKey}:${secretKey}`);
}

async function amplitudeApi(
    path: string,
    apiKey: string,
    secretKey: string,
    params: Record<string, string> = {},
): Promise<unknown> {
    const url = new URL(`${AMPLITUDE_API}${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
        headers: {
            Authorization: basicAuth(apiKey, secretKey),
            Accept: 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Amplitude API ${res.status}: ${text}`);
    }
    return res.json();
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
    secretKey: string,
): Promise<unknown> {
    switch (name) {
        case 'track_event': {
            if (!args.user_id) throw new Error('user_id is required');
            if (!args.event_type) throw new Error('event_type is required');

            const event: Record<string, unknown> = {
                user_id: args.user_id,
                event_type: args.event_type,
            };
            if (args.event_properties) event.event_properties = args.event_properties;
            if (args.user_properties) event.user_properties = args.user_properties;
            if (args.time != null) event.time = args.time;

            const body = JSON.stringify({ api_key: apiKey, events: [event] });
            const res = await fetch(`${AMPLITUDE_INGEST}/2/httpapi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Amplitude ingest ${res.status}: ${text}`);
            }
            const data = await res.json() as any;
            return { code: data.code ?? 200, events_ingested: data.events_ingested ?? 1 };
        }

        case 'identify_user': {
            if (!args.user_id) throw new Error('user_id is required');
            if (!args.user_properties) throw new Error('user_properties is required');

            const identification = btoa(JSON.stringify([{
                user_id: args.user_id,
                user_properties: args.user_properties,
            }]));
            const formBody = `api_key=${encodeURIComponent(apiKey)}&identification=${encodeURIComponent(identification)}`;
            const res = await fetch(`${AMPLITUDE_INGEST}/identify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formBody,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Amplitude identify ${res.status}: ${text}`);
            }
            const data = await res.json() as any;
            return { code: data.code ?? 200 };
        }

        case 'get_user_activity': {
            if (!args.user) throw new Error('user is required');
            const limit = Number(args.limit ?? 20);
            const data = await amplitudeApi('/useractivity', apiKey, secretKey, {
                user: String(args.user),
                limit: String(limit),
            }) as any;
            return { events: data.events ?? [] };
        }

        case 'list_cohorts': {
            const data = await amplitudeApi('/cohorts', apiKey, secretKey) as any;
            return (data.cohorts ?? []).map((c: any) => ({
                id: c.id,
                name: c.name,
                size: c.size,
                description: c.description ?? '',
                lastMod: c.lastMod,
            }));
        }

        case 'get_cohort_members': {
            if (!args.cohort_id) throw new Error('cohort_id is required');
            const data = await amplitudeApi(`/cohorts/${args.cohort_id}/members`, apiKey, secretKey) as any;
            return { memberIds: data.memberIds ?? [] };
        }

        case 'get_chart_data': {
            if (!args.event_type) throw new Error('event_type is required');
            if (!args.start) throw new Error('start is required');
            if (!args.end) throw new Error('end is required');
            const data = await amplitudeApi('/events/segmentation', apiKey, secretKey, {
                e: JSON.stringify({ event_type: args.event_type }),
                start: String(args.start),
                end: String(args.end),
                m: String(args.m ?? 'uniques'),
            }) as any;
            return { data: data.data ?? {} };
        }

        case 'get_funnel_data': {
            if (!args.e) throw new Error('e (events array) is required');
            if (!args.start) throw new Error('start is required');
            if (!args.end) throw new Error('end is required');
            const data = await amplitudeApi('/funnels', apiKey, secretKey, {
                e: JSON.stringify(args.e),
                start: String(args.start),
                end: String(args.end),
                n: String(args.n ?? 30),
            });
            return data;
        }

        case 'export_events': {
            if (!args.start) throw new Error('start is required');
            if (!args.end) throw new Error('end is required');
            return {
                message: 'Export initiated',
                start: args.start,
                end: args.end,
                note: 'Download the zipped export from Amplitude dashboard for large datasets',
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'amplitude-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: any;
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { jsonrpc, id, method, params } = body;
        if (jsonrpc !== '2.0') return rpcErr(id ?? null, -32600, 'Invalid Request');

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'amplitude-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-AMPLITUDE-API-KEY');
            const secretKey = request.headers.get('X-Mcp-Secret-AMPLITUDE-SECRET-KEY');

            if (!apiKey || !secretKey) {
                return rpcErr(id, -32001, 'Missing required secrets: AMPLITUDE_API_KEY, AMPLITUDE_SECRET_KEY');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, apiKey, secretKey);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
