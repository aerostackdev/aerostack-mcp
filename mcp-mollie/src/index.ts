/**
 * Mollie MCP Worker
 * Implements MCP protocol over HTTP for Mollie payment operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   MOLLIE_API_KEY → X-Mcp-Secret-MOLLIE-API-KEY
 *
 * Auth format: Authorization: Bearer {api_key}
 * Base URL: https://api.mollie.com/v2
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

const BASE = 'https://api.mollie.com/v2';

async function apiFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
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
        throw { code: -32603, message: `Mollie HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'detail' in data) {
            msg = (data as { detail: string }).detail || msg;
        }
        throw { code: -32603, message: `Mollie API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Mollie credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_payments',
        description: 'List payments in Mollie with status, amount, and payment method details.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of payments to return (default 25, max 250)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_payment',
        description: 'Get full payment details by ID including status, amount, method, and checkout URL.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Payment ID (e.g. tr_...)' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_payment',
        description: 'Create a new payment in Mollie. Amount, description, and redirectUrl are required.',
        inputSchema: {
            type: 'object',
            properties: {
                currency: { type: 'string', description: 'ISO 4217 currency code (e.g. EUR, USD)' },
                value: { type: 'string', description: 'Amount as a string with exactly 2 decimal places (e.g. "10.00")' },
                description: { type: 'string', description: 'Payment description shown to customer' },
                redirectUrl: { type: 'string', description: 'URL to redirect customer after payment' },
                method: { type: 'string', description: 'Payment method (e.g. ideal, creditcard, bancontact). Leave empty to show selector.' },
            },
            required: ['currency', 'value', 'description', 'redirectUrl'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'cancel_payment',
        description: 'Cancel a payment that has not yet been completed.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Payment ID to cancel (e.g. tr_...)' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_customers',
        description: 'List customers in Mollie.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of customers to return (default 25, max 250)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_customer',
        description: 'Create a new customer in Mollie.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Customer full name' },
                email: { type: 'string', description: 'Customer email address' },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_subscriptions',
        description: 'List subscriptions for a specific customer.',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: { type: 'string', description: 'Customer ID (e.g. cst_...)' },
                limit: { type: 'number', description: 'Number of subscriptions to return (default 25, max 250)' },
            },
            required: ['customer_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_subscription',
        description: 'Create a recurring subscription for a customer.',
        inputSchema: {
            type: 'object',
            properties: {
                customer_id: { type: 'string', description: 'Customer ID (e.g. cst_...)' },
                currency: { type: 'string', description: 'ISO 4217 currency code (e.g. EUR)' },
                value: { type: 'string', description: 'Amount as a string with exactly 2 decimal places (e.g. "10.00")' },
                interval: { type: 'string', description: 'Billing interval (e.g. "1 month", "2 weeks", "1 day")' },
                description: { type: 'string', description: 'Subscription description' },
            },
            required: ['customer_id', 'currency', 'value', 'interval', 'description'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_refunds',
        description: 'List all refunds across all payments.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of refunds to return (default 25, max 250)' },
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
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const data = await apiFetch('/organizations/me', apiKey) as { name?: string; email?: string };
            return { connected: true, name: data.name ?? data.email ?? 'unknown' };
        }

        case 'list_payments': {
            const limit = args.limit ?? 25;
            return apiFetch(`/payments?limit=${limit}`, apiKey);
        }

        case 'get_payment': {
            validateRequired(args, ['id']);
            return apiFetch(`/payments/${args.id}`, apiKey);
        }

        case 'create_payment': {
            validateRequired(args, ['currency', 'value', 'description', 'redirectUrl']);
            const body: Record<string, unknown> = {
                amount: { currency: args.currency, value: args.value },
                description: args.description,
                redirectUrl: args.redirectUrl,
            };
            if (args.method !== undefined) body.method = args.method;
            return apiFetch('/payments', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'cancel_payment': {
            validateRequired(args, ['id']);
            return apiFetch(`/payments/${args.id}`, apiKey, { method: 'DELETE' });
        }

        case 'list_customers': {
            const limit = args.limit ?? 25;
            return apiFetch(`/customers?limit=${limit}`, apiKey);
        }

        case 'create_customer': {
            const body: Record<string, unknown> = {};
            if (args.name !== undefined) body.name = args.name;
            if (args.email !== undefined) body.email = args.email;
            return apiFetch('/customers', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_subscriptions': {
            validateRequired(args, ['customer_id']);
            const limit = args.limit ?? 25;
            return apiFetch(`/customers/${args.customer_id}/subscriptions?limit=${limit}`, apiKey);
        }

        case 'create_subscription': {
            validateRequired(args, ['customer_id', 'currency', 'value', 'interval', 'description']);
            const body: Record<string, unknown> = {
                amount: { currency: args.currency, value: args.value },
                interval: args.interval,
                description: args.description,
            };
            return apiFetch(`/customers/${args.customer_id}/subscriptions`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_refunds': {
            const limit = args.limit ?? 25;
            return apiFetch(`/refunds?limit=${limit}`, apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-mollie', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-mollie', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const apiKey = request.headers.get('X-Mcp-Secret-MOLLIE-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: MOLLIE_API_KEY (header: X-Mcp-Secret-MOLLIE-API-KEY)');
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
