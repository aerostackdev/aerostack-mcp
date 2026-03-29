/**
 * Braze MCP Worker
 * Implements MCP protocol over HTTP for Braze enterprise CRM/marketing operations.
 *
 * Secrets:
 *   BRAZE_API_KEY      → X-Mcp-Secret-BRAZE-API-KEY
 *   BRAZE_INSTANCE_URL → X-Mcp-Secret-BRAZE-INSTANCE-URL (e.g. rest.iad-01.braze.com)
 */

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
        name: 'track_users',
        description: 'Track user attributes, events, and purchases in Braze',
        inputSchema: {
            type: 'object',
            properties: {
                attributes: { type: 'array', description: 'Array of user attribute objects' },
                events: { type: 'array', description: 'Array of event objects' },
                purchases: { type: 'array', description: 'Array of purchase objects' },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_user_profile',
        description: 'Export user profiles by external IDs',
        inputSchema: {
            type: 'object',
            properties: {
                external_ids: { type: 'array', description: 'Array of external user IDs' },
            },
            required: ['external_ids'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_user',
        description: 'Delete user profiles from Braze',
        inputSchema: {
            type: 'object',
            properties: {
                external_ids: { type: 'array', description: 'Array of external user IDs to delete' },
            },
            required: ['external_ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'send_message',
        description: 'Send a message to users via email, push, or SMS',
        inputSchema: {
            type: 'object',
            properties: {
                external_user_ids: { type: 'array', description: 'Target user IDs' },
                messages: { type: 'object', description: 'Message config with email/push/sms' },
            },
            required: ['external_user_ids', 'messages'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_campaign',
        description: 'Trigger a campaign send to recipients',
        inputSchema: {
            type: 'object',
            properties: {
                campaign_id: { type: 'string', description: 'Campaign ID' },
                recipients: { type: 'array', description: 'Array of recipient objects with external_user_id' },
            },
            required: ['campaign_id', 'recipients'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_campaigns',
        description: 'List all campaigns',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (default 0)' },
                include_archived: { type: 'boolean', description: 'Include archived campaigns' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_campaign',
        description: 'Get details for a specific campaign',
        inputSchema: {
            type: 'object',
            properties: { campaign_id: { type: 'string', description: 'Campaign ID' } },
            required: ['campaign_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_segments',
        description: 'List all audience segments',
        inputSchema: {
            type: 'object',
            properties: { page: { type: 'number', description: 'Page number' } },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_segment_details',
        description: 'Get details for a specific segment',
        inputSchema: {
            type: 'object',
            properties: { segment_id: { type: 'string', description: 'Segment ID' } },
            required: ['segment_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_email_template',
        description: 'Create a new email template',
        inputSchema: {
            type: 'object',
            properties: {
                template_name: { type: 'string', description: 'Template name' },
                subject: { type: 'string', description: 'Email subject' },
                body: { type: 'string', description: 'HTML body' },
                plaintext_body: { type: 'string', description: 'Plain text version' },
            },
            required: ['template_name', 'subject', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_email_templates',
        description: 'List all email templates',
        inputSchema: {
            type: 'object',
            properties: {
                count: { type: 'number', description: 'Number of templates (default 100)' },
                offset: { type: 'number', description: 'Pagination offset' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'track_event',
        description: 'Track a specific event for a user',
        inputSchema: {
            type: 'object',
            properties: {
                external_id: { type: 'string', description: 'External user ID' },
                event_name: { type: 'string', description: 'Event name' },
                time: { type: 'string', description: 'ISO 8601 timestamp (defaults to now)' },
                properties: { type: 'object', description: 'Event properties' },
            },
            required: ['external_id', 'event_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_subscription_groups',
        description: 'Get subscription group statuses for a user',
        inputSchema: {
            type: 'object',
            properties: { external_id: { type: 'string', description: 'External user ID' } },
            required: ['external_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_subscription_status',
        description: 'Update subscription group status for a user',
        inputSchema: {
            type: 'object',
            properties: {
                subscription_group_id: { type: 'string', description: 'Subscription group ID' },
                subscription_status: { type: 'string', description: 'Subscribed or Unsubscribed' },
                external_id: { type: 'string', description: 'External user ID' },
            },
            required: ['subscription_group_id', 'subscription_status', 'external_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_transactional_email',
        description: 'Send a transactional email via a campaign',
        inputSchema: {
            type: 'object',
            properties: {
                campaign_id: { type: 'string', description: 'Transactional campaign ID' },
                recipient: { type: 'object', description: 'Recipient object with external_user_id and/or email' },
                trigger_properties: { type: 'object', description: 'Personalization properties' },
            },
            required: ['campaign_id', 'recipient'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_app_group_info',
        description: 'Get app group info including timezone and currency',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function brazeFetch(path: string, apiKey: string, instanceUrl: string, options: RequestInit = {}): Promise<unknown> {
    const base = `https://${instanceUrl}`;
    const res = await fetch(`${base}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Braze API ${res.status}: ${text}`);
    }
    if (res.status === 204) return { success: true };
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string, instanceUrl: string): Promise<unknown> {
    switch (name) {
        case 'track_users': {
            const body: Record<string, unknown> = {};
            if (args.attributes) body.attributes = args.attributes;
            if (args.events) body.events = args.events;
            if (args.purchases) body.purchases = args.purchases;
            return brazeFetch('/users/track', apiKey, instanceUrl, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'get_user_profile': {
            if (!args.external_ids) throw new Error('external_ids is required');
            return brazeFetch('/users/export/ids', apiKey, instanceUrl, {
                method: 'POST',
                body: JSON.stringify({ external_ids: args.external_ids }),
            });
        }

        case 'delete_user': {
            if (!args.external_ids) throw new Error('external_ids is required');
            return brazeFetch('/users/delete', apiKey, instanceUrl, {
                method: 'POST',
                body: JSON.stringify({ external_ids: args.external_ids }),
            });
        }

        case 'send_message': {
            if (!args.external_user_ids) throw new Error('external_user_ids is required');
            if (!args.messages) throw new Error('messages is required');
            return brazeFetch('/messages/send', apiKey, instanceUrl, {
                method: 'POST',
                body: JSON.stringify({ external_user_ids: args.external_user_ids, messages: args.messages }),
            });
        }

        case 'create_campaign': {
            if (!args.campaign_id) throw new Error('campaign_id is required');
            if (!args.recipients) throw new Error('recipients is required');
            return brazeFetch('/campaigns/trigger/send', apiKey, instanceUrl, {
                method: 'POST',
                body: JSON.stringify({ campaign_id: args.campaign_id, recipients: args.recipients }),
            });
        }

        case 'list_campaigns': {
            const params = new URLSearchParams();
            params.set('page', String(args.page ?? 0));
            if (args.include_archived) params.set('include_archived', String(args.include_archived));
            return brazeFetch(`/campaigns/list?${params.toString()}`, apiKey, instanceUrl);
        }

        case 'get_campaign': {
            if (!args.campaign_id) throw new Error('campaign_id is required');
            return brazeFetch(`/campaigns/details?campaign_id=${args.campaign_id}`, apiKey, instanceUrl);
        }

        case 'list_segments': {
            const params = new URLSearchParams();
            if (args.page) params.set('page', String(args.page));
            const q = params.toString();
            return brazeFetch(`/segments/list${q ? '?' + q : ''}`, apiKey, instanceUrl);
        }

        case 'get_segment_details': {
            if (!args.segment_id) throw new Error('segment_id is required');
            return brazeFetch(`/segments/details?segment_id=${args.segment_id}`, apiKey, instanceUrl);
        }

        case 'create_email_template': {
            if (!args.template_name) throw new Error('template_name is required');
            if (!args.subject) throw new Error('subject is required');
            if (!args.body) throw new Error('body is required');
            const body: Record<string, unknown> = {
                template_name: args.template_name,
                subject: args.subject,
                body: args.body,
            };
            if (args.plaintext_body) body.plaintext_body = args.plaintext_body;
            return brazeFetch('/templates/email/create', apiKey, instanceUrl, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'list_email_templates': {
            const params = new URLSearchParams();
            params.set('count', String(args.count ?? 100));
            if (args.offset) params.set('offset', String(args.offset));
            return brazeFetch(`/templates/email/list?${params.toString()}`, apiKey, instanceUrl);
        }

        case 'track_event': {
            if (!args.external_id) throw new Error('external_id is required');
            if (!args.event_name) throw new Error('event_name is required');
            const event: Record<string, unknown> = {
                external_id: args.external_id,
                name: args.event_name,
                time: args.time ?? new Date().toISOString(),
            };
            if (args.properties) event.properties = args.properties;
            return brazeFetch('/users/track', apiKey, instanceUrl, {
                method: 'POST',
                body: JSON.stringify({ events: [event] }),
            });
        }

        case 'list_subscription_groups': {
            if (!args.external_id) throw new Error('external_id is required');
            return brazeFetch(`/subscription/user/status?external_id=${args.external_id}`, apiKey, instanceUrl);
        }

        case 'update_subscription_status': {
            if (!args.subscription_group_id) throw new Error('subscription_group_id is required');
            if (!args.subscription_status) throw new Error('subscription_status is required');
            if (!args.external_id) throw new Error('external_id is required');
            return brazeFetch('/subscription/status/set', apiKey, instanceUrl, {
                method: 'POST',
                body: JSON.stringify({
                    subscription_group_id: args.subscription_group_id,
                    subscription_status: args.subscription_status,
                    external_id: args.external_id,
                }),
            });
        }

        case 'send_transactional_email': {
            if (!args.campaign_id) throw new Error('campaign_id is required');
            if (!args.recipient) throw new Error('recipient is required');
            const body: Record<string, unknown> = { recipient: args.recipient };
            if (args.trigger_properties) body.trigger_properties = args.trigger_properties;
            return brazeFetch(`/transactional/v1/campaigns/${args.campaign_id}/send`, apiKey, instanceUrl, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_app_group_info':
            return brazeFetch('/app_group/info', apiKey, instanceUrl);

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'braze-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'braze-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = request.headers.get('X-Mcp-Secret-BRAZE-API-KEY');
            const instanceUrl = request.headers.get('X-Mcp-Secret-BRAZE-INSTANCE-URL');

            if (!apiKey || !instanceUrl) {
                return rpcErr(id, -32001, 'Missing required secrets: BRAZE_API_KEY, BRAZE_INSTANCE_URL');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, apiKey, instanceUrl);
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
