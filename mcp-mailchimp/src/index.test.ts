import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ────────────────────────────────────────────────────────────────

const API_KEY = 'testapikey123-us6';
const SERVER_PREFIX = 'us6';

// ── Mock data ────────────────────────────────────────────────────────────────

const mockList = {
    id: 'abc123list',
    name: 'Newsletter',
    status: 'active',
    stats: {
        member_count: 1500,
        unsubscribe_count: 42,
        open_rate: 0.32,
        click_rate: 0.08,
    },
    date_created: '2023-01-01T00:00:00Z',
    list_rating: 4,
    contact: {
        company: 'Acme Corp',
        address1: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        country: 'US',
    },
    campaign_defaults: {
        from_name: 'Acme Team',
        from_email: 'news@acme.com',
        subject: 'Monthly newsletter',
        language: 'en',
    },
    permission_reminder: 'You signed up on acme.com',
    email_type_option: false,
};

const mockMember = {
    id: 'membermd5hash',
    email_address: 'subscriber@example.com',
    unique_email_id: 'uniqueid123',
    status: 'subscribed',
    merge_fields: { FNAME: 'John', LNAME: 'Doe' },
    tags: [{ id: 1, name: 'vip' }],
    list_id: 'abc123list',
    timestamp_signup: '2023-06-01T00:00:00Z',
    last_changed: '2024-01-01T00:00:00Z',
    stats: { avg_open_rate: 0.5, avg_click_rate: 0.15 },
};

const mockCampaign = {
    id: 'campaign123',
    type: 'regular',
    status: 'sent',
    emails_sent: 1200,
    send_time: '2024-01-15T10:00:00Z',
    content_type: 'template',
    recipients: {
        list_id: 'abc123list',
        list_name: 'Newsletter',
        recipient_count: 1200,
    },
    settings: {
        subject_line: 'January Update',
        preview_text: 'Check out what is new',
        title: 'Jan 2024 Newsletter',
        from_name: 'Acme Team',
        reply_to: 'news@acme.com',
        use_conversation: false,
    },
    tracking: { opens: true, html_clicks: true, text_clicks: false },
    report_summary: {
        opens: 420,
        unique_opens: 390,
        open_rate: 0.325,
        clicks: 96,
        unique_clicks: 80,
        click_rate: 0.08,
        subscriber_clicks: 75,
    },
    create_time: '2024-01-14T09:00:00Z',
    archive_url: 'https://mailchi.mp/abc/jan-2024',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mcOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function mcErr(title: string, detail: string, status = 422) {
    return Promise.resolve(new Response(JSON.stringify({ title, status, detail, instance: 'uuid' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, missingSecrets: string[] = []) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('apikey')) headers['X-Mcp-Secret-MAILCHIMP-API-KEY'] = API_KEY;
    if (!missingSecrets.includes('server')) headers['X-Mcp-Secret-MAILCHIMP-SERVER-PREFIX'] = SERVER_PREFIX;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(toolName: string, args: Record<string, unknown> = {}, missingSecrets: string[] = []) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingSecrets);
}

async function callTool(toolName: string, args: Record<string, unknown> = {}, missingSecrets: string[] = []) {
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
    it('GET / returns status ok with server mcp-mailchimp and tools 15', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-mailchimp');
        expect(body.tools).toBe(15);
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
        expect(body.result.serverInfo.name).toBe('mcp-mailchimp');
    });

    it('tools/list returns exactly 15 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(15);
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
    it('missing MAILCHIMP_API_KEY returns -32001 with helpful message', async () => {
        const body = await callTool('list_audiences', {}, ['apikey', 'server']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('MAILCHIMP_API_KEY');
    });

    it('missing api key only (no server prefix either) returns -32001', async () => {
        const body = await callTool('list_audiences', {}, ['apikey']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('auth header uses Basic anystring:apikey base64 encoding', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ lists: [mockList], total_items: 1 }));
        await callTool('list_audiences', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        const expectedAuth = `Basic ${btoa(`anystring:${API_KEY}`)}`;
        expect(headers.Authorization).toBe(expectedAuth);
    });

    it('Mailchimp 401 maps to Authentication failed message', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ title: 'API Key Invalid', status: 401, detail: 'Your API key may be invalid', instance: 'uuid' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
        )));
        const body = await callTool('list_audiences', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Authentication failed');
    });

    it('server prefix is extracted from api key when not provided', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ lists: [mockList], total_items: 1 }));
        // Call without server prefix header
        const req = makeToolReq('list_audiences', {}, ['server']);
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: unknown; error?: { code: number } };
        expect(body.error).toBeUndefined();
        // URL should contain us6 (extracted from API_KEY = 'testapikey123-us6')
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('us6.api.mailchimp.com');
    });
});

// ── MD5 (subscriber hash) ─────────────────────────────────────────────────────

describe('MD5 subscriber hash', () => {
    it('get_member uses MD5 of lowercase email in URL', async () => {
        mockFetch.mockReturnValueOnce(mcOk(mockMember));
        await getToolResult('get_member', { list_id: 'abc123list', email: 'Test@Example.COM' });
        const url = mockFetch.mock.calls[0][0] as string;
        // MD5 of "test@example.com" = 55502f40dc8b7c769880b10874abc9d0
        expect(url).toContain('55502f40dc8b7c769880b10874abc9d0');
    });

    it('MD5 of known value is correct', async () => {
        mockFetch.mockReturnValueOnce(mcOk(mockMember));
        await getToolResult('get_member', { list_id: 'abc123list', email: 'subscriber@example.com' });
        const url = mockFetch.mock.calls[0][0] as string;
        // MD5('subscriber@example.com') known hash
        expect(url).toMatch(/\/members\/[a-f0-9]{32}$/);
    });
});

// ── Audiences / Lists ─────────────────────────────────────────────────────────

describe('list_audiences', () => {
    it('returns total and audiences array with shaped fields', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ lists: [mockList], total_items: 1 }));
        const result = await getToolResult('list_audiences');
        expect(result.total).toBe(1);
        expect(Array.isArray(result.audiences)).toBe(true);
        expect(result.audiences[0].id).toBe('abc123list');
        expect(result.audiences[0].name).toBe('Newsletter');
        expect(result.audiences[0].member_count).toBe(1500);
    });

    it('uses default count 20 and offset 0', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ lists: [], total_items: 0 }));
        await getToolResult('list_audiences');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('count=20');
        expect(url).toContain('offset=0');
    });

    it('respects custom count and offset', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ lists: [], total_items: 0 }));
        await getToolResult('list_audiences', { count: 5, offset: 10 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('count=5');
        expect(url).toContain('offset=10');
    });
});

describe('get_audience', () => {
    it('returns full audience details', async () => {
        mockFetch.mockReturnValueOnce(mcOk(mockList));
        const result = await getToolResult('get_audience', { list_id: 'abc123list' });
        expect(result.id).toBe('abc123list');
        expect(result.name).toBe('Newsletter');
        expect(result.stats.member_count).toBe(1500);
        expect(result.contact.company).toBe('Acme Corp');
        expect(result.campaign_defaults.from_name).toBe('Acme Team');
    });

    it('missing list_id returns validation error', async () => {
        const body = await callTool('get_audience', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('list_id');
    });
});

describe('create_audience', () => {
    it('creates audience and returns list_id and name', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ ...mockList, id: 'newlist456' }));
        const result = await getToolResult('create_audience', {
            name: 'New Audience',
            permission_reminder: 'You opted in',
            contact_company: 'Test Corp',
            contact_address1: '456 Elm St',
            contact_city: 'Boston',
            contact_state: 'MA',
            contact_zip: '02101',
            contact_country: 'US',
            from_name: 'Test Team',
            from_email: 'news@test.com',
            subject: 'Updates',
            language: 'en',
        });
        expect(result.list_id).toBe('newlist456');
        expect(result.name).toBe('Newsletter');
        expect(result.date_created).toBeDefined();
    });

    it('sends correct contact and campaign_defaults in body', async () => {
        mockFetch.mockReturnValueOnce(mcOk(mockList));
        await getToolResult('create_audience', {
            name: 'Test',
            permission_reminder: 'You opted in',
            contact_company: 'Corp',
            contact_address1: '1 St',
            contact_city: 'NYC',
            contact_state: 'NY',
            contact_zip: '10001',
            contact_country: 'US',
            from_name: 'Team',
            from_email: 'from@corp.com',
            subject: 'Hi',
            language: 'en',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as {
            contact: { company: string };
            campaign_defaults: { from_name: string };
        };
        expect(reqBody.contact.company).toBe('Corp');
        expect(reqBody.campaign_defaults.from_name).toBe('Team');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_audience', {
            permission_reminder: 'You opted in',
            contact_company: 'Corp',
            contact_address1: '1 St',
            contact_city: 'NYC',
            contact_state: 'NY',
            contact_zip: '10001',
            contact_country: 'US',
            from_name: 'Team',
            from_email: 'f@c.com',
            subject: 'Hi',
            language: 'en',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('get_audience_stats', () => {
    it('returns growth history', async () => {
        const historyData = {
            history: [
                { month: '2024-01', existing: 1400, imports: 50, optins: 60 },
                { month: '2023-12', existing: 1300, imports: 45, optins: 55 },
            ],
            total_items: 2,
        };
        mockFetch.mockReturnValueOnce(mcOk(historyData));
        const result = await getToolResult('get_audience_stats', { list_id: 'abc123list' });
        expect(result.list_id).toBe('abc123list');
        expect(result.total_months).toBe(2);
        expect(Array.isArray(result.history)).toBe(true);
        expect(result.history[0].month).toBe('2024-01');
    });

    it('defaults to count 12', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ history: [], total_items: 0 }));
        await getToolResult('get_audience_stats', { list_id: 'abc123list' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('count=12');
    });

    it('missing list_id returns validation error', async () => {
        const body = await callTool('get_audience_stats', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('list_id');
    });
});

// ── Members / Subscribers ─────────────────────────────────────────────────────

describe('list_members', () => {
    it('returns total and members array with shaped fields', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ members: [mockMember], total_items: 1 }));
        const result = await getToolResult('list_members', { list_id: 'abc123list' });
        expect(result.total).toBe(1);
        expect(Array.isArray(result.members)).toBe(true);
        expect(result.members[0].email_address).toBe('subscriber@example.com');
        expect(result.members[0].status).toBe('subscribed');
        expect(result.members[0].tags).toEqual([{ id: 1, name: 'vip' }]);
    });

    it('defaults to status=subscribed', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ members: [], total_items: 0 }));
        await getToolResult('list_members', { list_id: 'abc123list' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=subscribed');
    });

    it('respects custom status filter', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ members: [], total_items: 0 }));
        await getToolResult('list_members', { list_id: 'abc123list', status: 'unsubscribed' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=unsubscribed');
    });

    it('missing list_id returns validation error', async () => {
        const body = await callTool('list_members', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('list_id');
    });
});

describe('get_member', () => {
    it('returns all shaped member fields', async () => {
        mockFetch.mockReturnValueOnce(mcOk(mockMember));
        const result = await getToolResult('get_member', {
            list_id: 'abc123list',
            email: 'subscriber@example.com',
        });
        expect(result.email_address).toBe('subscriber@example.com');
        expect(result.status).toBe('subscribed');
        expect(result.merge_fields).toEqual({ FNAME: 'John', LNAME: 'Doe' });
        expect(result.stats).toBeDefined();
    });

    it('missing email returns validation error', async () => {
        const body = await callTool('get_member', { list_id: 'abc123list' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('email');
    });
});

describe('add_member', () => {
    it('adds member with upsert PUT and returns shaped fields', async () => {
        mockFetch.mockReturnValueOnce(mcOk(mockMember));
        const result = await getToolResult('add_member', {
            list_id: 'abc123list',
            email: 'new@example.com',
            status: 'subscribed',
            merge_fields: { FNAME: 'Alice' },
        });
        expect(result.email_address).toBe('subscriber@example.com');
        expect(result.status).toBe('subscribed');
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
    });

    it('defaults to status=subscribed when not provided', async () => {
        mockFetch.mockReturnValueOnce(mcOk(mockMember));
        await getToolResult('add_member', { list_id: 'abc123list', email: 'x@example.com' });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { status: string };
        expect(reqBody.status).toBe('subscribed');
    });

    it('tags are sent as array of { name, status: active }', async () => {
        mockFetch.mockReturnValueOnce(mcOk(mockMember));
        await getToolResult('add_member', {
            list_id: 'abc123list',
            email: 'tagged@example.com',
            tags: ['vip', 'newsletter'],
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as {
            tags: Array<{ name: string; status: string }>;
        };
        expect(reqBody.tags).toEqual([
            { name: 'vip', status: 'active' },
            { name: 'newsletter', status: 'active' },
        ]);
    });

    it('missing list_id returns validation error', async () => {
        const body = await callTool('add_member', { email: 'x@x.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('list_id');
    });
});

describe('update_member', () => {
    it('sends PATCH request with provided fields', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ ...mockMember, status: 'unsubscribed' }));
        const result = await getToolResult('update_member', {
            list_id: 'abc123list',
            email: 'subscriber@example.com',
            status: 'unsubscribed',
        });
        expect(result.status).toBe('unsubscribed');
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PATCH');
    });

    it('missing email returns validation error', async () => {
        const body = await callTool('update_member', { list_id: 'abc123list' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('email');
    });
});

describe('unsubscribe_member', () => {
    it('sets status to unsubscribed and returns unsubscribed: true', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ ...mockMember, status: 'unsubscribed' }));
        const result = await getToolResult('unsubscribe_member', {
            list_id: 'abc123list',
            email: 'subscriber@example.com',
        });
        expect(result.status).toBe('unsubscribed');
        expect(result.unsubscribed).toBe(true);
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { status: string };
        expect(reqBody.status).toBe('unsubscribed');
    });

    it('missing list_id returns validation error', async () => {
        const body = await callTool('unsubscribe_member', { email: 'x@x.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('list_id');
    });
});

// ── Campaigns ─────────────────────────────────────────────────────────────────

describe('list_campaigns', () => {
    it('returns total and campaigns array with shaped fields', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ campaigns: [mockCampaign], total_items: 1 }));
        const result = await getToolResult('list_campaigns');
        expect(result.total).toBe(1);
        expect(Array.isArray(result.campaigns)).toBe(true);
        expect(result.campaigns[0].id).toBe('campaign123');
        expect(result.campaigns[0].subject_line).toBe('January Update');
        expect(result.campaigns[0].report_summary).toBeDefined();
    });

    it('applies status filter when provided', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ campaigns: [], total_items: 0 }));
        await getToolResult('list_campaigns', { status: 'sent' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=sent');
    });

    it('applies list_id filter when provided', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ campaigns: [], total_items: 0 }));
        await getToolResult('list_campaigns', { list_id: 'abc123list' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('list_id=abc123list');
    });
});

describe('get_campaign', () => {
    it('returns all shaped campaign fields', async () => {
        mockFetch.mockReturnValueOnce(mcOk(mockCampaign));
        const result = await getToolResult('get_campaign', { campaign_id: 'campaign123' });
        expect(result.id).toBe('campaign123');
        expect(result.type).toBe('regular');
        expect(result.status).toBe('sent');
        expect(result.settings.subject_line).toBe('January Update');
        expect(result.recipients.list_id).toBe('abc123list');
        expect(result.report_summary.open_rate).toBe(0.325);
    });

    it('missing campaign_id returns validation error', async () => {
        const body = await callTool('get_campaign', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('campaign_id');
    });
});

describe('create_campaign', () => {
    it('creates campaign and returns campaign_id and shaped fields', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ ...mockCampaign, id: 'newcamp789', status: 'save' }));
        const result = await getToolResult('create_campaign', {
            type: 'regular',
            list_id: 'abc123list',
            subject_line: 'Welcome!',
            from_name: 'Team',
            reply_to: 'hello@acme.com',
        });
        expect(result.campaign_id).toBe('newcamp789');
        expect(result.status).toBe('save');
        expect(result.list_id).toBe('abc123list');
    });

    it('sends correct body to POST /campaigns', async () => {
        mockFetch.mockReturnValueOnce(mcOk(mockCampaign));
        await getToolResult('create_campaign', {
            type: 'regular',
            list_id: 'abc123list',
            subject_line: 'Test Subject',
            from_name: 'Test Sender',
            reply_to: 'reply@test.com',
            title: 'Internal Title',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as {
            type: string;
            recipients: { list_id: string };
            settings: { subject_line: string; title: string };
        };
        expect(reqBody.type).toBe('regular');
        expect(reqBody.recipients.list_id).toBe('abc123list');
        expect(reqBody.settings.subject_line).toBe('Test Subject');
        expect(reqBody.settings.title).toBe('Internal Title');
    });

    it('missing required fields returns validation error', async () => {
        const body = await callTool('create_campaign', {
            type: 'regular',
            list_id: 'abc123list',
            // missing subject_line, from_name, reply_to
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('subject_line');
    });
});

describe('send_campaign', () => {
    it('sends POST to /campaigns/{id}/actions/send and returns sent: true', async () => {
        // Mailchimp returns 204 on send
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(null, {
            status: 204,
            headers: { 'Content-Type': 'application/json' },
        })));
        const result = await getToolResult('send_campaign', { campaign_id: 'campaign123' });
        expect(result.sent).toBe(true);
        expect(result.campaign_id).toBe('campaign123');
        const call = mockFetch.mock.calls[0];
        const url = call[0] as string;
        expect(url).toContain('campaign123/actions/send');
        expect((call[1] as { method: string }).method).toBe('POST');
    });

    it('missing campaign_id returns validation error', async () => {
        const body = await callTool('send_campaign', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('campaign_id');
    });
});

// ── Tags ──────────────────────────────────────────────────────────────────────

describe('list_tags', () => {
    it('returns tag list with names and counts', async () => {
        const tagsData = {
            tags: [
                { id: 1, name: 'vip', member_count: 250 },
                { id: 2, name: 'newsletter', member_count: 1200 },
            ],
            total_items: 2,
        };
        mockFetch.mockReturnValueOnce(mcOk(tagsData));
        const result = await getToolResult('list_tags', { list_id: 'abc123list' });
        expect(result.list_id).toBe('abc123list');
        expect(result.total).toBe(2);
        expect(Array.isArray(result.tags)).toBe(true);
        expect(result.tags[0].name).toBe('vip');
    });

    it('applies name filter when provided', async () => {
        mockFetch.mockReturnValueOnce(mcOk({ tags: [], total_items: 0 }));
        await getToolResult('list_tags', { list_id: 'abc123list', name: 'vip' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('name=vip');
    });

    it('missing list_id returns validation error', async () => {
        const body = await callTool('list_tags', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('list_id');
    });
});

describe('add_tags_to_member', () => {
    it('sends tags POST and returns tags_updated: true', async () => {
        // Mailchimp returns 204 on tag update
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(null, {
            status: 204,
            headers: { 'Content-Type': 'application/json' },
        })));
        const tags = [
            { name: 'vip', status: 'active' as const },
            { name: 'churned', status: 'inactive' as const },
        ];
        const result = await getToolResult('add_tags_to_member', {
            list_id: 'abc123list',
            email: 'subscriber@example.com',
            tags,
        });
        expect(result.tags_updated).toBe(true);
        expect(result.email).toBe('subscriber@example.com');
        const call = mockFetch.mock.calls[0];
        const url = call[0] as string;
        expect(url).toContain('/tags');
        expect((call[1] as { method: string }).method).toBe('POST');
    });

    it('missing tags returns validation error', async () => {
        const body = await callTool('add_tags_to_member', {
            list_id: 'abc123list',
            email: 'x@x.com',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('tags');
    });

    it('missing email returns validation error', async () => {
        const body = await callTool('add_tags_to_member', {
            list_id: 'abc123list',
            tags: [{ name: 'vip', status: 'active' }],
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('email');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('Mailchimp 404 maps to Not found message', async () => {
        mockFetch.mockReturnValueOnce(mcErr('Resource Not Found', 'The requested resource could not be found', 404));
        const body = await callTool('get_audience', { list_id: 'nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Not found');
    });

    it('Mailchimp 422 validation error surfaces detail in message', async () => {
        mockFetch.mockReturnValueOnce(mcErr('Invalid Resource', 'Email address is invalid', 422));
        const body = await callTool('add_member', { list_id: 'abc123list', email: 'bademail' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Validation error');
    });
});

// ── E2E (skipped — require live Mailchimp API key) ────────────────────────────

describe.skip('E2E — live Mailchimp API (requires real key)', () => {
    it('list_audiences returns real audiences from account', async () => {
        // Requires MAILCHIMP_API_KEY in environment
    });

    it('add_member then unsubscribe_member round-trip', async () => {
        // Adds a test subscriber, then unsubscribes them
    });

    it('create_campaign and get_campaign', async () => {
        // Creates a draft campaign and fetches it back
    });
});
