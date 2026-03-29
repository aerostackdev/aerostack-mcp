import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'test_attio_token_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockPerson = {
    id: { record_id: 'rec_person_001' },
    values: {
        name: [{ first_name: 'Jane', last_name: 'Smith' }],
        email_addresses: [{ email_address: 'jane.smith@acme.com' }],
        phone_numbers: [{ phone_number: '+15550001234' }],
    },
};

const mockCompany = {
    id: { record_id: 'rec_company_001' },
    values: {
        name: [{ value: 'Acme Corp' }],
        domains: [{ domain: 'acme.com' }],
        description: 'Leading technology company',
        employee_range: '51-200',
    },
};

const mockDeal = {
    id: { record_id: 'rec_deal_001' },
    values: {
        name: [{ value: 'Acme Q1 2026' }],
        stage: [{ status: 'Qualification' }],
        value: [{ currency_value: 75000, currency_code: 'USD' }],
    },
};

const mockNote = {
    id: { note_id: 'note_001' },
    parent_object: 'people',
    parent_record_id: 'rec_person_001',
    title: 'Call summary',
    content: 'Discussed pricing options',
};

const mockTask = {
    id: { task_id: 'task_001' },
    content: 'Follow up on proposal',
    deadline_at: '2026-06-30T17:00:00.000Z',
    is_completed: false,
};

const mockMember = {
    id: { workspace_member_id: 'mem_001' },
    first_name: 'Alice',
    last_name: 'Nguyen',
    email_address: 'alice@acme.com',
};

const mockSelf = {
    workspace_member_id: 'mem_001',
    first_name: 'Alice',
    email_address: 'alice@acme.com',
};

function mockListResponse(data: unknown[]) {
    return { data, next_cursor: null };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function apiErr(body: unknown, status = 400) {
    return Promise.resolve(new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('token')) {
        headers['X-Mcp-Secret-ATTIO-ACCESS-TOKEN'] = ACCESS_TOKEN;
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
) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingSecrets);
}

async function callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    const req = makeToolReq(toolName, args, missingSecrets);
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

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-attio and tools 23', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-attio');
        expect(body.tools).toBe(23);
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
        const body = await res.json() as {
            result: { protocolVersion: string; serverInfo: { name: string } };
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-attio');
    });

    it('tools/list returns exactly 23 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
        };
        expect(body.result.tools).toHaveLength(23);
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
    it('missing token returns -32001 with ATTIO_ACCESS_TOKEN in message', async () => {
        const body = await callTool('list_people', {}, ['token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('ATTIO_ACCESS_TOKEN');
    });

    it('Authorization header uses Bearer token format', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockListResponse([mockPerson])));
        await callTool('list_people', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it('unknown tool returns -32601', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
    });
});

// ── People ────────────────────────────────────────────────────────────────────

describe('list_people', () => {
    it('returns list of people records', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockListResponse([mockPerson])));
        const result = await getToolResult('list_people', {});
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id.record_id).toBe('rec_person_001');
    });

    it('sends request to /objects/people/records with default limit', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockListResponse([])));
        await callTool('list_people', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/objects/people/records');
        expect(url).toContain('limit=20');
        expect(url).toContain('offset=0');
    });

    it('respects custom limit and offset', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockListResponse([])));
        await callTool('list_people', { limit: 50, offset: 100 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('limit=50');
        expect(url).toContain('offset=100');
    });
});

describe('get_person', () => {
    it('returns person record by record_id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockPerson }));
        const result = await getToolResult('get_person', { record_id: 'rec_person_001' });
        expect(result.data.id.record_id).toBe('rec_person_001');
        expect(result.data.values.name[0].first_name).toBe('Jane');
    });

    it('calls correct URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockPerson }));
        await callTool('get_person', { record_id: 'rec_person_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/objects/people/records/rec_person_001');
    });

    it('missing record_id returns validation error', async () => {
        const body = await callTool('get_person', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('record_id');
    });
});

describe('create_person', () => {
    it('returns created person with record_id', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockPerson }));
        const result = await getToolResult('create_person', {
            name: [{ first_name: 'Jane', last_name: 'Smith' }],
            email_addresses: [{ email_address: 'jane.smith@acme.com' }],
        });
        expect(result.data.id.record_id).toBe('rec_person_001');
    });

    it('sends POST to /objects/people/records', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockPerson }));
        await callTool('create_person', { name: [{ first_name: 'Jane', last_name: 'Smith' }] });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/objects/people/records');
        const body = JSON.parse(call[1].body as string);
        expect(body.data.values.name).toEqual([{ first_name: 'Jane', last_name: 'Smith' }]);
    });
});

describe('update_person', () => {
    it('sends PATCH to correct URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockPerson }));
        await callTool('update_person', {
            record_id: 'rec_person_001',
            email_addresses: [{ email_address: 'new@acme.com' }],
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('PATCH');
        expect(call[0]).toContain('/objects/people/records/rec_person_001');
        const body = JSON.parse(call[1].body as string);
        expect(body.data.values.email_addresses).toBeDefined();
    });

    it('missing record_id returns validation error', async () => {
        const body = await callTool('update_person', { email_addresses: [] });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('record_id');
    });
});

describe('delete_person', () => {
    it('sends DELETE to correct URL and returns 204', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        const result = await getToolResult('delete_person', { record_id: 'rec_person_001' });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('DELETE');
        expect(call[0]).toContain('/objects/people/records/rec_person_001');
    });

    it('missing record_id returns validation error', async () => {
        const body = await callTool('delete_person', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('record_id');
    });
});

// ── Companies ─────────────────────────────────────────────────────────────────

describe('list_companies', () => {
    it('returns list of company records', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockListResponse([mockCompany])));
        const result = await getToolResult('list_companies', {});
        expect(result.data).toHaveLength(1);
        expect(result.data[0].values.name[0].value).toBe('Acme Corp');
    });

    it('sends request to /objects/companies/records', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockListResponse([])));
        await callTool('list_companies', { limit: 10 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/objects/companies/records');
        expect(url).toContain('limit=10');
    });
});

describe('get_company', () => {
    it('returns company record', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockCompany }));
        const result = await getToolResult('get_company', { record_id: 'rec_company_001' });
        expect(result.data.values.domains[0].domain).toBe('acme.com');
    });

    it('missing record_id returns validation error', async () => {
        const body = await callTool('get_company', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('record_id');
    });
});

describe('create_company', () => {
    it('sends POST to /objects/companies/records', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockCompany }));
        await callTool('create_company', {
            name: [{ value: 'Acme Corp' }],
            domains: [{ domain: 'acme.com' }],
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/objects/companies/records');
        const body = JSON.parse(call[1].body as string);
        expect(body.data.values.name).toEqual([{ value: 'Acme Corp' }]);
    });
});

describe('update_company', () => {
    it('sends PATCH with updated fields', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockCompany }));
        await callTool('update_company', {
            record_id: 'rec_company_001',
            employee_range: '201-500',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('PATCH');
        const body = JSON.parse(call[1].body as string);
        expect(body.data.values.employee_range).toBe('201-500');
    });

    it('missing record_id returns validation error', async () => {
        const body = await callTool('update_company', { description: 'test' });
        expect(body.error).toBeDefined();
    });
});

describe('delete_company', () => {
    it('sends DELETE to /objects/companies/records/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await callTool('delete_company', { record_id: 'rec_company_001' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('DELETE');
        expect(call[0]).toContain('/objects/companies/records/rec_company_001');
    });

    it('missing record_id returns validation error', async () => {
        const body = await callTool('delete_company', {});
        expect(body.error).toBeDefined();
    });
});

// ── Deals ─────────────────────────────────────────────────────────────────────

describe('list_deals', () => {
    it('returns list of deal records', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockListResponse([mockDeal])));
        const result = await getToolResult('list_deals', {});
        expect(result.data).toHaveLength(1);
        expect(result.data[0].values.stage[0].status).toBe('Qualification');
    });

    it('sends request to /objects/deals/records', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockListResponse([])));
        await callTool('list_deals', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/objects/deals/records');
    });
});

describe('get_deal', () => {
    it('returns deal record', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockDeal }));
        const result = await getToolResult('get_deal', { record_id: 'rec_deal_001' });
        expect(result.data.values.value[0].currency_value).toBe(75000);
    });

    it('missing record_id returns validation error', async () => {
        const body = await callTool('get_deal', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('record_id');
    });
});

describe('create_deal', () => {
    it('sends POST with name, stage, and value', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockDeal }));
        await callTool('create_deal', {
            name: [{ value: 'Acme Q1 2026' }],
            stage: [{ status: 'Qualification' }],
            value: [{ currency_value: 75000, currency_code: 'USD' }],
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.data.values.stage[0].status).toBe('Qualification');
        expect(body.data.values.value[0].currency_code).toBe('USD');
    });
});

describe('update_deal', () => {
    it('sends PATCH with stage update', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockDeal }));
        await callTool('update_deal', {
            record_id: 'rec_deal_001',
            stage: [{ status: 'Closed Won' }],
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('PATCH');
        const body = JSON.parse(call[1].body as string);
        expect(body.data.values.stage[0].status).toBe('Closed Won');
    });

    it('missing record_id returns validation error', async () => {
        const body = await callTool('update_deal', { stage: [] });
        expect(body.error).toBeDefined();
    });
});

describe('delete_deal', () => {
    it('sends DELETE to /objects/deals/records/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await callTool('delete_deal', { record_id: 'rec_deal_001' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('DELETE');
        expect(call[0]).toContain('/objects/deals/records/rec_deal_001');
    });

    it('missing record_id returns validation error', async () => {
        const body = await callTool('delete_deal', {});
        expect(body.error).toBeDefined();
    });
});

// ── Records ───────────────────────────────────────────────────────────────────

describe('search_records', () => {
    it('sends POST to /objects/:slug/records/query', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockListResponse([mockPerson])));
        await callTool('search_records', {
            object_slug: 'people',
            filter: { name: { $str_contains: 'Jane' } },
            limit: 10,
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/objects/people/records/query');
        const body = JSON.parse(call[1].body as string);
        expect(body.filter).toBeDefined();
        expect(body.limit).toBe(10);
    });

    it('missing object_slug returns validation error', async () => {
        const body = await callTool('search_records', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('object_slug');
    });

    it('works without filter (returns all records)', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockListResponse([mockCompany])));
        const result = await getToolResult('search_records', { object_slug: 'companies' });
        expect(result.data).toHaveLength(1);
    });
});

describe('list_record_entries', () => {
    it('calls correct entries URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [] }));
        await callTool('list_record_entries', {
            object_slug: 'people',
            record_id: 'rec_person_001',
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/objects/people/records/rec_person_001/entries');
    });

    it('missing object_slug returns validation error', async () => {
        const body = await callTool('list_record_entries', { record_id: 'rec_person_001' });
        expect(body.error).toBeDefined();
    });

    it('missing record_id returns validation error', async () => {
        const body = await callTool('list_record_entries', { object_slug: 'people' });
        expect(body.error).toBeDefined();
    });
});

describe('create_note', () => {
    it('sends POST to /notes with correct payload', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockNote }));
        await callTool('create_note', {
            object_slug: 'people',
            record_id: 'rec_person_001',
            title: 'Call summary',
            text: 'Discussed pricing options',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/notes');
        const body = JSON.parse(call[1].body as string);
        expect(body.data.parent_object).toBe('people');
        expect(body.data.parent_record_id).toBe('rec_person_001');
        expect(body.data.title).toBe('Call summary');
        expect(body.data.content).toBe('Discussed pricing options');
        expect(body.data.format).toBe('plaintext');
    });

    it('missing required fields returns validation error', async () => {
        const body = await callTool('create_note', { object_slug: 'people', record_id: 'rec_001' });
        expect(body.error).toBeDefined();
    });
});

describe('list_notes', () => {
    it('sends GET with parent_object and parent_record_id params', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [mockNote] }));
        await callTool('list_notes', { object_slug: 'people', record_id: 'rec_person_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/notes');
        expect(url).toContain('parent_object=people');
        expect(url).toContain('parent_record_id=rec_person_001');
    });

    it('missing record_id returns validation error', async () => {
        const body = await callTool('list_notes', { object_slug: 'people' });
        expect(body.error).toBeDefined();
    });
});

// ── Tasks & Members ───────────────────────────────────────────────────────────

describe('list_tasks', () => {
    it('returns list of tasks', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [mockTask] }));
        const result = await getToolResult('list_tasks', {});
        expect(result.data).toHaveLength(1);
        expect(result.data[0].content).toBe('Follow up on proposal');
    });

    it('sends GET to /tasks without filters', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [] }));
        await callTool('list_tasks', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/tasks');
    });

    it('appends is_completed filter when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [] }));
        await callTool('list_tasks', { is_completed: false });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('is_completed=false');
    });

    it('appends record_id filter when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [] }));
        await callTool('list_tasks', { record_id: 'rec_person_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('linked_record_id=rec_person_001');
    });
});

describe('create_task', () => {
    it('sends POST to /tasks with content and deadline', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockTask }));
        await callTool('create_task', {
            content: 'Follow up on proposal',
            deadline_at: '2026-06-30T17:00:00.000Z',
            linked_records: [{ target_object: 'people', target_record_id: 'rec_person_001' }],
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect(call[0]).toContain('/tasks');
        const body = JSON.parse(call[1].body as string);
        expect(body.data.content).toBe('Follow up on proposal');
        expect(body.data.deadline_at).toBe('2026-06-30T17:00:00.000Z');
        expect(body.data.linked_records[0].target_object).toBe('people');
    });

    it('missing content returns validation error', async () => {
        const body = await callTool('create_task', { deadline_at: '2026-06-30T17:00:00.000Z' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('content');
    });
});

describe('list_workspace_members', () => {
    it('returns list of workspace members', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [mockMember] }));
        const result = await getToolResult('list_workspace_members', {});
        expect(result.data).toHaveLength(1);
        expect(result.data[0].first_name).toBe('Alice');
    });

    it('sends GET to /workspace_members', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: [mockMember] }));
        await callTool('list_workspace_members', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/workspace_members');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('calls GET /self and returns user info', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSelf));
        const result = await getToolResult('_ping', {});
        expect(result.workspace_member_id).toBe('mem_001');
        expect(result.email_address).toBe('alice@acme.com');
    });

    it('sends GET to /v2/self', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSelf));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/self');
    });

    it('returns API error on invalid token', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ message: 'Unauthorized' }, 401));
        const body = await callTool('_ping', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('401');
    });
});

// ── API error handling ────────────────────────────────────────────────────────

describe('API error handling', () => {
    it('propagates HTTP 404 as -32603 error', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ message: 'Record not found' }, 404));
        const body = await callTool('get_person', { record_id: 'nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('404');
    });

    it('propagates HTTP 429 rate limit as -32603 error', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ message: 'Rate limit exceeded' }, 429));
        const body = await callTool('list_people', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });

    it('handles non-JSON response body gracefully', async () => {
        mockFetch.mockReturnValueOnce(
            Promise.resolve(new Response('Internal Server Error', {
                status: 500,
                headers: { 'Content-Type': 'text/plain' },
            })),
        );
        const body = await callTool('list_companies', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });
});
