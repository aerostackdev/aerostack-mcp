import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_KEY = 'test_brevo_api_key_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockAccount = {
    email: 'owner@mycompany.com',
    firstName: 'John',
    lastName: 'Owner',
    companyName: 'My Company',
    plan: [{ type: 'free', creditsType: 'sendLimit', credits: 300 }],
};

const mockContact = {
    id: 42,
    email: 'jane.smith@example.com',
    emailBlacklisted: false,
    smsBlacklisted: false,
    createdAt: '2026-01-15T09:00:00Z',
    modifiedAt: '2026-03-10T14:30:00Z',
    attributes: { FIRSTNAME: 'Jane', LASTNAME: 'Smith' },
    listIds: [1, 3],
};

const mockContactList = {
    contacts: [mockContact],
    count: 1,
};

const mockCampaign = {
    id: 12,
    name: 'March Newsletter',
    subject: "What's new in March",
    status: 'draft',
    type: 'classic',
    sender: { name: 'My Company', email: 'hello@mycompany.com' },
    statistics: {
        globalStats: {
            uniqueClicks: 120,
            clickers: 118,
            complaints: 1,
            delivered: 980,
            sent: 1000,
            softBounces: 10,
            hardBounces: 10,
            uniqueViews: 450,
            unsubscriptions: 5,
            viewed: 460,
        },
    },
};

const mockCampaignList = {
    campaigns: [mockCampaign],
    count: 1,
};

const mockTransactionalEmail = {
    messageId: '<202603281200.abc123@smtp-relay.mailin.fr>',
};

const mockSmsResult = {
    reference: 'sms_ref_abc123',
    messageId: 42,
    smsCount: 1,
    usedCredits: 0.5,
    remainingCredits: 99.5,
};

const mockSmtpStats = {
    uniqueClicks: 55,
    clickers: 52,
    complaints: 0,
    delivered: 980,
    sent: 1000,
    softBounces: 8,
    hardBounces: 12,
    uniqueViews: 400,
    unsubscriptions: 3,
    viewed: 410,
    requests: 1000,
    deferred: 0,
};

const mockTemplates = {
    count: 2,
    templates: [
        { id: 1, name: 'Welcome Email', subject: 'Welcome!', isActive: true },
        { id: 2, name: 'Password Reset', subject: 'Reset your password', isActive: true },
    ],
};

const mockList = {
    id: 5,
    name: 'Trial Users',
    totalSubscribers: 0,
    totalBlacklisted: 0,
    folderId: 1,
    createdAt: '2026-03-28T10:00:00Z',
};

const mockListsList = {
    lists: [mockList],
    count: 1,
};

const mockWebhook = {
    id: 3,
    url: 'https://myapp.example.com/brevo-webhook',
    description: 'Production events',
    events: ['sent', 'opened', 'clicked'],
    type: 'transactional',
    createdAt: '2026-03-28T10:00:00Z',
    modifiedAt: '2026-03-28T10:00:00Z',
};

const mockWebhooksList = {
    webhooks: [mockWebhook],
};

// ── Test helpers ──────────────────────────────────────────────────────────────

function ok(data: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
}

function ok204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function apiErr(message: string, code = 'invalid_parameter', status = 400) {
    return Promise.resolve(
        new Response(JSON.stringify({ code, message }), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('apiKey')) {
        headers['X-Mcp-Secret-BREVO-API-KEY'] = API_KEY;
    }
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function toolReq(name: string, args: unknown = {}, missingSecrets: string[] = []) {
    return makeReq('tools/call', { name, arguments: args }, missingSecrets);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

describe('MCP protocol', () => {
    it('GET returns health check', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        expect(res.status).toBe(200);
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-brevo');
        expect(body.tools).toBe(21);
    });

    it('non-POST/GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error', async () => {
        const res = await worker.fetch(
            new Request('http://localhost/', {
                method: 'POST',
                body: 'not-json',
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns server info', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as { result: { serverInfo: { name: string }; protocolVersion: string } };
        expect(body.result.serverInfo.name).toBe('mcp-brevo');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });

    it('tools/list returns 21 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(21);
    });

    it('unknown method returns -32601', async () => {
        const res = await worker.fetch(makeReq('foo/bar'));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

describe('_ping', () => {
    it('returns account info on success', async () => {
        mockFetch.mockReturnValueOnce(ok(mockAccount));
        const res = await worker.fetch(toolReq('_ping'));
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.brevo.com/v3/account',
            expect.objectContaining({ headers: expect.objectContaining({ 'api-key': API_KEY }) }),
        );
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ email: mockAccount.email });
    });

    it('returns error when API key missing', async () => {
        const res = await worker.fetch(toolReq('_ping', {}, ['apiKey']));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('BREVO_API_KEY');
    });
});

describe('list_contacts', () => {
    it('fetches contacts with no params', async () => {
        mockFetch.mockReturnValueOnce(ok(mockContactList));
        const res = await worker.fetch(toolReq('list_contacts'));
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.brevo.com/v3/contacts',
            expect.anything(),
        );
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text) as typeof mockContactList;
        expect(data.contacts).toHaveLength(1);
    });

    it('passes limit, offset, and modifiedSince as query params', async () => {
        mockFetch.mockReturnValueOnce(ok(mockContactList));
        await worker.fetch(toolReq('list_contacts', {
            limit: 100,
            offset: 50,
            modifiedSince: '2026-01-01T00:00:00Z',
        }));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('limit=100');
        expect(calledUrl).toContain('offset=50');
        expect(calledUrl).toContain('modifiedSince=');
    });
});

describe('get_contact', () => {
    it('fetches contact by email', async () => {
        mockFetch.mockReturnValueOnce(ok(mockContact));
        const res = await worker.fetch(toolReq('get_contact', { identifier: 'jane.smith@example.com' }));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/contacts/jane.smith%40example.com');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ id: 42 });
    });

    it('fetches contact by numeric ID', async () => {
        mockFetch.mockReturnValueOnce(ok(mockContact));
        await worker.fetch(toolReq('get_contact', { identifier: '42' }));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/contacts/42');
    });

    it('returns error when identifier missing', async () => {
        const res = await worker.fetch(toolReq('get_contact', {}));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('identifier');
    });
});

describe('create_contact', () => {
    it('creates contact with email only', async () => {
        mockFetch.mockReturnValueOnce(ok({ id: 99 }, 201));
        const res = await worker.fetch(toolReq('create_contact', { email: 'new@example.com' }));
        const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.email).toBe('new@example.com');
        expect(opts.method).toBe('POST');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ id: 99 });
    });

    it('creates contact with attributes, listIds, and updateEnabled', async () => {
        mockFetch.mockReturnValueOnce(ok({ id: 100 }, 201));
        await worker.fetch(toolReq('create_contact', {
            email: 'user@example.com',
            attributes: { FIRSTNAME: 'Alice', LASTNAME: 'Bob' },
            listIds: [1, 2],
            updateEnabled: true,
        }));
        const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.attributes).toEqual({ FIRSTNAME: 'Alice', LASTNAME: 'Bob' });
        expect(sent.listIds).toEqual([1, 2]);
        expect(sent.updateEnabled).toBe(true);
    });

    it('returns error when email missing', async () => {
        const res = await worker.fetch(toolReq('create_contact', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('email');
    });

    it('handles Brevo duplicate contact error', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Contact already exist', 'duplicate_parameter', 400));
        const res = await worker.fetch(toolReq('create_contact', { email: 'dup@example.com' }));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('Contact already exist');
    });
});

describe('update_contact', () => {
    it('updates contact attributes', async () => {
        mockFetch.mockReturnValueOnce(ok204());
        const res = await worker.fetch(toolReq('update_contact', {
            identifier: 'jane@example.com',
            attributes: { FIRSTNAME: 'Janet' },
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/contacts/jane%40example.com');
        expect(opts.method).toBe('PUT');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.attributes).toEqual({ FIRSTNAME: 'Janet' });
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ success: true });
    });

    it('updates list memberships', async () => {
        mockFetch.mockReturnValueOnce(ok204());
        await worker.fetch(toolReq('update_contact', {
            identifier: '42',
            listIds: [5],
            unlinkListIds: [1],
        }));
        const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.listIds).toEqual([5]);
        expect(sent.unlinkListIds).toEqual([1]);
    });

    it('returns error when identifier missing', async () => {
        const res = await worker.fetch(toolReq('update_contact', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('identifier');
    });
});

describe('delete_contact', () => {
    it('deletes contact by email', async () => {
        mockFetch.mockReturnValueOnce(ok204());
        const res = await worker.fetch(toolReq('delete_contact', { identifier: 'bye@example.com' }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/contacts/bye%40example.com');
        expect(opts.method).toBe('DELETE');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ success: true });
    });

    it('returns error when identifier missing', async () => {
        const res = await worker.fetch(toolReq('delete_contact', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('identifier');
    });

    it('propagates 404 not found', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Contact not found', 'document_not_found', 404));
        const res = await worker.fetch(toolReq('delete_contact', { identifier: 'ghost@example.com' }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_campaigns', () => {
    it('lists all campaigns', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCampaignList));
        const res = await worker.fetch(toolReq('list_campaigns'));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toBe('https://api.brevo.com/v3/emailCampaigns');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ count: 1 });
    });

    it('filters by type and status', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCampaignList));
        await worker.fetch(toolReq('list_campaigns', { type: 'classic', status: 'sent', limit: 20 }));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('type=classic');
        expect(calledUrl).toContain('status=sent');
        expect(calledUrl).toContain('limit=20');
    });
});

describe('get_campaign', () => {
    it('fetches campaign by ID', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCampaign));
        const res = await worker.fetch(toolReq('get_campaign', { campaignId: 12 }));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/emailCampaigns/12');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ id: 12 });
    });

    it('returns error when campaignId missing', async () => {
        const res = await worker.fetch(toolReq('get_campaign', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('campaignId');
    });
});

describe('create_campaign', () => {
    it('creates campaign with htmlContent', async () => {
        mockFetch.mockReturnValueOnce(ok({ id: 20 }, 201));
        await worker.fetch(toolReq('create_campaign', {
            name: 'Spring Sale',
            subject: 'Spring deals inside!',
            sender: { name: 'My Store', email: 'deals@mystore.com' },
            htmlContent: '<p>Hello!</p>',
            recipients: { listIds: [1] },
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.brevo.com/v3/emailCampaigns');
        expect(opts.method).toBe('POST');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.name).toBe('Spring Sale');
        expect(sent.htmlContent).toBe('<p>Hello!</p>');
    });

    it('creates campaign with templateId', async () => {
        mockFetch.mockReturnValueOnce(ok({ id: 21 }, 201));
        await worker.fetch(toolReq('create_campaign', {
            name: 'Template Campaign',
            subject: 'Check this out',
            sender: { name: 'Brand', email: 'hi@brand.com' },
            templateId: 5,
        }));
        const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.templateId).toBe(5);
    });

    it('returns error when name missing', async () => {
        const res = await worker.fetch(toolReq('create_campaign', { subject: 'Hi', sender: {} }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('name');
    });
});

describe('send_test_email', () => {
    it('sends test email', async () => {
        mockFetch.mockReturnValueOnce(ok204());
        const res = await worker.fetch(toolReq('send_test_email', {
            campaignId: 12,
            emailTo: ['tester@example.com'],
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/emailCampaigns/12/sendTest');
        expect(opts.method).toBe('POST');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ success: true });
    });
});

describe('get_campaign_stats', () => {
    it('returns campaign statistics', async () => {
        mockFetch.mockReturnValueOnce(ok(mockCampaign));
        const res = await worker.fetch(toolReq('get_campaign_stats', { campaignId: 12 }));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/emailCampaigns/12');
        expect(calledUrl).toContain('statistics=true');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text) as typeof mockCampaign;
        expect(data.statistics.globalStats.delivered).toBe(980);
    });
});

describe('send_email', () => {
    it('sends transactional email with htmlContent', async () => {
        mockFetch.mockReturnValueOnce(ok(mockTransactionalEmail, 201));
        const res = await worker.fetch(toolReq('send_email', {
            sender: { name: 'Support', email: 'support@myco.com' },
            to: [{ email: 'user@example.com', name: 'User' }],
            subject: 'Your order is confirmed',
            htmlContent: '<p>Thanks for ordering!</p>',
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.brevo.com/v3/smtp/email');
        expect(opts.method).toBe('POST');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ messageId: mockTransactionalEmail.messageId });
    });

    it('sends transactional email with templateId and params', async () => {
        mockFetch.mockReturnValueOnce(ok(mockTransactionalEmail, 201));
        await worker.fetch(toolReq('send_email', {
            sender: { name: 'Billing', email: 'billing@myco.com' },
            to: [{ email: 'user@example.com' }],
            templateId: 3,
            params: { invoiceId: 'INV-001', amount: '$99' },
        }));
        const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.templateId).toBe(3);
        expect(sent.params).toEqual({ invoiceId: 'INV-001', amount: '$99' });
    });

    it('returns error when sender missing', async () => {
        const res = await worker.fetch(toolReq('send_email', { to: [{ email: 'u@e.com' }] }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('sender');
    });

    it('returns error when to missing', async () => {
        const res = await worker.fetch(toolReq('send_email', { sender: { name: 'Me', email: 'me@co.com' } }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('to');
    });
});

describe('send_sms', () => {
    it('sends transactional SMS', async () => {
        mockFetch.mockReturnValueOnce(ok(mockSmsResult, 201));
        const res = await worker.fetch(toolReq('send_sms', {
            recipient: '+14155552671',
            content: 'Your verification code is 1234',
            sender: 'MyBrand',
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.brevo.com/v3/transactionalSMS/sms');
        expect(opts.method).toBe('POST');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.recipient).toBe('+14155552671');
        expect(sent.sender).toBe('MyBrand');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ reference: mockSmsResult.reference });
    });

    it('returns error when content missing', async () => {
        const res = await worker.fetch(toolReq('send_sms', { recipient: '+1555', sender: 'Brand' }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('content');
    });
});

describe('get_smtp_stats', () => {
    it('fetches aggregated stats by date range', async () => {
        mockFetch.mockReturnValueOnce(ok(mockSmtpStats));
        const res = await worker.fetch(toolReq('get_smtp_stats', {
            startDate: '2026-03-01',
            endDate: '2026-03-28',
        }));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/smtp/statistics/aggregatedReport');
        expect(calledUrl).toContain('startDate=2026-03-01');
        expect(calledUrl).toContain('endDate=2026-03-28');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ delivered: 980 });
    });

    it('fetches stats by days and tag', async () => {
        mockFetch.mockReturnValueOnce(ok(mockSmtpStats));
        await worker.fetch(toolReq('get_smtp_stats', { days: 7, tag: 'welcome' }));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('days=7');
        expect(calledUrl).toContain('tag=welcome');
    });
});

describe('list_email_templates', () => {
    it('lists templates', async () => {
        mockFetch.mockReturnValueOnce(ok(mockTemplates));
        const res = await worker.fetch(toolReq('list_email_templates'));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/smtp/templates');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ count: 2 });
    });

    it('filters active templates', async () => {
        mockFetch.mockReturnValueOnce(ok(mockTemplates));
        await worker.fetch(toolReq('list_email_templates', { status: 'active' }));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('enabled=true');
    });

    it('filters inactive templates', async () => {
        mockFetch.mockReturnValueOnce(ok(mockTemplates));
        await worker.fetch(toolReq('list_email_templates', { status: 'inactive' }));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('enabled=false');
    });
});

describe('list_lists', () => {
    it('lists contact lists', async () => {
        mockFetch.mockReturnValueOnce(ok(mockListsList));
        const res = await worker.fetch(toolReq('list_lists', { limit: 10, offset: 0 }));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/contacts/lists');
        expect(calledUrl).toContain('limit=10');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ count: 1 });
    });
});

describe('create_list', () => {
    it('creates a list', async () => {
        mockFetch.mockReturnValueOnce(ok(mockList, 201));
        const res = await worker.fetch(toolReq('create_list', { name: 'Trial Users', folderId: 1 }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.brevo.com/v3/contacts/lists');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.name).toBe('Trial Users');
        expect(sent.folderId).toBe(1);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ id: 5 });
    });

    it('returns error when name missing', async () => {
        const res = await worker.fetch(toolReq('create_list', {}));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('name');
    });
});

describe('add_contacts_to_list', () => {
    it('adds contacts to list', async () => {
        mockFetch.mockReturnValueOnce(ok({ contacts: 2, failures: [] }));
        const res = await worker.fetch(toolReq('add_contacts_to_list', {
            listId: 5,
            emails: ['a@example.com', 'b@example.com'],
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/contacts/lists/5/contacts/add');
        expect(opts.method).toBe('POST');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.emails).toEqual(['a@example.com', 'b@example.com']);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ contacts: 2 });
    });

    it('returns error when listId missing', async () => {
        const res = await worker.fetch(toolReq('add_contacts_to_list', { emails: ['a@b.com'] }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('listId');
    });
});

describe('remove_contacts_from_list', () => {
    it('removes contacts from list', async () => {
        mockFetch.mockReturnValueOnce(ok({ contacts: 1, failures: [] }));
        await worker.fetch(toolReq('remove_contacts_from_list', {
            listId: 5,
            emails: ['a@example.com'],
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/contacts/lists/5/contacts/remove');
        expect(opts.method).toBe('POST');
    });

    it('returns error when emails missing', async () => {
        const res = await worker.fetch(toolReq('remove_contacts_from_list', { listId: 5 }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('emails');
    });
});

describe('create_event', () => {
    it('tracks event for a contact', async () => {
        mockFetch.mockReturnValueOnce(ok({}));
        await worker.fetch(toolReq('create_event', {
            event_name: 'purchase',
            email: 'user@example.com',
            event_date: '2026-03-28T12:00:00Z',
            properties: { amount: 99.99, plan: 'pro' },
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.brevo.com/v3/events');
        expect(opts.method).toBe('POST');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.event_name).toBe('purchase');
        expect(sent.email).toBe('user@example.com');
        expect(sent.properties).toEqual({ amount: 99.99, plan: 'pro' });
    });

    it('returns error when event_name missing', async () => {
        const res = await worker.fetch(toolReq('create_event', { email: 'u@e.com' }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('event_name');
    });

    it('returns error when email missing', async () => {
        const res = await worker.fetch(toolReq('create_event', { event_name: 'click' }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('email');
    });
});

describe('list_webhooks', () => {
    it('lists all webhooks', async () => {
        mockFetch.mockReturnValueOnce(ok(mockWebhooksList));
        const res = await worker.fetch(toolReq('list_webhooks'));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toBe('https://api.brevo.com/v3/webhooks');
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ webhooks: [{ id: 3 }] });
    });

    it('filters by type', async () => {
        mockFetch.mockReturnValueOnce(ok(mockWebhooksList));
        await worker.fetch(toolReq('list_webhooks', { type: 'transactional' }));
        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('type=transactional');
    });
});

describe('create_webhook', () => {
    it('creates a webhook', async () => {
        mockFetch.mockReturnValueOnce(ok(mockWebhook, 201));
        const res = await worker.fetch(toolReq('create_webhook', {
            url: 'https://myapp.example.com/brevo-webhook',
            description: 'Production events',
            events: ['sent', 'opened', 'clicked'],
            type: 'transactional',
        }));
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.brevo.com/v3/webhooks');
        expect(opts.method).toBe('POST');
        const sent = JSON.parse(opts.body as string) as Record<string, unknown>;
        expect(sent.url).toBe('https://myapp.example.com/brevo-webhook');
        expect(sent.events).toEqual(['sent', 'opened', 'clicked']);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toMatchObject({ id: 3 });
    });

    it('returns error when url missing', async () => {
        const res = await worker.fetch(toolReq('create_webhook', { events: ['sent'] }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('url');
    });

    it('returns error when events missing', async () => {
        const res = await worker.fetch(toolReq('create_webhook', { url: 'https://example.com/hook' }));
        const body = await res.json() as { error: { message: string } };
        expect(body.error.message).toContain('events');
    });
});

describe('auth guard', () => {
    it('returns -32001 for every tool when API key is missing', async () => {
        const tools = [
            'list_contacts', 'get_contact', 'create_contact', 'update_contact', 'delete_contact',
            'list_campaigns', 'get_campaign', 'create_campaign', 'send_test_email', 'get_campaign_stats',
            'send_email', 'send_sms', 'get_smtp_stats', 'list_email_templates',
            'list_lists', 'create_list', 'add_contacts_to_list', 'remove_contacts_from_list',
            'create_event', 'list_webhooks', 'create_webhook',
        ];
        for (const tool of tools) {
            const res = await worker.fetch(toolReq(tool, {}, ['apiKey']));
            const body = await res.json() as { error: { code: number } };
            expect(body.error.code, `${tool} should return -32001`).toBe(-32001);
        }
    });
});

describe('API error propagation', () => {
    it('propagates 401 unauthorized as -32603', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Invalid API key', 'unauthorized', 401));
        const res = await worker.fetch(toolReq('list_contacts'));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('401');
    });

    it('propagates 429 rate limit as -32603', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Too many requests', 'too_many_requests', 429));
        const res = await worker.fetch(toolReq('list_contacts'));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });

    it('handles non-JSON response body', async () => {
        mockFetch.mockReturnValueOnce(
            Promise.resolve(new Response('Bad Gateway', { status: 502 })),
        );
        const res = await worker.fetch(toolReq('list_contacts'));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('502');
    });
});
