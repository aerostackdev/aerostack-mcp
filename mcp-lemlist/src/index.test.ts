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
    'X-Mcp-Secret-LEMLIST-API-KEY': 'test_api_key',
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
        const req = new Request('http://localhost/health');
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('lemlist-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('lemlist-mcp');
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
        expect(names).toContain('add_lead_to_campaign');
        expect(names).toContain('get_campaign_stats');
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
    it('returns -32001 when no secret present', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_campaigns', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

describe('non-POST request', () => {
    it('returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'PUT' }));
        expect(res.status).toBe(405);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_campaigns', () => {
    it('returns campaigns array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([{ _id: 'c1', name: 'Q1 Outreach', status: 'active' }]));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_campaigns', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].name).toBe('Q1 Outreach');
    });
});

describe('get_campaign', () => {
    it('fetches a campaign by ID', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ _id: 'c1', name: 'Test' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_campaign', arguments: { campaignId: 'c1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result._id).toBe('c1');
    });

    it('returns -32603 when campaignId missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_campaign', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_campaign', () => {
    it('creates a campaign', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ _id: 'c2', name: 'New Campaign' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_campaign', arguments: { name: 'New Campaign' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.name).toBe('New Campaign');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_campaign', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('pause_campaign / resume_campaign', () => {
    it('pauses a campaign', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ paused: true }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'pause_campaign', arguments: { campaignId: 'c1' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('resumes a campaign', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ resumed: true }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'resume_campaign', arguments: { campaignId: 'c1' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('list_leads_in_campaign', () => {
    it('lists leads', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([{ email: 'a@b.com' }]));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_leads_in_campaign',
            arguments: { campaignId: 'c1', limit: 10 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(Array.isArray(result)).toBe(true);
    });

    it('returns -32603 when campaignId missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_leads_in_campaign', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('add_lead_to_campaign', () => {
    it('adds lead to campaign', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ email: 'test@example.com', firstName: 'Test' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'add_lead_to_campaign',
            arguments: { campaignId: 'c1', email: 'test@example.com', first_name: 'Test' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.email).toBe('test@example.com');
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'add_lead_to_campaign', arguments: { campaignId: 'c1' } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_lead_activity', () => {
    it('returns activity for lead', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([{ type: 'emailSent', date: '2024-01-01' }]));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_lead_activity',
            arguments: { campaignId: 'c1', email: 'test@example.com' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(Array.isArray(result)).toBe(true);
    });
});

describe('get_lead', () => {
    it('returns lead by email', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ email: 'test@example.com' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_lead', arguments: { email: 'test@example.com' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.email).toBe('test@example.com');
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_lead', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('unsubscribe_lead', () => {
    it('unsubscribes a lead', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ unsubscribed: true }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'unsubscribe_lead', arguments: { email: 'test@example.com' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('list_senders', () => {
    it('returns senders array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([{ _id: 's1', email: 'sender@company.com' }]));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_senders', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(Array.isArray(result)).toBe(true);
    });
});

describe('get_team', () => {
    it('returns team info', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ _id: 't1', name: 'Acme Corp', plan: 'pro' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_team', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.name).toBe('Acme Corp');
    });
});

describe('get_campaign_stats', () => {
    it('returns stats for campaign', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ sendCount: 100, openCount: 40, replyCount: 10 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_campaign_stats', arguments: { campaignId: 'c1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.sendCount).toBe(100);
        expect(result.openCount).toBe(40);
    });

    it('returns -32603 when campaignId missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_campaign_stats', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('uses Basic auth with empty username', () => {
    it('sets correct Authorization header', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([]));
        await worker.fetch(makeReq('tools/call', { name: 'list_campaigns', arguments: {} }));
        const fetchCall = mockFetch.mock.calls[0];
        const authHeader = fetchCall[1].headers['Authorization'];
        expect(authHeader).toMatch(/^Basic /);
        const decoded = atob(authHeader.replace('Basic ', ''));
        expect(decoded).toBe(':test_api_key');
    });
});
