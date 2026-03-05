/**
 * Stripe MCP Worker
 * Implements MCP protocol over HTTP for Stripe API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: STRIPE_SECRET_KEY → header: X-Mcp-Secret-STRIPE-SECRET-KEY
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-stripe
 */

const STRIPE_API = 'https://api.stripe.com/v1';

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
        name: 'list_customers',
        description: 'List Stripe customers, optionally filtering by email',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Filter by exact email address (optional)' },
                limit: { type: 'number', description: 'Max results (default 10, max 100)' },
            },
        },
    },
    {
        name: 'get_customer',
        description: 'Get details of a specific Stripe customer by ID',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: { type: 'string', description: 'Stripe customer ID (cus_...)' },
            },
            required: ['customer_id'],
        },
    },
    {
        name: 'list_subscriptions',
        description: 'List Stripe subscriptions, optionally filtered by customer or status',
        inputSchema: {
            type: 'object',
            properties: {
                customer: { type: 'string', description: 'Filter by customer ID (optional)' },
                status: { type: 'string', enum: ['active', 'canceled', 'past_due', 'trialing', 'all'], description: 'Filter by status (optional)' },
                limit: { type: 'number', description: 'Max results (default 10)' },
            },
        },
    },
    {
        name: 'list_invoices',
        description: 'List Stripe invoices, optionally filtered by customer or status',
        inputSchema: {
            type: 'object',
            properties: {
                customer: { type: 'string', description: 'Filter by customer ID (optional)' },
                status: { type: 'string', enum: ['draft', 'open', 'paid', 'void', 'uncollectible'], description: 'Filter by status (optional)' },
                limit: { type: 'number', description: 'Max results (default 10)' },
            },
        },
    },
    {
        name: 'get_balance',
        description: 'Get the current Stripe account balance (available and pending)',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'list_payment_intents',
        description: 'List recent Stripe payment intents',
        inputSchema: {
            type: 'object',
            properties: {
                customer: { type: 'string', description: 'Filter by customer ID (optional)' },
                limit: { type: 'number', description: 'Max results (default 10)' },
            },
        },
    },
    {
        name: 'list_products',
        description: 'List Stripe products with their prices',
        inputSchema: {
            type: 'object',
            properties: {
                active: { type: 'boolean', description: 'Filter by active status (optional)' },
                limit: { type: 'number', description: 'Max results (default 10)' },
            },
        },
    },
];

async function stripe(path: string, key: string, params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = `${STRIPE_API}${path}${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${key}`,
            'Stripe-Version': '2024-06-20',
        },
    });
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`Stripe API ${res.status}: ${err.error?.message ?? 'unknown'}`);
    }
    return res.json();
}

function formatAmount(amount: number, currency: string): string {
    const divisor = ['jpy', 'krw', 'clp'].includes(currency?.toLowerCase()) ? 1 : 100;
    return `${(amount / divisor).toFixed(2)} ${currency?.toUpperCase()}`;
}

async function callTool(name: string, args: Record<string, unknown>, key: string): Promise<unknown> {
    switch (name) {
        case 'list_customers': {
            const params: Record<string, string> = { limit: String(Math.min(Number(args.limit ?? 10), 100)) };
            if (args.email) params.email = String(args.email);
            const data = await stripe('/customers', key, params) as any;
            return data.data?.map((c: any) => ({
                id: c.id,
                email: c.email,
                name: c.name,
                created: new Date(c.created * 1000).toISOString(),
                currency: c.currency,
                balance: c.balance,
                subscriptions: c.subscriptions?.total_count ?? 0,
            })) ?? [];
        }

        case 'get_customer': {
            const c = await stripe(`/customers/${args.customer_id}`, key) as any;
            return {
                id: c.id,
                email: c.email,
                name: c.name,
                phone: c.phone,
                created: new Date(c.created * 1000).toISOString(),
                currency: c.currency,
                balance: c.balance,
                delinquent: c.delinquent,
                description: c.description,
                address: c.address,
                metadata: c.metadata,
            };
        }

        case 'list_subscriptions': {
            const params: Record<string, string> = { limit: String(Math.min(Number(args.limit ?? 10), 100)) };
            if (args.customer) params.customer = String(args.customer);
            if (args.status && args.status !== 'all') params.status = String(args.status);
            const data = await stripe('/subscriptions', key, params) as any;
            return data.data?.map((s: any) => ({
                id: s.id,
                status: s.status,
                customer: s.customer,
                current_period_end: new Date(s.current_period_end * 1000).toISOString(),
                cancel_at_period_end: s.cancel_at_period_end,
                items: s.items?.data?.map((i: any) => ({
                    product: i.price?.product,
                    price: i.price?.id,
                    amount: formatAmount(i.price?.unit_amount ?? 0, i.price?.currency),
                    interval: i.price?.recurring?.interval,
                })),
            })) ?? [];
        }

        case 'list_invoices': {
            const params: Record<string, string> = { limit: String(Math.min(Number(args.limit ?? 10), 100)) };
            if (args.customer) params.customer = String(args.customer);
            if (args.status) params.status = String(args.status);
            const data = await stripe('/invoices', key, params) as any;
            return data.data?.map((inv: any) => ({
                id: inv.id,
                number: inv.number,
                status: inv.status,
                customer_email: inv.customer_email,
                amount_due: formatAmount(inv.amount_due, inv.currency),
                amount_paid: formatAmount(inv.amount_paid, inv.currency),
                created: new Date(inv.created * 1000).toISOString(),
                due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
                hosted_invoice_url: inv.hosted_invoice_url,
            })) ?? [];
        }

        case 'get_balance': {
            const balance = await stripe('/balance', key) as any;
            return {
                available: balance.available?.map((b: any) => formatAmount(b.amount, b.currency)),
                pending: balance.pending?.map((b: any) => formatAmount(b.amount, b.currency)),
                currency: balance.available?.[0]?.currency?.toUpperCase(),
            };
        }

        case 'list_payment_intents': {
            const params: Record<string, string> = { limit: String(Math.min(Number(args.limit ?? 10), 100)) };
            if (args.customer) params.customer = String(args.customer);
            const data = await stripe('/payment_intents', key, params) as any;
            return data.data?.map((pi: any) => ({
                id: pi.id,
                amount: formatAmount(pi.amount, pi.currency),
                status: pi.status,
                customer: pi.customer,
                description: pi.description,
                created: new Date(pi.created * 1000).toISOString(),
            })) ?? [];
        }

        case 'list_products': {
            const params: Record<string, string> = { limit: String(Math.min(Number(args.limit ?? 10), 100)) };
            if (typeof args.active === 'boolean') params.active = String(args.active);
            const data = await stripe('/products', key, params) as any;
            return data.data?.map((p: any) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                active: p.active,
                created: new Date(p.created * 1000).toISOString(),
                metadata: p.metadata,
            })) ?? [];
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'stripe-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'stripe-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const key = request.headers.get('X-Mcp-Secret-STRIPE-SECRET-KEY');
            if (!key) {
                return rpcErr(id, -32001, 'Missing STRIPE_SECRET_KEY secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, key);
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
