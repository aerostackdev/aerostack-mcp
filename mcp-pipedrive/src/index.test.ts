import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_TOKEN = 'test_pipedrive_token_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockPerson = {
    id: 1001,
    name: 'John Doe',
    email: [{ value: 'john@acme.com', primary: true, label: 'work' }],
    phone: [{ value: '+14155551234', primary: true, label: 'work' }],
    org_id: { value: 2001, name: 'Acme Corp' },
    add_time: '2024-01-01T00:00:00Z',
    update_time: '2024-01-02T00:00:00Z',
    visible_to: '3',
    active_flag: true,
};

const mockDeal = {
    id: 3001,
    title: 'Acme Enterprise Plan',
    value: 50000,
    currency: 'USD',
    status: 'open',
    stage_id: 4001,
    pipeline_id: 5001,
    person_id: { value: 1001, name: 'John Doe' },
    org_id: { value: 2001, name: 'Acme Corp' },
    expected_close_date: '2024-06-30',
    add_time: '2024-01-01T00:00:00Z',
    update_time: '2024-01-10T00:00:00Z',
    lost_reason: null,
    won_time: null,
    lost_time: null,
};

const mockOrg = {
    id: 2001,
    name: 'Acme Corp',
    address: '123 Main St, San Francisco, CA',
    visible_to: '3',
    add_time: '2023-01-01T00:00:00Z',
    update_time: '2024-01-01T00:00:00Z',
    active_flag: true,
    open_deals_count: 3,
};

const mockActivity = {
    id: 6001,
    subject: 'Follow-up call with Acme Corp',
    type: 'call',
    due_date: '2024-02-15',
    due_time: '14:00',
    duration: '00:30',
    done: false,
    deal_id: 3001,
    person_id: 1001,
    org_id: 2001,
    note: 'Discuss Q1 renewal options',
    add_time: '2024-01-10T00:00:00Z',
    update_time: '2024-01-10T00:00:00Z',
};

const mockPipeline = {
    id: 5001,
    name: 'Sales Pipeline',
    active: true,
    order_nr: 1,
    add_time: '2023-01-01T00:00:00Z',
    update_time: '2023-06-01T00:00:00Z',
};

const mockStage = {
    id: 4001,
    name: 'Qualified Lead',
    pipeline_id: 5001,
    pipeline_name: 'Sales Pipeline',
    order_nr: 2,
    active_flag: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pdOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify({ success: true, data }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function pdErr(error: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ success: false, error }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, missingToken = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingToken) headers['X-Mcp-Secret-PIPEDRIVE-API-TOKEN'] = API_TOKEN;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(toolName: string, args: Record<string, unknown> = {}, missingToken = false) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingToken);
}

async function callTool(toolName: string, args: Record<string, unknown> = {}, missingToken = false) {
    const req = makeToolReq(toolName, args, missingToken);
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

// ── Protocol layer ─────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-pipedrive and tools 20', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-pipedrive');
        expect(body.tools).toBe(20);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json{{{',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-pipedrive');
    });

    it('tools/list returns exactly 20 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(20);
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

// ── Auth ───────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing token returns -32001 with helpful message', async () => {
        const body = await callTool('list_deals', {}, true);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('PIPEDRIVE_API_TOKEN');
    });

    it('token is appended to fetch URL as api_token query param', async () => {
        mockFetch.mockReturnValueOnce(pdOk({ data: [mockDeal] }));
        await callTool('list_deals', {});
        const call = mockFetch.mock.calls[0];
        const url = call[0] as string;
        expect(url).toContain(`api_token=${API_TOKEN}`);
    });
});

// ── Persons ────────────────────────────────────────────────────────────────────

describe('search_persons', () => {
    it('returns shaped array of persons', async () => {
        mockFetch.mockReturnValueOnce(pdOk({
            items: [{ item: mockPerson }],
        }));
        const result = await getToolResult('search_persons', { term: 'john' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(1001);
        expect(result[0].name).toBe('John Doe');
        expect(result[0].email).toBe('john@acme.com');
        expect(result[0].org_name).toBe('Acme Corp');
    });

    it('missing term returns validation error', async () => {
        const body = await callTool('search_persons', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('term');
    });

    it('search URL contains term and fields params', async () => {
        mockFetch.mockReturnValueOnce(pdOk({ items: [] }));
        await getToolResult('search_persons', { term: 'john@acme.com' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/persons/search');
        expect(url).toContain('john%40acme.com');
        expect(url).toContain('fields=email,phone,name');
    });
});

describe('get_person', () => {
    it('returns all shaped person fields', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockPerson));
        const result = await getToolResult('get_person', { id: 1001 });
        expect(result.id).toBe(1001);
        expect(result.name).toBe('John Doe');
        expect(result.org_id).toBe(2001);
        expect(result.org_name).toBe('Acme Corp');
        expect(result.active_flag).toBe(true);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_person', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_person', () => {
    it('returns person id and shaped fields', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockPerson));
        const result = await getToolResult('create_person', {
            name: 'John Doe',
            email: ['john@acme.com'],
            phone: ['+14155551234'],
            org_id: 2001,
        });
        expect(result.id).toBe(1001);
        expect(result.name).toBe('John Doe');
        expect(Array.isArray(result.email)).toBe(true);
    });

    it('email in request body uses correct structure', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockPerson));
        await getToolResult('create_person', { name: 'Test', email: ['test@example.com'] });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { email: Array<{ value: string }> };
        expect(reqBody.email[0].value).toBe('test@example.com');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_person', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('update_person', () => {
    it('only sends provided fields in fetch body', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockPerson));
        await getToolResult('update_person', { id: 1001, name: 'Updated Name' });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(reqBody.name).toBe('Updated Name');
        expect(reqBody.email).toBeUndefined();
    });

    it('uses PUT method', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockPerson));
        await getToolResult('update_person', { id: 1001, name: 'Test' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
    });
});

describe('list_person_deals', () => {
    it('returns shaped deals array', async () => {
        mockFetch.mockReturnValueOnce(pdOk([mockDeal]));
        const result = await getToolResult('list_person_deals', { id: 1001 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(3001);
        expect(result[0].title).toBe('Acme Enterprise Plan');
        expect(result[0].status).toBe('open');
    });

    it('URL contains persons/{id}/deals with status=all', async () => {
        mockFetch.mockReturnValueOnce(pdOk([]));
        await getToolResult('list_person_deals', { id: 1001 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/persons/1001/deals');
        expect(url).toContain('status=all');
    });
});

// ── Deals ──────────────────────────────────────────────────────────────────────

describe('list_deals', () => {
    it('returns shaped deals array with person and org names', async () => {
        mockFetch.mockReturnValueOnce(pdOk([mockDeal]));
        const result = await getToolResult('list_deals');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(3001);
        expect(result[0].title).toBe('Acme Enterprise Plan');
        expect(result[0].person_name).toBe('John Doe');
        expect(result[0].org_name).toBe('Acme Corp');
    });

    it('defaults to status=open', async () => {
        mockFetch.mockReturnValueOnce(pdOk([]));
        await getToolResult('list_deals');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=open');
    });

    it('custom status is used in URL', async () => {
        mockFetch.mockReturnValueOnce(pdOk([]));
        await getToolResult('list_deals', { status: 'won' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=won');
    });
});

describe('get_deal', () => {
    it('returns all deal fields', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockDeal));
        const result = await getToolResult('get_deal', { id: 3001 });
        expect(result.id).toBe(3001);
        expect(result.title).toBe('Acme Enterprise Plan');
        expect(result.value).toBe(50000);
        expect(result.currency).toBe('USD');
        expect(result.expected_close_date).toBe('2024-06-30');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_deal', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_deal', () => {
    it('returns deal id and shaped fields', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockDeal));
        const result = await getToolResult('create_deal', {
            title: 'New Enterprise Deal',
            value: 50000,
            person_id: 1001,
            org_id: 2001,
        });
        expect(result.id).toBe(3001);
        expect(result.title).toBe('Acme Enterprise Plan');
        expect(result.status).toBe('open');
    });

    it('uses POST method to /deals', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockDeal));
        await getToolResult('create_deal', { title: 'Test Deal' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/deals');
    });

    it('missing title returns validation error', async () => {
        const body = await callTool('create_deal', { value: 1000 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('title');
    });
});

describe('update_deal', () => {
    it('only sends provided fields', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockDeal));
        await getToolResult('update_deal', { id: 3001, status: 'won' });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(reqBody.status).toBe('won');
        expect(reqBody.title).toBeUndefined();
    });

    it('uses PUT method to /deals/{id}', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockDeal));
        await getToolResult('update_deal', { id: 3001, title: 'Updated Title' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
        expect(call[0] as string).toContain('/deals/3001');
    });
});

describe('update_deal_stage', () => {
    it('sends only stage_id in PUT body', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockDeal));
        const result = await getToolResult('update_deal_stage', { id: 3001, stage_id: 4002 });
        expect(result.id).toBe(3001);
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(reqBody.stage_id).toBe(4002);
        expect(Object.keys(reqBody)).toHaveLength(1);
    });

    it('missing stage_id returns validation error', async () => {
        const body = await callTool('update_deal_stage', { id: 3001 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('stage_id');
    });
});

// ── Organizations ──────────────────────────────────────────────────────────────

describe('search_organizations', () => {
    it('returns shaped org array', async () => {
        mockFetch.mockReturnValueOnce(pdOk({
            items: [{ item: mockOrg }],
        }));
        const result = await getToolResult('search_organizations', { term: 'Acme' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(2001);
        expect(result[0].name).toBe('Acme Corp');
        expect(result[0].open_deals_count).toBe(3);
    });

    it('missing term returns validation error', async () => {
        const body = await callTool('search_organizations', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('term');
    });
});

describe('get_organization', () => {
    it('returns all org fields', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockOrg));
        const result = await getToolResult('get_organization', { id: 2001 });
        expect(result.id).toBe(2001);
        expect(result.name).toBe('Acme Corp');
        expect(result.address).toBe('123 Main St, San Francisco, CA');
        expect(result.open_deals_count).toBe(3);
        expect(result.active_flag).toBe(true);
    });
});

describe('create_organization', () => {
    it('returns org id and shaped fields', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockOrg));
        const result = await getToolResult('create_organization', {
            name: 'New Corp',
            address: '456 New St',
        });
        expect(result.id).toBe(2001);
        expect(result.name).toBe('Acme Corp');
    });

    it('uses POST method to /organizations', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockOrg));
        await getToolResult('create_organization', { name: 'Test Corp' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/organizations');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_organization', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('list_organization_deals', () => {
    it('returns shaped deals array', async () => {
        mockFetch.mockReturnValueOnce(pdOk([mockDeal]));
        const result = await getToolResult('list_organization_deals', { id: 2001 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(3001);
        expect(result[0].title).toBe('Acme Enterprise Plan');
    });

    it('URL contains organizations/{id}/deals with status=all', async () => {
        mockFetch.mockReturnValueOnce(pdOk([]));
        await getToolResult('list_organization_deals', { id: 2001 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/organizations/2001/deals');
        expect(url).toContain('status=all');
    });
});

// ── Activities ─────────────────────────────────────────────────────────────────

describe('list_activities', () => {
    it('returns shaped activities array', async () => {
        mockFetch.mockReturnValueOnce(pdOk([mockActivity]));
        const result = await getToolResult('list_activities');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(6001);
        expect(result[0].subject).toBe('Follow-up call with Acme Corp');
        expect(result[0].type).toBe('call');
        expect(result[0].done).toBe(false);
    });

    it('with type filter adds type to URL', async () => {
        mockFetch.mockReturnValueOnce(pdOk([]));
        await getToolResult('list_activities', { type: 'meeting' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('type=meeting');
    });

    it('with due_date filter adds due_date to URL', async () => {
        mockFetch.mockReturnValueOnce(pdOk([]));
        await getToolResult('list_activities', { due_date: '2024-02-15' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('due_date=2024-02-15');
    });
});

describe('get_activity', () => {
    it('returns all activity fields', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockActivity));
        const result = await getToolResult('get_activity', { id: 6001 });
        expect(result.id).toBe(6001);
        expect(result.subject).toBe('Follow-up call with Acme Corp');
        expect(result.type).toBe('call');
        expect(result.deal_id).toBe(3001);
        expect(result.note).toBe('Discuss Q1 renewal options');
    });
});

describe('create_activity', () => {
    it('returns activity id and shaped fields', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockActivity));
        const result = await getToolResult('create_activity', {
            subject: 'Initial Call',
            type: 'call',
            due_date: '2024-02-15',
            deal_id: 3001,
        });
        expect(result.id).toBe(6001);
        expect(result.subject).toBe('Follow-up call with Acme Corp');
        expect(result.type).toBe('call');
    });

    it('done=true is serialized as 1 in request body', async () => {
        mockFetch.mockReturnValueOnce(pdOk(mockActivity));
        await getToolResult('create_activity', { subject: 'Done task', type: 'task', done: true });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { done: number };
        expect(reqBody.done).toBe(1);
    });

    it('missing subject returns validation error', async () => {
        const body = await callTool('create_activity', { type: 'call' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('subject');
    });

    it('missing type returns validation error', async () => {
        const body = await callTool('create_activity', { subject: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('type');
    });
});

describe('complete_activity', () => {
    it('sends done=1 in PUT body and returns shaped result', async () => {
        mockFetch.mockReturnValueOnce(pdOk({ ...mockActivity, done: true }));
        const result = await getToolResult('complete_activity', { id: 6001 });
        expect(result.id).toBe(6001);
        expect(result.done).toBe(true);
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
        const reqBody = JSON.parse(call[1].body as string) as { done: number };
        expect(reqBody.done).toBe(1);
    });
});

// ── Pipeline & Stages ──────────────────────────────────────────────────────────

describe('list_pipelines', () => {
    it('returns shaped pipelines array', async () => {
        mockFetch.mockReturnValueOnce(pdOk([mockPipeline]));
        const result = await getToolResult('list_pipelines');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(5001);
        expect(result[0].name).toBe('Sales Pipeline');
        expect(result[0].active).toBe(true);
        expect(result[0].order_nr).toBe(1);
    });

    it('calls GET /pipelines endpoint', async () => {
        mockFetch.mockReturnValueOnce(pdOk([]));
        await getToolResult('list_pipelines');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/pipelines');
    });
});

describe('list_stages', () => {
    it('returns shaped stages array', async () => {
        mockFetch.mockReturnValueOnce(pdOk([mockStage]));
        const result = await getToolResult('list_stages', { pipeline_id: 5001 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(4001);
        expect(result[0].name).toBe('Qualified Lead');
        expect(result[0].pipeline_id).toBe(5001);
        expect(result[0].pipeline_name).toBe('Sales Pipeline');
    });

    it('URL contains pipeline_id query param', async () => {
        mockFetch.mockReturnValueOnce(pdOk([]));
        await getToolResult('list_stages', { pipeline_id: 5001 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/stages');
        expect(url).toContain('pipeline_id=5001');
    });

    it('missing pipeline_id returns validation error', async () => {
        const body = await callTool('list_stages', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('pipeline_id');
    });
});

// ── Error mapping ──────────────────────────────────────────────────────────────

describe('Error mapping', () => {
    it('401 → message contains "Authentication failed"', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
        )));
        const body = await callTool('list_deals', {});
        expect(body.error!.message).toContain('Authentication failed');
    });

    it('404 → message contains "Not found"', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ error: 'Not found', success: false }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
        )));
        const body = await callTool('get_deal', { id: 99999 });
        expect(body.error!.message).toContain('Not found');
    });
});

// ── E2E tests (skipped unless env vars set) ────────────────────────────────────

describe.skipIf(!process.env.PIPEDRIVE_API_TOKEN)('E2E — real Pipedrive API', () => {
    const e2eToken = process.env.PIPEDRIVE_API_TOKEN!;

    function makeE2EReq(toolName: string, args: Record<string, unknown>) {
        return new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-PIPEDRIVE-API-TOKEN': e2eToken,
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: toolName, arguments: args },
            }),
        });
    }

    it('list_pipelines returns array', async () => {
        vi.restoreAllMocks();
        const req = makeE2EReq('list_pipelines', {});
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text);
        expect(Array.isArray(result)).toBe(true);
    });

    it('list_deals returns array', async () => {
        vi.restoreAllMocks();
        const req = makeE2EReq('list_deals', {});
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text);
        expect(Array.isArray(result)).toBe(true);
    });

    it('search_persons returns array for empty-ish term', async () => {
        vi.restoreAllMocks();
        const req = makeE2EReq('search_persons', { term: 'a' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
    });
});
