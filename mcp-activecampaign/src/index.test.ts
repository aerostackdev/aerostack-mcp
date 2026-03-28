import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_URL = 'https://testaccount.api-us1.com';
const API_KEY = 'test_ac_api_key_abc123xyz';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockContact = {
    id: '101',
    email: 'jane.doe@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '+1-555-200-0001',
    cdate: '2026-01-15T10:00:00-05:00',
    udate: '2026-03-01T12:00:00-05:00',
};

const mockList = {
    id: '10',
    name: 'Newsletter Subscribers',
    stringid: 'newsletter-subscribers',
    cdate: '2025-06-01T00:00:00-05:00',
    udate: '2026-01-01T00:00:00-05:00',
};

const mockTag = {
    id: '5',
    tag: 'customer',
    tagType: 'contact',
    description: 'Paying customers',
};

const mockContactTag = {
    id: '201',
    contact: '101',
    tag: '5',
    cdate: '2026-03-01T00:00:00-05:00',
};

const mockCampaign = {
    id: '301',
    name: 'March Newsletter',
    cdate: '2026-03-01T00:00:00-05:00',
    mdate: '2026-03-10T00:00:00-05:00',
    status: '5',
    public: '1',
    type: 'single',
    subject: 'What\'s new in March',
    opens: '450',
    uniqueopens: '380',
    linkclicks: '120',
    totalamount: '1200',
    send_amt: '1200',
};

const mockAutomation = {
    id: '401',
    name: 'Welcome Series',
    cdate: '2025-12-01T00:00:00-05:00',
    mdate: '2026-01-01T00:00:00-05:00',
    status: '1',
    contactGoalCount: '0',
    contactActiveCount: '15',
    contactCompleteCount: '423',
};

const mockContactAutomation = {
    id: '501',
    contact: '101',
    seriesid: '401',
    startid: '1',
    status: 'active',
    adddate: '2026-03-01T00:00:00-05:00',
};

const mockDeal = {
    id: '601',
    title: 'Enterprise License Deal',
    value: '500000',
    currency: 'usd',
    status: '0',
    stage: '5',
    owner: '1',
    contact: '101',
    cdate: '2026-02-01T00:00:00-05:00',
    mdate: '2026-03-01T00:00:00-05:00',
};

const mockPipeline = {
    id: '1',
    title: 'Sales Pipeline',
    currency: 'usd',
    dealStages: ['10', '11', '12'],
    cdate: '2025-01-01T00:00:00-05:00',
    udate: '2026-01-01T00:00:00-05:00',
};

const mockDealNote = {
    id: '701',
    note: 'Prospect is very interested in enterprise plan',
    cdate: '2026-03-15T00:00:00-05:00',
    mdate: '2026-03-15T00:00:00-05:00',
    relid: '601',
    reltype: 'deal',
};

const mockAccount = {
    id: '1',
    name: 'Acme Corp',
    accountUrl: 'https://acme.com',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function acOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function acOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function acErr(message: string, status = 422) {
    return Promise.resolve(new Response(JSON.stringify({
        message,
        errors: [{ title: message, detail: message }],
    }), {
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
    if (!missingSecrets.includes('apiUrl')) {
        headers['X-Mcp-Secret-ACTIVECAMPAIGN-API-URL'] = API_URL;
    }
    if (!missingSecrets.includes('apiKey')) {
        headers['X-Mcp-Secret-ACTIVECAMPAIGN-API-KEY'] = API_KEY;
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
    it('GET / returns status ok with server mcp-activecampaign and tool count 23', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-activecampaign');
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
            result: { protocolVersion: string; serverInfo: { name: string } }
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-activecampaign');
    });

    it('tools/list returns all tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools.length).toBeGreaterThan(0);
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
    it('missing apiUrl returns -32001 with ACTIVECAMPAIGN_API_URL in message', async () => {
        const body = await callTool('list_contacts', {}, ['apiUrl']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('ACTIVECAMPAIGN_API_URL');
    });

    it('missing apiKey returns -32001 with ACTIVECAMPAIGN_API_KEY in message', async () => {
        const body = await callTool('list_contacts', {}, ['apiKey']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('ACTIVECAMPAIGN_API_KEY');
    });

    it('missing both secrets returns -32001', async () => {
        const body = await callTool('list_contacts', {}, ['apiUrl', 'apiKey']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('Authorization uses Api-Token header format', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contacts: [mockContact], meta: { total: '1' } }));
        await callTool('list_contacts', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Api-Token']).toBe(API_KEY);
    });

    it('unknown tool returns -32601', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
    });
});

// ── Contacts ──────────────────────────────────────────────────────────────────

describe('list_contacts', () => {
    it('returns list of contacts', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contacts: [mockContact], meta: { total: '1' } }));
        const result = await getToolResult('list_contacts', {});
        expect(result.contacts).toHaveLength(1);
        expect(result.contacts[0].email).toBe('jane.doe@example.com');
    });

    it('passes email filter in query string', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contacts: [mockContact], meta: { total: '1' } }));
        await callTool('list_contacts', { email: 'jane.doe@example.com' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('email=jane.doe%40example.com');
    });

    it('passes list_id filter as listid param', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contacts: [], meta: { total: '0' } }));
        await callTool('list_contacts', { list_id: 10 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('listid=10');
    });

    it('passes status filter in query string', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contacts: [mockContact], meta: { total: '1' } }));
        await callTool('list_contacts', { status: 1 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=1');
    });

    it('API error returns -32603', async () => {
        mockFetch.mockReturnValueOnce(acErr('Unauthorized', 401));
        const body = await callTool('list_contacts', {});
        expect(body.error!.code).toBe(-32603);
    });

    it('uses correct base URL from secret', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contacts: [], meta: { total: '0' } }));
        await callTool('list_contacts', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(API_URL);
        expect(url).toContain('/api/3/contacts');
    });
});

describe('get_contact', () => {
    it('returns contact details', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contact: mockContact }));
        const result = await getToolResult('get_contact', { contact_id: 101 });
        expect(result.contact.id).toBe('101');
        expect(result.contact.email).toBe('jane.doe@example.com');
    });

    it('missing contact_id returns error', async () => {
        const body = await callTool('get_contact', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('contact_id');
    });

    it('calls correct endpoint URL', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contact: mockContact }));
        await callTool('get_contact', { contact_id: 101 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/contacts/101');
    });
});

describe('create_contact', () => {
    it('creates contact with required email', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contact: mockContact }));
        const result = await getToolResult('create_contact', { email: 'jane.doe@example.com' });
        expect(result.contact.id).toBe('101');
    });

    it('missing email returns error', async () => {
        const body = await callTool('create_contact', { firstName: 'Jane' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('email');
    });

    it('sends contact object in request body', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contact: mockContact }));
        await callTool('create_contact', {
            email: 'jane@example.com',
            firstName: 'Jane',
            lastName: 'Doe',
        });
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.contact).toBeDefined();
        expect(reqBody.contact.email).toBe('jane@example.com');
        expect(reqBody.contact.firstName).toBe('Jane');
    });

    it('uses POST method', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contact: mockContact }));
        await callTool('create_contact', { email: 'jane@example.com' });
        expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });
});

describe('update_contact', () => {
    it('updates contact and returns updated contact', async () => {
        const updated = { ...mockContact, firstName: 'Janet' };
        mockFetch.mockReturnValueOnce(acOk({ contact: updated }));
        const result = await getToolResult('update_contact', { contact_id: 101, firstName: 'Janet' });
        expect(result.contact.firstName).toBe('Janet');
    });

    it('missing contact_id returns error', async () => {
        const body = await callTool('update_contact', { firstName: 'Jane' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('contact_id');
    });

    it('uses PUT method', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contact: mockContact }));
        await callTool('update_contact', { contact_id: 101, phone: '+1-555-999-0000' });
        expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });
});

describe('delete_contact', () => {
    it('deletes contact and returns empty object on 204', async () => {
        mockFetch.mockReturnValueOnce(acOk204());
        const result = await getToolResult('delete_contact', { contact_id: 101 });
        expect(result).toEqual({});
    });

    it('missing contact_id returns error', async () => {
        const body = await callTool('delete_contact', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('contact_id');
    });

    it('uses DELETE method', async () => {
        mockFetch.mockReturnValueOnce(acOk204());
        await callTool('delete_contact', { contact_id: 101 });
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
});

describe('search_contacts', () => {
    it('returns matching contacts', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contacts: [mockContact], meta: { total: '1' } }));
        const result = await getToolResult('search_contacts', { query: 'Jane' });
        expect(result.contacts).toHaveLength(1);
    });

    it('missing query returns error', async () => {
        const body = await callTool('search_contacts', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('query');
    });

    it('passes search param in URL', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contacts: [], meta: { total: '0' } }));
        await callTool('search_contacts', { query: 'Jane Doe' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('search=Jane+Doe');
    });
});

describe('add_tag_to_contact', () => {
    it('adds tag to contact and returns contactTag', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contactTag: mockContactTag }));
        const result = await getToolResult('add_tag_to_contact', { contact_id: 101, tag_id: 5 });
        expect(result.contactTag.id).toBe('201');
    });

    it('missing contact_id returns error', async () => {
        const body = await callTool('add_tag_to_contact', { tag_id: 5 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('contact_id');
    });

    it('missing tag_id returns error', async () => {
        const body = await callTool('add_tag_to_contact', { contact_id: 101 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('tag_id');
    });

    it('sends contactTag payload with string IDs', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contactTag: mockContactTag }));
        await callTool('add_tag_to_contact', { contact_id: 101, tag_id: 5 });
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.contactTag.contact).toBe('101');
        expect(reqBody.contactTag.tag).toBe('5');
    });
});

// ── Lists & Tags ──────────────────────────────────────────────────────────────

describe('list_lists', () => {
    it('returns list of email lists', async () => {
        mockFetch.mockReturnValueOnce(acOk({ lists: [mockList], meta: { total: '1' } }));
        const result = await getToolResult('list_lists', {});
        expect(result.lists).toHaveLength(1);
        expect(result.lists[0].name).toBe('Newsletter Subscribers');
    });

    it('uses /lists endpoint', async () => {
        mockFetch.mockReturnValueOnce(acOk({ lists: [], meta: { total: '0' } }));
        await callTool('list_lists', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/lists');
    });
});

describe('create_list', () => {
    it('creates list and returns new list', async () => {
        mockFetch.mockReturnValueOnce(acOk({ list: mockList }));
        const result = await getToolResult('create_list', {
            name: 'Newsletter Subscribers',
            string_id: 'newsletter-subscribers',
        });
        expect(result.list.id).toBe('10');
    });

    it('missing name returns error', async () => {
        const body = await callTool('create_list', { string_id: 'my-list' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });

    it('missing string_id returns error', async () => {
        const body = await callTool('create_list', { name: 'My List' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('string_id');
    });

    it('sends list with stringid field', async () => {
        mockFetch.mockReturnValueOnce(acOk({ list: mockList }));
        await callTool('create_list', { name: 'My List', string_id: 'my-list' });
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.list.stringid).toBe('my-list');
        expect(reqBody.list.name).toBe('My List');
    });
});

describe('subscribe_contact_to_list', () => {
    it('subscribes contact to list', async () => {
        const contactList = { id: '301', contact: '101', list: '10', status: 1 };
        mockFetch.mockReturnValueOnce(acOk({ contactList }));
        const result = await getToolResult('subscribe_contact_to_list', {
            contact_id: 101,
            list_id: 10,
            status: 1,
        });
        expect(result.contactList.status).toBe(1);
    });

    it('missing contact_id returns error', async () => {
        const body = await callTool('subscribe_contact_to_list', { list_id: 10, status: 1 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('contact_id');
    });

    it('missing status returns error', async () => {
        const body = await callTool('subscribe_contact_to_list', { contact_id: 101, list_id: 10 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('status');
    });

    it('sends correct contactList payload', async () => {
        const contactList = { id: '301', contact: '101', list: '10', status: 1 };
        mockFetch.mockReturnValueOnce(acOk({ contactList }));
        await callTool('subscribe_contact_to_list', { contact_id: 101, list_id: 10, status: 1 });
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.contactList.contact).toBe('101');
        expect(reqBody.contactList.list).toBe('10');
        expect(reqBody.contactList.status).toBe(1);
    });
});

describe('list_tags', () => {
    it('returns list of tags', async () => {
        mockFetch.mockReturnValueOnce(acOk({ tags: [mockTag], meta: { total: '1' } }));
        const result = await getToolResult('list_tags', {});
        expect(result.tags).toHaveLength(1);
        expect(result.tags[0].tag).toBe('customer');
    });

    it('passes search filter in URL', async () => {
        mockFetch.mockReturnValueOnce(acOk({ tags: [], meta: { total: '0' } }));
        await callTool('list_tags', { search: 'customer' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('search=customer');
    });
});

// ── Campaigns & Automations ───────────────────────────────────────────────────

describe('list_campaigns', () => {
    it('returns list of campaigns', async () => {
        mockFetch.mockReturnValueOnce(acOk({ campaigns: [mockCampaign], meta: { total: '1' } }));
        const result = await getToolResult('list_campaigns', {});
        expect(result.campaigns).toHaveLength(1);
        expect(result.campaigns[0].name).toBe('March Newsletter');
    });

    it('passes type filter in URL', async () => {
        mockFetch.mockReturnValueOnce(acOk({ campaigns: [], meta: { total: '0' } }));
        await callTool('list_campaigns', { type: 'single' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('type=single');
    });

    it('passes status filter in URL', async () => {
        mockFetch.mockReturnValueOnce(acOk({ campaigns: [mockCampaign], meta: { total: '1' } }));
        await callTool('list_campaigns', { status: 5 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=5');
    });
});

describe('get_campaign', () => {
    it('returns campaign details', async () => {
        mockFetch.mockReturnValueOnce(acOk({ campaign: mockCampaign }));
        const result = await getToolResult('get_campaign', { campaign_id: 301 });
        expect(result.campaign.id).toBe('301');
        expect(result.campaign.subject).toBe("What's new in March");
    });

    it('missing campaign_id returns error', async () => {
        const body = await callTool('get_campaign', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('campaign_id');
    });
});

describe('list_automations', () => {
    it('returns list of automations', async () => {
        mockFetch.mockReturnValueOnce(acOk({ automations: [mockAutomation], meta: { total: '1' } }));
        const result = await getToolResult('list_automations', {});
        expect(result.automations).toHaveLength(1);
        expect(result.automations[0].name).toBe('Welcome Series');
    });

    it('passes status filter in URL', async () => {
        mockFetch.mockReturnValueOnce(acOk({ automations: [mockAutomation], meta: { total: '1' } }));
        await callTool('list_automations', { status: 1 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=1');
    });
});

describe('get_automation', () => {
    it('returns automation details', async () => {
        mockFetch.mockReturnValueOnce(acOk({ automation: mockAutomation }));
        const result = await getToolResult('get_automation', { automation_id: 401 });
        expect(result.automation.id).toBe('401');
        expect(result.automation.name).toBe('Welcome Series');
    });

    it('missing automation_id returns error', async () => {
        const body = await callTool('get_automation', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('automation_id');
    });
});

describe('add_contact_to_automation', () => {
    it('adds contact to automation and returns contactAutomation', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contactAutomation: mockContactAutomation }));
        const result = await getToolResult('add_contact_to_automation', {
            contact_id: 101,
            automation_id: 401,
        });
        expect(result.contactAutomation.id).toBe('501');
    });

    it('missing contact_id returns error', async () => {
        const body = await callTool('add_contact_to_automation', { automation_id: 401 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('contact_id');
    });

    it('missing automation_id returns error', async () => {
        const body = await callTool('add_contact_to_automation', { contact_id: 101 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('automation_id');
    });

    it('sends contactAutomation payload with string IDs', async () => {
        mockFetch.mockReturnValueOnce(acOk({ contactAutomation: mockContactAutomation }));
        await callTool('add_contact_to_automation', { contact_id: 101, automation_id: 401 });
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.contactAutomation.contact).toBe('101');
        expect(reqBody.contactAutomation.automation).toBe('401');
    });
});

// ── Deals & CRM ───────────────────────────────────────────────────────────────

describe('list_deals', () => {
    it('returns list of deals', async () => {
        mockFetch.mockReturnValueOnce(acOk({ deals: [mockDeal], meta: { total: '1' } }));
        const result = await getToolResult('list_deals', {});
        expect(result.deals).toHaveLength(1);
        expect(result.deals[0].title).toBe('Enterprise License Deal');
    });

    it('passes status filter in URL', async () => {
        mockFetch.mockReturnValueOnce(acOk({ deals: [mockDeal], meta: { total: '1' } }));
        await callTool('list_deals', { status: 0 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=0');
    });

    it('passes owner filter in URL', async () => {
        mockFetch.mockReturnValueOnce(acOk({ deals: [], meta: { total: '0' } }));
        await callTool('list_deals', { owner: 1 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('owner=1');
    });
});

describe('get_deal', () => {
    it('returns deal details', async () => {
        mockFetch.mockReturnValueOnce(acOk({ deal: mockDeal }));
        const result = await getToolResult('get_deal', { deal_id: 601 });
        expect(result.deal.id).toBe('601');
        expect(result.deal.title).toBe('Enterprise License Deal');
    });

    it('missing deal_id returns error', async () => {
        const body = await callTool('get_deal', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('deal_id');
    });
});

describe('create_deal', () => {
    it('creates deal and returns new deal', async () => {
        mockFetch.mockReturnValueOnce(acOk({ deal: mockDeal }));
        const result = await getToolResult('create_deal', {
            title: 'Enterprise License Deal',
            value: 500000,
            currency: 'usd',
            group: '1',
        });
        expect(result.deal.id).toBe('601');
    });

    it('missing title returns error', async () => {
        const body = await callTool('create_deal', { value: 10000, currency: 'usd', group: '1' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('title');
    });

    it('missing currency returns error', async () => {
        const body = await callTool('create_deal', { title: 'Deal', value: 10000, group: '1' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('currency');
    });

    it('missing group (pipeline) returns error', async () => {
        const body = await callTool('create_deal', { title: 'Deal', value: 10000, currency: 'usd' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('group');
    });

    it('sends deal object in request body with group as string', async () => {
        mockFetch.mockReturnValueOnce(acOk({ deal: mockDeal }));
        await callTool('create_deal', { title: 'Deal', value: 10000, currency: 'usd', group: '1' });
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.deal).toBeDefined();
        expect(reqBody.deal.title).toBe('Deal');
        expect(reqBody.deal.group).toBe('1');
    });

    it('uses POST method', async () => {
        mockFetch.mockReturnValueOnce(acOk({ deal: mockDeal }));
        await callTool('create_deal', { title: 'Deal', value: 10000, currency: 'usd', group: '1' });
        expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });
});

describe('update_deal', () => {
    it('updates deal and returns updated deal', async () => {
        const updated = { ...mockDeal, status: '1' };
        mockFetch.mockReturnValueOnce(acOk({ deal: updated }));
        const result = await getToolResult('update_deal', { deal_id: 601, status: 1 });
        expect(result.deal.status).toBe('1');
    });

    it('missing deal_id returns error', async () => {
        const body = await callTool('update_deal', { status: 1 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('deal_id');
    });

    it('uses PUT method', async () => {
        mockFetch.mockReturnValueOnce(acOk({ deal: mockDeal }));
        await callTool('update_deal', { deal_id: 601, title: 'Updated Deal' });
        expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });
});

describe('list_pipelines', () => {
    it('returns list of pipelines', async () => {
        mockFetch.mockReturnValueOnce(acOk({ dealGroups: [mockPipeline], meta: { total: '1' } }));
        const result = await getToolResult('list_pipelines', {});
        expect(result.dealGroups).toHaveLength(1);
        expect(result.dealGroups[0].title).toBe('Sales Pipeline');
    });

    it('calls /dealGroups endpoint', async () => {
        mockFetch.mockReturnValueOnce(acOk({ dealGroups: [], meta: { total: '0' } }));
        await callTool('list_pipelines', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/dealGroups');
    });
});

describe('create_deal_note', () => {
    it('creates note on deal and returns created note', async () => {
        mockFetch.mockReturnValueOnce(acOk({ note: mockDealNote }));
        const result = await getToolResult('create_deal_note', {
            deal_id: 601,
            note: 'Prospect is very interested',
        });
        expect(result.note.id).toBe('701');
    });

    it('missing deal_id returns error', async () => {
        const body = await callTool('create_deal_note', { note: 'some note' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('deal_id');
    });

    it('missing note returns error', async () => {
        const body = await callTool('create_deal_note', { deal_id: 601 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('note');
    });

    it('sends note payload', async () => {
        mockFetch.mockReturnValueOnce(acOk({ note: mockDealNote }));
        await callTool('create_deal_note', { deal_id: 601, note: 'Test note' });
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.note.note).toBe('Test note');
    });

    it('calls endpoint with deal ID in path', async () => {
        mockFetch.mockReturnValueOnce(acOk({ note: mockDealNote }));
        await callTool('create_deal_note', { deal_id: 601, note: 'Test' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/deals/601/notes');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns ok:true when credentials are valid', async () => {
        mockFetch.mockReturnValueOnce(acOk({ accounts: [mockAccount], meta: { total: '1' } }));
        const result = await getToolResult('_ping', {});
        expect(result.ok).toBe(true);
        expect(result.message).toContain('valid');
    });

    it('calls /accounts?limit=1 endpoint', async () => {
        mockFetch.mockReturnValueOnce(acOk({ accounts: [], meta: { total: '0' } }));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/accounts');
        expect(url).toContain('limit=1');
    });

    it('returns -32603 when API returns error', async () => {
        mockFetch.mockReturnValueOnce(acErr('Invalid API Key', 401));
        const body = await callTool('_ping', {});
        expect(body.error!.code).toBe(-32603);
    });

    it('missing API key returns -32001', async () => {
        const body = await callTool('_ping', {}, ['apiKey']);
        expect(body.error!.code).toBe(-32001);
    });

    it('missing API URL returns -32001', async () => {
        const body = await callTool('_ping', {}, ['apiUrl']);
        expect(body.error!.code).toBe(-32001);
    });
});

// ── URL construction ──────────────────────────────────────────────────────────

describe('URL construction', () => {
    it('strips trailing slash from API URL before appending /api/3', async () => {
        const headersWithSlash: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-ACTIVECAMPAIGN-API-URL': 'https://testaccount.api-us1.com/',
            'X-Mcp-Secret-ACTIVECAMPAIGN-API-KEY': API_KEY,
        };
        mockFetch.mockReturnValueOnce(acOk({ contacts: [], meta: { total: '0' } }));
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: headersWithSlash,
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'list_contacts', arguments: {} },
            }),
        });
        await worker.fetch(req);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).not.toContain('//api/3');
        expect(url).toContain('/api/3/contacts');
    });
});
