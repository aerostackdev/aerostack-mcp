/**
 * Lemon Squeezy MCP Worker
 * Implements MCP protocol over HTTP for Lemon Squeezy payments and subscriptions.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   LEMONSQUEEZY_API_KEY → X-Mcp-Secret-LEMONSQUEEZY-API-KEY
 *
 * Auth format: Authorization: Bearer {api_key} on all requests
 * Base URL: https://api.lemonsqueezy.com/v1
 */

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

const LS_BASE = 'https://api.lemonsqueezy.com/v1';

async function lsFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${LS_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Lemon Squeezy HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'errors' in data) {
            const errors = (data as { errors: Array<{ title?: string; detail?: string }> }).errors;
            if (Array.isArray(errors) && errors.length > 0) {
                msg = errors.map(e => e.detail || e.title || '').filter(Boolean).join(', ') || msg;
            }
        }
        throw new Error(`Lemon Squeezy API error ${res.status}: ${msg}`);
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_stores',
        description: 'List all stores in your Lemon Squeezy account.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_products',
        description: 'List products in a store.',
        inputSchema: {
            type: 'object',
            properties: {
                store_id: { type: 'string', description: 'Store ID to filter products by' },
            },
            required: ['store_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_product',
        description: 'Get a product by its ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Product ID' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_orders',
        description: 'List orders in a store.',
        inputSchema: {
            type: 'object',
            properties: {
                store_id: { type: 'string', description: 'Store ID to filter orders by' },
                limit: { type: 'number', description: 'Number of orders to return (default 10)' },
            },
            required: ['store_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_order',
        description: 'Get an order by its ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Order ID' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_subscriptions',
        description: 'List subscriptions across your stores.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of subscriptions to return (default 10)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_subscription',
        description: 'Get a subscription by its ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Subscription ID' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'cancel_subscription',
        description: 'Cancel a subscription by its ID. This will cancel at period end.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Subscription ID to cancel' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_customers',
        description: 'List customers across your stores.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of customers to return (default 10)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case 'list_stores':
            return lsFetch('/stores', apiKey);

        case 'list_products': {
            validateRequired(args, ['store_id']);
            return lsFetch(`/products?filter[store_id]=${args.store_id}`, apiKey);
        }

        case 'get_product': {
            validateRequired(args, ['id']);
            return lsFetch(`/products/${args.id}`, apiKey);
        }

        case 'list_orders': {
            validateRequired(args, ['store_id']);
            const limit = args.limit ?? 10;
            return lsFetch(`/orders?filter[store_id]=${args.store_id}&page[size]=${limit}`, apiKey);
        }

        case 'get_order': {
            validateRequired(args, ['id']);
            return lsFetch(`/orders/${args.id}`, apiKey);
        }

        case 'list_subscriptions': {
            const limit = args.limit ?? 10;
            return lsFetch(`/subscriptions?page[size]=${limit}`, apiKey);
        }

        case 'get_subscription': {
            validateRequired(args, ['id']);
            return lsFetch(`/subscriptions/${args.id}`, apiKey);
        }

        case 'cancel_subscription': {
            validateRequired(args, ['id']);
            return lsFetch(`/subscriptions/${args.id}`, apiKey, { method: 'DELETE' });
        }

        case 'list_customers': {
            const limit = args.limit ?? 10;
            return lsFetch(`/customers?page[size]=${limit}`, apiKey);
        }

        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-lemon-squeezy', tools: TOOLS.length }),
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

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-lemon-squeezy', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const apiKey = request.headers.get('X-Mcp-Secret-LEMONSQUEEZY-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: LEMONSQUEEZY_API_KEY (header: X-Mcp-Secret-LEMONSQUEEZY-API-KEY)');
            }

            try {
                const result = await callTool(toolName, args, apiKey);
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
