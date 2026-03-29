import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-BRAZE-API-KEY': 'test_api_key',
    'X-Mcp-Secret-BRAZE-INSTANCE-URL': 'rest.iad-01.braze.com',
};

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: TEST_HEADERS,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeReqNoAuth(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

// ── Health ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
    it('returns ok', async () => {
        const res = await worker.fetch(new Request('http://localhost/health'));
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('braze-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('braze-mcp');
    });
});

describe('tools/list', () => {
    it('returns 16 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(16);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('track_users');
        expect(names).toContain('send_message');
        expect(names).toContain('get_app_group_info');
    });
});

describe('missing auth', () => {
    it('returns -32001 when both secrets missing', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_campaigns', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });

    it('returns -32001 when instance URL missing', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-BRAZE-API-KEY': 'test_key',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_campaigns', arguments: {} } }),
        });
        const res = await worker.fetch(req);
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('track_users', () => {
    it('tracks user attributes', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ message: 'success', attributes_processed: 1 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'track_users',
            arguments: {
                attributes: [{ external_id: 'user1', email: 'user@example.com', first_name: 'John' }],
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.message).toBe('success');
    });
});

describe('get_user_profile', () => {
    it('exports user profiles', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ users: [{ external_id: 'user1', email: 'user@example.com' }] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_user_profile',
            arguments: { external_ids: ['user1'] },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.users).toHaveLength(1);
    });

    it('returns -32603 when external_ids missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_user_profile', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('send_message', () => {
    it('sends message to users', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ dispatch_id: 'd1', message: 'queued' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'send_message',
            arguments: {
                external_user_ids: ['user1'],
                messages: { email: { subject: 'Hello', body: '<p>Hi</p>' } },
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.dispatch_id).toBe('d1');
    });

    it('returns -32603 when messages missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'send_message',
            arguments: { external_user_ids: ['user1'] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_campaigns', () => {
    it('lists campaigns', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ campaigns: [{ id: 'c1', name: 'Onboarding' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_campaigns', arguments: { page: 0 } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('uses correct base URL from instance URL', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ campaigns: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_campaigns', arguments: {} }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('rest.iad-01.braze.com');
    });
});

describe('get_campaign', () => {
    it('returns campaign details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'c1', name: 'Test', type: 'Email' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_campaign', arguments: { campaign_id: 'c1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.name).toBe('Test');
    });

    it('returns -32603 when campaign_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_campaign', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('track_event', () => {
    it('tracks event for user', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ message: 'success' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'track_event',
            arguments: { external_id: 'user1', event_name: 'purchase', properties: { amount: 50 } },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('returns -32603 when event_name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'track_event', arguments: { external_id: 'u1' } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_email_template', () => {
    it('creates email template', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ email_template_id: 'tmpl1' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_email_template',
            arguments: { template_name: 'Welcome', subject: 'Welcome!', body: '<h1>Hi</h1>' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.email_template_id).toBe('tmpl1');
    });
});

describe('update_subscription_status', () => {
    it('updates subscription status', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ message: 'success' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_subscription_status',
            arguments: { subscription_group_id: 'sg1', subscription_status: 'Subscribed', external_id: 'user1' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('list_segments', () => {
    it('returns segments', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ segments: [{ id: 'seg1', name: 'Power Users' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_segments', arguments: {} }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('get_app_group_info', () => {
    it('returns app group info', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ name: 'My App', time_zone: 'UTC', currency_code: 'USD' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_app_group_info', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.name).toBe('My App');
    });
});
