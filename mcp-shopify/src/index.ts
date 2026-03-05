/**
 * Shopify MCP Worker
 * Implements MCP protocol over HTTP for Shopify Admin API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   SHOPIFY_ACCESS_TOKEN → header: X-Mcp-Secret-SHOPIFY-ACCESS-TOKEN
 *   SHOPIFY_SHOP_DOMAIN  → header: X-Mcp-Secret-SHOPIFY-SHOP-DOMAIN
 *   (domain format: mystore.myshopify.com)
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-shopify
 */

const SHOPIFY_API_VERSION = '2024-01';

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
        name: 'get_shop_info',
        description: 'Get basic information about the Shopify store',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'list_products',
        description: 'List products in the Shopify store',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default 10, max 250)' },
                status: { type: 'string', enum: ['active', 'archived', 'draft'], description: 'Filter by status (optional)' },
                title: { type: 'string', description: 'Filter by title (partial match, optional)' },
            },
        },
    },
    {
        name: 'get_product',
        description: 'Get details of a specific Shopify product including variants',
        inputSchema: {
            type: 'object',
            properties: {
                product_id: { type: 'string', description: 'Shopify product ID' },
            },
            required: ['product_id'],
        },
    },
    {
        name: 'list_orders',
        description: 'List orders from the Shopify store',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default 10, max 250)' },
                status: { type: 'string', enum: ['open', 'closed', 'cancelled', 'any'], description: 'Order status filter (default: any)' },
                financial_status: { type: 'string', enum: ['paid', 'pending', 'refunded', 'partially_refunded', 'authorized'], description: 'Financial status filter (optional)' },
            },
        },
    },
    {
        name: 'get_order',
        description: 'Get details of a specific Shopify order',
        inputSchema: {
            type: 'object',
            properties: {
                order_id: { type: 'string', description: 'Shopify order ID' },
            },
            required: ['order_id'],
        },
    },
    {
        name: 'list_customers',
        description: 'List customers in the Shopify store',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max results (default 10)' },
                email: { type: 'string', description: 'Filter by exact email (optional)' },
            },
        },
    },
    {
        name: 'get_inventory',
        description: 'Get inventory levels for a product variant',
        inputSchema: {
            type: 'object',
            properties: {
                product_id: { type: 'string', description: 'Shopify product ID' },
            },
            required: ['product_id'],
        },
    },
];

async function shopify(path: string, token: string, domain: string, opts: RequestInit = {}) {
    const base = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}`;
    const res = await fetch(`${base}${path}`, {
        ...opts,
        headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Shopify API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string, domain: string): Promise<unknown> {
    switch (name) {
        case 'get_shop_info': {
            const data = await shopify('/shop.json', token, domain) as any;
            const s = data.shop;
            return {
                name: s.name,
                domain: s.domain,
                email: s.email,
                currency: s.currency,
                timezone: s.iana_timezone,
                plan: s.plan_name,
                country: s.country_name,
            };
        }

        case 'list_products': {
            const params = new URLSearchParams({ limit: String(Math.min(Number(args.limit ?? 10), 250)) });
            if (args.status) params.set('status', String(args.status));
            if (args.title) params.set('title', String(args.title));
            const data = await shopify(`/products.json?${params}`, token, domain) as any;
            return data.products?.map((p: any) => ({
                id: p.id,
                title: p.title,
                status: p.status,
                vendor: p.vendor,
                product_type: p.product_type,
                tags: p.tags,
                variants_count: p.variants?.length ?? 0,
                price_range: p.variants?.length
                    ? { min: p.variants[0]?.price, max: p.variants[p.variants.length - 1]?.price }
                    : null,
                created_at: p.created_at,
            })) ?? [];
        }

        case 'get_product': {
            const data = await shopify(`/products/${args.product_id}.json`, token, domain) as any;
            const p = data.product;
            return {
                id: p.id,
                title: p.title,
                description: p.body_html?.replace(/<[^>]*>/g, '').slice(0, 500),
                status: p.status,
                vendor: p.vendor,
                product_type: p.product_type,
                variants: p.variants?.map((v: any) => ({
                    id: v.id,
                    title: v.title,
                    price: v.price,
                    sku: v.sku,
                    inventory_quantity: v.inventory_quantity,
                })),
                images_count: p.images?.length ?? 0,
                created_at: p.created_at,
            };
        }

        case 'list_orders': {
            const params = new URLSearchParams({
                limit: String(Math.min(Number(args.limit ?? 10), 250)),
                status: String(args.status ?? 'any'),
            });
            if (args.financial_status) params.set('financial_status', String(args.financial_status));
            const data = await shopify(`/orders.json?${params}`, token, domain) as any;
            return data.orders?.map((o: any) => ({
                id: o.id,
                name: o.name,
                email: o.email,
                financial_status: o.financial_status,
                fulfillment_status: o.fulfillment_status,
                total_price: `${o.total_price} ${o.currency}`,
                line_items_count: o.line_items?.length ?? 0,
                created_at: o.created_at,
            })) ?? [];
        }

        case 'get_order': {
            const data = await shopify(`/orders/${args.order_id}.json`, token, domain) as any;
            const o = data.order;
            return {
                id: o.id,
                name: o.name,
                email: o.email,
                financial_status: o.financial_status,
                fulfillment_status: o.fulfillment_status,
                total_price: `${o.total_price} ${o.currency}`,
                subtotal_price: o.subtotal_price,
                shipping_price: o.total_shipping_price_set?.shop_money?.amount,
                line_items: o.line_items?.map((li: any) => ({
                    title: li.title,
                    quantity: li.quantity,
                    price: li.price,
                    sku: li.sku,
                })),
                shipping_address: o.shipping_address,
                created_at: o.created_at,
            };
        }

        case 'list_customers': {
            const params = new URLSearchParams({ limit: String(Math.min(Number(args.limit ?? 10), 250)) });
            if (args.email) params.set('email', String(args.email));
            const data = await shopify(`/customers.json?${params}`, token, domain) as any;
            return data.customers?.map((c: any) => ({
                id: c.id,
                name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
                email: c.email,
                phone: c.phone,
                orders_count: c.orders_count,
                total_spent: `${c.total_spent} ${c.currency}`,
                created_at: c.created_at,
            })) ?? [];
        }

        case 'get_inventory': {
            const productData = await shopify(`/products/${args.product_id}.json`, token, domain) as any;
            const variants = productData.product?.variants ?? [];
            return variants.map((v: any) => ({
                variant_id: v.id,
                title: v.title,
                sku: v.sku,
                inventory_quantity: v.inventory_quantity,
                inventory_policy: v.inventory_policy,
            }));
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'shopify-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'shopify-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-SHOPIFY-ACCESS-TOKEN');
            const domain = request.headers.get('X-Mcp-Secret-SHOPIFY-SHOP-DOMAIN');
            if (!token || !domain) {
                return rpcErr(id, -32001, 'Missing secrets — add SHOPIFY_ACCESS_TOKEN and SHOPIFY_SHOP_DOMAIN to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token, domain);
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
