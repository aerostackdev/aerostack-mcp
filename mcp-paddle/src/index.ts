/**
 * Paddle Billing MCP Worker
 * Implements MCP protocol over HTTP for Paddle Billing v1 operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   PADDLE_API_KEY → X-Mcp-Secret-PADDLE-API-KEY
 *
 * Auth format: Authorization: Bearer {api_key} on all requests
 * Base URL: https://api.paddle.com
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

const PADDLE_BASE = 'https://api.paddle.com';

async function paddleFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${PADDLE_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Paddle HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'error' in data) {
            const err = (data as { error: { detail?: string; type?: string } }).error;
            msg = err.detail || err.type || msg;
        }
        throw new Error(`Paddle API error ${res.status}: ${msg}`);
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_products',
        description: 'List all products in your Paddle catalog.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of products to return (default 10, max 200)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_product',
        description: 'Get a product by its ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Product ID (e.g. pro_01abc...)' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_prices',
        description: 'List all prices across products.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of prices to return (default 10, max 200)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_customers',
        description: 'List customers in your Paddle account.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of customers to return (default 10, max 200)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_customer',
        description: 'Get a customer by their ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Customer ID (e.g. ctm_01abc...)' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_subscriptions',
        description: 'List subscriptions in your Paddle account.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of subscriptions to return (default 10, max 200)' },
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
                id: { type: 'string', description: 'Subscription ID (e.g. sub_01abc...)' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'cancel_subscription',
        description: 'Cancel a subscription. By default cancels at the end of the current billing period.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Subscription ID to cancel' },
                effective_from: {
                    type: 'string',
                    enum: ['next_billing_period', 'immediately'],
                    description: 'When to cancel: next_billing_period (default) or immediately',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_transactions',
        description: 'List transactions in your Paddle account.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of transactions to return (default 10, max 200)' },
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
        case 'list_products': {
            const limit = args.limit ?? 10;
            return paddleFetch(`/products?per_page=${limit}`, apiKey);
        }

        case 'get_product': {
            validateRequired(args, ['id']);
            return paddleFetch(`/products/${args.id}`, apiKey);
        }

        case 'list_prices': {
            const limit = args.limit ?? 10;
            return paddleFetch(`/prices?per_page=${limit}`, apiKey);
        }

        case 'list_customers': {
            const limit = args.limit ?? 10;
            return paddleFetch(`/customers?per_page=${limit}`, apiKey);
        }

        case 'get_customer': {
            validateRequired(args, ['id']);
            return paddleFetch(`/customers/${args.id}`, apiKey);
        }

        case 'list_subscriptions': {
            const limit = args.limit ?? 10;
            return paddleFetch(`/subscriptions?per_page=${limit}`, apiKey);
        }

        case 'get_subscription': {
            validateRequired(args, ['id']);
            return paddleFetch(`/subscriptions/${args.id}`, apiKey);
        }

        case 'cancel_subscription': {
            validateRequired(args, ['id']);
            const effectiveFrom = args.effective_from ?? 'next_billing_period';
            return paddleFetch(`/subscriptions/${args.id}/cancel`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ effective_from: effectiveFrom }),
            });
        }

        case 'list_transactions': {
            const limit = args.limit ?? 10;
            return paddleFetch(`/transactions?per_page=${limit}`, apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-paddle', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-paddle', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const apiKey = request.headers.get('X-Mcp-Secret-PADDLE-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: PADDLE_API_KEY (header: X-Mcp-Secret-PADDLE-API-KEY)');
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
