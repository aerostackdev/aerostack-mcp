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

function apiNoContent() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-MAILERLITE-API-KEY': 'test_api_key',
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
        expect(body.server).toBe('mailerlite-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mailerlite-mcp');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 18 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(18);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_subscribers');
        expect(names).toContain('create_campaign');
        expect(names).toContain('get_account_info');
    });
});

describe('missing auth', () => {
    it('returns -32001', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_subscribers', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_subscribers', () => {
    it('returns subscribers', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [{ id: '1', email: 'a@b.com' }], meta: { total: 1 } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_subscribers', arguments: { limit: 25 } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.data).toHaveLength(1);
    });

    it('passes filter[status] param', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_subscribers', arguments: { 'filter[status]': 'active' } }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('filter%5Bstatus%5D=active');
    });
});

describe('create_subscriber', () => {
    it('creates subscriber', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { id: '1', email: 'new@test.com' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_subscriber',
            arguments: { email: 'new@test.com', name: 'New User' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.data.email).toBe('new@test.com');
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_subscriber', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_subscriber', () => {
    it('returns subscriber', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { id: '1', email: 'a@b.com' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_subscriber', arguments: { id: '1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.data.id).toBe('1');
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_subscriber', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('delete_subscriber', () => {
    it('deletes subscriber (204)', async () => {
        mockFetch.mockResolvedValueOnce(apiNoContent());
        const res = await worker.fetch(makeReq('tools/call', { name: 'delete_subscriber', arguments: { id: '1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
    });
});

describe('list_groups', () => {
    it('returns groups', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [{ id: 'g1', name: 'Newsletter' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_groups', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.data[0].name).toBe('Newsletter');
    });
});

describe('create_group', () => {
    it('creates group', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { id: 'g2', name: 'VIP' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_group', arguments: { name: 'VIP' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.data.name).toBe('VIP');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_group', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('add_subscriber_to_group', () => {
    it('adds subscriber', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: {} }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'add_subscriber_to_group',
            arguments: { subscriber_id: 's1', group_id: 'g1' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('create_campaign', () => {
    it('creates a campaign', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { id: 'camp1', name: 'Weekly Update' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_campaign',
            arguments: {
                name: 'Weekly Update',
                emails: [{ subject: 'Hello', from_name: 'Me', from_email: 'me@co.com', content: '<p>Hi</p>' }],
                groups: ['g1'],
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.data.name).toBe('Weekly Update');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_campaign', arguments: { emails: [], groups: [] } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('schedule_campaign', () => {
    it('schedules a campaign', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { id: 'camp1', status: 'ready' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'schedule_campaign',
            arguments: { id: 'camp1', delivery: 'instant' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('list_fields', () => {
    it('returns fields', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [{ id: 'f1', name: 'Company', key: 'company', type: 'text' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_fields', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.data[0].name).toBe('Company');
    });
});

describe('get_account_info', () => {
    it('returns account info', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { id: 'acc1', email: 'admin@co.com', plan: 'pro' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_account_info', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.data.email).toBe('admin@co.com');
    });
});
