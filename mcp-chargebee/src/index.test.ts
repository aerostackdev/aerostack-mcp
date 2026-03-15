import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ message, error_code: 'some_error' }), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://mcp-chargebee.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function withSecrets(extra: Record<string, string> = {}) {
    return {
        'X-Mcp-Secret-CHARGEBEE-SITE': 'my-company',
        'X-Mcp-Secret-CHARGEBEE-API-KEY': 'test_api_key_abc123',
        ...extra,
    };
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(makeRequest(body, headers ?? withSecrets()));
    return res.json() as Promise<any>;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockCustomersList = {
    list: [
        {
            customer: {
                id: 'cus_001',
                first_name: 'Alice',
                last_name: 'Smith',
                email: 'alice@example.com',
                created_at: 1700000000,
                deleted: false,
            },
        },
        {
            customer: {
                id: 'cus_002',
                first_name: 'Bob',
                last_name: 'Jones',
                email: 'bob@example.com',
                created_at: 1700001000,
                deleted: false,
            },
        },
    ],
};

const mockCustomer = {
    customer: {
        id: 'cus_001',
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice@example.com',
        created_at: 1700000000,
        deleted: false,
    },
};

const mockCreatedCustomer = {
    customer: {
        id: 'cus_new',
        first_name: 'Carol',
        last_name: 'White',
        email: 'carol@example.com',
        company: 'ACME',
        created_at: 1700002000,
    },
};

const mockSubscriptionsList = {
    list: [
        {
            subscription: {
                id: 'sub_001',
                plan_id: 'pro-monthly',
                status: 'active',
                current_term_start: 1700000000,
                current_term_end: 1702678400,
                customer_id: 'cus_001',
            },
        },
    ],
};

const mockSubscription = {
    subscription: {
        id: 'sub_001',
        plan_id: 'pro-monthly',
        status: 'active',
        current_term_start: 1700000000,
        current_term_end: 1702678400,
        customer_id: 'cus_001',
    },
};

const mockCreatedSubscription = {
    subscription: {
        id: 'sub_new',
        plan_id: 'starter-monthly',
        status: 'active',
        customer_id: 'cus_001',
    },
};

const mockCancelledSubscription = {
    subscription: {
        id: 'sub_001',
        plan_id: 'pro-monthly',
        status: 'cancelled',
        customer_id: 'cus_001',
    },
};

const mockReactivatedSubscription = {
    subscription: {
        id: 'sub_001',
        plan_id: 'pro-monthly',
        status: 'active',
        customer_id: 'cus_001',
    },
};

const mockInvoicesList = {
    list: [
        {
            invoice: {
                id: 'inv_001',
                customer_id: 'cus_001',
                status: 'paid',
                amount_due: 0,
                amount_paid: 2900,
                date: 1700000000,
                due_date: 1700000000,
            },
        },
    ],
};

const mockPlansList = {
    list: [
        {
            plan: {
                id: 'pro-monthly',
                name: 'Pro Monthly',
                price: 2900,
                period: 1,
                period_unit: 'month',
                currency_code: 'USD',
                status: 'active',
            },
        },
        {
            plan: {
                id: 'starter-monthly',
                name: 'Starter Monthly',
                price: 900,
                period: 1,
                period_unit: 'month',
                currency_code: 'USD',
                status: 'active',
            },
        },
    ],
};

// ── Protocol tests ────────────────────────────────────────────────────────────

describe('Protocol', () => {
    it('GET /health returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-chargebee.workers.dev/health', { method: 'GET' }));
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('chargebee-mcp');
    });

    it('initialize returns protocol info', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        expect(data.result.protocolVersion).toBe('2024-11-05');
        expect(data.result.serverInfo.name).toBe('chargebee-mcp');
        expect(data.result.capabilities.tools).toBeDefined();
    });

    it('tools/list returns all 10 tools', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        expect(data.result.tools).toHaveLength(10);
        const names = data.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_customers');
        expect(names).toContain('get_customer');
        expect(names).toContain('create_customer');
        expect(names).toContain('list_subscriptions');
        expect(names).toContain('get_subscription');
        expect(names).toContain('create_subscription');
        expect(names).toContain('cancel_subscription');
        expect(names).toContain('reactivate_subscription');
        expect(names).toContain('list_invoices');
        expect(names).toContain('list_plans');
    });

    it('unknown method returns -32601', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 3, method: 'unknown/method', params: {} });
        expect(data.error.code).toBe(-32601);
    });

    it('invalid JSON-RPC version returns -32600', async () => {
        const data = await rpc({ jsonrpc: '1.0', id: 4, method: 'initialize', params: {} });
        expect(data.error.code).toBe(-32600);
    });

    it('non-POST non-health returns 405', async () => {
        const res = await worker.fetch(new Request('https://mcp-chargebee.workers.dev/', { method: 'PUT' }));
        expect(res.status).toBe(405);
    });

    it('missing secrets returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_customers', arguments: {} } },
            {},
        );
        expect(data.error.code).toBe(-32001);
        expect(data.error.message).toContain('Missing required secrets');
    });

    it('missing only site secret returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'list_customers', arguments: {} } },
            { 'X-Mcp-Secret-CHARGEBEE-API-KEY': 'key_only' },
        );
        expect(data.error.code).toBe(-32001);
    });
});

// ── Tool tests ────────────────────────────────────────────────────────────────

describe('list_customers', () => {
    it('returns list of customers', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCustomersList));
        const data = await rpc({
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: { name: 'list_customers', arguments: { limit: 10 } },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('cus_001');
        expect(result[0].email).toBe('alice@example.com');
        expect(result[1].id).toBe('cus_002');
    });

    it('includes email filter in query params when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCustomersList));
        await rpc({
            jsonrpc: '2.0', id: 11, method: 'tools/call',
            params: { name: 'list_customers', arguments: { email: 'alice@example.com' } },
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('email%5Bis%5D=alice%40example.com');
    });

    it('uses default limit of 20', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCustomersList));
        await rpc({
            jsonrpc: '2.0', id: 12, method: 'tools/call',
            params: { name: 'list_customers', arguments: {} },
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('limit=20');
    });

    it('includes correct site in URL', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCustomersList));
        await rpc({
            jsonrpc: '2.0', id: 13, method: 'tools/call',
            params: { name: 'list_customers', arguments: {} },
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('my-company.chargebee.com');
    });
});

describe('get_customer', () => {
    it('returns a specific customer', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCustomer));
        const data = await rpc({
            jsonrpc: '2.0', id: 20, method: 'tools/call',
            params: { name: 'get_customer', arguments: { customer_id: 'cus_001' } },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('cus_001');
        expect(result.email).toBe('alice@example.com');
    });

    it('returns error for missing customer_id', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 21, method: 'tools/call',
            params: { name: 'get_customer', arguments: {} },
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('customer_id');
    });

    it('handles API error gracefully', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(404, 'Customer not found'));
        const data = await rpc({
            jsonrpc: '2.0', id: 22, method: 'tools/call',
            params: { name: 'get_customer', arguments: { customer_id: 'nonexistent' } },
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('404');
    });
});

describe('create_customer', () => {
    it('creates a customer successfully', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCreatedCustomer));
        const data = await rpc({
            jsonrpc: '2.0', id: 30, method: 'tools/call',
            params: {
                name: 'create_customer',
                arguments: {
                    email: 'carol@example.com',
                    first_name: 'Carol',
                    last_name: 'White',
                    company: 'ACME',
                },
            },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('cus_new');
        expect(result.email).toBe('carol@example.com');
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[1].body).toContain('email=carol%40example.com');
    });

    it('returns error for missing email', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 31, method: 'tools/call',
            params: { name: 'create_customer', arguments: { first_name: 'NoEmail' } },
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('email');
    });
});

describe('list_subscriptions', () => {
    it('returns list of subscriptions', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockSubscriptionsList));
        const data = await rpc({
            jsonrpc: '2.0', id: 40, method: 'tools/call',
            params: { name: 'list_subscriptions', arguments: {} },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('sub_001');
        expect(result[0].status).toBe('active');
        expect(result[0].customer_id).toBe('cus_001');
    });

    it('filters by customer_id when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockSubscriptionsList));
        await rpc({
            jsonrpc: '2.0', id: 41, method: 'tools/call',
            params: { name: 'list_subscriptions', arguments: { customer_id: 'cus_001' } },
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('customer_id%5Bis%5D=cus_001');
    });

    it('filters by status when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockSubscriptionsList));
        await rpc({
            jsonrpc: '2.0', id: 42, method: 'tools/call',
            params: { name: 'list_subscriptions', arguments: { status: 'active' } },
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status%5Bis%5D=active');
    });
});

describe('get_subscription', () => {
    it('returns a specific subscription', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockSubscription));
        const data = await rpc({
            jsonrpc: '2.0', id: 50, method: 'tools/call',
            params: { name: 'get_subscription', arguments: { subscription_id: 'sub_001' } },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('sub_001');
        expect(result.plan_id).toBe('pro-monthly');
    });

    it('returns error for missing subscription_id', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 51, method: 'tools/call',
            params: { name: 'get_subscription', arguments: {} },
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('subscription_id');
    });
});

describe('create_subscription', () => {
    it('creates a subscription for a customer', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCreatedSubscription));
        const data = await rpc({
            jsonrpc: '2.0', id: 60, method: 'tools/call',
            params: {
                name: 'create_subscription',
                arguments: { customer_id: 'cus_001', plan_id: 'starter-monthly', plan_quantity: 2 },
            },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('sub_new');
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/customers/cus_001/subscription_for_customer');
        expect(call[1].method).toBe('POST');
        expect(call[1].body).toContain('subscription%5Bplan_id%5D=starter-monthly');
    });

    it('returns error for missing customer_id', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 61, method: 'tools/call',
            params: { name: 'create_subscription', arguments: { plan_id: 'pro-monthly' } },
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('customer_id');
    });

    it('returns error for missing plan_id', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 62, method: 'tools/call',
            params: { name: 'create_subscription', arguments: { customer_id: 'cus_001' } },
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('plan_id');
    });
});

describe('cancel_subscription', () => {
    it('cancels a subscription at end of term by default', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCancelledSubscription));
        const data = await rpc({
            jsonrpc: '2.0', id: 70, method: 'tools/call',
            params: { name: 'cancel_subscription', arguments: { subscription_id: 'sub_001' } },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.status).toBe('cancelled');
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/subscriptions/sub_001/cancel');
        expect(call[1].body).toContain('end_of_term=true');
    });

    it('cancels immediately when end_of_term=false', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCancelledSubscription));
        await rpc({
            jsonrpc: '2.0', id: 71, method: 'tools/call',
            params: { name: 'cancel_subscription', arguments: { subscription_id: 'sub_001', end_of_term: false } },
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].body).toContain('end_of_term=false');
    });

    it('returns error for missing subscription_id', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 72, method: 'tools/call',
            params: { name: 'cancel_subscription', arguments: {} },
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('subscription_id');
    });
});

describe('reactivate_subscription', () => {
    it('reactivates a cancelled subscription', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockReactivatedSubscription));
        const data = await rpc({
            jsonrpc: '2.0', id: 80, method: 'tools/call',
            params: { name: 'reactivate_subscription', arguments: { subscription_id: 'sub_001' } },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.status).toBe('active');
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/subscriptions/sub_001/reactivate');
        expect(call[1].method).toBe('POST');
    });

    it('returns error for missing subscription_id', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 81, method: 'tools/call',
            params: { name: 'reactivate_subscription', arguments: {} },
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('subscription_id');
    });
});

describe('list_invoices', () => {
    it('returns list of invoices', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockInvoicesList));
        const data = await rpc({
            jsonrpc: '2.0', id: 90, method: 'tools/call',
            params: { name: 'list_invoices', arguments: {} },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('inv_001');
        expect(result[0].status).toBe('paid');
        expect(result[0].amount_paid).toBe(2900);
    });

    it('filters by customer_id and status when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockInvoicesList));
        await rpc({
            jsonrpc: '2.0', id: 91, method: 'tools/call',
            params: { name: 'list_invoices', arguments: { customer_id: 'cus_001', status: 'paid' } },
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('customer_id%5Bis%5D=cus_001');
        expect(url).toContain('status%5Bis%5D=paid');
    });
});

describe('list_plans', () => {
    it('returns list of plans', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockPlansList));
        const data = await rpc({
            jsonrpc: '2.0', id: 100, method: 'tools/call',
            params: { name: 'list_plans', arguments: {} },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('pro-monthly');
        expect(result[0].price).toBe(2900);
        expect(result[0].currency_code).toBe('USD');
    });

    it('filters by status when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockPlansList));
        await rpc({
            jsonrpc: '2.0', id: 101, method: 'tools/call',
            params: { name: 'list_plans', arguments: { status: 'active' } },
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status%5Bis%5D=active');
    });
});

describe('basic auth', () => {
    it('uses correct Basic auth header with site from secret', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCustomersList));
        await rpc({
            jsonrpc: '2.0', id: 200, method: 'tools/call',
            params: { name: 'list_customers', arguments: {} },
        });
        const call = mockFetch.mock.calls[0];
        const authHeader = call[1].headers?.Authorization ?? '';
        expect(authHeader).toMatch(/^Basic /);
        // btoa('test_api_key_abc123:') = 'dGVzdF9hcGlfa2V5X2FiYzEyMzo='
        const expectedToken = btoa('test_api_key_abc123:');
        expect(authHeader).toBe(`Basic ${expectedToken}`);
    });
});

describe('unknown tool', () => {
    it('returns -32603 for unknown tool', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 999, method: 'tools/call',
            params: { name: 'nonexistent_tool', arguments: {} },
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Unknown tool');
    });
});
