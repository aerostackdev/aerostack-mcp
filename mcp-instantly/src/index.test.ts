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
    'X-Mcp-Secret-INSTANTLY-API-KEY': 'test_api_key',
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

// ── Health check ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
    it('returns status ok', async () => {
        const res = await worker.fetch(new Request('http://localhost/health'));
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('instantly-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('instantly-mcp');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 16 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(16);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_campaigns');
        expect(names).toContain('verify_email');
        expect(names).toContain('bulk_verify_emails');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('unknown/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('missing auth', () => {
    it('returns -32001', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_campaigns', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_campaigns', () => {
    it('returns campaigns', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ items: [{ id: 'c1', name: 'Test' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_campaigns', arguments: { limit: 10 } }));
        const body = await res.json() as any;
        expect(body.result.content[0].text).toBeDefined();
    });

    it('passes limit param to API', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ items: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_campaigns', arguments: { limit: 5 } }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('limit=5');
    });
});

describe('create_campaign', () => {
    it('creates a campaign', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'c2', name: 'New' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_campaign', arguments: { name: 'New' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('c2');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_campaign', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_campaign', () => {
    it('fetches campaign by ID', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'c1', name: 'Test' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_campaign', arguments: { id: 'c1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('c1');
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_campaign', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('update_campaign_status', () => {
    it('updates status', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'c1', status: 'paused' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_campaign_status',
            arguments: { id: 'c1', status: 'paused' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('returns -32603 when status missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'update_campaign_status', arguments: { id: 'c1' } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('add_leads', () => {
    it('adds leads to campaign', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ uploaded_count: 2, duplicate_count: 0, invalid_count: 0 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'add_leads',
            arguments: { campaign_id: 'c1', leads: [{ email: 'a@b.com' }] },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.uploaded_count).toBe(2);
    });

    it('returns -32603 when leads missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'add_leads', arguments: { campaign_id: 'c1' } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('verify_email', () => {
    it('verifies an email', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ is_valid: true, reason: 'valid', mx_found: true }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'verify_email', arguments: { email: 'test@example.com' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.is_valid).toBe(true);
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'verify_email', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('bulk_verify_emails', () => {
    it('verifies multiple emails', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ verified: [{ email: 'a@b.com', is_valid: true }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'bulk_verify_emails', arguments: { emails: ['a@b.com'] } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.verified).toHaveLength(1);
    });
});

describe('get_campaign_analytics', () => {
    it('returns analytics', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ sent: 100, opened: 45, replied: 10 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_campaign_analytics', arguments: { id: 'c1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.sent).toBe(100);
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_campaign_analytics', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_accounts', () => {
    it('returns email accounts', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ items: [{ email: 'sender@company.com', status: 'active' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_accounts', arguments: {} }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('get_account_status', () => {
    it('returns account details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ email: 'sender@company.com', status: 'active', daily_limit: 50 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_account_status', arguments: { email: 'sender@company.com' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.email).toBe('sender@company.com');
    });
});

describe('uses Bearer auth', () => {
    it('sets Authorization header correctly', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ items: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_campaigns', arguments: {} }));
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Authorization']).toBe('Bearer test_api_key');
    });
});
