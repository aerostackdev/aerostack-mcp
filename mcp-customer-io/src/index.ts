/**
 * Customer.io MCP Worker
 * Implements MCP protocol over HTTP for Customer.io behavioral messaging operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   CUSTOMER_IO_SITE_ID → X-Mcp-Secret-CUSTOMER-IO-SITE-ID
 *   CUSTOMER_IO_API_KEY → X-Mcp-Secret-CUSTOMER-IO-API-KEY
 *
 * Two auth schemes:
 *   Track API (write): Basic auth — base64(SITE_ID:API_KEY)
 *   App API (read):   Bearer token — Authorization: Bearer API_KEY
 *
 * Covers: Customers (5), Events (4), Segments (4), Campaigns (4), Metrics (3) = 20 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const TRACK_BASE = 'https://track.customer.io/api/v1';
const APP_BASE = 'https://api.customer.io/v1';

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

function getSecrets(request: Request): { siteId: string | null; apiKey: string | null } {
    return {
        siteId: request.headers.get('X-Mcp-Secret-CUSTOMER-IO-SITE-ID'),
        apiKey: request.headers.get('X-Mcp-Secret-CUSTOMER-IO-API-KEY'),
    };
}

function basicAuth(siteId: string, apiKey: string): string {
    return `Basic ${btoa(`${siteId}:${apiKey}`)}`;
}

async function trackFetch(
    path: string,
    siteId: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${TRACK_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': basicAuth(siteId, apiKey),
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 200 || res.status === 204) {
        const text = await res.text();
        if (!text || text === '{}') return { success: true };
        try {
            return JSON.parse(text);
        } catch {
            return { success: true };
        }
    }

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Customer.io Track HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        const d = data as { meta?: { error?: string }; errors?: Array<{ detail?: string }> };
        const msg = d?.meta?.error || d?.errors?.[0]?.detail || res.statusText;
        throw { code: -32603, message: `Customer.io Track API error ${res.status}: ${msg}` };
    }

    return data;
}

async function appFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${APP_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return { success: true };

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Customer.io App HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        const d = data as { meta?: { error?: string }; errors?: Array<{ detail?: string }> };
        const msg = d?.meta?.error || d?.errors?.[0]?.detail || res.statusText;
        throw { code: -32603, message: `Customer.io App API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Customers (5 tools) ─────────────────────────────────────────

    {
        name: 'identify_customer',
        description: 'Create or update (upsert) a customer profile by ID. Safe to call repeatedly — will update attributes without creating duplicates.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Your unique customer identifier (required)',
                },
                attributes: {
                    type: 'object',
                    description: 'Customer attributes to set or update (e.g. {"email":"alice@example.com","name":"Alice","plan":"pro","created_at":1711584000})',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_customer',
        description: 'Get a customer profile by ID including email, attributes, and metadata.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Customer ID to look up',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_customer',
        description: 'Merge new attribute values into an existing customer profile.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Customer ID to update',
                },
                attributes: {
                    type: 'object',
                    description: 'Attributes to merge into the customer (e.g. {"plan":"enterprise","mrr":500})',
                },
            },
            required: ['id', 'attributes'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_customer',
        description: 'Permanently delete a customer and all their data from Customer.io.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Customer ID to delete',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_customers',
        description: 'Search for customers using filter parameters such as email.',
        inputSchema: {
            type: 'object',
            properties: {
                filter: {
                    type: 'object',
                    description: 'Filter criteria (e.g. {"attribute":{"field":"email","operator":"eq","value":"alice@example.com"}})',
                },
                limit: {
                    type: 'number',
                    description: 'Number of customers to return (default 20)',
                },
                start: {
                    type: 'string',
                    description: 'Pagination cursor from previous response (next field)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Events (4 tools) ────────────────────────────────────────────

    {
        name: 'track_event',
        description: 'Track a named event for an identified customer. Triggers automations configured in Customer.io.',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: {
                    type: 'string',
                    description: 'The customer ID to associate the event with (required)',
                },
                name: {
                    type: 'string',
                    description: 'Event name (required, e.g. "purchased", "trial_started", "page_viewed")',
                },
                data: {
                    type: 'object',
                    description: 'Event properties (e.g. {"plan":"pro","amount":49,"currency":"USD"})',
                },
            },
            required: ['customer_id', 'name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'track_anonymous_event',
        description: 'Track an event for a visitor who has not yet been identified as a customer.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Event name (required)',
                },
                data: {
                    type: 'object',
                    description: 'Event properties',
                },
                anonymous_id: {
                    type: 'string',
                    description: 'Optional anonymous visitor identifier',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'batch_track',
        description: 'Send multiple identify and/or track operations in one API call (up to 1000 operations).',
        inputSchema: {
            type: 'object',
            properties: {
                batch: {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Array of batch items. Each item must have a "type" of "identify", "event", or "delete" plus the relevant fields (e.g. [{"type":"identify","id":"user-1","attributes":{"email":"a@b.com"}},{"type":"event","customer_id":"user-1","name":"signed_up"}])',
                },
            },
            required: ['batch'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_customer_activities',
        description: 'Get the activity history for a customer (emails sent, events received, segment changes).',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Customer ID to get activity for (required)',
                },
                type: {
                    type: 'string',
                    description: 'Filter by activity type (e.g. "email_sent", "event", "segment_membership_change")',
                },
                limit: {
                    type: 'number',
                    description: 'Number of activities to return (default 20)',
                },
                start: {
                    type: 'string',
                    description: 'Pagination cursor from previous response',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Segments (4 tools) ──────────────────────────────────────────

    {
        name: 'list_segments',
        description: 'List all segments in the Customer.io workspace.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['manual', 'automated'],
                    description: 'Filter by segment type (manual or automated)',
                },
                limit: {
                    type: 'number',
                    description: 'Number of segments to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_segment',
        description: 'Get segment details including name, description, type, and customer count.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Segment ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_to_segment',
        description: 'Add one or more customers to a manual segment by customer ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Segment ID to add customers to (must be a manual segment)',
                },
                ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of customer IDs to add to the segment',
                },
            },
            required: ['id', 'ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'remove_from_segment',
        description: 'Remove one or more customers from a manual segment by customer ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Segment ID to remove customers from (must be a manual segment)',
                },
                ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of customer IDs to remove from the segment',
                },
            },
            required: ['id', 'ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Campaigns (4 tools) ─────────────────────────────────────────

    {
        name: 'list_campaigns',
        description: 'List all campaigns in the Customer.io workspace.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of campaigns to return (default 20)',
                },
                start: {
                    type: 'string',
                    description: 'Pagination cursor from previous response',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_campaign',
        description: 'Get full details of a specific campaign including name, active status, type, and timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Campaign ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_broadcasts',
        description: 'List all transactional (API-triggered) broadcasts in the workspace.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'send_broadcast',
        description: 'Trigger a transactional broadcast to a specific customer. Provide either to.id or to.email.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Broadcast ID to trigger (required)',
                },
                to: {
                    type: 'object',
                    description: 'Recipient — provide either id (customer ID) or email (e.g. {"id":"user-001"} or {"email":"alice@example.com"})',
                },
                data: {
                    type: 'object',
                    description: 'Broadcast data variables to pass into the message template (e.g. {"reset_link":"https://...","name":"Alice"})',
                },
            },
            required: ['id', 'to'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 5 — Metrics (3 tools) ───────────────────────────────────────────

    {
        name: 'get_campaign_metrics',
        description: 'Get delivery and engagement metrics for a campaign, optionally grouped by time period.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Campaign ID to get metrics for (required)',
                },
                period: {
                    type: 'string',
                    enum: ['hours', 'days', 'weeks', 'months'],
                    description: 'Time granularity for metrics aggregation (default: days)',
                },
                metric: {
                    type: 'string',
                    description: 'Specific metric to retrieve (e.g. "sent", "opened", "clicked", "converted")',
                },
                steps: {
                    type: 'number',
                    description: 'Number of time periods to return (default 24 for hours, 7 for days)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_webhooks',
        description: 'List all reporting webhooks configured in the Customer.io workspace.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_workspace_info',
        description: 'Get workspace information including name and timezone. Also used as health check.',
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
    siteId: string,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        // ── Customers ───────────────────────────────────────────────────────────

        case 'identify_customer': {
            validateRequired(args, ['id']);
            const body: Record<string, unknown> = {};
            if (args.attributes !== undefined) {
                const attrs = args.attributes as Record<string, unknown>;
                Object.assign(body, attrs);
            }
            return trackFetch(`/customers/${encodeURIComponent(args.id as string)}`, siteId, apiKey, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'get_customer': {
            validateRequired(args, ['id']);
            return appFetch(`/customers/${encodeURIComponent(args.id as string)}`, apiKey);
        }

        case 'update_customer': {
            validateRequired(args, ['id', 'attributes']);
            const body = args.attributes as Record<string, unknown>;
            return trackFetch(`/customers/${encodeURIComponent(args.id as string)}`, siteId, apiKey, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'delete_customer': {
            validateRequired(args, ['id']);
            return trackFetch(`/customers/${encodeURIComponent(args.id as string)}`, siteId, apiKey, {
                method: 'DELETE',
            });
        }

        case 'list_customers': {
            const body: Record<string, unknown> = {};
            if (args.filter !== undefined) body.filter = args.filter;
            if (args.limit !== undefined) body.limit = args.limit;
            if (args.start !== undefined) body.start = args.start;
            return appFetch('/customers', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        // ── Events ──────────────────────────────────────────────────────────────

        case 'track_event': {
            validateRequired(args, ['customer_id', 'name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.data !== undefined) body.data = args.data;
            return trackFetch(
                `/customers/${encodeURIComponent(args.customer_id as string)}/events`,
                siteId,
                apiKey,
                { method: 'POST', body: JSON.stringify(body) },
            );
        }

        case 'track_anonymous_event': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.data !== undefined) body.data = args.data;
            if (args.anonymous_id !== undefined) body.anonymous_id = args.anonymous_id;
            return trackFetch('/events', siteId, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'batch_track': {
            validateRequired(args, ['batch']);
            return trackFetch('/batch', siteId, apiKey, {
                method: 'POST',
                body: JSON.stringify({ batch: args.batch }),
            });
        }

        case 'get_customer_activities': {
            validateRequired(args, ['id']);
            const params = new URLSearchParams();
            if (args.type) params.set('type', args.type as string);
            if (args.limit !== undefined) params.set('limit', String(args.limit));
            if (args.start) params.set('start', args.start as string);
            const qs = params.toString() ? `?${params}` : '';
            return appFetch(`/customers/${encodeURIComponent(args.id as string)}/activities${qs}`, apiKey);
        }

        // ── Segments ────────────────────────────────────────────────────────────

        case 'list_segments': {
            const params = new URLSearchParams();
            if (args.type) params.set('type', args.type as string);
            if (args.limit !== undefined) params.set('limit', String(args.limit));
            const qs = params.toString() ? `?${params}` : '';
            return appFetch(`/segments${qs}`, apiKey);
        }

        case 'get_segment': {
            validateRequired(args, ['id']);
            return appFetch(`/segments/${args.id}`, apiKey);
        }

        case 'add_to_segment': {
            validateRequired(args, ['id', 'ids']);
            return appFetch(`/segments/${args.id}/add_customers`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ ids: args.ids }),
            });
        }

        case 'remove_from_segment': {
            validateRequired(args, ['id', 'ids']);
            return appFetch(`/segments/${args.id}/remove_customers`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ ids: args.ids }),
            });
        }

        // ── Campaigns ───────────────────────────────────────────────────────────

        case 'list_campaigns': {
            const params = new URLSearchParams();
            if (args.limit !== undefined) params.set('limit', String(args.limit));
            if (args.start) params.set('start', args.start as string);
            const qs = params.toString() ? `?${params}` : '';
            return appFetch(`/campaigns${qs}`, apiKey);
        }

        case 'get_campaign': {
            validateRequired(args, ['id']);
            return appFetch(`/campaigns/${args.id}`, apiKey);
        }

        case 'list_broadcasts': {
            return appFetch('/broadcasts', apiKey);
        }

        case 'send_broadcast': {
            validateRequired(args, ['id', 'to']);
            const body: Record<string, unknown> = { to: args.to };
            if (args.data !== undefined) body.data = args.data;
            return appFetch(`/broadcasts/${args.id}/send`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        // ── Metrics ─────────────────────────────────────────────────────────────

        case 'get_campaign_metrics': {
            validateRequired(args, ['id']);
            const params = new URLSearchParams();
            if (args.period) params.set('period', args.period as string);
            if (args.metric) params.set('metric', args.metric as string);
            if (args.steps !== undefined) params.set('steps', String(args.steps));
            const qs = params.toString() ? `?${params}` : '';
            return appFetch(`/campaigns/${args.id}/metrics${qs}`, apiKey);
        }

        case 'list_webhooks': {
            return appFetch('/reporting_webhooks', apiKey);
        }

        case 'get_workspace_info': {
            return appFetch('/info', apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-customer-io', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-customer-io', version: '1.0.0' },
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
            const { siteId, apiKey } = getSecrets(request);
            const missing: string[] = [];
            if (!siteId) missing.push('CUSTOMER_IO_SITE_ID (header: X-Mcp-Secret-CUSTOMER-IO-SITE-ID)');
            if (!apiKey) missing.push('CUSTOMER_IO_API_KEY (header: X-Mcp-Secret-CUSTOMER-IO-API-KEY)');
            if (missing.length > 0) {
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            // _ping — workspace info health check
            if (toolName === '_ping') {
                try {
                    const result = await appFetch('/info', apiKey!);
                    return rpcOk(id, toolOk(result));
                } catch (err: unknown) {
                    if (err && typeof err === 'object' && 'code' in err) {
                        const e = err as { code: number; message: string };
                        return rpcErr(id, e.code, e.message);
                    }
                    return rpcErr(id, -32603, 'Ping failed');
                }
            }

            try {
                const result = await callTool(toolName, args, siteId!, apiKey!);
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
