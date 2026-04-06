/**
 * Chargebee MCP Worker
 * Implements MCP protocol over HTTP for Chargebee subscription management.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   CHARGEBEE_SITE    → X-Mcp-Secret-CHARGEBEE-SITE    (your Chargebee subdomain)
 *   CHARGEBEE_API_KEY → X-Mcp-Secret-CHARGEBEE-API-KEY (API key, used as basic auth username)
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
        name: '_ping',
        description: 'Verify Chargebee credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_customers',
        description: 'List customers in the Chargebee account with optional email filter',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Maximum number of customers to return (default 20)' },
                email: { type: 'string', description: 'Filter customers by email address (optional)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_customer',
        description: 'Get full details for a specific Chargebee customer',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: { type: 'string', description: 'Chargebee customer ID' },
            },
            required: ['customer_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_customer',
        description: 'Create a new customer in Chargebee',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Customer email address' },
                first_name: { type: 'string', description: 'First name (optional)' },
                last_name: { type: 'string', description: 'Last name (optional)' },
                company: { type: 'string', description: 'Company name (optional)' },
                phone: { type: 'string', description: 'Phone number (optional)' },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_subscriptions',
        description: 'List subscriptions with optional filters by customer or status',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: { type: 'string', description: 'Filter by customer ID (optional)' },
                status: {
                    type: 'string',
                    description: 'Filter by status: active, cancelled, in_trial, paused (optional)',
                    enum: ['active', 'cancelled', 'in_trial', 'paused'],
                },
                limit: { type: 'number', description: 'Maximum number to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_subscription',
        description: 'Get full details for a specific subscription',
        inputSchema: {
            type: 'object',
            properties: {
                subscription_id: { type: 'string', description: 'Chargebee subscription ID' },
            },
            required: ['subscription_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_subscription',
        description: 'Create a new subscription for an existing customer',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: { type: 'string', description: 'Chargebee customer ID' },
                plan_id: { type: 'string', description: 'Plan ID to subscribe to' },
                plan_quantity: { type: 'number', description: 'Quantity of plan seats (default 1)' },
            },
            required: ['customer_id', 'plan_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'cancel_subscription',
        description: 'Cancel a subscription, optionally at end of billing period',
        inputSchema: {
            type: 'object',
            properties: {
                subscription_id: { type: 'string', description: 'Chargebee subscription ID' },
                end_of_term: {
                    type: 'boolean',
                    description: 'If true, cancel at end of current billing period (default true)',
                },
            },
            required: ['subscription_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'reactivate_subscription',
        description: 'Reactivate a cancelled subscription',
        inputSchema: {
            type: 'object',
            properties: {
                subscription_id: { type: 'string', description: 'Chargebee subscription ID to reactivate' },
            },
            required: ['subscription_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_invoices',
        description: 'List invoices with optional filters by customer or status',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: { type: 'string', description: 'Filter by customer ID (optional)' },
                status: {
                    type: 'string',
                    description: 'Filter by status: paid, not_paid, voided (optional)',
                    enum: ['paid', 'not_paid', 'voided'],
                },
                limit: { type: 'number', description: 'Maximum number to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_plans',
        description: 'List plans available in the Chargebee account',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Maximum number to return (default 20)' },
                status: {
                    type: 'string',
                    description: 'Filter by status: active, archived (optional)',
                    enum: ['active', 'archived'],
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

function basicAuth(apiKey: string): string {
    return `Basic ${btoa(apiKey + ':')}`;
}

async function cbApi(
    site: string,
    apiKey: string,
    path: string,
    opts: RequestInit = {},
): Promise<unknown> {
    const baseUrl = `https://${site}.chargebee.com/api/v2`;
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, {
        ...opts,
        headers: {
            Authorization: basicAuth(apiKey),
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(opts.headers as Record<string, string> ?? {}),
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Chargebee API error ${res.status}: ${text}`);
    }
    return res.json();
}

function buildFormParams(params: Record<string, unknown>): string {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) form.set(k, String(v));
    }
    return form.toString();
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    site: string,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            await cbApi(site, apiKey, '/subscriptions?limit=1');
            return { content: [{ type: 'text', text: 'Connected to Chargebee' }] };
        }

        case 'list_customers': {
            const params = new URLSearchParams();
            params.set('limit', String(Number(args.limit ?? 20)));
            if (args.email) params.set('email[is]', String(args.email));
            const data = await cbApi(site, apiKey, `/customers?${params}`) as any;
            return (data.list ?? []).map((item: any) => {
                const c = item.customer;
                return {
                    id: c.id,
                    first_name: c.first_name,
                    last_name: c.last_name,
                    email: c.email,
                    created_at: c.created_at,
                    deleted: c.deleted,
                };
            });
        }

        case 'get_customer': {
            if (!args.customer_id) throw new Error('customer_id is required');
            const data = await cbApi(site, apiKey, `/customers/${args.customer_id}`) as any;
            return data.customer;
        }

        case 'create_customer': {
            if (!args.email) throw new Error('email is required');
            const body = buildFormParams({
                email: args.email,
                first_name: args.first_name,
                last_name: args.last_name,
                company: args.company,
                phone: args.phone,
            });
            const data = await cbApi(site, apiKey, '/customers', {
                method: 'POST',
                body,
            }) as any;
            return data.customer;
        }

        case 'list_subscriptions': {
            const params = new URLSearchParams();
            params.set('limit', String(Number(args.limit ?? 20)));
            if (args.customer_id) params.set('customer_id[is]', String(args.customer_id));
            if (args.status) params.set('status[is]', String(args.status));
            const data = await cbApi(site, apiKey, `/subscriptions?${params}`) as any;
            return (data.list ?? []).map((item: any) => {
                const s = item.subscription;
                return {
                    id: s.id,
                    plan_id: s.plan_id,
                    status: s.status,
                    current_term_start: s.current_term_start,
                    current_term_end: s.current_term_end,
                    customer_id: s.customer_id,
                };
            });
        }

        case 'get_subscription': {
            if (!args.subscription_id) throw new Error('subscription_id is required');
            const data = await cbApi(site, apiKey, `/subscriptions/${args.subscription_id}`) as any;
            return data.subscription;
        }

        case 'create_subscription': {
            if (!args.customer_id) throw new Error('customer_id is required');
            if (!args.plan_id) throw new Error('plan_id is required');
            const body = buildFormParams({
                'subscription[plan_id]': args.plan_id,
                'subscription[plan_quantity]': args.plan_quantity ?? 1,
            });
            const data = await cbApi(
                site,
                apiKey,
                `/customers/${args.customer_id}/subscription_for_customer`,
                { method: 'POST', body },
            ) as any;
            return data.subscription;
        }

        case 'cancel_subscription': {
            if (!args.subscription_id) throw new Error('subscription_id is required');
            const endOfTerm = args.end_of_term !== false;
            const body = buildFormParams({ end_of_term: endOfTerm });
            const data = await cbApi(
                site,
                apiKey,
                `/subscriptions/${args.subscription_id}/cancel`,
                { method: 'POST', body },
            ) as any;
            return data.subscription;
        }

        case 'reactivate_subscription': {
            if (!args.subscription_id) throw new Error('subscription_id is required');
            const data = await cbApi(
                site,
                apiKey,
                `/subscriptions/${args.subscription_id}/reactivate`,
                { method: 'POST', body: '' },
            ) as any;
            return data.subscription;
        }

        case 'list_invoices': {
            const params = new URLSearchParams();
            params.set('limit', String(Number(args.limit ?? 20)));
            if (args.customer_id) params.set('customer_id[is]', String(args.customer_id));
            if (args.status) params.set('status[is]', String(args.status));
            const data = await cbApi(site, apiKey, `/invoices?${params}`) as any;
            return (data.list ?? []).map((item: any) => {
                const inv = item.invoice;
                return {
                    id: inv.id,
                    customer_id: inv.customer_id,
                    status: inv.status,
                    amount_due: inv.amount_due,
                    amount_paid: inv.amount_paid,
                    date: inv.date,
                    due_date: inv.due_date,
                };
            });
        }

        case 'list_plans': {
            const params = new URLSearchParams();
            params.set('limit', String(Number(args.limit ?? 20)));
            if (args.status) params.set('status[is]', String(args.status));
            const data = await cbApi(site, apiKey, `/plans?${params}`) as any;
            return (data.list ?? []).map((item: any) => {
                const p = item.plan;
                return {
                    id: p.id,
                    name: p.name,
                    price: p.price,
                    period: p.period,
                    period_unit: p.period_unit,
                    currency_code: p.currency_code,
                    status: p.status,
                };
            });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'chargebee-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'chargebee-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const site = request.headers.get('X-Mcp-Secret-CHARGEBEE-SITE');
            const apiKey = request.headers.get('X-Mcp-Secret-CHARGEBEE-API-KEY');

            if (!site || !apiKey) {
                return rpcErr(id, -32001, 'Missing required secrets: CHARGEBEE_SITE, CHARGEBEE_API_KEY');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, site, apiKey);
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
