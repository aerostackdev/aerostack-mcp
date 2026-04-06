/**
 * WooCommerce MCP Worker
 * Implements MCP protocol over HTTP for WooCommerce REST API v3 operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   WOOCOMMERCE_CONSUMER_KEY    → X-Mcp-Secret-WOOCOMMERCE-CONSUMER-KEY    (REST API Consumer Key)
 *   WOOCOMMERCE_CONSUMER_SECRET → X-Mcp-Secret-WOOCOMMERCE-CONSUMER-SECRET (REST API Consumer Secret)
 *   WOOCOMMERCE_STORE_URL       → X-Mcp-Secret-WOOCOMMERCE-STORE-URL       (e.g. https://mystore.com)
 *
 * Auth format: Authorization: Basic base64(consumerKey:consumerSecret)
 * Base URL: {STORE_URL}/wp-json/wc/v3
 *
 * Covers: Products (6), Orders (6), Customers (4), Coupons & Store (4), Reports (2) = 22 tools total
 *
 * SECURITY: Store URL is user-supplied. SSRF protection validates protocol and blocks
 * private/local IP ranges before every outbound request.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const WC_API_VERSION = 'wc/v3';

function wcApiBase(storeUrl: string): string {
    return `${storeUrl.replace(/\/$/, '')}/wp-json/${WC_API_VERSION}`;
}

// ── SSRF Protection ────────────────────────────────────────────────────────────

const ALLOWED_PROTOCOLS = /^https:\/\//i;
const PRIVATE_IP_PATTERN =
    /^https?:\/\/(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/i;

function validateStoreUrl(storeUrl: string): void {
    if (!ALLOWED_PROTOCOLS.test(storeUrl)) {
        throw { code: -32600, message: 'WOOCOMMERCE_STORE_URL must start with https://' };
    }
    if (PRIVATE_IP_PATTERN.test(storeUrl)) {
        throw {
            code: -32600,
            message: 'WOOCOMMERCE_STORE_URL must not point to a private/local network address',
        };
    }
}

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

function getSecrets(request: Request): {
    consumerKey: string | null;
    consumerSecret: string | null;
    storeUrl: string | null;
} {
    return {
        consumerKey: request.headers.get('X-Mcp-Secret-WOOCOMMERCE-CONSUMER-KEY'),
        consumerSecret: request.headers.get('X-Mcp-Secret-WOOCOMMERCE-CONSUMER-SECRET'),
        storeUrl: request.headers.get('X-Mcp-Secret-WOOCOMMERCE-STORE-URL'),
    };
}

function buildAuthHeader(consumerKey: string, consumerSecret: string): string {
    const credentials = btoa(`${consumerKey}:${consumerSecret}`);
    return `Basic ${credentials}`;
}

// ── Typed fetch wrapper ───────────────────────────────────────────────────────

interface WcFetchOptions extends RequestInit {
    headers?: Record<string, string>;
}

interface WcFetchResult {
    data: unknown;
    headers: Headers;
}

async function wcFetch(
    storeUrl: string,
    path: string,
    authHeader: string,
    options: WcFetchOptions = {},
): Promise<WcFetchResult> {
    const url = `${wcApiBase(storeUrl)}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            ...(options.headers ?? {}),
        },
    });

    if (res.status === 204) {
        return { data: {}, headers: res.headers };
    }

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `WooCommerce HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object') {
            const d = data as { message?: string; code?: string };
            msg = d.message || msg;
        }
        throw { code: -32603, message: `WooCommerce API error ${res.status}: ${msg}` };
    }

    return { data, headers: res.headers };
}

async function wcGet(storeUrl: string, path: string, authHeader: string): Promise<WcFetchResult> {
    return wcFetch(storeUrl, path, authHeader);
}

async function wcPost(
    storeUrl: string,
    path: string,
    authHeader: string,
    body: unknown,
): Promise<WcFetchResult> {
    return wcFetch(storeUrl, path, authHeader, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

async function wcPut(
    storeUrl: string,
    path: string,
    authHeader: string,
    body: unknown,
): Promise<WcFetchResult> {
    return wcFetch(storeUrl, path, authHeader, {
        method: 'PUT',
        body: JSON.stringify(body),
    });
}

async function wcDelete(
    storeUrl: string,
    path: string,
    authHeader: string,
    force = false,
): Promise<WcFetchResult> {
    return wcFetch(storeUrl, path, authHeader, {
        method: 'DELETE',
        body: JSON.stringify({ force }),
    });
}

// Builds pagination query string fragment
function paginationParams(args: Record<string, unknown>): string {
    const parts: string[] = [];
    if (args.page !== undefined) parts.push(`page=${args.page}`);
    if (args.per_page !== undefined) parts.push(`per_page=${Math.min(Number(args.per_page), 100)}`);
    return parts.length > 0 ? `?${parts.join('&')}` : '';
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify WooCommerce credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    // ── Group 1 — Products (6 tools) ──────────────────────────────────────────

    {
        name: 'list_products',
        description:
            'List WooCommerce products. Filter by status, type, category, or search term. Supports pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    description: 'Filter by product status: publish, draft, private',
                },
                type: {
                    type: 'string',
                    description: 'Filter by product type: simple, variable, grouped, external',
                },
                category: {
                    type: 'string',
                    description: 'Filter by category ID (numeric string)',
                },
                search: {
                    type: 'string',
                    description: 'Search products by name or SKU',
                },
                per_page: {
                    type: 'number',
                    description: 'Number of results per page (max 100, default 10)',
                },
                page: {
                    type: 'number',
                    description: 'Page number (1-indexed, default 1)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_product',
        description:
            'Get a single WooCommerce product by ID. Returns name, slug, status, type, price, regular_price, sale_price, stock_status, stock_quantity, sku, images, categories, and tags.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Product ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_product',
        description:
            'Create a new WooCommerce product. Name is required. Optionally set type, price, description, categories, images, SKU, and stock management.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Product name (required)' },
                type: {
                    type: 'string',
                    description: 'Product type: simple, variable, grouped, external (default: simple)',
                },
                regular_price: { type: 'string', description: 'Regular price (e.g. "29.99")' },
                description: { type: 'string', description: 'Full product description (HTML allowed)' },
                short_description: {
                    type: 'string',
                    description: 'Short product description (HTML allowed)',
                },
                categories: {
                    type: 'array',
                    description: 'Array of category objects with id field (e.g. [{"id": 9}])',
                    items: { type: 'object' },
                },
                images: {
                    type: 'array',
                    description: 'Array of image objects with src field (e.g. [{"src": "https://..."}])',
                    items: { type: 'object' },
                },
                sku: { type: 'string', description: 'Unique SKU for this product' },
                manage_stock: {
                    type: 'boolean',
                    description: 'Whether to enable stock management for this product',
                },
                stock_quantity: {
                    type: 'number',
                    description: 'Stock quantity (only used if manage_stock is true)',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_product',
        description:
            'Update fields on an existing WooCommerce product. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'number', description: 'Product ID (required)' },
                name: { type: 'string', description: 'Product name' },
                regular_price: { type: 'string', description: 'Regular price (e.g. "29.99")' },
                sale_price: { type: 'string', description: 'Sale price (e.g. "19.99")' },
                stock_quantity: { type: 'number', description: 'Updated stock quantity' },
                status: {
                    type: 'string',
                    description: 'Product status: publish, draft, private',
                },
                description: { type: 'string', description: 'Full product description' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_product',
        description:
            'Delete a WooCommerce product. Use force=true to permanently delete; force=false moves to trash.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'number', description: 'Product ID (required)' },
                force: {
                    type: 'boolean',
                    description: 'true to permanently delete, false to trash (default: false)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_product_categories',
        description: 'List WooCommerce product categories. Filter by parent category or search term.',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: { type: 'number', description: 'Results per page (max 100, default 10)' },
                parent: {
                    type: 'number',
                    description: 'Parent category ID — 0 returns only top-level categories',
                },
                search: { type: 'string', description: 'Search categories by name' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Orders (6 tools) ────────────────────────────────────────────

    {
        name: 'list_orders',
        description:
            'List WooCommerce orders. Filter by status, date range, or customer. Supports pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    description:
                        'Order status: pending, processing, on-hold, completed, cancelled, refunded, failed',
                },
                after: {
                    type: 'string',
                    description: 'Return orders created after this date (ISO8601, e.g. 2026-01-01T00:00:00)',
                },
                before: {
                    type: 'string',
                    description: 'Return orders created before this date (ISO8601)',
                },
                customer: {
                    type: 'number',
                    description: 'Filter by customer ID',
                },
                per_page: { type: 'number', description: 'Results per page (max 100, default 10)' },
                page: { type: 'number', description: 'Page number (1-indexed, default 1)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_order',
        description:
            'Get a single WooCommerce order by ID. Returns status, customer, line_items, shipping, billing, total, and payment_method.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'number', description: 'Order ID (required)' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_order',
        description:
            'Create a new WooCommerce order with line items, billing/shipping address, and payment method.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    description: 'Order status (default: pending)',
                },
                currency: { type: 'string', description: 'Currency code (e.g. USD, EUR, GBP)' },
                billing: {
                    type: 'object',
                    description:
                        'Billing address: {first_name, last_name, email, address_1, city, state, postcode, country}',
                },
                shipping: {
                    type: 'object',
                    description:
                        'Shipping address: {first_name, last_name, address_1, city, state, postcode, country}',
                },
                line_items: {
                    type: 'array',
                    description:
                        'Array of line item objects: [{product_id, quantity, variation_id (optional)}]',
                    items: { type: 'object' },
                },
                payment_method: {
                    type: 'string',
                    description: 'Payment method ID (e.g. bacs, cheque, paypal)',
                },
                payment_method_title: {
                    type: 'string',
                    description: 'Human-readable payment method name',
                },
                customer_id: { type: 'number', description: 'Customer ID (0 for guest)' },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_order',
        description:
            'Update a WooCommerce order. Commonly used to change status or add a customer note.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'number', description: 'Order ID (required)' },
                status: {
                    type: 'string',
                    description:
                        'New order status: pending, processing, on-hold, completed, cancelled, refunded, failed',
                },
                customer_note: {
                    type: 'string',
                    description: 'Customer-facing note appended to the order',
                },
                shipping: {
                    type: 'object',
                    description: 'Updated shipping address fields',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_order',
        description:
            'Delete a WooCommerce order. Use force=true to permanently delete; force=false moves to trash.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'number', description: 'Order ID (required)' },
                force: {
                    type: 'boolean',
                    description: 'true to permanently delete, false to trash (default: false)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'create_refund',
        description:
            'Create a refund for a WooCommerce order. Specify the amount, reason, and optionally the line items to refund.',
        inputSchema: {
            type: 'object',
            properties: {
                order_id: { type: 'number', description: 'Order ID to refund (required)' },
                amount: { type: 'string', description: 'Refund amount (e.g. "15.00"). Required.' },
                reason: { type: 'string', description: 'Reason for the refund' },
                line_items: {
                    type: 'array',
                    description:
                        'Array of line item refund objects: [{id, quantity, refund_total}]',
                    items: { type: 'object' },
                },
            },
            required: ['order_id', 'amount'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 3 — Customers (4 tools) ─────────────────────────────────────────

    {
        name: 'list_customers',
        description:
            'List WooCommerce customers. Search by name/email, filter by role, or paginate.',
        inputSchema: {
            type: 'object',
            properties: {
                search: { type: 'string', description: 'Search customers by name or email' },
                email: { type: 'string', description: 'Filter by exact email address' },
                role: {
                    type: 'string',
                    description: 'Filter by user role: customer, subscriber (default: customer)',
                },
                per_page: { type: 'number', description: 'Results per page (max 100, default 10)' },
                page: { type: 'number', description: 'Page number (1-indexed, default 1)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_customer',
        description:
            'Get a single WooCommerce customer by ID. Returns first_name, last_name, email, orders_count, total_spent, billing, and shipping.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'number', description: 'Customer ID (required)' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_customer',
        description:
            'Create a new WooCommerce customer. Email is required. Optionally set name, username, password, and addresses.',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Customer email address (required)' },
                first_name: { type: 'string', description: 'Customer first name' },
                last_name: { type: 'string', description: 'Customer last name' },
                username: { type: 'string', description: 'WordPress username (auto-generated if omitted)' },
                password: { type: 'string', description: 'Account password' },
                billing: {
                    type: 'object',
                    description:
                        'Billing address: {first_name, last_name, email, address_1, city, state, postcode, country}',
                },
                shipping: {
                    type: 'object',
                    description: 'Shipping address: {first_name, last_name, address_1, city, state, postcode, country}',
                },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_customer',
        description:
            'Update a WooCommerce customer. Provide only the fields to change (name, billing address, shipping address).',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'number', description: 'Customer ID (required)' },
                first_name: { type: 'string', description: 'Updated first name' },
                last_name: { type: 'string', description: 'Updated last name' },
                billing: { type: 'object', description: 'Updated billing address fields' },
                shipping: { type: 'object', description: 'Updated shipping address fields' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Coupons & Store (4 tools) ───────────────────────────────────

    {
        name: 'list_coupons',
        description: 'List WooCommerce coupons. Optionally search by code.',
        inputSchema: {
            type: 'object',
            properties: {
                search: { type: 'string', description: 'Search coupons by code or description' },
                per_page: { type: 'number', description: 'Results per page (max 100, default 10)' },
                page: { type: 'number', description: 'Page number (1-indexed, default 1)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_coupon',
        description:
            'Create a WooCommerce coupon. Code and discount_type are required. Supports percent, fixed_cart, and fixed_product discounts.',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'Coupon code (required, e.g. SAVE20)' },
                discount_type: {
                    type: 'string',
                    description: 'Discount type: percent, fixed_cart, fixed_product (required)',
                },
                amount: {
                    type: 'string',
                    description: 'Discount amount (e.g. "20" for 20% off or $20 off)',
                },
                usage_limit: {
                    type: 'number',
                    description: 'Maximum number of times the coupon can be used',
                },
                expiry_date: {
                    type: 'string',
                    description: 'Coupon expiry date in YYYY-MM-DD format',
                },
                minimum_amount: {
                    type: 'string',
                    description: 'Minimum order amount required to use the coupon',
                },
                product_ids: {
                    type: 'array',
                    description: 'Array of product IDs the coupon applies to (empty = all products)',
                    items: { type: 'number' },
                },
            },
            required: ['code', 'discount_type'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_store_settings',
        description:
            'Get WooCommerce store general settings including currency, price format, weight unit, and store address.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_shipping_zones',
        description: 'List all WooCommerce shipping zones with their configured shipping methods.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 5 — Reports (2 tools) ───────────────────────────────────────────

    {
        name: 'get_sales_report',
        description:
            'Get a WooCommerce sales report for a date range or predefined period. Returns totals for sales, orders, items, refunds, discount, and shipping.',
        inputSchema: {
            type: 'object',
            properties: {
                period: {
                    type: 'string',
                    description: 'Predefined period: week, month, last_month, year (used if date_min/date_max not set)',
                },
                date_min: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format',
                },
                date_max: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_order_statuses',
        description:
            'Get all possible WooCommerce order statuses (including custom ones registered by plugins).',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    storeUrl: string,
    authHeader: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            validateStoreUrl(storeUrl);
            await wcFetch(storeUrl, '/system_status', authHeader);
            return toolOk({ connected: true });
        }
        // ── Products ────────────────────────────────────────────────────────────

        case 'list_products': {
            const params: string[] = [];
            if (args.status) params.push(`status=${encodeURIComponent(String(args.status))}`);
            if (args.type) params.push(`type=${encodeURIComponent(String(args.type))}`);
            if (args.category) params.push(`category=${encodeURIComponent(String(args.category))}`);
            if (args.search) params.push(`search=${encodeURIComponent(String(args.search))}`);
            if (args.per_page) params.push(`per_page=${Math.min(Number(args.per_page), 100)}`);
            if (args.page) params.push(`page=${Number(args.page)}`);
            const qs = params.length > 0 ? `?${params.join('&')}` : '';
            const { data, headers } = await wcGet(storeUrl, `/products${qs}`, authHeader);
            return {
                products: data,
                total: headers.get('X-WP-Total'),
                total_pages: headers.get('X-WP-TotalPages'),
            };
        }

        case 'get_product': {
            validateRequired(args, ['id']);
            const { data } = await wcGet(storeUrl, `/products/${args.id}`, authHeader);
            return data;
        }

        case 'create_product': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = {};
            for (const key of [
                'name', 'type', 'regular_price', 'description', 'short_description',
                'categories', 'images', 'sku', 'manage_stock', 'stock_quantity',
            ]) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            const { data } = await wcPost(storeUrl, '/products', authHeader, body);
            return data;
        }

        case 'update_product': {
            validateRequired(args, ['id']);
            const { id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['name', 'regular_price', 'sale_price', 'stock_quantity', 'status', 'description']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            const { data } = await wcPut(storeUrl, `/products/${id}`, authHeader, body);
            return data;
        }

        case 'delete_product': {
            validateRequired(args, ['id']);
            const { data } = await wcDelete(storeUrl, `/products/${args.id}`, authHeader, Boolean(args.force));
            return data;
        }

        case 'list_product_categories': {
            const params: string[] = [];
            if (args.per_page) params.push(`per_page=${Math.min(Number(args.per_page), 100)}`);
            if (args.parent !== undefined) params.push(`parent=${Number(args.parent)}`);
            if (args.search) params.push(`search=${encodeURIComponent(String(args.search))}`);
            const qs = params.length > 0 ? `?${params.join('&')}` : '';
            const { data, headers } = await wcGet(storeUrl, `/products/categories${qs}`, authHeader);
            return {
                categories: data,
                total: headers.get('X-WP-Total'),
                total_pages: headers.get('X-WP-TotalPages'),
            };
        }

        // ── Orders ──────────────────────────────────────────────────────────────

        case 'list_orders': {
            const params: string[] = [];
            if (args.status) params.push(`status=${encodeURIComponent(String(args.status))}`);
            if (args.after) params.push(`after=${encodeURIComponent(String(args.after))}`);
            if (args.before) params.push(`before=${encodeURIComponent(String(args.before))}`);
            if (args.customer) params.push(`customer=${Number(args.customer)}`);
            if (args.per_page) params.push(`per_page=${Math.min(Number(args.per_page), 100)}`);
            if (args.page) params.push(`page=${Number(args.page)}`);
            const qs = params.length > 0 ? `?${params.join('&')}` : '';
            const { data, headers } = await wcGet(storeUrl, `/orders${qs}`, authHeader);
            return {
                orders: data,
                total: headers.get('X-WP-Total'),
                total_pages: headers.get('X-WP-TotalPages'),
            };
        }

        case 'get_order': {
            validateRequired(args, ['id']);
            const { data } = await wcGet(storeUrl, `/orders/${args.id}`, authHeader);
            return data;
        }

        case 'create_order': {
            const body: Record<string, unknown> = {};
            for (const key of [
                'status', 'currency', 'billing', 'shipping', 'line_items',
                'payment_method', 'payment_method_title', 'customer_id',
            ]) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            const { data } = await wcPost(storeUrl, '/orders', authHeader, body);
            return data;
        }

        case 'update_order': {
            validateRequired(args, ['id']);
            const { id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['status', 'customer_note', 'shipping']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            const { data } = await wcPut(storeUrl, `/orders/${id}`, authHeader, body);
            return data;
        }

        case 'delete_order': {
            validateRequired(args, ['id']);
            const { data } = await wcDelete(storeUrl, `/orders/${args.id}`, authHeader, Boolean(args.force));
            return data;
        }

        case 'create_refund': {
            validateRequired(args, ['order_id', 'amount']);
            const body: Record<string, unknown> = {
                amount: args.amount,
            };
            if (args.reason !== undefined) body.reason = args.reason;
            if (args.line_items !== undefined) body.line_items = args.line_items;
            const { data } = await wcPost(storeUrl, `/orders/${args.order_id}/refunds`, authHeader, body);
            return data;
        }

        // ── Customers ───────────────────────────────────────────────────────────

        case 'list_customers': {
            const params: string[] = [];
            if (args.search) params.push(`search=${encodeURIComponent(String(args.search))}`);
            if (args.email) params.push(`email=${encodeURIComponent(String(args.email))}`);
            if (args.role) params.push(`role=${encodeURIComponent(String(args.role))}`);
            if (args.per_page) params.push(`per_page=${Math.min(Number(args.per_page), 100)}`);
            if (args.page) params.push(`page=${Number(args.page)}`);
            const qs = params.length > 0 ? `?${params.join('&')}` : '';
            const { data, headers } = await wcGet(storeUrl, `/customers${qs}`, authHeader);
            return {
                customers: data,
                total: headers.get('X-WP-Total'),
                total_pages: headers.get('X-WP-TotalPages'),
            };
        }

        case 'get_customer': {
            validateRequired(args, ['id']);
            const { data } = await wcGet(storeUrl, `/customers/${args.id}`, authHeader);
            return data;
        }

        case 'create_customer': {
            validateRequired(args, ['email']);
            const body: Record<string, unknown> = {};
            for (const key of ['email', 'first_name', 'last_name', 'username', 'password', 'billing', 'shipping']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            const { data } = await wcPost(storeUrl, '/customers', authHeader, body);
            return data;
        }

        case 'update_customer': {
            validateRequired(args, ['id']);
            const { id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['first_name', 'last_name', 'billing', 'shipping']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            const { data } = await wcPut(storeUrl, `/customers/${id}`, authHeader, body);
            return data;
        }

        // ── Coupons & Store ─────────────────────────────────────────────────────

        case 'list_coupons': {
            const params: string[] = [];
            if (args.search) params.push(`search=${encodeURIComponent(String(args.search))}`);
            if (args.per_page) params.push(`per_page=${Math.min(Number(args.per_page), 100)}`);
            if (args.page) params.push(`page=${Number(args.page)}`);
            const qs = params.length > 0 ? `?${params.join('&')}` : '';
            const { data, headers } = await wcGet(storeUrl, `/coupons${qs}`, authHeader);
            return {
                coupons: data,
                total: headers.get('X-WP-Total'),
                total_pages: headers.get('X-WP-TotalPages'),
            };
        }

        case 'create_coupon': {
            validateRequired(args, ['code', 'discount_type']);
            const body: Record<string, unknown> = {};
            for (const key of [
                'code', 'discount_type', 'amount', 'usage_limit',
                'expiry_date', 'minimum_amount', 'product_ids',
            ]) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            const { data } = await wcPost(storeUrl, '/coupons', authHeader, body);
            return data;
        }

        case 'get_store_settings': {
            const { data } = await wcGet(storeUrl, '/settings/general', authHeader);
            return data;
        }

        case 'list_shipping_zones': {
            const { data: zones } = await wcGet(storeUrl, '/shipping/zones', authHeader);
            // Fetch methods for each zone in parallel
            const zonesArr = zones as Array<{ id: number; name: string }>;
            const zonesWithMethods = await Promise.all(
                zonesArr.map(async (zone) => {
                    try {
                        const { data: methods } = await wcGet(
                            storeUrl,
                            `/shipping/zones/${zone.id}/methods`,
                            authHeader,
                        );
                        return { ...zone, methods };
                    } catch {
                        return { ...zone, methods: [] };
                    }
                }),
            );
            return zonesWithMethods;
        }

        // ── Reports ─────────────────────────────────────────────────────────────

        case 'get_sales_report': {
            const params: string[] = [];
            if (args.period) params.push(`period=${encodeURIComponent(String(args.period))}`);
            if (args.date_min) params.push(`date_min=${encodeURIComponent(String(args.date_min))}`);
            if (args.date_max) params.push(`date_max=${encodeURIComponent(String(args.date_max))}`);
            const qs = params.length > 0 ? `?${params.join('&')}` : '';
            const { data } = await wcGet(storeUrl, `/reports/sales${qs}`, authHeader);
            return data;
        }

        case 'list_order_statuses': {
            const { data } = await wcGet(storeUrl, '/reports/orders/totals', authHeader);
            return data;
        }

        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check / _ping
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-woocommerce', tools: TOOLS.length }),
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

        // ── MCP protocol methods ──────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-woocommerce', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            // Validate secrets
            const { consumerKey, consumerSecret, storeUrl } = getSecrets(request);
            const missing: string[] = [];
            if (!consumerKey)
                missing.push('WOOCOMMERCE_CONSUMER_KEY (header: X-Mcp-Secret-WOOCOMMERCE-CONSUMER-KEY)');
            if (!consumerSecret)
                missing.push(
                    'WOOCOMMERCE_CONSUMER_SECRET (header: X-Mcp-Secret-WOOCOMMERCE-CONSUMER-SECRET)',
                );
            if (!storeUrl)
                missing.push('WOOCOMMERCE_STORE_URL (header: X-Mcp-Secret-WOOCOMMERCE-STORE-URL)');
            if (missing.length > 0) {
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            // SSRF validation — must happen before ANY fetch
            try {
                validateStoreUrl(storeUrl!);
            } catch (err: unknown) {
                if (err && typeof err === 'object' && 'code' in err) {
                    const e = err as { code: number; message: string };
                    return rpcErr(id, e.code, e.message);
                }
                return rpcErr(id, -32600, 'Invalid store URL');
            }

            const authHeader = buildAuthHeader(consumerKey!, consumerSecret!);

            try {
                const result = await callTool(toolName, args, storeUrl!, authHeader);
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
