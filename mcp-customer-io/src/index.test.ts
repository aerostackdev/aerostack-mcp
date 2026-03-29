import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const SITE_ID = 'test_site_id_abc';
const API_KEY = 'test_api_key_xyz';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockWorkspaceInfo = {
    name: 'Acme Corp',
    domain: 'acme.customer.io',
    timezone: 'America/New_York',
};

const mockCustomer = {
    customer: {
        id: 'user-001',
        email: 'alice@example.com',
        attributes: { name: 'Alice', plan: 'pro' },
        created_at: 1711584000,
        updated_at: 1711670400,
    },
};

const mockCustomerList = {
    customers: [
        { id: 'user-001', email: 'alice@example.com' },
        { id: 'user-002', email: 'bob@example.com' },
    ],
    next: 'cursor_xyz',
};

const mockSegment = {
    segment: {
        id: 5,
        name: 'Pro Users',
        description: 'All users on the pro plan',
        state: 'ready',
        progress: 100,
        type: 'manual',
        customer_count: 842,
    },
};

const mockSegmentsList = {
    segments: [mockSegment.segment, { id: 6, name: 'Trial Users', type: 'automated', customer_count: 203 }],
};

const mockCampaign = {
    campaign: {
        id: 10,
        name: 'Trial Expiry Series',
        active: true,
        type: 'trigger',
        created: 1700000000,
        updated: 1711000000,
    },
};

const mockCampaignsList = {
    campaigns: [mockCampaign.campaign],
};

const mockBroadcast = {
    id: 20,
    name: 'Password Reset',
    type: 'transactional',
};

const mockBroadcastsList = {
    broadcasts: [mockBroadcast],
};

const mockCampaignMetrics = {
    metric: 'sent',
    period: 'days',
    steps: 7,
    timestamps: [1711065600, 1711152000, 1711238400, 1711324800, 1711411200, 1711497600, 1711584000],
    series: [
        { date: '2026-03-22', sent: 120 },
        { date: '2026-03-23', sent: 95 },
    ],
};

const mockActivities = {
    activities: [
        { type: 'event', name: 'purchased', timestamp: 1711584000 },
        { type: 'email_sent', campaign_id: 10, timestamp: 1711497600 },
    ],
    next: 'next_cursor',
};

const mockWebhooks = {
    webhooks: [
        { id: 1, endpoint: 'https://myapp.com/cio-webhook', events: ['delivered', 'opened'] },
    ],
};

// ── Test helpers ──────────────────────────────────────────────────────────────

function ok(data: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
}

function ok200empty() {
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

function ok204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function apiErr(message: string, status = 400) {
    return Promise.resolve(
        new Response(JSON.stringify({ meta: { error: message } }), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('siteId')) {
        headers['X-Mcp-Secret-CUSTOMER-IO-SITE-ID'] = SITE_ID;
    }
    if (!missingSecrets.includes('apiKey')) {
        headers['X-Mcp-Secret-CUSTOMER-IO-API-KEY'] = API_KEY;
    }
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function toolReq(name: string, args: unknown = {}, missingSecrets: string[] = []) {
    return makeReq('tools/call', { name, arguments: args }, missingSecrets);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

describe('MCP protocol', () => {
    it('GET returns health check', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        expect(res.status).toBe(200);
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-customer-io');
        expect(body.tools).toBe(20);
    });

    it('non-POST/GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'PATCH' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error', async () => {
        const res = await worker.fetch(
            new Request('http://localhost/', {
                method: 'POST',
                body: 'bad-json',
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns server info', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as { result: { serverInfo: { name: string }; protocolVersion: string } };
        expect(body.result.serverInfo.name).toBe('mcp-customer-io');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });

    it('tools/list returns 20 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(20);
    });

    it('unknown method returns -32601', async () => {
        const res = await worker.fetch(makeReq('foo/bar'));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

describe('_ping', () => {
    it('returns workspace info on success', async () => {
        mockFetch.mockReturnValueOnce(ok(mockWorkspaceInfo));
        const res = await worker.fetch(toolReq('_ping'));
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.customer.io/v1/info',
            expect.objectContaining({
                headers: expect.objectContaining({ 'Authorization': `Bearer ${API_KEY}` }),
            }),
        );
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ name: 'Acme Corp' });
    });

    it('returns -32001 when both secrets missing', async () => {
        const res = await worker.fetch(toolReq('_ping', {}, ['siteId', 'apiKey']));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('CUSTOMER_IO_SITE_ID');
        expect(body.error.message).toContain('CUSTOMER_IO_API_KEY');
    });

    it('returns -32001 when only siteId missing', async () => {
        const res = await worker.fetch(toolReq('_ping', {}, ['siteId']));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('CUSTOMER_IO_SITE_ID');
    });
});

describe('identify_customer', () => {
    it('creates customer with attributes', async () => {
        mockFetch.mockReturnValueOnce(ok200empty());
        const res = await worker.fetch(toolReq('identify_customer', {
            id: 'user-001',
            attributes: { email: 'alice@example.com', name: 'Alice', plan: 'pro' },
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://track.customer.io/api/v1/customers/user-001');
        expect(opts.method).toBe('PUT');
        // Verify Basic auth header
        const expectedAuth = `Basic ${btoa(`${SITE_ID}:${API_KEY}`)}`;
        expect((opts.headers as Record<string, string>)['Authorization']).toBe(expectedAuth);
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.email).toBe('alice@example.com');
        expect(sent.plan).toBe('pro');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ success: true });
    });

    it('creates customer with no attributes', async () => {
        mockFetch.mockReturnValueOnce(ok200empty());
        await worker.fetch(toolReq('identify_customer', { id: 'user-002' }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/customers/user-002');
        expect(opts.method).toBe('PUT');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(Object.keys(sent)).toHaveLength(0);
    });

    it('returns error when id missing', async () => {
        const res = await worker.fetch(toolReq('identify_customer', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('id');
    });
});

describe('get_customer', () => {
    it('fetches customer by ID from App API', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCustomer));
        const res = await worker.fetch(toolReq('get_customer', { id: 'user-001' }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.customer.io/v1/customers/user-001');
        expect((opts.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text) as typeof mockCustomer;
        expect(data.customer.email).toBe('alice@example.com');
    });

    it('returns error when id missing', async () => {
        const res = await worker.fetch(toolReq('get_customer', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('id');
    });

    it('propagates 404 not found', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Customer not found', 404));
        const res = await worker.fetch(toolReq('get_customer', { id: 'nonexistent' }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('update_customer', () => {
    it('updates customer attributes', async () => {
        mockFetch.mockReturnValueOnce(ok200empty());
        await worker.fetch(toolReq('update_customer', {
            id: 'user-001',
            attributes: { plan: 'enterprise', mrr: 500 },
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/customers/user-001');
        expect(opts.method).toBe('PUT');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.plan).toBe('enterprise');
        expect(sent.mrr).toBe(500);
    });

    it('returns error when id missing', async () => {
        const res = await worker.fetch(toolReq('update_customer', { attributes: { plan: 'pro' } }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('id');
    });

    it('returns error when attributes missing', async () => {
        const res = await worker.fetch(toolReq('update_customer', { id: 'user-001' }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('attributes');
    });
});

describe('delete_customer', () => {
    it('deletes customer via Track API', async () => {
        mockFetch.mockReturnValueOnce(ok200empty());
        const res = await worker.fetch(toolReq('delete_customer', { id: 'user-001' }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://track.customer.io/api/v1/customers/user-001');
        expect(opts.method).toBe('DELETE');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ success: true });
    });

    it('returns error when id missing', async () => {
        const res = await worker.fetch(toolReq('delete_customer', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('id');
    });
});

describe('list_customers', () => {
    it('lists customers with no filter', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCustomerList));
        const res = await worker.fetch(toolReq('list_customers'));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.customer.io/v1/customers');
        expect(opts.method).toBe('POST');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text) as typeof mockCustomerList;
        expect(data.customers).toHaveLength(2);
    });

    it('passes filter and pagination', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCustomerList));
        await worker.fetch(toolReq('list_customers', {
            filter: { attribute: { field: 'email', operator: 'eq', value: 'alice@example.com' } },
            limit: 10,
            start: 'cursor_abc',
        }));
        const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.filter).toBeDefined();
        expect(sent.limit).toBe(10);
        expect(sent.start).toBe('cursor_abc');
    });
});

describe('track_event', () => {
    it('tracks named event for a customer', async () => {
        mockFetch.mockReturnValueOnce(ok200empty());
        const res = await worker.fetch(toolReq('track_event', {
            customer_id: 'user-001',
            name: 'purchased',
            data: { plan: 'pro', amount: 49 },
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://track.customer.io/api/v1/customers/user-001/events');
        expect(opts.method).toBe('POST');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.name).toBe('purchased');
        expect(sent.data).toEqual({ plan: 'pro', amount: 49 });
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ success: true });
    });

    it('tracks event without data', async () => {
        mockFetch.mockReturnValueOnce(ok200empty());
        await worker.fetch(toolReq('track_event', { customer_id: 'user-001', name: 'logged_in' }));
        const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.name).toBe('logged_in');
        expect(sent.data).toBeUndefined();
    });

    it('returns error when customer_id missing', async () => {
        const res = await worker.fetch(toolReq('track_event', { name: 'purchased' }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('customer_id');
    });

    it('returns error when name missing', async () => {
        const res = await worker.fetch(toolReq('track_event', { customer_id: 'user-001' }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('name');
    });
});

describe('track_anonymous_event', () => {
    it('tracks anonymous event', async () => {
        mockFetch.mockReturnValueOnce(ok200empty());
        await worker.fetch(toolReq('track_anonymous_event', {
            name: 'page_viewed',
            data: { page: '/pricing' },
            anonymous_id: 'anon-abc123',
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://track.customer.io/api/v1/events');
        expect(opts.method).toBe('POST');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.name).toBe('page_viewed');
        expect(sent.anonymous_id).toBe('anon-abc123');
    });

    it('returns error when name missing', async () => {
        const res = await worker.fetch(toolReq('track_anonymous_event', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('name');
    });
});

describe('batch_track', () => {
    it('sends batch operations', async () => {
        mockFetch.mockReturnValueOnce(ok({ errors: [] }));
        const batch = [
            { type: 'identify', id: 'user-001', attributes: { email: 'a@b.com' } },
            { type: 'event', customer_id: 'user-001', name: 'signed_up' },
        ];
        const res = await worker.fetch(toolReq('batch_track', { batch }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://track.customer.io/api/v1/batch');
        expect(opts.method).toBe('POST');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect((sent.batch as unknown[]).length).toBe(2);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ errors: [] });
    });

    it('returns error when batch missing', async () => {
        const res = await worker.fetch(toolReq('batch_track', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('batch');
    });
});

describe('get_customer_activities', () => {
    it('fetches customer activities', async () => {
        mockFetch.mockReturnValueOnce(ok(mockActivities));
        const res = await worker.fetch(toolReq('get_customer_activities', { id: 'user-001' }));
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/customers/user-001/activities');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text) as typeof mockActivities;
        expect(data.activities).toHaveLength(2);
    });

    it('passes type filter and pagination', async () => {
        mockFetch.mockReturnValueOnce(ok(mockActivities));
        await worker.fetch(toolReq('get_customer_activities', {
            id: 'user-001',
            type: 'email_sent',
            limit: 10,
            start: 'cursor_abc',
        }));
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('type=email_sent');
        expect(url).toContain('limit=10');
        expect(url).toContain('start=cursor_abc');
    });

    it('returns error when id missing', async () => {
        const res = await worker.fetch(toolReq('get_customer_activities', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('id');
    });
});

describe('list_segments', () => {
    it('lists all segments', async () => {
        mockFetch.mockReturnValueOnce(ok(mockSegmentsList));
        const res = await worker.fetch(toolReq('list_segments'));
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.customer.io/v1/segments');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text) as typeof mockSegmentsList;
        expect(data.segments).toHaveLength(2);
    });

    it('filters by type', async () => {
        mockFetch.mockReturnValueOnce(ok(mockSegmentsList));
        await worker.fetch(toolReq('list_segments', { type: 'manual', limit: 10 }));
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('type=manual');
        expect(url).toContain('limit=10');
    });
});

describe('get_segment', () => {
    it('fetches segment by ID', async () => {
        mockFetch.mockReturnValueOnce(ok(mockSegment));
        const res = await worker.fetch(toolReq('get_segment', { id: 5 }));
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.customer.io/v1/segments/5');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text) as typeof mockSegment;
        expect(data.segment.customer_count).toBe(842);
    });

    it('returns error when id missing', async () => {
        const res = await worker.fetch(toolReq('get_segment', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('id');
    });
});

describe('add_to_segment', () => {
    it('adds customers to segment', async () => {
        mockFetch.mockReturnValueOnce(ok204());
        const res = await worker.fetch(toolReq('add_to_segment', {
            id: 5,
            ids: ['user-001', 'user-002', 'user-003'],
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.customer.io/v1/segments/5/add_customers');
        expect(opts.method).toBe('POST');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.ids).toEqual(['user-001', 'user-002', 'user-003']);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ success: true });
    });

    it('returns error when ids missing', async () => {
        const res = await worker.fetch(toolReq('add_to_segment', { id: 5 }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('ids');
    });
});

describe('remove_from_segment', () => {
    it('removes customers from segment', async () => {
        mockFetch.mockReturnValueOnce(ok204());
        const res = await worker.fetch(toolReq('remove_from_segment', {
            id: 5,
            ids: ['user-001'],
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.customer.io/v1/segments/5/remove_customers');
        expect(opts.method).toBe('POST');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ success: true });
    });

    it('returns error when id missing', async () => {
        const res = await worker.fetch(toolReq('remove_from_segment', { ids: ['user-001'] }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('id');
    });
});

describe('list_campaigns', () => {
    it('lists all campaigns', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCampaignsList));
        const res = await worker.fetch(toolReq('list_campaigns'));
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.customer.io/v1/campaigns');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text) as typeof mockCampaignsList;
        expect(data.campaigns).toHaveLength(1);
    });

    it('passes limit and start', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCampaignsList));
        await worker.fetch(toolReq('list_campaigns', { limit: 5, start: 'cursor_abc' }));
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('limit=5');
        expect(url).toContain('start=cursor_abc');
    });
});

describe('get_campaign', () => {
    it('fetches campaign by ID', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCampaign));
        const res = await worker.fetch(toolReq('get_campaign', { id: 10 }));
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.customer.io/v1/campaigns/10');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text) as typeof mockCampaign;
        expect(data.campaign.name).toBe('Trial Expiry Series');
    });

    it('returns error when id missing', async () => {
        const res = await worker.fetch(toolReq('get_campaign', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('id');
    });
});

describe('list_broadcasts', () => {
    it('lists all broadcasts', async () => {
        mockFetch.mockReturnValueOnce(ok(mockBroadcastsList));
        const res = await worker.fetch(toolReq('list_broadcasts'));
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.customer.io/v1/broadcasts');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text) as typeof mockBroadcastsList;
        expect(data.broadcasts).toHaveLength(1);
        expect(data.broadcasts[0].name).toBe('Password Reset');
    });
});

describe('send_broadcast', () => {
    it('triggers broadcast to customer by ID', async () => {
        mockFetch.mockReturnValueOnce(ok({ delivery_id: 'del_abc' }));
        const res = await worker.fetch(toolReq('send_broadcast', {
            id: 20,
            to: { id: 'user-001' },
            data: { reset_link: 'https://app.example.com/reset/token123' },
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.customer.io/v1/broadcasts/20/send');
        expect(opts.method).toBe('POST');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.to).toEqual({ id: 'user-001' });
        expect(sent.data).toMatchObject({ reset_link: 'https://app.example.com/reset/token123' });
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ delivery_id: 'del_abc' });
    });

    it('triggers broadcast to customer by email', async () => {
        mockFetch.mockReturnValueOnce(ok({ delivery_id: 'del_xyz' }));
        await worker.fetch(toolReq('send_broadcast', {
            id: 20,
            to: { email: 'alice@example.com' },
        }));
        const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.to).toEqual({ email: 'alice@example.com' });
    });

    it('returns error when id missing', async () => {
        const res = await worker.fetch(toolReq('send_broadcast', { to: { id: 'user-001' } }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('id');
    });

    it('returns error when to missing', async () => {
        const res = await worker.fetch(toolReq('send_broadcast', { id: 20 }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('to');
    });
});

describe('get_campaign_metrics', () => {
    it('fetches campaign metrics', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCampaignMetrics));
        const res = await worker.fetch(toolReq('get_campaign_metrics', { id: 10, period: 'days' }));
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/campaigns/10/metrics');
        expect(url).toContain('period=days');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text) as typeof mockCampaignMetrics;
        expect(data.period).toBe('days');
    });

    it('passes metric and steps filters', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCampaignMetrics));
        await worker.fetch(toolReq('get_campaign_metrics', { id: 10, metric: 'opened', steps: 14 }));
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('metric=opened');
        expect(url).toContain('steps=14');
    });

    it('returns error when id missing', async () => {
        const res = await worker.fetch(toolReq('get_campaign_metrics', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('id');
    });
});

describe('list_webhooks', () => {
    it('lists reporting webhooks', async () => {
        mockFetch.mockReturnValueOnce(ok(mockWebhooks));
        const res = await worker.fetch(toolReq('list_webhooks'));
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.customer.io/v1/reporting_webhooks');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text) as typeof mockWebhooks;
        expect(data.webhooks).toHaveLength(1);
    });
});

describe('get_workspace_info', () => {
    it('returns workspace info', async () => {
        mockFetch.mockReturnValueOnce(ok(mockWorkspaceInfo));
        const res = await worker.fetch(toolReq('get_workspace_info'));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.customer.io/v1/info');
        expect((opts.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ name: 'Acme Corp', timezone: 'America/New_York' });
    });
});

describe('auth guard', () => {
    it('returns -32001 for every tool when both secrets are missing', async () => {
        const tools = [
            'identify_customer', 'get_customer', 'update_customer', 'delete_customer', 'list_customers',
            'track_event', 'track_anonymous_event', 'batch_track', 'get_customer_activities',
            'list_segments', 'get_segment', 'add_to_segment', 'remove_from_segment',
            'list_campaigns', 'get_campaign', 'list_broadcasts', 'send_broadcast',
            'get_campaign_metrics', 'list_webhooks', 'get_workspace_info',
        ];
        for (const tool of tools) {
            const res = await worker.fetch(toolReq(tool, {}, ['siteId', 'apiKey']));
            const body = await res.json() as { error: { code: number } };
            expect(body.error.code, `${tool} should return -32001`).toBe(-32001);
        }
    });
});

describe('API error propagation', () => {
    it('propagates Track API 401 as -32603', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Invalid credentials', 401));
        const res = await worker.fetch(toolReq('identify_customer', { id: 'user-001' }));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('401');
    });

    it('propagates App API 401 as -32603', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Unauthorized', 401));
        const res = await worker.fetch(toolReq('get_customer', { id: 'user-001' }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });

    it('propagates 429 rate limit as -32603', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Rate limit exceeded', 429));
        const res = await worker.fetch(toolReq('track_event', { customer_id: 'user-001', name: 'test' }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });

    it('handles non-JSON response body', async () => {
        mockFetch.mockReturnValueOnce(
            Promise.resolve(new Response('Service Unavailable', { status: 503 })),
        );
        const res = await worker.fetch(toolReq('list_campaigns'));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('503');
    });
});

describe('auth header correctness', () => {
    it('Track API calls use Basic auth with site_id:api_key', async () => {
        mockFetch.mockReturnValueOnce(ok200empty());
        await worker.fetch(toolReq('track_event', { customer_id: 'user-001', name: 'test' }));
        const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        const expected = `Basic ${btoa(`${SITE_ID}:${API_KEY}`)}`;
        expect((opts.headers as Record<string, string>)['Authorization']).toBe(expected);
    });

    it('App API calls use Bearer token', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCampaignsList));
        await worker.fetch(toolReq('list_campaigns'));
        const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect((opts.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
});
