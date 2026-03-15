import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ────────────────────────────────────────────────────────────────

const API_KEY = 'test_freshdesk_api_key_abc123';
const DOMAIN = 'testcompany';

// ── Mock data ────────────────────────────────────────────────────────────────

const mockTicket = {
    id: 1001,
    subject: 'Test ticket',
    description: '<p>Test ticket description</p>',
    description_text: 'Test ticket description',
    status: 2,
    priority: 2,
    type: 'Question',
    requester_id: 500,
    responder_id: 600,
    group_id: 700,
    company_id: 800,
    tags: ['billing', 'urgent'],
    fr_due_by: '2024-01-10T00:00:00Z',
    due_by: '2024-01-15T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    email: 'customer@acme.com',
};

const mockContact = {
    id: 500,
    name: 'Sarah Chen',
    email: 'sarah@acme.com',
    phone: '+447911123456',
    mobile: '+447900000000',
    company_id: 800,
    tags: ['vip'],
    description: 'Enterprise contact',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    active: true,
};

const mockCompany = {
    id: 800,
    name: 'Acme Corp',
    description: 'Enterprise customer',
    domains: ['acme.com'],
    note: 'Key account',
    created_at: '2022-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
};

const mockAgent = {
    id: 600,
    contact: {
        name: 'Bob Agent',
        email: 'bob@testcompany.com',
        phone: '+441234567890',
        mobile: null,
    },
    type: 'fulltime',
    ticket_scope: 1,
    available: true,
    groups: [{ id: 700, name: 'Support Team' }],
    created_at: '2022-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
};

const mockGroup = {
    id: 700,
    name: 'Support Team',
    description: 'General support group',
    escalate_to: null,
    unassigned_for: '30m',
    created_at: '2022-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
};

const mockConversation = {
    id: 9001,
    body: '<p>Reply from agent</p>',
    body_text: 'Reply from agent',
    incoming: false,
    private: false,
    user_id: 600,
    support_email: 'support@testcompany.freshdesk.com',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fdOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function fdNoContent() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function fdErr(description: string, errors: unknown[] = [], status = 422) {
    return Promise.resolve(new Response(JSON.stringify({ description, errors }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, missingSecrets: string[] = []) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('apikey')) headers['X-Mcp-Secret-FRESHDESK-API-KEY'] = API_KEY;
    if (!missingSecrets.includes('domain')) headers['X-Mcp-Secret-FRESHDESK-DOMAIN'] = DOMAIN;
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
    it('GET / returns status ok with server mcp-freshdesk and tools 25', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-freshdesk');
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
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-freshdesk');
    });

    it('tools/list returns exactly 25 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(25);
        for (const tool of body.result.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
        }
    });

    it('tools/list contains all 25 expected tool names', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string }> } };
        const names = body.result.tools.map(t => t.name);
        const expected = [
            'list_tickets', 'get_ticket', 'create_ticket', 'update_ticket', 'delete_ticket',
            'list_ticket_conversations', 'add_reply', 'add_note', 'update_ticket_status',
            'list_contacts', 'get_contact', 'create_contact', 'update_contact', 'search_contacts', 'merge_contacts',
            'list_companies', 'get_company', 'create_company', 'list_company_contacts',
            'list_agents', 'get_agent', 'get_current_agent',
            'list_groups', 'get_group',
            'get_ticket_stats',
        ];
        for (const name of expected) {
            expect(names).toContain(name);
        }
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq('unknown/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('notifications/initialized returns ok', async () => {
        const req = makeReq('notifications/initialized');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: unknown };
        expect(body.result).toBeDefined();
    });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing both secrets returns -32001', async () => {
        const body = await callTool('list_tickets', {}, ['apikey', 'domain']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('FRESHDESK_API_KEY');
    });

    it('missing apikey only returns -32001', async () => {
        const body = await callTool('list_tickets', {}, ['apikey']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('missing domain only returns -32001', async () => {
        const body = await callTool('list_tickets', {}, ['domain']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('auth header uses Basic btoa(apiKey:X) format', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockTicket]));
        await callTool('list_tickets', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        const expectedAuth = `Basic ${btoa(`${API_KEY}:X`)}`;
        expect(headers['Authorization']).toBe(expectedAuth);
    });

    it('Freshdesk 401 maps to authentication failed message', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ description: 'Invalid credentials' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
        )));
        const body = await callTool('list_tickets', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Authentication failed');
    });

    it('Freshdesk 404 maps to not found message', async () => {
        mockFetch.mockReturnValueOnce(fdErr('Resource not found', [], 404));
        const body = await callTool('get_ticket', { id: 9999 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Not found');
    });

    it('Freshdesk 429 maps to rate limited message', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ description: 'Too many requests' }),
            { status: 429, headers: { 'Content-Type': 'application/json' } },
        )));
        const body = await callTool('list_tickets', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Rate limited');
    });
});

// ── Tickets ───────────────────────────────────────────────────────────────────

describe('list_tickets', () => {
    it('returns shaped array of tickets with status and priority labels', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockTicket]));
        const result = await getToolResult('list_tickets');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(1001);
        expect(result[0].subject).toBe('Test ticket');
        expect(result[0].status).toBe('open');
        expect(result[0].status_code).toBe(2);
        expect(result[0].priority).toBe('medium');
        expect(result[0].priority_code).toBe(2);
        expect(result[0].tags).toEqual(['billing', 'urgent']);
    });

    it('builds correct URL with default params', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockTicket]));
        await getToolResult('list_tickets');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('testcompany.freshdesk.com/api/v2/tickets');
        expect(url).toContain('per_page=20');
        expect(url).toContain('page=1');
        expect(url).toContain('order_by=created_at');
        expect(url).toContain('order_type=desc');
    });

    it('with filter adds filter param to URL', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockTicket]));
        await getToolResult('list_tickets', { filter: 'new_and_my_open' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('filter=new_and_my_open');
    });

    it('with requester_id adds requester_id param to URL', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockTicket]));
        await getToolResult('list_tickets', { requester_id: 500 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('requester_id=500');
    });

    it('with custom per_page and page uses those values', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockTicket]));
        await getToolResult('list_tickets', { per_page: 50, page: 3 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('per_page=50');
        expect(url).toContain('page=3');
    });
});

describe('get_ticket', () => {
    it('returns all shaped fields', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockTicket));
        const result = await getToolResult('get_ticket', { id: 1001 });
        expect(result.id).toBe(1001);
        expect(result.subject).toBe('Test ticket');
        expect(result.description).toBe('Test ticket description');
        expect(result.status).toBe('open');
        expect(result.priority).toBe('medium');
        expect(result.type).toBe('Question');
        expect(result.tags).toEqual(['billing', 'urgent']);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_ticket', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_ticket', () => {
    it('returns shaped ticket with id and status', async () => {
        mockFetch.mockReturnValueOnce(fdOk({ ...mockTicket, id: 999 }));
        const result = await getToolResult('create_ticket', {
            subject: 'New ticket',
            description: 'Something broke',
            email: 'customer@acme.com',
        });
        expect(result.id).toBe(999);
        expect(result.status).toBe('open');
        expect(result.priority).toBe('medium');
    });

    it('POST body includes subject, description, email, priority, status', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockTicket));
        await getToolResult('create_ticket', {
            subject: 'Test',
            description: 'Desc',
            email: 'test@example.com',
            priority: 3,
            status: 3,
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as {
            subject: string; email: string; priority: number; status: number;
        };
        expect(reqBody.subject).toBe('Test');
        expect(reqBody.email).toBe('test@example.com');
        expect(reqBody.priority).toBe(3);
        expect(reqBody.status).toBe(3);
    });

    it('with tags includes tags in POST body', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockTicket));
        await getToolResult('create_ticket', {
            subject: 'Tagged ticket',
            description: 'Desc',
            email: 'test@example.com',
            tags: ['billing', 'api'],
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { tags: string[] };
        expect(reqBody.tags).toEqual(['billing', 'api']);
    });

    it('missing subject returns validation error', async () => {
        const body = await callTool('create_ticket', { description: 'no subject', email: 'x@x.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('subject');
    });

    it('missing description returns validation error', async () => {
        const body = await callTool('create_ticket', { subject: 'no desc', email: 'x@x.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('description');
    });

    it('missing email returns validation error', async () => {
        const body = await callTool('create_ticket', { subject: 'no email', description: 'desc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('email');
    });
});

describe('update_ticket', () => {
    it('calls PUT to correct ticket URL', async () => {
        mockFetch.mockReturnValueOnce(fdOk({ ...mockTicket, status: 4 }));
        const result = await getToolResult('update_ticket', { id: 1001, status: 4 });
        expect(result.id).toBe(1001);
        expect(result.status).toBe('resolved');
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
        expect(call[0]).toContain('/tickets/1001');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('update_ticket', { status: 4 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });

    it('only defined fields are sent in PUT body', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockTicket));
        await getToolResult('update_ticket', { id: 1001, priority: 4 });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(reqBody.priority).toBe(4);
        expect(reqBody.status).toBeUndefined();
        expect(reqBody.subject).toBeUndefined();
    });
});

describe('delete_ticket', () => {
    it('calls DELETE and returns success', async () => {
        mockFetch.mockReturnValueOnce(fdNoContent());
        const result = await getToolResult('delete_ticket', { id: 1001 });
        expect(result.success).toBe(true);
        expect(result.deleted_ticket_id).toBe(1001);
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('DELETE');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('delete_ticket', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('list_ticket_conversations', () => {
    it('returns shaped conversations array', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockConversation]));
        const result = await getToolResult('list_ticket_conversations', { id: 1001 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(9001);
        expect(result[0].body).toBe('Reply from agent');
        expect(result[0].private).toBe(false);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('list_ticket_conversations', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('add_reply', () => {
    it('POSTs to /tickets/{id}/reply and returns shaped response', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockConversation));
        const result = await getToolResult('add_reply', { id: 1001, body: '<p>Hello</p>' });
        expect(result.id).toBe(9001);
        expect(result.ticket_id).toBe(1001);
        expect(result.private).toBe(false);
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/tickets/1001/reply');
        expect((call[1] as { method: string }).method).toBe('POST');
    });

    it('cc_emails and bcc_emails are passed in POST body', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockConversation));
        await getToolResult('add_reply', {
            id: 1001,
            body: 'Reply',
            cc_emails: ['cc@example.com'],
            bcc_emails: ['bcc@example.com'],
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { cc_emails: string[]; bcc_emails: string[] };
        expect(reqBody.cc_emails).toEqual(['cc@example.com']);
        expect(reqBody.bcc_emails).toEqual(['bcc@example.com']);
    });

    it('missing body returns validation error', async () => {
        const body = await callTool('add_reply', { id: 1001 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('body');
    });
});

describe('add_note', () => {
    it('POSTs to /tickets/{id}/notes with private=true by default', async () => {
        mockFetch.mockReturnValueOnce(fdOk({ ...mockConversation, private: true }));
        const result = await getToolResult('add_note', { id: 1001, body: 'Internal note' });
        expect(result.id).toBe(9001);
        expect(result.private).toBe(true);
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/tickets/1001/notes');
        const reqBody = JSON.parse(call[1].body as string) as { private: boolean };
        expect(reqBody.private).toBe(true);
    });

    it('notify_emails included in POST body when provided', async () => {
        mockFetch.mockReturnValueOnce(fdOk({ ...mockConversation, private: true }));
        await getToolResult('add_note', { id: 1001, body: 'Note', notify_emails: ['agent@company.com'] });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { notify_emails: string[] };
        expect(reqBody.notify_emails).toEqual(['agent@company.com']);
    });

    it('missing body returns validation error', async () => {
        const body = await callTool('add_note', { id: 1001 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('body');
    });
});

describe('update_ticket_status', () => {
    it('PUTs only status field and returns updated status label', async () => {
        mockFetch.mockReturnValueOnce(fdOk({ ...mockTicket, status: 4 }));
        const result = await getToolResult('update_ticket_status', { id: 1001, status: 4 });
        expect(result.id).toBe(1001);
        expect(result.status).toBe('resolved');
        expect(result.status_code).toBe(4);
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { status: number };
        expect(reqBody.status).toBe(4);
    });

    it('missing status returns validation error', async () => {
        const body = await callTool('update_ticket_status', { id: 1001 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('status');
    });
});

// ── Contacts ──────────────────────────────────────────────────────────────────

describe('list_contacts', () => {
    it('returns shaped contacts array', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockContact]));
        const result = await getToolResult('list_contacts');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(500);
        expect(result[0].name).toBe('Sarah Chen');
        expect(result[0].email).toBe('sarah@acme.com');
    });

    it('email filter is passed to URL', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockContact]));
        await getToolResult('list_contacts', { email: 'sarah@acme.com' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('email=sarah%40acme.com');
    });
});

describe('get_contact', () => {
    it('returns full contact details', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockContact));
        const result = await getToolResult('get_contact', { id: 500 });
        expect(result.id).toBe(500);
        expect(result.description).toBe('Enterprise contact');
        expect(result.tags).toEqual(['vip']);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_contact', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_contact', () => {
    it('returns shaped contact with id', async () => {
        mockFetch.mockReturnValueOnce(fdOk({ ...mockContact, id: 501 }));
        const result = await getToolResult('create_contact', { name: 'New Contact', email: 'new@acme.com' });
        expect(result.id).toBe(501);
        expect(result.name).toBe('Sarah Chen');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_contact', { email: 'no-name@acme.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });

    it('optional fields included in POST body when provided', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockContact));
        await getToolResult('create_contact', {
            name: 'Test',
            email: 'test@example.com',
            phone: '+1234567890',
            company_id: 800,
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { phone: string; company_id: number };
        expect(reqBody.phone).toBe('+1234567890');
        expect(reqBody.company_id).toBe(800);
    });
});

describe('update_contact', () => {
    it('calls PUT to correct contact URL', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockContact));
        const result = await getToolResult('update_contact', { id: 500, name: 'Updated Name' });
        expect(result.id).toBe(500);
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
        expect(call[0]).toContain('/contacts/500');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('update_contact', { name: 'No ID' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('search_contacts', () => {
    it('returns shaped contacts from search query', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockContact]));
        const result = await getToolResult('search_contacts', { term: 'sarah' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(500);
    });

    it('missing term returns validation error', async () => {
        const body = await callTool('search_contacts', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('term');
    });
});

describe('merge_contacts', () => {
    it('POSTs to /contacts/{id}/merge and returns success', async () => {
        mockFetch.mockReturnValueOnce(fdNoContent());
        const result = await getToolResult('merge_contacts', { id: 500, target_contact_id: 501 });
        expect(result.success).toBe(true);
        expect(result.target_contact_id).toBe(500);
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/contacts/500/merge');
        expect((call[1] as { method: string }).method).toBe('POST');
    });

    it('missing target_contact_id returns validation error', async () => {
        const body = await callTool('merge_contacts', { id: 500 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('target_contact_id');
    });
});

// ── Companies ─────────────────────────────────────────────────────────────────

describe('list_companies', () => {
    it('returns shaped companies array', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockCompany]));
        const result = await getToolResult('list_companies');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(800);
        expect(result[0].name).toBe('Acme Corp');
        expect(result[0].domains).toEqual(['acme.com']);
    });
});

describe('get_company', () => {
    it('returns full company details', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockCompany));
        const result = await getToolResult('get_company', { id: 800 });
        expect(result.id).toBe(800);
        expect(result.note).toBe('Key account');
        expect(result.domains).toEqual(['acme.com']);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_company', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_company', () => {
    it('returns shaped company with id', async () => {
        mockFetch.mockReturnValueOnce(fdOk({ ...mockCompany, id: 801 }));
        const result = await getToolResult('create_company', {
            name: 'New Corp',
            domains: ['newcorp.com'],
        });
        expect(result.id).toBe(801);
        expect(result.name).toBe('Acme Corp');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_company', { description: 'no name' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('list_company_contacts', () => {
    it('returns shaped contacts for company', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockContact]));
        const result = await getToolResult('list_company_contacts', { id: 800 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(500);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/companies/800/contacts');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('list_company_contacts', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Agents ────────────────────────────────────────────────────────────────────

describe('list_agents', () => {
    it('returns shaped agents array', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockAgent]));
        const result = await getToolResult('list_agents');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(600);
        expect(result[0].name).toBe('Bob Agent');
        expect(result[0].email).toBe('bob@testcompany.com');
        expect(result[0].available).toBe(true);
        expect(result[0].groups).toHaveLength(1);
    });

    it('uses per_page 50 by default', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockAgent]));
        await getToolResult('list_agents');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('per_page=50');
    });
});

describe('get_agent', () => {
    it('returns full agent details', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockAgent));
        const result = await getToolResult('get_agent', { id: 600 });
        expect(result.id).toBe(600);
        expect(result.name).toBe('Bob Agent');
        expect(result.type).toBe('fulltime');
        expect(result.groups[0].id).toBe(700);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_agent', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('get_current_agent', () => {
    it('calls GET /agents/me and returns shaped agent', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockAgent));
        const result = await getToolResult('get_current_agent');
        expect(result.id).toBe(600);
        expect(result.email).toBe('bob@testcompany.com');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/agents/me');
    });
});

// ── Groups ────────────────────────────────────────────────────────────────────

describe('list_groups', () => {
    it('returns shaped groups array', async () => {
        mockFetch.mockReturnValueOnce(fdOk([mockGroup]));
        const result = await getToolResult('list_groups');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(700);
        expect(result[0].name).toBe('Support Team');
    });
});

describe('get_group', () => {
    it('returns full group details', async () => {
        mockFetch.mockReturnValueOnce(fdOk(mockGroup));
        const result = await getToolResult('get_group', { id: 700 });
        expect(result.id).toBe(700);
        expect(result.description).toBe('General support group');
        expect(result.unassigned_for).toBe('30m');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_group', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Reports ───────────────────────────────────────────────────────────────────

describe('get_ticket_stats', () => {
    it('returns data when reports endpoint succeeds', async () => {
        const statsData = { open_count: 10, pending_count: 5, resolved_count: 100 };
        mockFetch.mockReturnValueOnce(fdOk(statsData));
        const result = await getToolResult('get_ticket_stats');
        expect(result.open_count).toBe(10);
    });

    it('returns helpful fallback message when endpoint returns 404', async () => {
        mockFetch.mockReturnValueOnce(fdErr('Not Found', [], 404));
        const result = await getToolResult('get_ticket_stats');
        expect(result.note).toContain('Freddy Analytics');
        expect(result.fallback).toBeDefined();
        expect(result.plan_upgrade_url).toContain('testcompany.freshdesk.com');
    });
});

// ── E2E (skipped — require real Freshdesk credentials) ───────────────────────

describe.skip('E2E — Freshdesk API (requires real credentials)', () => {
    it('E2E: list_tickets returns real tickets from Freshdesk', async () => {
        const result = await getToolResult('list_tickets', { per_page: 5 });
        expect(Array.isArray(result)).toBe(true);
    });

    it('E2E: get_current_agent returns the authenticated agent profile', async () => {
        const result = await getToolResult('get_current_agent');
        expect(result.id).toBeGreaterThan(0);
        expect(result.email).toBeTruthy();
    });

    it('E2E: list_agents returns agents array with group memberships', async () => {
        const result = await getToolResult('list_agents', { per_page: 5 });
        expect(Array.isArray(result)).toBe(true);
    });
});
