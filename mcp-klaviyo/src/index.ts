/**
 * Klaviyo MCP Worker
 * Implements MCP protocol over HTTP for Klaviyo email marketing operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   KLAVIYO_API_KEY  → X-Mcp-Secret-KLAVIYO-API-KEY  (Private API key from Account → Settings → API Keys)
 *
 * Auth format: Authorization: Klaviyo-API-Key {apiKey}
 * Revision header: revision: 2023-02-22
 * Response format: JSON:API style { data: { id, type, attributes: {} } } or { data: [] }
 *
 * Covers: Profiles (5), Lists (4), Events (3), Campaigns (3), Flows (2), Templates (1) = 18 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_REVISION = '2023-02-22';

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

function getToken(request: Request): string | null {
    return request.headers.get('X-Mcp-Secret-KLAVIYO-API-KEY');
}

async function klaviyoFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${KLAVIYO_API_BASE}${path}`, {
        ...options,
        headers: {
            'Authorization': `Klaviyo-API-Key ${token}`,
            'revision': KLAVIYO_REVISION,
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) ?? {}),
        },
    });
    if (res.status === 202 || res.status === 204) return { success: true };
    if (!res.ok) {
        const errBody = await res.json().catch(() => ({ errors: [{ detail: res.statusText }] }));
        const msg = (errBody as { errors?: Array<{ detail: string }> }).errors?.[0]?.detail ?? res.statusText;
        throw { code: -32603, message: `Klaviyo API error ${res.status}: ${msg}` };
    }
    return res.json();
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Profiles (5) ──────────────────────────────────────────────────────────

    {
        name: 'get_profiles',
        description: 'List profiles (contacts) in Klaviyo. Supports optional filter using Klaviyo filter syntax, e.g. equals(email,"test@example.com") or contains(email,"@acme.com"). Returns up to 20 by default.',
        inputSchema: {
            type: 'object',
            properties: {
                size: {
                    type: 'number',
                    description: 'Number of profiles to return (default 20, max 100)',
                },
                filter: {
                    type: 'string',
                    description: 'Klaviyo filter expression (e.g. equals(email,"test@example.com") or contains(first_name,"John"))',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_profile',
        description: 'Get full details of a specific Klaviyo profile by profile ID — email, name, phone, properties, and timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                profile_id: {
                    type: 'string',
                    description: 'Klaviyo profile ID (e.g. "01ABC123")',
                },
            },
            required: ['profile_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_profile',
        description: 'Create a new profile (contact) in Klaviyo. Email is required. Optionally provide name, phone, and custom properties.',
        inputSchema: {
            type: 'object',
            properties: {
                email: {
                    type: 'string',
                    description: 'Email address of the profile (required)',
                },
                first_name: {
                    type: 'string',
                    description: 'First name of the profile',
                },
                last_name: {
                    type: 'string',
                    description: 'Last name of the profile',
                },
                phone_number: {
                    type: 'string',
                    description: 'Phone number in E.164 format (e.g. "+14155552671")',
                },
                properties: {
                    type: 'object',
                    description: 'Additional custom properties as key-value pairs (e.g. {"plan": "pro", "company": "Acme"})',
                },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_profile',
        description: 'Update an existing Klaviyo profile by ID. Provide only the fields you want to change.',
        inputSchema: {
            type: 'object',
            properties: {
                profile_id: {
                    type: 'string',
                    description: 'Klaviyo profile ID to update',
                },
                email: {
                    type: 'string',
                    description: 'New email address',
                },
                first_name: {
                    type: 'string',
                    description: 'Updated first name',
                },
                last_name: {
                    type: 'string',
                    description: 'Updated last name',
                },
                phone_number: {
                    type: 'string',
                    description: 'Updated phone number in E.164 format',
                },
                properties: {
                    type: 'object',
                    description: 'Updated custom properties to merge into the profile',
                },
            },
            required: ['profile_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'subscribe_profiles',
        description: 'Subscribe one or more email addresses to marketing in a specific list. Sets marketing consent to SUBSCRIBED for each email provided.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Klaviyo list ID to subscribe profiles to',
                },
                emails: {
                    description: 'Email address or array of email addresses to subscribe',
                    oneOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                },
            },
            required: ['list_id', 'emails'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Lists (4) ─────────────────────────────────────────────────────────────

    {
        name: 'get_lists',
        description: 'List all Klaviyo lists. Returns list IDs, names, and creation dates. Use list IDs to add profiles or subscribe contacts.',
        inputSchema: {
            type: 'object',
            properties: {
                size: {
                    type: 'number',
                    description: 'Number of lists to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_list',
        description: 'Get details of a specific Klaviyo list by ID — name, creation date, and opt-in process.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Klaviyo list ID (e.g. "XY1234")',
                },
            },
            required: ['list_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_list',
        description: 'Create a new Klaviyo list with the given name.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name for the new list (e.g. "Newsletter Subscribers")',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'add_profiles_to_list',
        description: 'Add existing profiles to a Klaviyo list by profile IDs. Use get_profiles to find profile IDs first.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Klaviyo list ID to add profiles to',
                },
                profile_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of Klaviyo profile IDs to add to the list',
                },
            },
            required: ['list_id', 'profile_ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Events (3) ────────────────────────────────────────────────────────────

    {
        name: 'get_events',
        description: 'List events (analytics data) in Klaviyo. Supports optional filter. Use to retrieve metric activity like purchases, opens, clicks.',
        inputSchema: {
            type: 'object',
            properties: {
                size: {
                    type: 'number',
                    description: 'Number of events to return (default 20)',
                },
                filter: {
                    type: 'string',
                    description: 'Klaviyo filter expression (e.g. equals(metric_id,"ABC123"))',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_event',
        description: 'Track a custom event (metric) for a profile in Klaviyo. Used to record actions like purchases, signups, or custom behaviors that can trigger flows.',
        inputSchema: {
            type: 'object',
            properties: {
                email: {
                    type: 'string',
                    description: 'Email address of the profile to associate the event with',
                },
                metric_name: {
                    type: 'string',
                    description: 'Name of the metric/event (e.g. "Placed Order", "Signed Up", "Viewed Product")',
                },
                properties: {
                    type: 'object',
                    description: 'Custom event properties (e.g. {"order_id": "123", "value": 49.99})',
                },
                time: {
                    type: 'string',
                    description: 'ISO 8601 timestamp for when the event occurred (default: now)',
                },
                value: {
                    type: 'number',
                    description: 'Numeric value associated with the event (e.g. purchase value)',
                },
            },
            required: ['email', 'metric_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_metrics',
        description: 'List all metrics (event types) in Klaviyo — includes name, integration source, and IDs. Use metric IDs to filter events.',
        inputSchema: {
            type: 'object',
            properties: {
                size: {
                    type: 'number',
                    description: 'Number of metrics to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Campaigns (3) ─────────────────────────────────────────────────────────

    {
        name: 'get_campaigns',
        description: 'List email campaigns in Klaviyo. Returns campaign IDs, names, status, and send times.',
        inputSchema: {
            type: 'object',
            properties: {
                size: {
                    type: 'number',
                    description: 'Number of campaigns to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_campaign',
        description: 'Get full details of a specific Klaviyo campaign by ID — name, status, send time, subject, and audience.',
        inputSchema: {
            type: 'object',
            properties: {
                campaign_id: {
                    type: 'string',
                    description: 'Klaviyo campaign ID',
                },
            },
            required: ['campaign_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_campaign_recipient_estimation',
        description: 'Get the estimated recipient count for a Klaviyo campaign before sending.',
        inputSchema: {
            type: 'object',
            properties: {
                campaign_id: {
                    type: 'string',
                    description: 'Klaviyo campaign ID to get recipient estimate for',
                },
            },
            required: ['campaign_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Flows (2) ─────────────────────────────────────────────────────────────

    {
        name: 'get_flows',
        description: 'List all automation flows in Klaviyo — includes flow name, status (draft/live/manual), trigger type, and timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                size: {
                    type: 'number',
                    description: 'Number of flows to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_flow',
        description: 'Get full details of a specific Klaviyo automation flow by ID — name, status, trigger, and action count.',
        inputSchema: {
            type: 'object',
            properties: {
                flow_id: {
                    type: 'string',
                    description: 'Klaviyo flow ID',
                },
            },
            required: ['flow_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Templates (1) ─────────────────────────────────────────────────────────

    {
        name: 'get_templates',
        description: 'List email templates in Klaviyo — includes template name, type (drag-and-drop or HTML), and timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                size: {
                    type: 'number',
                    description: 'Number of templates to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {

        // ── Profiles ──────────────────────────────────────────────────────────

        case 'get_profiles': {
            const size = (args.size as number) ?? 20;
            let path = `/profiles?page[size]=${size}`;
            if (args.filter) path += `&filter=${encodeURIComponent(args.filter as string)}`;
            return klaviyoFetch(path, token);
        }

        case 'get_profile': {
            validateRequired(args, ['profile_id']);
            return klaviyoFetch(`/profiles/${args.profile_id as string}`, token);
        }

        case 'create_profile': {
            validateRequired(args, ['email']);
            const attributes: Record<string, unknown> = { email: args.email };
            if (args.first_name !== undefined) attributes.first_name = args.first_name;
            if (args.last_name !== undefined) attributes.last_name = args.last_name;
            if (args.phone_number !== undefined) attributes.phone_number = args.phone_number;
            if (args.properties !== undefined) attributes.properties = args.properties;
            return klaviyoFetch('/profiles', token, {
                method: 'POST',
                body: JSON.stringify({
                    data: { type: 'profile', attributes },
                }),
            });
        }

        case 'update_profile': {
            validateRequired(args, ['profile_id']);
            const profileId = args.profile_id as string;
            const updateAttrs: Record<string, unknown> = {};
            if (args.email !== undefined) updateAttrs.email = args.email;
            if (args.first_name !== undefined) updateAttrs.first_name = args.first_name;
            if (args.last_name !== undefined) updateAttrs.last_name = args.last_name;
            if (args.phone_number !== undefined) updateAttrs.phone_number = args.phone_number;
            if (args.properties !== undefined) updateAttrs.properties = args.properties;
            return klaviyoFetch(`/profiles/${profileId}`, token, {
                method: 'PATCH',
                body: JSON.stringify({
                    data: { type: 'profile', id: profileId, attributes: updateAttrs },
                }),
            });
        }

        case 'subscribe_profiles': {
            validateRequired(args, ['list_id', 'emails']);
            const emails = Array.isArray(args.emails)
                ? (args.emails as string[])
                : [args.emails as string];
            return klaviyoFetch('/profile-subscription-bulk-create-jobs', token, {
                method: 'POST',
                body: JSON.stringify({
                    data: {
                        type: 'profile-subscription-bulk-create-job',
                        attributes: {
                            list_id: args.list_id,
                            subscriptions: emails.map(email => ({
                                channels: {
                                    email: {
                                        subscriptions: [{ marketing: { consent: 'SUBSCRIBED' } }],
                                    },
                                },
                                profile: {
                                    data: { type: 'profile', attributes: { email } },
                                },
                            })),
                        },
                    },
                }),
            });
        }

        // ── Lists ─────────────────────────────────────────────────────────────

        case 'get_lists': {
            const size = (args.size as number) ?? 20;
            return klaviyoFetch(`/lists?page[size]=${size}`, token);
        }

        case 'get_list': {
            validateRequired(args, ['list_id']);
            return klaviyoFetch(`/lists/${args.list_id as string}`, token);
        }

        case 'create_list': {
            validateRequired(args, ['name']);
            return klaviyoFetch('/lists', token, {
                method: 'POST',
                body: JSON.stringify({
                    data: { type: 'list', attributes: { name: args.name } },
                }),
            });
        }

        case 'add_profiles_to_list': {
            validateRequired(args, ['list_id', 'profile_ids']);
            return klaviyoFetch(`/lists/${args.list_id as string}/relationships/profiles`, token, {
                method: 'POST',
                body: JSON.stringify({
                    data: (args.profile_ids as string[]).map(id => ({ type: 'profile', id })),
                }),
            });
        }

        // ── Events ────────────────────────────────────────────────────────────

        case 'get_events': {
            const size = (args.size as number) ?? 20;
            let path = `/events?page[size]=${size}`;
            if (args.filter) path += `&filter=${encodeURIComponent(args.filter as string)}`;
            return klaviyoFetch(path, token);
        }

        case 'create_event': {
            validateRequired(args, ['email', 'metric_name']);
            const eventAttributes: Record<string, unknown> = {
                profile: { data: { type: 'profile', attributes: { email: args.email } } },
                metric: { data: { type: 'metric', attributes: { name: args.metric_name } } },
                properties: (args.properties as Record<string, unknown>) ?? {},
            };
            if (args.time !== undefined) eventAttributes.time = args.time;
            if (args.value !== undefined) eventAttributes.value = args.value;
            return klaviyoFetch('/events', token, {
                method: 'POST',
                body: JSON.stringify({
                    data: { type: 'event', attributes: eventAttributes },
                }),
            });
        }

        case 'get_metrics': {
            const size = (args.size as number) ?? 20;
            return klaviyoFetch(`/metrics?page[size]=${size}`, token);
        }

        // ── Campaigns ─────────────────────────────────────────────────────────

        case 'get_campaigns': {
            const size = (args.size as number) ?? 20;
            return klaviyoFetch(
                `/campaigns?filter=${encodeURIComponent("equals(messages.channel,'email')")}&page[size]=${size}`,
                token,
            );
        }

        case 'get_campaign': {
            validateRequired(args, ['campaign_id']);
            return klaviyoFetch(`/campaigns/${args.campaign_id as string}`, token);
        }

        case 'get_campaign_recipient_estimation': {
            validateRequired(args, ['campaign_id']);
            return klaviyoFetch(`/campaign-recipient-estimation/${args.campaign_id as string}`, token);
        }

        // ── Flows ─────────────────────────────────────────────────────────────

        case 'get_flows': {
            const size = (args.size as number) ?? 20;
            return klaviyoFetch(`/flows?page[size]=${size}`, token);
        }

        case 'get_flow': {
            validateRequired(args, ['flow_id']);
            return klaviyoFetch(`/flows/${args.flow_id as string}`, token);
        }

        // ── Templates ─────────────────────────────────────────────────────────

        case 'get_templates': {
            const size = (args.size as number) ?? 20;
            return klaviyoFetch(`/templates?page[size]=${size}`, token);
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
                JSON.stringify({ status: 'ok', server: 'mcp-klaviyo', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-klaviyo', version: '1.0.0' },
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
                'Missing required secret — add KLAVIYO_API_KEY to workspace secrets',
            );
        }

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        try {
            const result = await callTool(toolName, args, token);
            return rpcOk(id, toolOk(result));
        } catch (err) {
            const errObj = err as { code?: number; message?: string };
            if (errObj.code !== undefined) {
                return rpcErr(id, errObj.code, errObj.message ?? 'Internal error');
            }
            const msg = err instanceof Error ? err.message : String(err);
            return rpcErr(id, -32603, msg);
        }
    },
};
