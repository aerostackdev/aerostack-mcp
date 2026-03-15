import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ────────────────────────────────────────────────────────────────

const API_KEY = 'pk_test_abc123def456';

// ── Mock data ────────────────────────────────────────────────────────────────

const mockProfile = {
    id: '01ABC123',
    type: 'profile',
    attributes: {
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        phone_number: '+14155552671',
        properties: { plan: 'pro' },
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-02T00:00:00Z',
    },
};

const mockList = {
    id: 'XY1234',
    type: 'list',
    attributes: {
        name: 'Test List',
        opt_in_process: 'single-opt-in',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-02T00:00:00Z',
    },
};

const mockEvent = {
    id: 'EVT001',
    type: 'event',
    attributes: {
        datetime: '2024-01-01T00:00:00Z',
        event_properties: { order_id: '123' },
    },
};

const mockMetric = {
    id: 'MET001',
    type: 'metric',
    attributes: {
        name: 'Placed Order',
        integration: { object: 'api', name: 'API' },
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-02T00:00:00Z',
    },
};

const mockCampaign = {
    id: 'CAM001',
    type: 'campaign',
    attributes: {
        name: 'Test Campaign',
        status: 'draft',
        send_time: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
    },
};

const mockFlow = {
    id: 'FLW001',
    type: 'flow',
    attributes: {
        name: 'Welcome Flow',
        status: 'live',
        trigger_type: 'list',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-02T00:00:00Z',
    },
};

const mockTemplate = {
    id: 'TPL001',
    type: 'template',
    attributes: {
        name: 'Welcome Email',
        editor_type: 'CODE',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-02T00:00:00Z',
    },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function klaviyoOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function klaviyoNoContent() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function klaviyoAccepted(data: unknown) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function klaviyoErr(errors: Array<{ detail: string }>, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ errors }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, includeAuth = true) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (includeAuth) headers['X-Mcp-Secret-KLAVIYO-API-KEY'] = API_KEY;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(toolName: string, args: Record<string, unknown> = {}, includeAuth = true) {
    return makeReq('tools/call', { name: toolName, arguments: args }, includeAuth);
}

async function callTool(toolName: string, args: Record<string, unknown> = {}, includeAuth = true) {
    const req = makeToolReq(toolName, args, includeAuth);
    const res = await worker.fetch(req);
    return res.json() as Promise<{
        jsonrpc: string;
        id: number;
        result?: { content: [{ type: string; text: string }] };
        error?: { code: number; message: string };
    }>;
}

async function getToolResult(toolName: string, args: Record<string, unknown> = {}) {
    const body = await callTool(toolName, args);
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    return JSON.parse(body.result!.content[0].text);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Health check', () => {
    it('GET / returns status ok and tool count', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        expect(res.status).toBe(200);
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-klaviyo');
        expect(body.tools).toBe(18);
    });

    it('non-POST/GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });
});

describe('initialize', () => {
    it('returns protocol version and server info', async () => {
        const req = makeReq('initialize', { protocolVersion: '2024-11-05' });
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { protocolVersion: string; serverInfo: { name: string } };
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-klaviyo');
    });
});

describe('tools/list', () => {
    it('returns exactly 18 tools', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(18);
    });

    it('includes all expected tool names', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string }> } };
        const names = body.result.tools.map(t => t.name);
        const expected = [
            'get_profiles', 'get_profile', 'create_profile', 'update_profile', 'subscribe_profiles',
            'get_lists', 'get_list', 'create_list', 'add_profiles_to_list',
            'get_events', 'create_event', 'get_metrics',
            'get_campaigns', 'get_campaign', 'get_campaign_recipient_estimation',
            'get_flows', 'get_flow',
            'get_templates',
        ];
        for (const name of expected) {
            expect(names).toContain(name);
        }
    });
});

describe('Missing auth', () => {
    it('returns -32001 when API key header is missing', async () => {
        const req = makeToolReq('get_profiles', {}, false);
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('KLAVIYO_API_KEY');
    });
});

describe('Unknown method', () => {
    it('returns -32601 for unrecognized method', async () => {
        const req = makeReq('unknown/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32601);
    });
});

describe('Invalid JSON', () => {
    it('returns -32700 for malformed JSON body', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-valid-json',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });
});

// ── Tool happy paths ──────────────────────────────────────────────────────────

describe('get_profiles', () => {
    it('lists profiles with default size', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: [mockProfile] }));
        const result = await getToolResult('get_profiles');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('01ABC123');
    });

    it('passes filter param to Klaviyo API', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: [mockProfile] }));
        await getToolResult('get_profiles', { filter: 'equals(email,"test@example.com")' });
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('filter=');
    });

    it('uses correct auth header format', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: [] }));
        await getToolResult('get_profiles');
        const calledInit = mockFetch.mock.calls[0][1] as RequestInit;
        const headers = calledInit.headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Klaviyo-API-Key ${API_KEY}`);
        expect(headers['revision']).toBe('2023-02-22');
    });
});

describe('get_profile', () => {
    it('fetches profile by ID', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: mockProfile }));
        const result = await getToolResult('get_profile', { profile_id: '01ABC123' });
        expect(result.data.id).toBe('01ABC123');
        expect(result.data.attributes.email).toBe('test@example.com');
    });

    it('returns -32603 when profile_id missing', async () => {
        const body = await callTool('get_profile', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('profile_id');
    });
});

describe('create_profile', () => {
    it('creates a profile with required and optional fields', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: mockProfile }, 201));
        const result = await getToolResult('create_profile', {
            email: 'test@example.com',
            first_name: 'John',
            last_name: 'Doe',
            phone_number: '+14155552671',
            properties: { plan: 'pro' },
        });
        expect(result.data.attributes.email).toBe('test@example.com');
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(body.data.type).toBe('profile');
        expect(body.data.attributes.email).toBe('test@example.com');
        expect(body.data.attributes.first_name).toBe('John');
    });

    it('returns -32603 when email missing', async () => {
        const body = await callTool('create_profile', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('email');
    });
});

describe('update_profile', () => {
    it('updates a profile with PATCH', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: { ...mockProfile, attributes: { ...mockProfile.attributes, first_name: 'Jane' } } }));
        const result = await getToolResult('update_profile', {
            profile_id: '01ABC123',
            first_name: 'Jane',
        });
        expect(result.data.attributes.first_name).toBe('Jane');
        const reqInit = mockFetch.mock.calls[0][1] as RequestInit;
        expect(reqInit.method).toBe('PATCH');
        const reqBody = JSON.parse(reqInit.body as string);
        expect(reqBody.data.type).toBe('profile');
        expect(reqBody.data.id).toBe('01ABC123');
    });

    it('returns -32603 when profile_id missing', async () => {
        const body = await callTool('update_profile', {});
        expect(body.error?.code).toBe(-32603);
    });
});

describe('subscribe_profiles', () => {
    it('subscribes a single email', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoAccepted({ data: { id: 'JOB001', type: 'profile-subscription-bulk-create-job' } }));
        const result = await getToolResult('subscribe_profiles', {
            list_id: 'XY1234',
            emails: 'test@example.com',
        });
        expect(result.success).toBe(true);
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.data.type).toBe('profile-subscription-bulk-create-job');
        expect(reqBody.data.attributes.list_id).toBe('XY1234');
        expect(reqBody.data.attributes.subscriptions).toHaveLength(1);
        expect(reqBody.data.attributes.subscriptions[0].profile.data.attributes.email).toBe('test@example.com');
        expect(reqBody.data.attributes.subscriptions[0].channels.email.subscriptions[0].marketing.consent).toBe('SUBSCRIBED');
    });

    it('subscribes multiple emails', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoAccepted({ data: { id: 'JOB002', type: 'profile-subscription-bulk-create-job' } }));
        await getToolResult('subscribe_profiles', {
            list_id: 'XY1234',
            emails: ['a@test.com', 'b@test.com'],
        });
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.data.attributes.subscriptions).toHaveLength(2);
    });

    it('returns -32603 when list_id missing', async () => {
        const body = await callTool('subscribe_profiles', { emails: 'test@example.com' });
        expect(body.error?.code).toBe(-32603);
    });
});

describe('get_lists', () => {
    it('lists Klaviyo lists', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: [mockList] }));
        const result = await getToolResult('get_lists');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('XY1234');
        expect(result.data[0].attributes.name).toBe('Test List');
    });
});

describe('get_list', () => {
    it('fetches list by ID', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: mockList }));
        const result = await getToolResult('get_list', { list_id: 'XY1234' });
        expect(result.data.attributes.name).toBe('Test List');
    });

    it('returns -32603 when list_id missing', async () => {
        const body = await callTool('get_list', {});
        expect(body.error?.code).toBe(-32603);
    });
});

describe('create_list', () => {
    it('creates a list with given name', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: mockList }, 201));
        const result = await getToolResult('create_list', { name: 'Test List' });
        expect(result.data.attributes.name).toBe('Test List');
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.data.type).toBe('list');
        expect(reqBody.data.attributes.name).toBe('Test List');
    });

    it('returns -32603 when name missing', async () => {
        const body = await callTool('create_list', {});
        expect(body.error?.code).toBe(-32603);
    });
});

describe('add_profiles_to_list', () => {
    it('adds profiles to list (204 → success)', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoNoContent());
        const result = await getToolResult('add_profiles_to_list', {
            list_id: 'XY1234',
            profile_ids: ['01ABC123', '01DEF456'],
        });
        expect(result.success).toBe(true);
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.data).toHaveLength(2);
        expect(reqBody.data[0].type).toBe('profile');
        expect(reqBody.data[0].id).toBe('01ABC123');
    });

    it('returns -32603 when list_id missing', async () => {
        const body = await callTool('add_profiles_to_list', { profile_ids: ['01ABC123'] });
        expect(body.error?.code).toBe(-32603);
    });
});

describe('get_events', () => {
    it('lists events', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: [mockEvent] }));
        const result = await getToolResult('get_events');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('EVT001');
    });

    it('passes filter to API', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: [] }));
        await getToolResult('get_events', { filter: 'equals(metric_id,"MET001")' });
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('filter=');
    });
});

describe('create_event', () => {
    it('creates an event for a profile', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoAccepted({ data: { id: 'EVT002', type: 'event' } }));
        const result = await getToolResult('create_event', {
            email: 'test@example.com',
            metric_name: 'Placed Order',
            properties: { order_id: '123', value: 49.99 },
            value: 49.99,
        });
        expect(result.success).toBe(true);
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.data.type).toBe('event');
        expect(reqBody.data.attributes.profile.data.attributes.email).toBe('test@example.com');
        expect(reqBody.data.attributes.metric.data.attributes.name).toBe('Placed Order');
        expect(reqBody.data.attributes.value).toBe(49.99);
    });

    it('returns -32603 when email missing', async () => {
        const body = await callTool('create_event', { metric_name: 'Placed Order' });
        expect(body.error?.code).toBe(-32603);
    });

    it('returns -32603 when metric_name missing', async () => {
        const body = await callTool('create_event', { email: 'test@example.com' });
        expect(body.error?.code).toBe(-32603);
    });
});

describe('get_metrics', () => {
    it('lists metrics', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: [mockMetric] }));
        const result = await getToolResult('get_metrics');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].attributes.name).toBe('Placed Order');
    });
});

describe('get_campaigns', () => {
    it('lists email campaigns with channel filter', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: [mockCampaign] }));
        const result = await getToolResult('get_campaigns');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('CAM001');
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('filter=');
        expect(decodeURIComponent(calledUrl)).toContain("equals(messages.channel,'email')");
    });
});

describe('get_campaign', () => {
    it('fetches campaign by ID', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: mockCampaign }));
        const result = await getToolResult('get_campaign', { campaign_id: 'CAM001' });
        expect(result.data.attributes.name).toBe('Test Campaign');
    });

    it('returns -32603 when campaign_id missing', async () => {
        const body = await callTool('get_campaign', {});
        expect(body.error?.code).toBe(-32603);
    });
});

describe('get_campaign_recipient_estimation', () => {
    it('fetches recipient estimation for a campaign', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({
            data: {
                id: 'CAM001',
                type: 'campaign-recipient-estimation',
                attributes: { estimated_recipient_count: 1500 },
            },
        }));
        const result = await getToolResult('get_campaign_recipient_estimation', { campaign_id: 'CAM001' });
        expect(result.data.attributes.estimated_recipient_count).toBe(1500);
    });

    it('returns -32603 when campaign_id missing', async () => {
        const body = await callTool('get_campaign_recipient_estimation', {});
        expect(body.error?.code).toBe(-32603);
    });
});

describe('get_flows', () => {
    it('lists flows', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: [mockFlow] }));
        const result = await getToolResult('get_flows');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].attributes.name).toBe('Welcome Flow');
        expect(result.data[0].attributes.status).toBe('live');
    });
});

describe('get_flow', () => {
    it('fetches flow by ID', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: mockFlow }));
        const result = await getToolResult('get_flow', { flow_id: 'FLW001' });
        expect(result.data.attributes.name).toBe('Welcome Flow');
    });

    it('returns -32603 when flow_id missing', async () => {
        const body = await callTool('get_flow', {});
        expect(body.error?.code).toBe(-32603);
    });
});

describe('get_templates', () => {
    it('lists templates', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoOk({ data: [mockTemplate] }));
        const result = await getToolResult('get_templates');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].attributes.name).toBe('Welcome Email');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Klaviyo API error handling', () => {
    it('surfaces Klaviyo error detail on 4xx', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoErr([{ detail: 'Profile not found' }], 404));
        const body = await callTool('get_profile', { profile_id: 'NOTEXIST' });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('404');
        expect(body.error?.message).toContain('Profile not found');
    });

    it('surfaces 401 unauthorized error', async () => {
        mockFetch.mockResolvedValueOnce(klaviyoErr([{ detail: 'Invalid API key' }], 401));
        const body = await callTool('get_profiles', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('401');
    });
});

describe('Unknown tool', () => {
    it('returns -32603 for unknown tool name', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('Unknown tool');
    });
});

// ── E2E (skipped — require real Klaviyo API key) ──────────────────────────────

describe.skip('E2E — requires real KLAVIYO_API_KEY', () => {
    it('E2E: lists profiles from live Klaviyo account', async () => {
        // Set real API key in X-Mcp-Secret-KLAVIYO-API-KEY header
    });

    it('E2E: creates and retrieves a profile', async () => {
        // Creates test@e2e.example.com profile, then retrieves it
    });

    it('E2E: creates a custom event for a profile', async () => {
        // Sends a "Test Event" metric for a test email
    });
});
