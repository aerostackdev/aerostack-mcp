/**
 * BigCommerce MCP Worker
 * Implements MCP protocol over HTTP for BigCommerce API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: BIGCOMMERCE_ACCESS_TOKEN → header: X-Mcp-Secret-BIGCOMMERCE-ACCESS-TOKEN
 * Secret: BIGCOMMERCE_STORE_HASH  → header: X-Mcp-Secret-BIGCOMMERCE-STORE-HASH
 */

function rpcOk(id: string | number | null, result: unknown): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: string | number | null, code: number, message: string): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    const missing = fields.filter(f => args[f] === undefined || args[f] === null || args[f] === '');
    if (missing.length > 0) throw new Error(`Missing required fields: ${missing.join(', ')}`);
}

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify BigCommerce credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_products',
        description: 'List products in the BigCommerce store',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of results per page (default 20)' },
                page: { type: 'number', description: 'Page number (default 1)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_product',
        description: 'Get a single product by ID',
        inputSchema: {
            type: 'object',
            properties: {
                productId: { type: 'number', description: 'Product ID' },
            },
            required: ['productId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_product',
        description: 'Create a new product in the store',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Product name' },
                type: { type: 'string', description: 'Product type (physical or digital)' },
                weight: { type: 'number', description: 'Product weight' },
                price: { type: 'number', description: 'Product price' },
                sku: { type: 'string', description: 'Product SKU (optional)' },
            },
            required: ['name', 'type', 'weight', 'price'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'update_product',
        description: 'Update an existing product',
        inputSchema: {
            type: 'object',
            properties: {
                productId: { type: 'number', description: 'Product ID to update' },
                name: { type: 'string', description: 'New product name (optional)' },
                price: { type: 'number', description: 'New price (optional)' },
                weight: { type: 'number', description: 'New weight (optional)' },
                description: { type: 'string', description: 'New description (optional)' },
            },
            required: ['productId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'delete_product',
        description: 'Delete a product from the store',
        inputSchema: {
            type: 'object',
            properties: {
                productId: { type: 'number', description: 'Product ID to delete' },
            },
            required: ['productId'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_orders',
        description: 'List orders in the store',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of results per page (default 20)' },
                page: { type: 'number', description: 'Page number (default 1)' },
                status_id: { type: 'number', description: 'Filter by order status ID (optional)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_order',
        description: 'Get a single order by ID',
        inputSchema: {
            type: 'object',
            properties: {
                orderId: { type: 'number', description: 'Order ID' },
            },
            required: ['orderId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'update_order_status',
        description: 'Update the status of an order',
        inputSchema: {
            type: 'object',
            properties: {
                orderId: { type: 'number', description: 'Order ID to update' },
                status_id: { type: 'number', description: 'New status ID' },
            },
            required: ['orderId', 'status_id'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_customers',
        description: 'List customers in the store',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of results per page (default 20)' },
                page: { type: 'number', description: 'Page number (default 1)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_customer',
        description: 'Get a customer by ID',
        inputSchema: {
            type: 'object',
            properties: {
                customerId: { type: 'number', description: 'Customer ID' },
            },
            required: ['customerId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_categories',
        description: 'List product categories',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of results per page (default 20)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_category',
        description: 'Create a new product category',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Category name' },
                parent_id: { type: 'number', description: 'Parent category ID (optional)' },
                description: { type: 'string', description: 'Category description (optional)' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_coupons',
        description: 'List coupons in the store',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of results per page (default 20)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_store_info',
        description: 'Get store information and settings',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true },
    },
];

async function bcFetch(
    url: string,
    token: string,
    opts: RequestInit = {}
): Promise<unknown> {
    const res = await fetch(url, {
        ...opts,
        headers: {
            'X-Auth-Token': token,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (res.status === 204 || res.status === 404) {
        return { deleted: true };
    }
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`BigCommerce API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    storeHash: string
): Promise<unknown> {
    const v2 = `https://api.bigcommerce.com/stores/${storeHash}/v2`;
    const v3 = `https://api.bigcommerce.com/stores/${storeHash}/v3`;

    switch (name) {
        case '_ping': {
            // GET /v2/store — validates API key + store hash
            const data = await bcFetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/store`, token) as any;
            return { connected: true, store: data?.name ?? storeHash, domain: data?.domain ?? 'unknown' };
        }
        case 'list_products': {
            const limit = args.limit ?? 20;
            const page = args.page ?? 1;
            const data = await bcFetch(`${v3}/catalog/products?limit=${limit}&page=${page}`, token) as any;
            return data.data ?? data;
        }
        case 'get_product': {
            validateRequired(args, ['productId']);
            const data = await bcFetch(`${v3}/catalog/products/${args.productId}`, token) as any;
            return data.data ?? data;
        }
        case 'create_product': {
            validateRequired(args, ['name', 'type', 'weight', 'price']);
            const body: Record<string, unknown> = {
                name: args.name,
                type: args.type,
                weight: args.weight,
                price: args.price,
            };
            if (args.sku) body.sku = args.sku;
            const data = await bcFetch(`${v3}/catalog/products`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;
            return data.data ?? data;
        }
        case 'update_product': {
            validateRequired(args, ['productId']);
            const { productId, ...rest } = args;
            const data = await bcFetch(`${v3}/catalog/products/${productId}`, token, {
                method: 'PUT',
                body: JSON.stringify(rest),
            }) as any;
            return data.data ?? data;
        }
        case 'delete_product': {
            validateRequired(args, ['productId']);
            return bcFetch(`${v3}/catalog/products/${args.productId}`, token, { method: 'DELETE' });
        }
        case 'list_orders': {
            const limit = args.limit ?? 20;
            const page = args.page ?? 1;
            let url = `${v2}/orders?limit=${limit}&page=${page}`;
            if (args.status_id !== undefined) url += `&status_id=${args.status_id}`;
            return bcFetch(url, token);
        }
        case 'get_order': {
            validateRequired(args, ['orderId']);
            return bcFetch(`${v2}/orders/${args.orderId}`, token);
        }
        case 'update_order_status': {
            validateRequired(args, ['orderId', 'status_id']);
            return bcFetch(`${v2}/orders/${args.orderId}`, token, {
                method: 'PUT',
                body: JSON.stringify({ status_id: args.status_id }),
            });
        }
        case 'list_customers': {
            const limit = args.limit ?? 20;
            const page = args.page ?? 1;
            const data = await bcFetch(`${v3}/customers?limit=${limit}&page=${page}`, token) as any;
            return data.data ?? data;
        }
        case 'get_customer': {
            validateRequired(args, ['customerId']);
            const data = await bcFetch(`${v3}/customers?id:in=${args.customerId}`, token) as any;
            return data.data ?? data;
        }
        case 'list_categories': {
            const limit = args.limit ?? 20;
            const data = await bcFetch(`${v3}/catalog/categories?limit=${limit}`, token) as any;
            return data.data ?? data;
        }
        case 'create_category': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.parent_id !== undefined) body.parent_id = args.parent_id;
            if (args.description) body.description = args.description;
            const data = await bcFetch(`${v3}/catalog/categories`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;
            return data.data ?? data;
        }
        case 'list_coupons': {
            const limit = args.limit ?? 20;
            return bcFetch(`${v2}/coupons?limit=${limit}`, token);
        }
        case 'get_store_info': {
            return bcFetch(`${v2}/store`, token);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'bigcommerce-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string | null; method: string; params?: Record<string, unknown> };
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
                serverInfo: { name: 'bigcommerce-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-BIGCOMMERCE-ACCESS-TOKEN');
            const storeHash = request.headers.get('X-Mcp-Secret-BIGCOMMERCE-STORE-HASH');

            if (!token || !storeHash) {
                return rpcErr(id, -32001, 'Missing secrets — add BIGCOMMERCE_ACCESS_TOKEN and BIGCOMMERCE_STORE_HASH to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token, storeHash);
                return rpcOk(id, toolOk(result));
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
