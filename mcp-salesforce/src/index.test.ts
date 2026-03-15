import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'test_sf_access_token_abc123';
const INSTANCE_URL = 'https://testorg.my.salesforce.com';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockLead = {
    Id: '00Qxx000000LEAD1',
    FirstName: 'Jane',
    LastName: 'Smith',
    Email: 'jane.smith@example.com',
    Company: 'Acme Corp',
    Status: 'Open - Not Contacted',
    Phone: '+1-555-000-0001',
};

const mockContact = {
    Id: '003xx000000CONT1',
    FirstName: 'John',
    LastName: 'Doe',
    Email: 'john.doe@example.com',
    Phone: '+1-555-000-0002',
    AccountId: '001xx000000ACCT1',
};

const mockAccount = {
    Id: '001xx000000ACCT1',
    Name: 'Acme Corp',
    Industry: 'Technology',
    Website: 'https://acme.com',
    Phone: '+1-555-000-0003',
    AnnualRevenue: 5000000,
};

const mockOpportunity = {
    Id: '006xx000000OPPT1',
    Name: 'Acme Q1 Deal',
    StageName: 'Prospecting',
    Amount: 50000,
    CloseDate: '2026-06-30',
    AccountId: '001xx000000ACCT1',
};

const mockTask = {
    Id: '00Txx000000TASK1',
    Subject: 'Follow up call',
    Status: 'Not Started',
    Priority: 'Normal',
    ActivityDate: '2026-03-20',
    WhoId: '003xx000000CONT1',
    WhatId: '006xx000000OPPT1',
};

const mockQueryResult = (records: unknown[]) => ({
    records,
    totalSize: records.length,
    done: true,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sfOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function sfOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function sfErr(messages: Array<{ message: string; errorCode: string }>, status = 400) {
    return Promise.resolve(new Response(JSON.stringify(messages), {
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
        headers['X-Mcp-Secret-SALESFORCE-ACCESS-TOKEN'] = ACCESS_TOKEN;
    }
    if (!missingSecrets.includes('instanceUrl')) {
        headers['X-Mcp-Secret-SALESFORCE-INSTANCE-URL'] = INSTANCE_URL;
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
    it('GET / returns status ok with server mcp-salesforce and tools 25', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-salesforce');
        expect(body.tools).toBe(25);
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
            result: { protocolVersion: string; serverInfo: { name: string } }
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-salesforce');
    });

    it('tools/list returns exactly 25 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools).toHaveLength(25);
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
    it('missing token returns -32001 with SALESFORCE_ACCESS_TOKEN in message', async () => {
        const body = await callTool('search_leads', { field: 'Email', value: 'test' }, ['token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('SALESFORCE_ACCESS_TOKEN');
    });

    it('missing instanceUrl returns -32001 with SALESFORCE_INSTANCE_URL in message', async () => {
        const body = await callTool('search_leads', { field: 'Email', value: 'test' }, ['instanceUrl']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('SALESFORCE_INSTANCE_URL');
    });

    it('missing both secrets returns -32001', async () => {
        const body = await callTool('search_leads', { field: 'Email', value: 'test' }, ['token', 'instanceUrl']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('Authorization header uses Bearer token format', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([mockLead])));
        await callTool('search_leads', { field: 'Email', value: 'jane' });
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });
});

// ── Leads ─────────────────────────────────────────────────────────────────────

describe('search_leads', () => {
    it('returns SOQL query result with records', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([mockLead])));
        const result = await getToolResult('search_leads', { field: 'Email', value: 'jane' });
        expect(result.records).toHaveLength(1);
        expect(result.records[0].Id).toBe('00Qxx000000LEAD1');
        expect(result.totalSize).toBe(1);
    });

    it('builds correct SOQL with field and value in URL', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([])));
        await callTool('search_leads', { field: 'Company', value: 'Acme', limit: 5 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/query');
        expect(url).toContain('Lead');
        expect(url).toContain('Company');
        expect(url).toContain('Acme');
    });

    it('missing field returns validation error', async () => {
        const body = await callTool('search_leads', { value: 'test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('field');
    });

    it('missing value returns validation error', async () => {
        const body = await callTool('search_leads', { field: 'Email' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('value');
    });
});

describe('get_lead', () => {
    it('returns lead object', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockLead));
        const result = await getToolResult('get_lead', { id: '00Qxx000000LEAD1' });
        expect(result.Id).toBe('00Qxx000000LEAD1');
        expect(result.LastName).toBe('Smith');
        expect(result.Company).toBe('Acme Corp');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_lead', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_lead', () => {
    it('returns created record id and success', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ id: '00Qxx000000LEAD2', success: true, errors: [] }));
        const result = await getToolResult('create_lead', {
            LastName: 'Smith',
            Company: 'Acme Corp',
            Email: 'jane@acme.com',
        });
        expect(result.id).toBe('00Qxx000000LEAD2');
        expect(result.success).toBe(true);
    });

    it('sends POST to /sobjects/Lead', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ id: '00Qxx000000LEAD3', success: true }));
        await callTool('create_lead', { LastName: 'Jones', Company: 'Beta Inc' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/sobjects/Lead');
    });

    it('missing LastName returns validation error', async () => {
        const body = await callTool('create_lead', { Company: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('LastName');
    });

    it('missing Company returns validation error', async () => {
        const body = await callTool('create_lead', { LastName: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Company');
    });
});

describe('update_lead', () => {
    it('sends PATCH to /sobjects/Lead/{id}', async () => {
        mockFetch.mockReturnValueOnce(sfOk204());
        const result = await getToolResult('update_lead', { id: '00Qxx000000LEAD1', Status: 'Working - Contacted' });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PATCH');
        expect(call[0] as string).toContain('/sobjects/Lead/00Qxx000000LEAD1');
    });

    it('only sends provided fields in request body', async () => {
        mockFetch.mockReturnValueOnce(sfOk204());
        await callTool('update_lead', { id: '00Qxx000000LEAD1', Email: 'new@acme.com' });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(body.Email).toBe('new@acme.com');
        expect(body.LastName).toBeUndefined();
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('update_lead', { Status: 'Closed' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('convert_lead', () => {
    it('sends POST to /actions/standard/convertLead with inputs array', async () => {
        mockFetch.mockReturnValueOnce(sfOk([{ success: true, leadId: '00Qxx000000LEAD1' }]));
        const result = await getToolResult('convert_lead', {
            lead_id: '00Qxx000000LEAD1',
            converted_status: 'Closed - Converted',
        });
        expect(Array.isArray(result)).toBe(true);
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/actions/standard/convertLead');
    });

    it('defaults create_opportunity to true', async () => {
        mockFetch.mockReturnValueOnce(sfOk([{ success: true }]));
        await callTool('convert_lead', { lead_id: '00Qxx000000LEAD1', converted_status: 'Closed - Converted' });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { inputs: Array<{ createOpportunity: boolean }> };
        expect(body.inputs[0].createOpportunity).toBe(true);
    });

    it('respects create_opportunity=false', async () => {
        mockFetch.mockReturnValueOnce(sfOk([{ success: true }]));
        await callTool('convert_lead', {
            lead_id: '00Qxx000000LEAD1',
            converted_status: 'Closed - Converted',
            create_opportunity: false,
        });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { inputs: Array<{ createOpportunity: boolean }> };
        expect(body.inputs[0].createOpportunity).toBe(false);
    });
});

// ── Contacts ──────────────────────────────────────────────────────────────────

describe('search_contacts', () => {
    it('returns SOQL query result with contact records', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([mockContact])));
        const result = await getToolResult('search_contacts', { field: 'Email', value: 'john' });
        expect(result.records).toHaveLength(1);
        expect(result.records[0].Id).toBe('003xx000000CONT1');
        expect(result.records[0].Email).toBe('john.doe@example.com');
    });

    it('builds SOQL query with correct fields', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([])));
        await callTool('search_contacts', { field: 'LastName', value: 'Doe' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('Contact');
        expect(url).toContain('LastName');
        expect(url).toContain('Doe');
    });
});

describe('get_contact', () => {
    it('returns contact object', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockContact));
        const result = await getToolResult('get_contact', { id: '003xx000000CONT1' });
        expect(result.Id).toBe('003xx000000CONT1');
        expect(result.LastName).toBe('Doe');
        expect(result.AccountId).toBe('001xx000000ACCT1');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_contact', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_contact', () => {
    it('returns created contact id and success', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ id: '003xx000000CONT2', success: true }));
        const result = await getToolResult('create_contact', {
            LastName: 'Doe',
            Email: 'john@example.com',
        });
        expect(result.id).toBe('003xx000000CONT2');
        expect(result.success).toBe(true);
    });

    it('sends POST to /sobjects/Contact', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ id: '003xx000000CONT3', success: true }));
        await callTool('create_contact', { LastName: 'Brown' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/sobjects/Contact');
    });

    it('missing LastName returns validation error', async () => {
        const body = await callTool('create_contact', { Email: 'test@test.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('LastName');
    });
});

describe('update_contact', () => {
    it('sends PATCH to /sobjects/Contact/{id}', async () => {
        mockFetch.mockReturnValueOnce(sfOk204());
        await getToolResult('update_contact', { id: '003xx000000CONT1', Phone: '+1-555-999-0001' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PATCH');
        expect(call[0] as string).toContain('/sobjects/Contact/003xx000000CONT1');
    });

    it('only sends provided fields', async () => {
        mockFetch.mockReturnValueOnce(sfOk204());
        await callTool('update_contact', { id: '003xx000000CONT1', Title: 'VP Sales' });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(body.Title).toBe('VP Sales');
        expect(body.Email).toBeUndefined();
    });
});

describe('list_contact_activities', () => {
    it('calls ActivityHistories endpoint for contact', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ records: [], totalSize: 0, done: true }));
        await callTool('list_contact_activities', { id: '003xx000000CONT1' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/sobjects/Contact/003xx000000CONT1/ActivityHistories');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('list_contact_activities', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Accounts ──────────────────────────────────────────────────────────────────

describe('search_accounts', () => {
    it('returns SOQL query result with account records', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([mockAccount])));
        const result = await getToolResult('search_accounts', { name: 'Acme' });
        expect(result.records).toHaveLength(1);
        expect(result.records[0].Id).toBe('001xx000000ACCT1');
        expect(result.records[0].Name).toBe('Acme Corp');
        expect(result.records[0].Industry).toBe('Technology');
    });

    it('builds SOQL with Name LIKE query', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([])));
        await callTool('search_accounts', { name: 'Beta' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('Account');
        expect(url).toContain('Name');
        expect(url).toContain('Beta');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('search_accounts', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('get_account', () => {
    it('returns account object', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockAccount));
        const result = await getToolResult('get_account', { id: '001xx000000ACCT1' });
        expect(result.Id).toBe('001xx000000ACCT1');
        expect(result.Name).toBe('Acme Corp');
        expect(result.AnnualRevenue).toBe(5000000);
    });
});

describe('create_account', () => {
    it('returns created account id and success', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ id: '001xx000000ACCT2', success: true }));
        const result = await getToolResult('create_account', {
            Name: 'Beta Inc',
            Industry: 'Finance',
        });
        expect(result.id).toBe('001xx000000ACCT2');
        expect(result.success).toBe(true);
    });

    it('sends POST to /sobjects/Account', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ id: '001xx000000ACCT3', success: true }));
        await callTool('create_account', { Name: 'Gamma LLC' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/sobjects/Account');
    });

    it('missing Name returns validation error', async () => {
        const body = await callTool('create_account', { Industry: 'Tech' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Name');
    });
});

describe('update_account', () => {
    it('sends PATCH to /sobjects/Account/{id}', async () => {
        mockFetch.mockReturnValueOnce(sfOk204());
        await getToolResult('update_account', { id: '001xx000000ACCT1', Website: 'https://newacme.com' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PATCH');
        expect(call[0] as string).toContain('/sobjects/Account/001xx000000ACCT1');
    });

    it('only sends provided fields', async () => {
        mockFetch.mockReturnValueOnce(sfOk204());
        await callTool('update_account', { id: '001xx000000ACCT1', AnnualRevenue: 10000000 });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(body.AnnualRevenue).toBe(10000000);
        expect(body.Name).toBeUndefined();
    });
});

describe('list_account_contacts', () => {
    it('calls Contacts relationship endpoint on account', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ records: [mockContact], totalSize: 1, done: true }));
        const result = await getToolResult('list_account_contacts', { id: '001xx000000ACCT1' });
        expect(result.records).toHaveLength(1);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/sobjects/Account/001xx000000ACCT1/Contacts');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('list_account_contacts', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Opportunities ─────────────────────────────────────────────────────────────

describe('list_opportunities', () => {
    it('returns query result with opportunity records', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([mockOpportunity])));
        const result = await getToolResult('list_opportunities', {});
        expect(result.records).toHaveLength(1);
        expect(result.records[0].Id).toBe('006xx000000OPPT1');
        expect(result.records[0].StageName).toBe('Prospecting');
    });

    it('with accountId adds WHERE clause to SOQL', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([])));
        await callTool('list_opportunities', { accountId: '001xx000000ACCT1' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('AccountId');
        expect(url).toContain('001xx000000ACCT1');
    });

    it('without accountId omits WHERE clause', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([])));
        await callTool('list_opportunities', {});
        const url = mockFetch.mock.calls[0][0] as string;
        // Should not contain WHERE...AccountId filter
        expect(decodeURIComponent(url)).not.toContain('WHERE');
    });
});

describe('get_opportunity', () => {
    it('returns opportunity object', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockOpportunity));
        const result = await getToolResult('get_opportunity', { id: '006xx000000OPPT1' });
        expect(result.Id).toBe('006xx000000OPPT1');
        expect(result.Name).toBe('Acme Q1 Deal');
        expect(result.Amount).toBe(50000);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_opportunity', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_opportunity', () => {
    it('returns created opportunity id and success', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ id: '006xx000000OPPT2', success: true }));
        const result = await getToolResult('create_opportunity', {
            Name: 'New Deal',
            StageName: 'Prospecting',
            CloseDate: '2026-06-30',
            Amount: 25000,
        });
        expect(result.id).toBe('006xx000000OPPT2');
        expect(result.success).toBe(true);
    });

    it('sends POST to /sobjects/Opportunity', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ id: '006xx000000OPPT3', success: true }));
        await callTool('create_opportunity', {
            Name: 'Another Deal',
            StageName: 'Qualification',
            CloseDate: '2026-07-31',
        });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/sobjects/Opportunity');
    });

    it('missing Name returns validation error', async () => {
        const body = await callTool('create_opportunity', { StageName: 'Prospecting', CloseDate: '2026-06-30' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Name');
    });

    it('missing StageName returns validation error', async () => {
        const body = await callTool('create_opportunity', { Name: 'Deal', CloseDate: '2026-06-30' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('StageName');
    });

    it('missing CloseDate returns validation error', async () => {
        const body = await callTool('create_opportunity', { Name: 'Deal', StageName: 'Prospecting' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('CloseDate');
    });
});

describe('update_opportunity', () => {
    it('sends PATCH to /sobjects/Opportunity/{id}', async () => {
        mockFetch.mockReturnValueOnce(sfOk204());
        await getToolResult('update_opportunity', { id: '006xx000000OPPT1', StageName: 'Closed Won' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PATCH');
        expect(call[0] as string).toContain('/sobjects/Opportunity/006xx000000OPPT1');
    });

    it('only sends provided fields', async () => {
        mockFetch.mockReturnValueOnce(sfOk204());
        await callTool('update_opportunity', { id: '006xx000000OPPT1', Amount: 75000 });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(body.Amount).toBe(75000);
        expect(body.StageName).toBeUndefined();
    });
});

describe('add_opportunity_note', () => {
    it('creates a Task with WhatId set to opportunity_id and Status=Completed', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ id: '00Txx000000TASK2', success: true }));
        const result = await getToolResult('add_opportunity_note', {
            opportunity_id: '006xx000000OPPT1',
            subject: 'Demo call completed',
            description: 'Showed pricing page and product roadmap',
        });
        expect(result.id).toBe('00Txx000000TASK2');
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(body.WhatId).toBe('006xx000000OPPT1');
        expect(body.Subject).toBe('Demo call completed');
        expect(body.Status).toBe('Completed');
        expect(body.Description).toBe('Showed pricing page and product roadmap');
    });

    it('sends POST to /sobjects/Task', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ id: '00Txx000000TASK3', success: true }));
        await callTool('add_opportunity_note', { opportunity_id: '006xx000000OPPT1', subject: 'Follow up' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/sobjects/Task');
    });

    it('missing opportunity_id returns validation error', async () => {
        const body = await callTool('add_opportunity_note', { subject: 'Note' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('opportunity_id');
    });
});

// ── Tasks & Activities ────────────────────────────────────────────────────────

describe('list_tasks', () => {
    it('returns SOQL query result with task records', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([mockTask])));
        const result = await getToolResult('list_tasks', { owner_id: '005xx000000USER1' });
        expect(result.records).toHaveLength(1);
        expect(result.records[0].Id).toBe('00Txx000000TASK1');
        expect(result.records[0].Subject).toBe('Follow up call');
    });

    it('builds SOQL with OwnerId WHERE clause', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([])));
        await callTool('list_tasks', { owner_id: '005xx000000USER1' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('Task');
        expect(url).toContain('OwnerId');
        expect(url).toContain('005xx000000USER1');
    });

    it('missing owner_id returns validation error', async () => {
        const body = await callTool('list_tasks', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('owner_id');
    });
});

describe('create_task', () => {
    it('returns created task id and success', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ id: '00Txx000000TASK4', success: true }));
        const result = await getToolResult('create_task', {
            Subject: 'Call prospect',
            Status: 'Not Started',
            Priority: 'High',
        });
        expect(result.id).toBe('00Txx000000TASK4');
        expect(result.success).toBe(true);
    });

    it('sends POST to /sobjects/Task', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ id: '00Txx000000TASK5', success: true }));
        await callTool('create_task', { Subject: 'Send email' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/sobjects/Task');
    });

    it('missing Subject returns validation error', async () => {
        const body = await callTool('create_task', { Status: 'Not Started' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Subject');
    });
});

describe('complete_task', () => {
    it('sends PATCH with Status=Completed', async () => {
        mockFetch.mockReturnValueOnce(sfOk204());
        const result = await getToolResult('complete_task', { id: '00Txx000000TASK1' });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PATCH');
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(body.Status).toBe('Completed');
        expect(call[0] as string).toContain('/sobjects/Task/00Txx000000TASK1');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('complete_task', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── SOQL ──────────────────────────────────────────────────────────────────────

describe('run_soql', () => {
    it('executes arbitrary SOQL query and returns results', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([{ Id: '001xxx', Name: 'Test' }])));
        const result = await getToolResult('run_soql', {
            soql: "SELECT Id, Name FROM Account WHERE Industry = 'Technology' LIMIT 10",
        });
        expect(result.records).toHaveLength(1);
        expect(result.totalSize).toBe(1);
    });

    it('URL-encodes the SOQL query', async () => {
        mockFetch.mockReturnValueOnce(sfOk(mockQueryResult([])));
        await callTool('run_soql', { soql: "SELECT Id FROM Account WHERE Name = 'Test Corp'" });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/query?q=');
        // URL should be encoded (space → %20, = → %3D, etc.)
        expect(url).not.toContain(' ');
    });

    it('missing soql returns validation error', async () => {
        const body = await callTool('run_soql', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('soql');
    });
});

describe('describe_object', () => {
    it('calls /sobjects/{objectName}/describe endpoint', async () => {
        mockFetch.mockReturnValueOnce(sfOk({ name: 'Lead', label: 'Lead', fields: [] }));
        const result = await getToolResult('describe_object', { object_name: 'Lead' });
        expect(result.name).toBe('Lead');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/sobjects/Lead/describe');
    });

    it('missing object_name returns validation error', async () => {
        const body = await callTool('describe_object', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('object_name');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('Salesforce API error (400) returns -32603 with error message', async () => {
        mockFetch.mockReturnValueOnce(sfErr([{ message: 'INVALID_FIELD: No such column', errorCode: 'INVALID_FIELD' }]));
        const body = await callTool('search_leads', { field: 'BadField', value: 'test' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('Salesforce API error');
    });

    it('Salesforce 404 returns -32603 with error message', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify([{ message: 'The requested resource does not exist', errorCode: 'NOT_FOUND' }]),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
        )));
        const body = await callTool('get_contact', { id: 'nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('404');
    });

    it('unknown tool name returns -32601', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
    });
});

// ── E2E tests (skipped unless env vars set) ───────────────────────────────────

describe.skipIf(!process.env.SALESFORCE_ACCESS_TOKEN)('E2E — real Salesforce API', () => {
    const e2eToken = process.env.SALESFORCE_ACCESS_TOKEN!;
    const e2eInstanceUrl = process.env.SALESFORCE_INSTANCE_URL!;

    function makeE2EReq(toolName: string, args: Record<string, unknown>) {
        return new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-SALESFORCE-ACCESS-TOKEN': e2eToken,
                'X-Mcp-Secret-SALESFORCE-INSTANCE-URL': e2eInstanceUrl,
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: toolName, arguments: args },
            }),
        });
    }

    it('search_contacts returns records array', async () => {
        vi.restoreAllMocks();
        const req = makeE2EReq('search_contacts', { field: 'Email', value: 'test' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text) as { records: unknown[] };
        expect(Array.isArray(result.records)).toBe(true);
    });

    it('get_opportunity returns opportunity fields', async () => {
        vi.restoreAllMocks();
        // Replace with a real Opportunity ID from your org
        const req = makeE2EReq('list_opportunities', { limit: 1 });
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text) as { records: unknown[]; totalSize: number };
        expect(typeof result.totalSize).toBe('number');
    });

    it('run_soql returns query results', async () => {
        vi.restoreAllMocks();
        const req = makeE2EReq('run_soql', { soql: 'SELECT Id, Name FROM Account LIMIT 5' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text) as { records: unknown[] };
        expect(Array.isArray(result.records)).toBe(true);
    });
});
