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
    'X-Mcp-Secret-ZOHO-CRM-ACCESS-TOKEN': 'test_token',
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
    it('returns status ok', async () => {
        const req = new Request('http://localhost/health');
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-zoho-crm');
        expect(body.version).toBe('1.0.0');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────
describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-zoho-crm');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 20 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(20);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_leads');
        expect(names).toContain('create_deal');
        expect(names).toContain('get_modules');
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
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_leads', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

describe('invalid JSON', () => {
    it('returns -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-json',
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
    });
});

// ── list_leads ────────────────────────────────────────────────────────────────
describe('list_leads', () => {
    it('returns leads with info', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ id: '1', Last_Name: 'Smith', Email: 'smith@example.com' }],
            info: { count: 1, more_records: false },
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_leads', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.leads).toHaveLength(1);
        expect(result.info.count).toBe(1);
    });

    it('uses default fields', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [], info: {} }));
        await worker.fetch(makeReq('tools/call', { name: 'list_leads', arguments: {} }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('First_Name');
    });
});

// ── create_lead ───────────────────────────────────────────────────────────────
describe('create_lead', () => {
    it('creates lead and returns id', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ code: 'SUCCESS', details: { id: 'lead123' }, message: 'record added' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_lead',
            arguments: { last_name: 'Smith', email: 'smith@example.com', company: 'Acme' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('lead123');
        expect(result.message).toBe('record added');
    });

    it('wraps body in data array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [{ code: 'SUCCESS', details: { id: 'x' } }] }));
        await worker.fetch(makeReq('tools/call', {
            name: 'create_lead',
            arguments: { last_name: 'Jones' },
        }));
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(Array.isArray(reqBody.data)).toBe(true);
        expect(reqBody.data[0].Last_Name).toBe('Jones');
    });

    it('returns -32603 when last_name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_lead',
            arguments: { email: 'x@x.com' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── get_lead ──────────────────────────────────────────────────────────────────
describe('get_lead', () => {
    it('returns lead data', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [{ id: '1', Last_Name: 'Doe' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_lead', arguments: { id: '1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.Last_Name).toBe('Doe');
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_lead', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── update_lead ───────────────────────────────────────────────────────────────
describe('update_lead', () => {
    it('updates and returns id', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ code: 'SUCCESS', details: { id: 'lead123' }, message: 'record updated' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_lead',
            arguments: { id: 'lead123', email: 'new@email.com' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('lead123');
    });
});

// ── delete_lead ───────────────────────────────────────────────────────────────
describe('delete_lead', () => {
    it('deletes lead and returns success', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [{ code: 'SUCCESS' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'delete_lead', arguments: { id: 'lead123' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.id).toBe('lead123');
    });
});

// ── create_deal ───────────────────────────────────────────────────────────────
describe('create_deal', () => {
    it('creates deal and returns id', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ code: 'SUCCESS', details: { id: 'deal456' }, message: 'record added' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_deal',
            arguments: { deal_name: 'Big Deal', stage: 'Qualification', amount: 50000 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('deal456');
    });

    it('returns -32603 when stage missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_deal',
            arguments: { deal_name: 'Deal' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_deals ────────────────────────────────────────────────────────────────
describe('list_deals', () => {
    it('returns deals array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ id: 'd1', Deal_Name: 'Test Deal', Stage: 'Proposal' }],
            info: { count: 1 },
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_deals', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.deals).toHaveLength(1);
        expect(result.deals[0].Deal_Name).toBe('Test Deal');
    });
});

// ── create_account ────────────────────────────────────────────────────────────
describe('create_account', () => {
    it('creates account', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ code: 'SUCCESS', details: { id: 'acc789' }, message: 'record added' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_account',
            arguments: { account_name: 'Acme Corp', industry: 'Technology' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('acc789');
    });

    it('returns -32603 when account_name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_account',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── create_task ───────────────────────────────────────────────────────────────
describe('create_task', () => {
    it('creates task with defaults', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ code: 'SUCCESS', details: { id: 'task001' }, message: 'record added' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_task',
            arguments: { subject: 'Follow up call' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('task001');
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.data[0].Status).toBe('Not Started');
        expect(reqBody.data[0].Priority).toBe('Normal');
    });
});

// ── get_modules ───────────────────────────────────────────────────────────────
describe('get_modules', () => {
    it('returns mapped modules', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            modules: [
                { api_name: 'Leads', module_name: 'Leads', singular_label: 'Lead', plural_label: 'Leads' },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_modules', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result[0].api_name).toBe('Leads');
        expect(result[0].singular_label).toBe('Lead');
    });
});

// ── search_records ────────────────────────────────────────────────────────────
describe('search_records', () => {
    it('searches records by module', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ id: 'c1', Last_Name: 'Smith' }],
            info: { count: 1 },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_records',
            arguments: { module: 'Contacts', criteria: '(Email:equals:smith@example.com)' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.records).toHaveLength(1);
    });

    it('returns -32603 when module missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_records',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
