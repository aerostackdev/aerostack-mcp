/**
 * Squarespace MCP Worker
 * Implements MCP protocol over HTTP for Squarespace Commerce API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: SQUARESPACE_API_KEY → header: X-Mcp-Secret-SQUARESPACE-API-KEY
 */

const SS_API = 'https://api.squarespace.com/1.0';

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
        name: 'list_products',
        description: 'List products in the Squarespace store',
        inputSchema: {
            type: 'object',
            properties: {
                cursor: { type: 'string', description: 'Pagination cursor (optional)' },
                hasInventory: { type: 'boolean', description: 'Filter by inventory availability (optional)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_product',
        description: 'Get a product by ID',
        inputSchema: {
            type: 'object',
            properties: {
                productId: { type: 'string', description: 'Product ID' },
            },
            required: ['productId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_orders',
        description: 'List orders from the store',
        inputSchema: {
            type: 'object',
            properties: {
                cursor: { type: 'string', description: 'Pagination cursor (optional)' },
                fulfillmentStatus: { type: 'string', description: 'Filter by fulfillment status (default PENDING)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_order',
        description: 'Get a specific order by ID',
        inputSchema: {
            type: 'object',
            properties: {
                orderId: { type: 'string', description: 'Order ID' },
            },
            required: ['orderId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'fulfill_order',
        description: 'Mark an order as fulfilled and optionally send notification',
        inputSchema: {
            type: 'object',
            properties: {
                orderId: { type: 'string', description: 'Order ID to fulfill' },
                shouldSendNotification: { type: 'boolean', description: 'Whether to notify the customer' },
                trackingNumber: { type: 'string', description: 'Shipment tracking number (optional)' },
                carrierName: { type: 'string', description: 'Carrier name (optional)' },
                service: { type: 'string', description: 'Shipping service (optional)' },
            },
            required: ['orderId', 'shouldSendNotification'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_inventory',
        description: 'List inventory for store variants',
        inputSchema: {
            type: 'object',
            properties: {
                cursor: { type: 'string', description: 'Pagination cursor (optional)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'update_inventory',
        description: 'Update inventory quantities for product variants',
        inputSchema: {
            type: 'object',
            properties: {
                variants: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            variantId: { type: 'string' },
                            quantity: { type: 'number' },
                        },
                    },
                    description: 'Array of variant IDs and quantities to set',
                },
            },
            required: ['variants'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_pages',
        description: 'List pages on the Squarespace website',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_page',
        description: 'Get a specific page by ID',
        inputSchema: {
            type: 'object',
            properties: {
                pageId: { type: 'string', description: 'Page ID' },
            },
            required: ['pageId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_blog_posts',
        description: 'List blog posts from the website',
        inputSchema: {
            type: 'object',
            properties: {
                cursor: { type: 'string', description: 'Pagination cursor (optional)' },
                status: { type: 'string', description: 'Filter by status (default published)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_blog_post',
        description: 'Get a specific blog post by ID',
        inputSchema: {
            type: 'object',
            properties: {
                postId: { type: 'string', description: 'Blog post ID' },
            },
            required: ['postId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_website',
        description: 'Get general website information',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true },
    },
];

async function ssFetch(path: string, apiKey: string, opts: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${SS_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Squarespace API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
    switch (name) {
        case 'list_products': {
            let url = '/commerce/products';
            const qs: string[] = [];
            if (args.cursor) qs.push(`cursor=${args.cursor}`);
            if (args.hasInventory !== undefined) qs.push(`hasInventory=${args.hasInventory}`);
            if (qs.length) url += `?${qs.join('&')}`;
            return ssFetch(url, apiKey);
        }
        case 'get_product': {
            validateRequired(args, ['productId']);
            return ssFetch(`/commerce/products/${args.productId}`, apiKey);
        }
        case 'list_orders': {
            const status = args.fulfillmentStatus ?? 'PENDING';
            let url = `/commerce/orders?fulfillmentStatus=${status}`;
            if (args.cursor) url += `&cursor=${args.cursor}`;
            return ssFetch(url, apiKey);
        }
        case 'get_order': {
            validateRequired(args, ['orderId']);
            return ssFetch(`/commerce/orders/${args.orderId}`, apiKey);
        }
        case 'fulfill_order': {
            validateRequired(args, ['orderId', 'shouldSendNotification']);
            const shipments: Record<string, string>[] = [];
            if (args.trackingNumber) {
                const shipment: Record<string, string> = { trackingNumber: String(args.trackingNumber) };
                if (args.carrierName) shipment.carrierName = String(args.carrierName);
                if (args.service) shipment.service = String(args.service);
                shipments.push(shipment);
            }
            return ssFetch(`/commerce/orders/${args.orderId}/fulfillments`, apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    shouldSendNotification: args.shouldSendNotification,
                    shipments,
                }),
            });
        }
        case 'list_inventory': {
            let url = '/commerce/inventory';
            if (args.cursor) url += `?cursor=${args.cursor}`;
            return ssFetch(url, apiKey);
        }
        case 'update_inventory': {
            validateRequired(args, ['variants']);
            return ssFetch('/commerce/inventory', apiKey, {
                method: 'POST',
                body: JSON.stringify({ variants: args.variants }),
            });
        }
        case 'list_pages': {
            return ssFetch('/pages', apiKey);
        }
        case 'get_page': {
            validateRequired(args, ['pageId']);
            return ssFetch(`/pages/${args.pageId}`, apiKey);
        }
        case 'list_blog_posts': {
            const status = args.status ?? 'published';
            let url = `/blog/posts?status=${status}`;
            if (args.cursor) url += `&cursor=${args.cursor}`;
            return ssFetch(url, apiKey);
        }
        case 'get_blog_post': {
            validateRequired(args, ['postId']);
            return ssFetch(`/blog/posts/${args.postId}`, apiKey);
        }
        case 'get_website': {
            return ssFetch('/website', apiKey);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'squarespace-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'squarespace-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const apiKey = request.headers.get('X-Mcp-Secret-SQUARESPACE-API-KEY');
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing SQUARESPACE_API_KEY secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, apiKey);
                return rpcOk(id, toolOk(result));
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
