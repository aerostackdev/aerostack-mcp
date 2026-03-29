import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.stubGlobal('btoa', (s: string) => Buffer.from(s).toString('base64'));

// ── Constants ─────────────────────────────────────────────────────────────────

const CONSUMER_KEY = 'ck_test_abc123456789';
const CONSUMER_SECRET = 'cs_test_xyz987654321';
const STORE_URL = 'https://mystore.example.com';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockProduct = {
    id: 1,
    name: 'Test T-Shirt',
    slug: 'test-t-shirt',
    status: 'publish',
    type: 'simple',
    regular_price: '29.99',
    sale_price: '',
    price: '29.99',
    sku: 'TSH-001',
    stock_status: 'instock',
    stock_quantity: 50,
    categories: [{ id: 9, name: 'Clothing' }],
    images: [{ id: 1, src: 'https://mystore.example.com/wp-content/uploads/shirt.jpg' }],
    tags: [],
};

const mockOrder = {
    id: 100,
    status: 'processing',
    currency: 'USD',
    total: '59.99',
    payment_method: 'paypal',
    billing: {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        address_1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postcode: '10001',
        country: 'US',
    },
    shipping: {
        first_name: 'John',
        last_name: 'Doe',
        address_1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postcode: '10001',
        country: 'US',
    },
    line_items: [{ product_id: 1, quantity: 2, total: '59.98' }],
};

const mockCustomer = {
    id: 5,
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Smith',
    username: 'janesmith',
    orders_count: 3,
    total_spent: '149.97',
    billing: {
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        address_1: '456 Oak Ave',
        city: 'Chicago',
        state: 'IL',
        postcode: '60601',
        country: 'US',
    },
    shipping: {},
};

const mockCoupon = {
    id: 10,
    code: 'SAVE20',
    discount_type: 'percent',
    amount: '20',
    usage_limit: 100,
    expiry_date: '2026-12-31',
};

const mockCategory = {
    id: 9,
    name: 'Clothing',
    slug: 'clothing',
    parent: 0,
    count: 15,
};

const mockShippingZone = {
    id: 1,
    name: 'US Domestic',
    order: 0,
};

const mockShippingMethod = {
    id: 1,
    title: 'Flat Rate',
    method_id: 'flat_rate',
    enabled: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function wcOk(data: unknown, extra: Record<string, string> = {}, status = 200) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-WP-Total': '10',
        'X-WP-TotalPages': '1',
        ...extra,
    };
    return Promise.resolve(new Response(JSON.stringify(data), { status, headers }));
}

function wcOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function wcErr(message: string, code = 'woocommerce_rest_error', status = 400) {
    return Promise.resolve(
        new Response(JSON.stringify({ code, message }), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
    storeUrlOverride?: string,
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('consumerKey')) {
        headers['X-Mcp-Secret-WOOCOMMERCE-CONSUMER-KEY'] = CONSUMER_KEY;
    }
    if (!missingSecrets.includes('consumerSecret')) {
        headers['X-Mcp-Secret-WOOCOMMERCE-CONSUMER-SECRET'] = CONSUMER_SECRET;
    }
    if (!missingSecrets.includes('storeUrl')) {
        headers['X-Mcp-Secret-WOOCOMMERCE-STORE-URL'] = storeUrlOverride ?? STORE_URL;
    }
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
    storeUrlOverride?: string,
) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingSecrets, storeUrlOverride);
}

async function callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
    storeUrlOverride?: string,
) {
    const req = makeToolReq(toolName, args, missingSecrets, storeUrlOverride);
    const res = await worker.fetch(req);
    return res.json() as Promise<{
        jsonrpc: string;
        id: number;
        result?: { content: [{ type: string; text: string }] };
        error?: { code: number; message: string };
    }>;
}

async function getToolResult(
    toolName: string,
    args: Record<string, unknown> = {},
    storeUrlOverride?: string,
) {
    const body = await callTool(toolName, args, [], storeUrlOverride);
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    return JSON.parse(body.result!.content[0].text);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-woocommerce and tools 22', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-woocommerce');
        expect(body.tools).toBe(22);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(
            new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'not json{{{',
            }),
        );
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { protocolVersion: string; serverInfo: { name: string } };
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-woocommerce');
    });

    it('tools/list returns exactly 22 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
        };
        expect(body.result.tools).toHaveLength(22);
        for (const tool of body.result.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
        }
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq('unknown/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing consumerKey returns -32001 with WOOCOMMERCE_CONSUMER_KEY in message', async () => {
        const body = await callTool('list_products', {}, ['consumerKey']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('WOOCOMMERCE_CONSUMER_KEY');
    });

    it('missing consumerSecret returns -32001 with WOOCOMMERCE_CONSUMER_SECRET in message', async () => {
        const body = await callTool('list_products', {}, ['consumerSecret']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('WOOCOMMERCE_CONSUMER_SECRET');
    });

    it('missing storeUrl returns -32001 with WOOCOMMERCE_STORE_URL in message', async () => {
        const body = await callTool('list_products', {}, ['storeUrl']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('WOOCOMMERCE_STORE_URL');
    });

    it('missing all secrets returns -32001', async () => {
        const body = await callTool('list_products', {}, ['consumerKey', 'consumerSecret', 'storeUrl']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('Authorization header uses Basic format with base64 credentials', async () => {
        mockFetch.mockReturnValueOnce(wcOk([]));
        await callTool('list_products', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        const expected = `Basic ${Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64')}`;
        expect(headers['Authorization']).toBe(expected);
    });
});

// ── SSRF Protection ───────────────────────────────────────────────────────────

describe('SSRF Protection', () => {
    it('rejects http:// store URL with -32600', async () => {
        const body = await callTool('list_products', {}, [], 'http://mystore.example.com');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32600);
        expect(body.error!.message).toContain('https://');
    });

    it('rejects localhost store URL with -32600', async () => {
        const body = await callTool('list_products', {}, [], 'https://localhost/shop');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32600);
        expect(body.error!.message).toContain('private/local');
    });

    it('rejects 127.x.x.x IP with -32600', async () => {
        const body = await callTool('list_products', {}, [], 'https://127.0.0.1');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32600);
    });

    it('rejects 10.x.x.x private IP with -32600', async () => {
        const body = await callTool('list_products', {}, [], 'https://10.0.0.1/woocommerce');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32600);
    });

    it('rejects 192.168.x.x private IP with -32600', async () => {
        const body = await callTool('list_products', {}, [], 'https://192.168.1.10');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32600);
    });

    it('rejects 172.16.x.x private IP with -32600', async () => {
        const body = await callTool('list_products', {}, [], 'https://172.16.0.1');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32600);
    });

    it('allows valid https:// store URL', async () => {
        mockFetch.mockReturnValueOnce(wcOk([]));
        const body = await callTool('list_products', {});
        // No SSRF error — either succeeds or fails for a different reason
        if (body.error) {
            expect(body.error.code).not.toBe(-32600);
        }
    });
});

// ── Products ──────────────────────────────────────────────────────────────────

describe('list_products', () => {
    it('returns products array with pagination metadata', async () => {
        mockFetch.mockReturnValueOnce(wcOk([mockProduct], { 'X-WP-Total': '25', 'X-WP-TotalPages': '3' }));
        const result = await getToolResult('list_products', { per_page: 10, page: 1 });
        expect(Array.isArray(result.products)).toBe(true);
        expect(result.total).toBe('25');
        expect(result.total_pages).toBe('3');
    });

    it('builds correct URL with status and search filters', async () => {
        mockFetch.mockReturnValueOnce(wcOk([]));
        await callTool('list_products', { status: 'publish', search: 'shirt', per_page: 5 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/wp-json/wc/v3/products');
        expect(url).toContain('status=publish');
        expect(url).toContain('search=shirt');
        expect(url).toContain('per_page=5');
    });

    it('caps per_page at 100', async () => {
        mockFetch.mockReturnValueOnce(wcOk([]));
        await callTool('list_products', { per_page: 999 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('per_page=100');
    });

    it('builds correct URL with type and category filters', async () => {
        mockFetch.mockReturnValueOnce(wcOk([]));
        await callTool('list_products', { type: 'variable', category: '9' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('type=variable');
        expect(url).toContain('category=9');
    });
});

describe('get_product', () => {
    it('returns product object', async () => {
        mockFetch.mockReturnValueOnce(wcOk(mockProduct));
        const result = await getToolResult('get_product', { id: 1 });
        expect(result.id).toBe(1);
        expect(result.name).toBe('Test T-Shirt');
        expect(result.sku).toBe('TSH-001');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_product', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });

    it('sends GET to /products/{id}', async () => {
        mockFetch.mockReturnValueOnce(wcOk(mockProduct));
        await callTool('get_product', { id: 42 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/products/42');
    });
});

describe('create_product', () => {
    it('returns created product', async () => {
        mockFetch.mockReturnValueOnce(wcOk({ ...mockProduct, id: 2, name: 'New Hoodie' }));
        const result = await getToolResult('create_product', {
            name: 'New Hoodie',
            regular_price: '49.99',
            sku: 'HOO-001',
        });
        expect(result.id).toBe(2);
        expect(result.name).toBe('New Hoodie');
    });

    it('sends POST to /products', async () => {
        mockFetch.mockReturnValueOnce(wcOk({ id: 3, name: 'Cap' }));
        await callTool('create_product', { name: 'Cap', type: 'simple', regular_price: '19.99' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/products');
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.name).toBe('Cap');
        expect(body.regular_price).toBe('19.99');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_product', { regular_price: '9.99' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('update_product', () => {
    it('sends PUT to /products/{id} with changed fields', async () => {
        mockFetch.mockReturnValueOnce(wcOk({ ...mockProduct, sale_price: '19.99' }));
        await callTool('update_product', { id: 1, sale_price: '19.99' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/products/1');
        expect(call[1].method).toBe('PUT');
        const body = JSON.parse(call[1].body as string);
        expect(body.sale_price).toBe('19.99');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('update_product', { regular_price: '9.99' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('delete_product', () => {
    it('sends DELETE to /products/{id} with force=true', async () => {
        mockFetch.mockReturnValueOnce(wcOk(mockProduct));
        await callTool('delete_product', { id: 1, force: true });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/products/1');
        expect(call[1].method).toBe('DELETE');
        const body = JSON.parse(call[1].body as string);
        expect(body.force).toBe(true);
    });

    it('sends DELETE with force=false (trash) by default', async () => {
        mockFetch.mockReturnValueOnce(wcOk(mockProduct));
        await callTool('delete_product', { id: 1 });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string);
        expect(body.force).toBe(false);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('delete_product', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('list_product_categories', () => {
    it('returns categories with pagination metadata', async () => {
        mockFetch.mockReturnValueOnce(wcOk([mockCategory]));
        const result = await getToolResult('list_product_categories', {});
        expect(Array.isArray(result.categories)).toBe(true);
        expect(result.categories[0].name).toBe('Clothing');
    });

    it('filters by parent category', async () => {
        mockFetch.mockReturnValueOnce(wcOk([]));
        await callTool('list_product_categories', { parent: 0 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('parent=0');
    });
});

// ── Orders ────────────────────────────────────────────────────────────────────

describe('list_orders', () => {
    it('returns orders with pagination metadata', async () => {
        mockFetch.mockReturnValueOnce(wcOk([mockOrder], { 'X-WP-Total': '50', 'X-WP-TotalPages': '5' }));
        const result = await getToolResult('list_orders', { per_page: 10 });
        expect(Array.isArray(result.orders)).toBe(true);
        expect(result.total).toBe('50');
    });

    it('filters by status and date range', async () => {
        mockFetch.mockReturnValueOnce(wcOk([]));
        await callTool('list_orders', { status: 'processing', after: '2026-01-01T00:00:00' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=processing');
        expect(url).toContain('after=');
    });

    it('filters by customer id', async () => {
        mockFetch.mockReturnValueOnce(wcOk([]));
        await callTool('list_orders', { customer: 5 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('customer=5');
    });
});

describe('get_order', () => {
    it('returns order object', async () => {
        mockFetch.mockReturnValueOnce(wcOk(mockOrder));
        const result = await getToolResult('get_order', { id: 100 });
        expect(result.id).toBe(100);
        expect(result.status).toBe('processing');
        expect(result.total).toBe('59.99');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_order', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_order', () => {
    it('sends POST to /orders with line items and billing', async () => {
        mockFetch.mockReturnValueOnce(wcOk({ ...mockOrder, id: 101 }));
        await callTool('create_order', {
            status: 'pending',
            billing: mockOrder.billing,
            line_items: [{ product_id: 1, quantity: 1 }],
            payment_method: 'paypal',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/orders');
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.payment_method).toBe('paypal');
        expect(body.line_items).toHaveLength(1);
    });
});

describe('update_order', () => {
    it('sends PUT to /orders/{id} with new status', async () => {
        mockFetch.mockReturnValueOnce(wcOk({ ...mockOrder, status: 'completed' }));
        await callTool('update_order', { id: 100, status: 'completed' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/orders/100');
        expect(call[1].method).toBe('PUT');
        const body = JSON.parse(call[1].body as string);
        expect(body.status).toBe('completed');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('update_order', { status: 'completed' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('delete_order', () => {
    it('sends DELETE to /orders/{id}', async () => {
        mockFetch.mockReturnValueOnce(wcOk(mockOrder));
        await callTool('delete_order', { id: 100, force: true });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/orders/100');
        expect(call[1].method).toBe('DELETE');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('delete_order', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_refund', () => {
    it('sends POST to /orders/{order_id}/refunds', async () => {
        mockFetch.mockReturnValueOnce(wcOk({ id: 1, amount: '15.00', reason: 'Damaged item' }));
        await callTool('create_refund', { order_id: 100, amount: '15.00', reason: 'Damaged item' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/orders/100/refunds');
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.amount).toBe('15.00');
        expect(body.reason).toBe('Damaged item');
    });

    it('missing order_id returns validation error', async () => {
        const body = await callTool('create_refund', { amount: '10.00' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('order_id');
    });

    it('missing amount returns validation error', async () => {
        const body = await callTool('create_refund', { order_id: 100 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('amount');
    });
});

// ── Customers ─────────────────────────────────────────────────────────────────

describe('list_customers', () => {
    it('returns customers with pagination metadata', async () => {
        mockFetch.mockReturnValueOnce(wcOk([mockCustomer], { 'X-WP-Total': '20' }));
        const result = await getToolResult('list_customers', { per_page: 10 });
        expect(Array.isArray(result.customers)).toBe(true);
        expect(result.total).toBe('20');
    });

    it('filters by search and email', async () => {
        mockFetch.mockReturnValueOnce(wcOk([]));
        await callTool('list_customers', { search: 'Jane', email: 'jane@example.com' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('search=Jane');
        expect(url).toContain('email=');
    });

    it('filters by role', async () => {
        mockFetch.mockReturnValueOnce(wcOk([]));
        await callTool('list_customers', { role: 'subscriber' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('role=subscriber');
    });
});

describe('get_customer', () => {
    it('returns customer object', async () => {
        mockFetch.mockReturnValueOnce(wcOk(mockCustomer));
        const result = await getToolResult('get_customer', { id: 5 });
        expect(result.id).toBe(5);
        expect(result.email).toBe('jane@example.com');
        expect(result.orders_count).toBe(3);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_customer', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_customer', () => {
    it('sends POST to /customers with email', async () => {
        mockFetch.mockReturnValueOnce(wcOk({ ...mockCustomer, id: 6 }));
        await callTool('create_customer', {
            email: 'new@example.com',
            first_name: 'New',
            last_name: 'User',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/customers');
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.email).toBe('new@example.com');
        expect(body.first_name).toBe('New');
    });

    it('missing email returns validation error', async () => {
        const body = await callTool('create_customer', { first_name: 'Jane' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('email');
    });
});

describe('update_customer', () => {
    it('sends PUT to /customers/{id} with updated fields', async () => {
        mockFetch.mockReturnValueOnce(wcOk({ ...mockCustomer, first_name: 'Janet' }));
        await callTool('update_customer', { id: 5, first_name: 'Janet' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/customers/5');
        expect(call[1].method).toBe('PUT');
        const body = JSON.parse(call[1].body as string);
        expect(body.first_name).toBe('Janet');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('update_customer', { first_name: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Coupons & Store ───────────────────────────────────────────────────────────

describe('list_coupons', () => {
    it('returns coupons with pagination metadata', async () => {
        mockFetch.mockReturnValueOnce(wcOk([mockCoupon]));
        const result = await getToolResult('list_coupons', {});
        expect(Array.isArray(result.coupons)).toBe(true);
        expect(result.coupons[0].code).toBe('SAVE20');
    });

    it('filters by search term', async () => {
        mockFetch.mockReturnValueOnce(wcOk([]));
        await callTool('list_coupons', { search: 'SAVE' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('search=SAVE');
    });
});

describe('create_coupon', () => {
    it('sends POST to /coupons with code and discount_type', async () => {
        mockFetch.mockReturnValueOnce(wcOk({ ...mockCoupon, id: 11 }));
        await callTool('create_coupon', {
            code: 'SUMMER10',
            discount_type: 'percent',
            amount: '10',
            usage_limit: 50,
        });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/coupons');
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.code).toBe('SUMMER10');
        expect(body.discount_type).toBe('percent');
        expect(body.amount).toBe('10');
    });

    it('missing code returns validation error', async () => {
        const body = await callTool('create_coupon', { discount_type: 'percent' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('code');
    });

    it('missing discount_type returns validation error', async () => {
        const body = await callTool('create_coupon', { code: 'TEST' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('discount_type');
    });
});

describe('get_store_settings', () => {
    it('sends GET to /settings/general', async () => {
        mockFetch.mockReturnValueOnce(wcOk([{ id: 'woocommerce_currency', value: 'USD' }]));
        const result = await getToolResult('get_store_settings', {});
        expect(Array.isArray(result)).toBe(true);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/settings/general');
    });
});

describe('list_shipping_zones', () => {
    it('fetches zones then their methods', async () => {
        mockFetch
            .mockReturnValueOnce(wcOk([mockShippingZone]))
            .mockReturnValueOnce(wcOk([mockShippingMethod]));
        const result = await getToolResult('list_shipping_zones', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].name).toBe('US Domestic');
        expect(result[0].methods).toHaveLength(1);
        expect(result[0].methods[0].title).toBe('Flat Rate');
    });

    it('returns zones with empty methods array on method fetch error', async () => {
        mockFetch
            .mockReturnValueOnce(wcOk([mockShippingZone]))
            .mockReturnValueOnce(wcErr('Not found', 'error', 404));
        const result = await getToolResult('list_shipping_zones', {});
        expect(result[0].methods).toEqual([]);
    });
});

// ── Reports ───────────────────────────────────────────────────────────────────

describe('get_sales_report', () => {
    const mockReport = [{
        total_sales: '1500.00',
        net_sales: '1400.00',
        average_sales: '150.00',
        total_orders: 10,
        total_items: 25,
        total_tax: '100.00',
        total_shipping: '50.00',
        total_refunds: '0.00',
        total_discount: '0.00',
        totals_grouped_by: 'day',
        totals: {},
    }];

    it('fetches sales report with period filter', async () => {
        mockFetch.mockReturnValueOnce(wcOk(mockReport));
        const result = await getToolResult('get_sales_report', { period: 'month' });
        expect(Array.isArray(result)).toBe(true);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/reports/sales');
        expect(url).toContain('period=month');
    });

    it('fetches sales report with date_min and date_max', async () => {
        mockFetch.mockReturnValueOnce(wcOk(mockReport));
        await callTool('get_sales_report', { date_min: '2026-01-01', date_max: '2026-01-31' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('date_min=2026-01-01');
        expect(url).toContain('date_max=2026-01-31');
    });
});

describe('list_order_statuses', () => {
    it('fetches order status totals from /reports/orders/totals', async () => {
        mockFetch.mockReturnValueOnce(
            wcOk([
                { slug: 'pending', name: 'Pending payment', total: 2 },
                { slug: 'processing', name: 'Processing', total: 8 },
                { slug: 'completed', name: 'Completed', total: 45 },
            ]),
        );
        const result = await getToolResult('list_order_statuses', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].slug).toBe('pending');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/reports/orders/totals');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('WooCommerce API error propagates with -32603 code', async () => {
        mockFetch.mockReturnValueOnce(wcErr('Invalid parameter: status', 'woocommerce_rest_invalid_param', 400));
        const body = await callTool('list_products', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('400');
    });

    it('unknown tool name returns -32601', async () => {
        mockFetch.mockReturnValueOnce(wcOk({}));
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
        expect(body.error!.message).toContain('nonexistent_tool');
    });

    it('URL is built correctly from store URL without trailing slash', async () => {
        mockFetch.mockReturnValueOnce(wcOk(mockProduct));
        await callTool('get_product', { id: 1 });
        const url = mockFetch.mock.calls[0][0] as string;
        // Should not have double slash
        expect(url).not.toContain('//wp-json');
        expect(url).toContain('mystore.example.com/wp-json/wc/v3/products/1');
    });

    it('URL is built correctly from store URL with trailing slash', async () => {
        const body = await callTool(
            'get_product',
            { id: 1 },
            [],
            'https://mystore.example.com/',
        );
        if (!body.error) {
            // If it somehow resolves, check URL
            const url = mockFetch.mock.calls[0]?.[0] as string | undefined;
            if (url) expect(url).not.toContain('//wp-json');
        } else {
            // SSRF validation passed, error is from fetch
            expect(body.error.code).not.toBe(-32600);
        }
    });
});
