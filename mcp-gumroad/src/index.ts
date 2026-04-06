/**
 * Gumroad MCP Worker
 * Implements MCP protocol over HTTP for Gumroad creator economy operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   GUMROAD_ACCESS_TOKEN → X-Mcp-Secret-GUMROAD-ACCESS-TOKEN
 *
 * Auth format: Authorization: Bearer {access_token}
 * Base URL: https://api.gumroad.com/v2
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

const BASE = 'https://api.gumroad.com/v2';

async function apiFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Gumroad HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'message' in data) {
            msg = (data as { message: string }).message || msg;
        }
        throw { code: -32603, message: `Gumroad API error ${res.status}: ${msg}` };
    }

    // Gumroad wraps responses in {success: true, ...data}
    if (data && typeof data === 'object' && 'success' in data && !(data as { success: boolean }).success) {
        const d = data as { message?: string };
        throw { code: -32603, message: `Gumroad error: ${d.message ?? 'Unknown error'}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Gumroad credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_products',
        description: 'List all products on your Gumroad account.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_product',
        description: 'Get product details by ID including price, sales count, and description.',
        inputSchema: {
            type: 'object',
            properties: {
                product_id: { type: 'string', description: 'Gumroad product ID' },
            },
            required: ['product_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_sales',
        description: 'List all sales for your Gumroad account.',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number for pagination (default 1)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_sale',
        description: 'Get sale details by ID including buyer info, product, and amount.',
        inputSchema: {
            type: 'object',
            properties: {
                sale_id: { type: 'string', description: 'Sale ID' },
            },
            required: ['sale_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_subscribers',
        description: 'List subscribers for a specific product.',
        inputSchema: {
            type: 'object',
            properties: {
                product_id: { type: 'string', description: 'Product ID to list subscribers for' },
            },
            required: ['product_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_offer_codes',
        description: 'List all offer codes (discount codes) for a product.',
        inputSchema: {
            type: 'object',
            properties: {
                product_id: { type: 'string', description: 'Product ID' },
            },
            required: ['product_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_offer_code',
        description: 'Create a discount offer code for a product.',
        inputSchema: {
            type: 'object',
            properties: {
                product_id: { type: 'string', description: 'Product ID to create the offer code for' },
                offer_code: { type: 'string', description: 'The discount code string (e.g. SAVE20)' },
                amount_off: { type: 'number', description: 'Discount amount — cents if offer_type is "cents", percentage if "percent"' },
                offer_type: {
                    type: 'string',
                    enum: ['cents', 'percent'],
                    description: '"cents" for fixed amount off, "percent" for percentage off',
                },
            },
            required: ['product_id', 'offer_code', 'amount_off', 'offer_type'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const data = await apiFetch('/user', token) as { user?: { name?: string; email?: string } };
            const user = data.user;
            return { connected: true, name: user?.name ?? 'unknown', email: user?.email ?? 'unknown' };
        }

        case 'list_products': {
            return apiFetch('/products', token);
        }

        case 'get_product': {
            validateRequired(args, ['product_id']);
            return apiFetch(`/products/${args.product_id}`, token);
        }

        case 'list_sales': {
            const page = args.page ?? 1;
            return apiFetch(`/sales?page=${page}`, token);
        }

        case 'get_sale': {
            validateRequired(args, ['sale_id']);
            return apiFetch(`/sales/${args.sale_id}`, token);
        }

        case 'list_subscribers': {
            validateRequired(args, ['product_id']);
            return apiFetch(`/products/${args.product_id}/subscribers`, token);
        }

        case 'list_offer_codes': {
            validateRequired(args, ['product_id']);
            return apiFetch(`/products/${args.product_id}/offer_codes`, token);
        }

        case 'create_offer_code': {
            validateRequired(args, ['product_id', 'offer_code', 'amount_off', 'offer_type']);
            const body = JSON.stringify({
                offer_code: args.offer_code,
                amount_off: args.amount_off,
                offer_type: args.offer_type,
            });
            return apiFetch(`/products/${args.product_id}/offer_codes`, token, {
                method: 'POST',
                body,
            });
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
                JSON.stringify({ status: 'ok', server: 'mcp-gumroad', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-gumroad', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const token = request.headers.get('X-Mcp-Secret-GUMROAD-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing required secret: GUMROAD_ACCESS_TOKEN (header: X-Mcp-Secret-GUMROAD-ACCESS-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, token);
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
