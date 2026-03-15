import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ────────────────────────────────────────────────────────────────

const API_KEY = 'SG.test_api_key_abc123xyz';

// ── Mock data ────────────────────────────────────────────────────────────────

const mockTemplate = {
    id: 'd-abc123def456',
    name: 'Welcome Email',
    generation: 'dynamic',
    updated_at: '2024-01-15T10:00:00Z',
    versions: [],
};

const mockTemplateVersion = {
    id: 'ver-001',
    template_id: 'd-abc123def456',
    name: 'Version 1',
    subject: 'Welcome to {{company}}!',
    html_content: '<p>Hello {{first_name}}</p>',
    plain_content: 'Hello {{first_name}}',
    active: 1,
    updated_at: '2024-01-15T10:00:00Z',
};

const mockContact = {
    id: 'contact-uuid-001',
    email: 'alice@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-10T00:00:00Z',
};

const mockContactList = {
    id: 'list-uuid-001',
    name: 'Newsletter Subscribers',
    contact_count: 1250,
    created_at: '2023-06-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
};

const mockStats = [
    {
        date: '2024-01-01',
        stats: [{
            metrics: {
                requests: 100,
                delivered: 95,
                opens: 40,
                clicks: 20,
                bounces: 2,
                spam_reports: 0,
            },
        }],
    },
];

const mockBounce = {
    created: 1704067200,
    email: 'bounce@example.com',
    reason: '550 5.1.1 The email account does not exist',
    status: '5.1.1',
};

const mockSender = {
    id: 1001,
    nickname: 'Test Sender',
    from: { email: 'sender@example.com', name: 'Sender Name' },
    reply_to: { email: 'reply@example.com', name: 'Reply Name' },
    address: '123 Main St',
    city: 'San Francisco',
    country: 'US',
    verified: { status: true, reason: '' },
    locked: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sgOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function sgAccepted() {
    return Promise.resolve(new Response(null, { status: 202 }));
}

function sgNoContent() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function sgErr(errors: Array<{ message: string; field?: string }>, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ errors }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, missingAuth = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingAuth) headers['X-Mcp-Secret-SENDGRID-API-KEY'] = API_KEY;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(toolName: string, args: Record<string, unknown> = {}, missingAuth = false) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingAuth);
}

async function callTool(toolName: string, args: Record<string, unknown> = {}, missingAuth = false) {
    const req = makeToolReq(toolName, args, missingAuth);
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
    it('GET / returns status ok with server mcp-sendgrid and tools 20', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-sendgrid');
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
        expect(body.result.serverInfo.name).toBe('mcp-sendgrid');
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

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing API key returns -32001 with helpful message', async () => {
        const body = await callTool('list_templates', {}, true);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('SENDGRID-API-KEY');
    });

    it('uses Bearer token Authorization header', async () => {
        mockFetch.mockReturnValueOnce(sgOk({ result: [], _metadata: {} }));
        await callTool('list_templates');
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${API_KEY}`);
    });

    it('SendGrid 401 maps to authentication failed message', async () => {
        mockFetch.mockReturnValueOnce(sgErr([{ message: 'The provided authorization grant is invalid, expired, or revoked' }], 401));
        const body = await callTool('list_templates');
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('authentication failed');
    });
});

// ── Email Sending ─────────────────────────────────────────────────────────────

describe('send_email', () => {
    it('returns success:true on 202 Accepted', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        const result = await getToolResult('send_email', {
            to: 'alice@example.com',
            from: 'sender@example.com',
            subject: 'Hello',
            content: [{ type: 'text/plain', value: 'Hello world' }],
        });
        expect(result.success).toBe(true);
    });

    it('builds personalizations with to as string', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        await callTool('send_email', { to: 'alice@example.com', from: 'me@example.com', subject: 'Hi' });
        const call = mockFetch.mock.calls[0];
        const sentBody = JSON.parse(call[1].body as string);
        expect(sentBody.personalizations[0].to).toEqual([{ email: 'alice@example.com' }]);
    });

    it('builds personalizations with to as object', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        await callTool('send_email', {
            to: { email: 'alice@example.com', name: 'Alice' },
            from: 'me@example.com',
            subject: 'Hi',
        });
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.personalizations[0].to).toEqual([{ email: 'alice@example.com', name: 'Alice' }]);
    });

    it('builds personalizations with to as array', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        await callTool('send_email', {
            to: [{ email: 'a@example.com' }, { email: 'b@example.com' }],
            from: 'me@example.com',
            subject: 'Hi',
        });
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.personalizations[0].to).toHaveLength(2);
    });

    it('includes template_id and dynamic_template_data in personalization', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        await callTool('send_email', {
            to: 'alice@example.com',
            from: 'me@example.com',
            template_id: 'd-abc123',
            dynamic_template_data: { first_name: 'Alice' },
        });
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.template_id).toBe('d-abc123');
        expect(sentBody.personalizations[0].dynamic_template_data).toEqual({ first_name: 'Alice' });
    });

    it('missing to returns -32603', async () => {
        const body = await callTool('send_email', { from: 'me@example.com', subject: 'Hi' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });
});

describe('send_bulk_email', () => {
    it('returns success:true on 202 Accepted', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        const result = await getToolResult('send_bulk_email', {
            personalizations: [
                { to: [{ email: 'a@example.com' }], dynamic_template_data: { name: 'Alice' } },
                { to: [{ email: 'b@example.com' }], dynamic_template_data: { name: 'Bob' } },
            ],
            from: { email: 'sender@example.com', name: 'Sender' },
            template_id: 'd-abc123',
        });
        expect(result.success).toBe(true);
    });

    it('sends personalizations array directly', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        const personalizations = [{ to: [{ email: 'x@y.com' }] }];
        await callTool('send_bulk_email', { personalizations, from: 'me@example.com', subject: 'Bulk' });
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.personalizations).toEqual(personalizations);
    });
});

describe('send_template_email', () => {
    it('returns success:true on 202', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        const result = await getToolResult('send_template_email', {
            template_id: 'd-abc123',
            to: 'alice@example.com',
            from: 'sender@example.com',
            dynamic_template_data: { first_name: 'Alice' },
        });
        expect(result.success).toBe(true);
    });

    it('sets template_id in request body', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        await callTool('send_template_email', {
            template_id: 'd-xyz789',
            to: 'alice@example.com',
            from: 'me@example.com',
        });
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.template_id).toBe('d-xyz789');
    });
});

describe('schedule_email', () => {
    it('returns success:true on 202', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        const result = await getToolResult('schedule_email', {
            to: 'alice@example.com',
            from: 'me@example.com',
            subject: 'Scheduled',
            content: [{ type: 'text/plain', value: 'This email was scheduled.' }],
            send_at: 1735689600,
        });
        expect(result.success).toBe(true);
    });

    it('includes send_at in request body', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        await callTool('schedule_email', {
            to: 'alice@example.com',
            from: 'me@example.com',
            subject: 'Scheduled',
            content: [{ type: 'text/plain', value: 'Hi' }],
            send_at: 1735689600,
        });
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.send_at).toBe(1735689600);
    });
});

// ── Templates ─────────────────────────────────────────────────────────────────

describe('list_templates', () => {
    it('returns templates array', async () => {
        mockFetch.mockReturnValueOnce(sgOk({ result: [mockTemplate], _metadata: { count: 1 } }));
        const result = await getToolResult('list_templates');
        expect(result.result).toHaveLength(1);
        expect(result.result[0].id).toBe('d-abc123def456');
    });

    it('calls correct URL with generations=dynamic', async () => {
        mockFetch.mockReturnValueOnce(sgOk({ result: [] }));
        await callTool('list_templates');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('generations=dynamic');
    });

    it('respects page_size param', async () => {
        mockFetch.mockReturnValueOnce(sgOk({ result: [] }));
        await callTool('list_templates', { page_size: 50 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('page_size=50');
    });
});

describe('get_template', () => {
    it('returns template object', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockTemplate));
        const result = await getToolResult('get_template', { template_id: 'd-abc123def456' });
        expect(result.id).toBe('d-abc123def456');
        expect(result.name).toBe('Welcome Email');
    });

    it('missing template_id returns error', async () => {
        const body = await callTool('get_template', {});
        expect(body.error).toBeDefined();
    });
});

describe('create_template', () => {
    it('returns created template', async () => {
        mockFetch.mockReturnValueOnce(sgOk({ ...mockTemplate, id: 'd-new123' }));
        const result = await getToolResult('create_template', { name: 'My New Template' });
        expect(result.id).toBe('d-new123');
    });

    it('sends correct body with generation dynamic', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockTemplate));
        await callTool('create_template', { name: 'Test Template' });
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.name).toBe('Test Template');
        expect(sentBody.generation).toBe('dynamic');
    });
});

describe('get_template_version', () => {
    it('returns template version', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockTemplateVersion));
        const result = await getToolResult('get_template_version', {
            template_id: 'd-abc123def456',
            version_id: 'ver-001',
        });
        expect(result.id).toBe('ver-001');
        expect(result.template_id).toBe('d-abc123def456');
    });
});

// ── Contacts & Lists ──────────────────────────────────────────────────────────

describe('search_contacts', () => {
    it('returns contacts matching query', async () => {
        mockFetch.mockReturnValueOnce(sgOk({ result: [mockContact], contact_count: 1 }));
        const result = await getToolResult('search_contacts', { query: "email LIKE 'alice%'" });
        expect(result.result).toHaveLength(1);
        expect(result.result[0].email).toBe('alice@example.com');
    });

    it('POSTs to /marketing/contacts/search', async () => {
        mockFetch.mockReturnValueOnce(sgOk({ result: [] }));
        await callTool('search_contacts', { query: "first_name = 'Alice'" });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/marketing/contacts/search');
        expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });
});

describe('get_contact', () => {
    it('returns contact by ID', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockContact));
        const result = await getToolResult('get_contact', { id: 'contact-uuid-001' });
        expect(result.id).toBe('contact-uuid-001');
        expect(result.email).toBe('alice@example.com');
    });
});

describe('upsert_contacts', () => {
    it('returns job_id on success', async () => {
        mockFetch.mockReturnValueOnce(sgOk({ job_id: 'job-abc123', persisted_recipients: ['alice@example.com'] }));
        const result = await getToolResult('upsert_contacts', {
            contacts: [{ email: 'alice@example.com', first_name: 'Alice' }],
        });
        expect(result.job_id).toBe('job-abc123');
    });

    it('PUTs to /marketing/contacts', async () => {
        mockFetch.mockReturnValueOnce(sgOk({ job_id: 'job-xyz' }));
        await callTool('upsert_contacts', { contacts: [{ email: 'a@b.com' }] });
        expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/marketing/contacts');
    });
});

describe('list_contact_lists', () => {
    it('returns lists array', async () => {
        mockFetch.mockReturnValueOnce(sgOk({ result: [mockContactList], _metadata: { count: 1 } }));
        const result = await getToolResult('list_contact_lists');
        expect(result.result).toHaveLength(1);
        expect(result.result[0].name).toBe('Newsletter Subscribers');
    });
});

describe('add_contacts_to_list', () => {
    it('returns success on 202', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        const result = await getToolResult('add_contacts_to_list', {
            list_id: 'list-uuid-001',
            contact_ids: ['contact-uuid-001', 'contact-uuid-002'],
        });
        expect(result.success).toBe(true);
    });

    it('POSTs to correct list endpoint', async () => {
        mockFetch.mockReturnValueOnce(sgAccepted());
        await callTool('add_contacts_to_list', {
            list_id: 'list-abc',
            contact_ids: ['c1'],
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/marketing/lists/list-abc/contacts');
    });
});

// ── Stats & Analytics ─────────────────────────────────────────────────────────

describe('get_global_stats', () => {
    it('returns stats array', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockStats));
        const result = await getToolResult('get_global_stats', { start_date: '2024-01-01' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].date).toBe('2024-01-01');
    });

    it('includes start_date and aggregated_by in URL', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockStats));
        await callTool('get_global_stats', { start_date: '2024-01-01', aggregated_by: 'week' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('start_date=2024-01-01');
        expect(url).toContain('aggregated_by=week');
    });

    it('defaults aggregated_by to day', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockStats));
        await callTool('get_global_stats', { start_date: '2024-01-01' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('aggregated_by=day');
    });
});

describe('get_email_stats', () => {
    it('returns stats for a category', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockStats));
        const result = await getToolResult('get_email_stats', {
            start_date: '2024-01-01',
            category: 'transactional',
        });
        expect(Array.isArray(result)).toBe(true);
    });

    it('includes category as categories param', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockStats));
        await callTool('get_email_stats', { start_date: '2024-01-01', category: 'transactional' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('categories=transactional');
    });
});

describe('get_template_stats', () => {
    it('returns template version stats', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockStats));
        const result = await getToolResult('get_template_stats', {
            template_id: 'd-abc123def456',
            version_id: 'ver-001',
            start_date: '2024-01-01',
        });
        expect(Array.isArray(result)).toBe(true);
    });

    it('calls correct template stats URL', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockStats));
        await callTool('get_template_stats', {
            template_id: 'd-abc123def456',
            version_id: 'ver-001',
            start_date: '2024-01-01',
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/templates/d-abc123def456/versions/ver-001/stats');
    });
});

describe('get_bounce_list', () => {
    it('returns bounce records', async () => {
        mockFetch.mockReturnValueOnce(sgOk([mockBounce]));
        const result = await getToolResult('get_bounce_list', { limit: 10 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].email).toBe('bounce@example.com');
    });

    it('includes limit param in URL', async () => {
        mockFetch.mockReturnValueOnce(sgOk([]));
        await callTool('get_bounce_list', { limit: 50 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('limit=50');
    });

    it('defaults limit to 20', async () => {
        mockFetch.mockReturnValueOnce(sgOk([]));
        await callTool('get_bounce_list', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('limit=20');
    });
});

// ── Sender Management ─────────────────────────────────────────────────────────

describe('list_senders', () => {
    it('returns senders array', async () => {
        mockFetch.mockReturnValueOnce(sgOk([mockSender]));
        const result = await getToolResult('list_senders');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(1001);
        expect(result[0].from.email).toBe('sender@example.com');
    });

    it('calls /senders endpoint', async () => {
        mockFetch.mockReturnValueOnce(sgOk([]));
        await callTool('list_senders');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/senders');
    });
});

describe('create_sender', () => {
    it('returns created sender', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockSender));
        const result = await getToolResult('create_sender', {
            from: { email: 'sender@example.com', name: 'Sender Name' },
            reply_to: { email: 'reply@example.com', name: 'Reply Name' },
            address: '123 Main St',
            city: 'San Francisco',
            country: 'US',
        });
        expect(result.id).toBe(1001);
        expect(result.from.email).toBe('sender@example.com');
    });

    it('POSTs to /senders', async () => {
        mockFetch.mockReturnValueOnce(sgOk(mockSender));
        await callTool('create_sender', {
            from: { email: 'a@b.com', name: 'A' },
            reply_to: { email: 'r@b.com', name: 'R' },
            address: '1 St',
            city: 'NY',
            country: 'US',
        });
        expect(mockFetch.mock.calls[0][1].method).toBe('POST');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/senders');
    });
});

describe('verify_sender_domain', () => {
    it('returns validation result', async () => {
        mockFetch.mockReturnValueOnce(sgOk({ valid: true, validation_results: {} }));
        const result = await getToolResult('verify_sender_domain', { domain_id: 42 });
        expect(result.valid).toBe(true);
    });

    it('calls correct domain validate endpoint', async () => {
        mockFetch.mockReturnValueOnce(sgOk({ valid: true }));
        await callTool('verify_sender_domain', { domain_id: 42 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/whitelabel/domains/42/validate');
    });

    it('missing domain_id returns error', async () => {
        const body = await callTool('verify_sender_domain', {});
        expect(body.error).toBeDefined();
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('SendGrid 403 maps to permission denied', async () => {
        mockFetch.mockReturnValueOnce(sgErr([{ message: 'Forbidden' }], 403));
        const body = await callTool('list_templates');
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('permission denied');
    });

    it('SendGrid 404 maps to not found', async () => {
        mockFetch.mockReturnValueOnce(sgErr([{ message: 'Not Found' }], 404));
        const body = await callTool('get_template', { template_id: 'd-nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('not found');
    });

    it('SendGrid 429 maps to rate limit message', async () => {
        mockFetch.mockReturnValueOnce(sgErr([{ message: 'Too Many Requests' }], 429));
        const body = await callTool('list_templates');
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('rate limit');
    });

    it('generic 500 returns API error message', async () => {
        mockFetch.mockReturnValueOnce(sgErr([{ message: 'Internal Server Error' }], 500));
        const body = await callTool('list_templates');
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('500');
    });
});

// ── E2E (skipped — requires real API key) ────────────────────────────────────

describe.skip('E2E — requires real SENDGRID_API_KEY', () => {
    it('E2E: list_templates returns real templates', async () => {
        // Set X-Mcp-Secret-SENDGRID-API-KEY header with a real key to run this
    });

    it('E2E: get_global_stats returns real metrics', async () => {
        // Requires a real SendGrid account with send history
    });

    it('E2E: search_contacts returns real contacts', async () => {
        // Requires SendGrid Marketing Campaigns to be enabled
    });
});
