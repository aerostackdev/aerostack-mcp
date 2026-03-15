import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ────────────────────────────────────────────────────────────────

const SUBDOMAIN = 'testcompany';
const EMAIL = 'admin@testcompany.com';
const TOKEN = 'test_api_token_abc123';

// ── Mock data ────────────────────────────────────────────────────────────────

const mockTicket = {
    id: 1001,
    subject: 'Test ticket',
    description: 'This is a test ticket description',
    status: 'open',
    priority: 'normal',
    type: 'problem',
    requester_id: 500,
    assignee_id: 600,
    group_id: 700,
    organization_id: 800,
    tags: ['billing', 'bot-escalation'],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    due_at: null,
    via: { channel: 'api' },
    custom_fields: [],
};

const mockUser = {
    id: 500,
    name: 'Sarah Chen',
    email: 'sarah@acme.com',
    phone: '+447911123456',
    role: 'end-user',
    organization_id: 800,
    tags: ['whatsapp'],
    notes: 'VIP customer',
    time_zone: 'London',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    active: true,
};

const mockOrg = {
    id: 800,
    name: 'Acme Corp',
    domain_names: ['acme.com'],
    tags: ['enterprise'],
    notes: 'Key account',
    group_id: 700,
    created_at: '2022-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
};

const mockArticle = {
    id: 200,
    title: 'How to export your data',
    body: '<p>To export your data, go to <b>Settings</b> &gt; Export.</p>',
    snippet: 'To export your data, go to Settings > Export.',
    html_url: 'https://testcompany.zendesk.com/hc/en-us/articles/200',
    vote_sum: 42,
    label_names: ['data', 'export'],
    created_at: '2023-06-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
};

const mockComment = {
    id: 9001,
    type: 'Comment',
    author_id: 600,
    body: 'This is a comment',
    html_body: '<p>This is a comment</p>',
    plain_body: 'This is a comment',
    public: false,
    created_at: '2024-01-02T00:00:00Z',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function zdOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function zdErr(error: string, description: string, status = 422) {
    return Promise.resolve(new Response(JSON.stringify({ error, description }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function zdValidationErr(field: string, msg: string) {
    return Promise.resolve(new Response(JSON.stringify({
        details: { [field]: [{ description: msg }] },
    }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, missingSecrets: string[] = []) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('subdomain')) headers['X-Mcp-Secret-ZENDESK-SUBDOMAIN'] = SUBDOMAIN;
    if (!missingSecrets.includes('email')) headers['X-Mcp-Secret-ZENDESK-EMAIL'] = EMAIL;
    if (!missingSecrets.includes('token')) headers['X-Mcp-Secret-ZENDESK-API-TOKEN'] = TOKEN;
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
    it('GET / returns status ok with server mcp-zendesk and tools 28', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-zendesk');
        expect(body.tools).toBe(28);
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
        expect(body.result.serverInfo.name).toBe('mcp-zendesk');
    });

    it('tools/list returns exactly 28 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(28);
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
    it('missing all secrets returns -32001 with helpful message', async () => {
        const body = await callTool('list_tickets', {}, ['subdomain', 'email', 'token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('ZENDESK_SUBDOMAIN');
    });

    it('missing subdomain only returns -32001', async () => {
        const body = await callTool('list_tickets', {}, ['subdomain']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('Zendesk 401 maps to Authentication failed message', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ error: 'Unauthorized', description: 'Not authorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
        )));
        const body = await callTool('list_tickets', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Authentication failed');
    });

    it('auth header format uses email/token:apiToken base64 encoding', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ tickets: [mockTicket] }));
        await callTool('list_tickets', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        const expectedAuth = `Basic ${btoa(`${EMAIL}/token:${TOKEN}`)}`;
        expect(headers.Authorization).toBe(expectedAuth);
    });
});

// ── Tickets ────────────────────────────────────────────────────────────────────

describe('list_tickets', () => {
    it('returns shaped array of tickets', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ tickets: [mockTicket] }));
        const result = await getToolResult('list_tickets');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(1001);
        expect(result[0].subject).toBe('Test ticket');
        expect(result[0].status).toBe('open');
        expect(result[0].tags).toEqual(['billing', 'bot-escalation']);
    });

    it('with status filter uses search endpoint', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ results: [mockTicket], count: 1 }));
        const result = await getToolResult('list_tickets', { status: 'open' });
        const call = mockFetch.mock.calls[0];
        const url = call[0] as string;
        expect(url).toContain('/search');
        expect(url).toContain('status%3Aopen');
        expect(Array.isArray(result)).toBe(true);
    });
});

describe('search_tickets', () => {
    it('returns total and tickets array', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ results: [mockTicket], count: 1 }));
        const result = await getToolResult('search_tickets', { query: 'billing refund' });
        expect(result.total).toBe(1);
        expect(Array.isArray(result.tickets)).toBe(true);
        expect(result.tickets[0].id).toBe(1001);
    });

    it('missing query returns validation error', async () => {
        const body = await callTool('search_tickets', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('query');
    });

    it('query includes type:ticket prefix in fetch URL', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ results: [], count: 0 }));
        await getToolResult('search_tickets', { query: 'status:open' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('type%3Aticket');
    });
});

describe('get_ticket', () => {
    it('returns all shaped fields', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ ticket: mockTicket }));
        const result = await getToolResult('get_ticket', { ticket_id: 1001 });
        expect(result.id).toBe(1001);
        expect(result.subject).toBe('Test ticket');
        expect(result.description).toBe('This is a test ticket description');
        expect(result.status).toBe('open');
        expect(result.channel).toBe('api');
        expect(result.tags).toEqual(['billing', 'bot-escalation']);
    });

    it('missing ticket_id returns validation error', async () => {
        const body = await callTool('get_ticket', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('ticket_id');
    });
});

describe('create_ticket', () => {
    it('returns ticket_id, url, and shaped fields', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ ticket: { ...mockTicket, id: 999 } }));
        const result = await getToolResult('create_ticket', {
            subject: 'New ticket',
            body: 'Something broke',
        });
        expect(result.ticket_id).toBe(999);
        expect(result.url).toContain('testcompany.zendesk.com/tickets/999');
        expect(result.status).toBe('open');
    });

    it('with channel "whatsapp" adds whatsapp to tags in fetch body', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ ticket: { ...mockTicket, id: 1000 } }));
        await getToolResult('create_ticket', {
            subject: 'WhatsApp ticket',
            body: 'Message from WA',
            channel: 'whatsapp',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { ticket: { tags: string[] } };
        expect(reqBody.ticket.tags).toContain('whatsapp');
    });

    it('with requester_email adds requester object in fetch body', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ ticket: { ...mockTicket, id: 1001 } }));
        await getToolResult('create_ticket', {
            subject: 'Requester ticket',
            body: 'From customer',
            requester_email: 'customer@example.com',
            requester_name: 'Customer Name',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { ticket: { requester: { email: string } } };
        expect(reqBody.ticket.requester.email).toBe('customer@example.com');
    });

    it('with internal_note makes a second fetch call for internal comment', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ ticket: { ...mockTicket, id: 1002 } }));
        mockFetch.mockReturnValueOnce(zdOk({ ticket: { ...mockTicket, id: 1002 } }));
        await getToolResult('create_ticket', {
            subject: 'Ticket with note',
            body: 'Public description',
            internal_note: 'This is a private AI summary',
        });
        expect(mockFetch).toHaveBeenCalledTimes(2);
        // Second call should be the internal note PUT
        const secondCall = mockFetch.mock.calls[1];
        expect((secondCall[1] as { method: string }).method).toBe('PUT');
        const noteBody = JSON.parse(secondCall[1].body as string) as {
            ticket: { comment: { body: string; public: boolean } }
        };
        expect(noteBody.ticket.comment.body).toBe('This is a private AI summary');
        expect(noteBody.ticket.comment.public).toBe(false);
    });

    it('missing subject returns validation error', async () => {
        const body = await callTool('create_ticket', { body: 'no subject' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('subject');
    });

    it('missing body returns validation error', async () => {
        const body = await callTool('create_ticket', { subject: 'no body' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('body');
    });
});

describe('update_ticket', () => {
    it('basic update calls PUT with ticket body', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ ticket: { ...mockTicket, status: 'solved' } }));
        const result = await getToolResult('update_ticket', {
            ticket_id: 1001,
            status: 'solved',
            priority: 'high',
        });
        expect(result.ticket_id).toBe(1001);
        expect(result.status).toBe('solved');
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
    });

    it('with add_tags fetches current tags first then merges', async () => {
        // First GET to fetch current tags
        mockFetch.mockReturnValueOnce(zdOk({ ticket: { ...mockTicket, tags: ['existing-tag'] } }));
        // Then PUT with merged tags
        mockFetch.mockReturnValueOnce(zdOk({ ticket: { ...mockTicket, tags: ['existing-tag', 'new-tag'] } }));
        const result = await getToolResult('update_ticket', {
            ticket_id: 1001,
            add_tags: ['new-tag'],
        });
        expect(mockFetch).toHaveBeenCalledTimes(2);
        // First call should be GET
        const firstCall = mockFetch.mock.calls[0];
        expect((firstCall[1] as { method: string }).method).toBe('GET');
        // Second call (PUT) should have merged tags
        const secondCall = mockFetch.mock.calls[1];
        const putBody = JSON.parse(secondCall[1].body as string) as { ticket: { tags: string[] } };
        expect(putBody.ticket.tags).toContain('existing-tag');
        expect(putBody.ticket.tags).toContain('new-tag');
        expect(result.tags).toContain('new-tag');
    });

    it('with comment includes comment in PUT body and defaults to public=false', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ ticket: mockTicket }));
        await getToolResult('update_ticket', {
            ticket_id: 1001,
            comment: 'Adding a note',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as {
            ticket: { comment: { body: string; public: boolean } }
        };
        expect(reqBody.ticket.comment.body).toBe('Adding a note');
        expect(reqBody.ticket.comment.public).toBe(false);
    });
});

describe('delete_ticket', () => {
    it('returns success with note about trash', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(null, { status: 204 })));
        const result = await getToolResult('delete_ticket', { ticket_id: 1001 });
        expect(result.success).toBe(true);
        expect(result.deleted_ticket_id).toBe(1001);
        expect(result.note).toContain('trash');
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('DELETE');
    });
});

describe('list_ticket_comments', () => {
    it('returns shaped comments array using plain_body', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ comments: [mockComment] }));
        const result = await getToolResult('list_ticket_comments', { ticket_id: 1001 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(9001);
        expect(result[0].author_id).toBe(600);
        expect(result[0].body).toBe('This is a comment');
        expect(result[0].public).toBe(false);
    });
});

describe('add_comment', () => {
    it('defaults to public=false (internal note)', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ ticket: mockTicket }));
        const result = await getToolResult('add_comment', {
            ticket_id: 1001,
            body: 'Internal note',
        });
        expect(result.comment_public).toBe(false);
        expect(result.note).toContain('Internal note');
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { ticket: { comment: { public: boolean } } };
        expect(reqBody.ticket.comment.public).toBe(false);
    });

    it('public=true sets public flag and note about customer visibility', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ ticket: mockTicket }));
        const result = await getToolResult('add_comment', {
            ticket_id: 1001,
            body: 'Public reply',
            public: true,
        });
        expect(result.comment_public).toBe(true);
        expect(result.note).toContain('Visible to customer');
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { ticket: { comment: { public: boolean } } };
        expect(reqBody.ticket.comment.public).toBe(true);
    });

    it('uses PUT /tickets/{id} not POST', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ ticket: mockTicket }));
        await getToolResult('add_comment', { ticket_id: 1001, body: 'test' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
        expect(call[0] as string).toContain('/tickets/1001');
    });
});

describe('merge_tickets', () => {
    it('returns success with merged_into and closed IDs', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ job_status: { id: 'job_abc123' } }));
        const result = await getToolResult('merge_tickets', {
            ticket_id: 1001,
            source_ticket_id: 1002,
        });
        expect(result.success).toBe(true);
        expect(result.merged_into).toBe(1001);
        expect(result.closed).toBe(1002);
    });

    it('includes target_comment and source_comment in request body if provided', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ job_status: { id: 'job_abc456' } }));
        await getToolResult('merge_tickets', {
            ticket_id: 1001,
            source_ticket_id: 1002,
            target_comment: 'Merged from duplicate',
            source_comment: 'This ticket was merged into #1001',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as {
            ids: number[];
            target_comment: string;
            source_comment: string;
        };
        expect(reqBody.ids).toContain(1002);
        expect(reqBody.target_comment).toBe('Merged from duplicate');
        expect(reqBody.source_comment).toBe('This ticket was merged into #1001');
    });
});

// ── Users ─────────────────────────────────────────────────────────────────────

describe('search_users', () => {
    it('returns shaped user array', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ users: [mockUser] }));
        const result = await getToolResult('search_users', { query: 'sarah@acme.com' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(500);
        expect(result[0].name).toBe('Sarah Chen');
        expect(result[0].email).toBe('sarah@acme.com');
        expect(result[0].role).toBe('end-user');
    });

    it('with role filter applies client-side role filter', async () => {
        const agentUser = { ...mockUser, id: 501, role: 'agent' };
        mockFetch.mockReturnValueOnce(zdOk({ users: [mockUser, agentUser] }));
        const result = await getToolResult('search_users', { query: 'test', role: 'agent' });
        expect(result).toHaveLength(1);
        expect(result[0].role).toBe('agent');
    });
});

describe('get_user', () => {
    it('returns all user fields', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ user: mockUser }));
        const result = await getToolResult('get_user', { user_id: 500 });
        expect(result.id).toBe(500);
        expect(result.name).toBe('Sarah Chen');
        expect(result.email).toBe('sarah@acme.com');
        expect(result.phone).toBe('+447911123456');
        expect(result.role).toBe('end-user');
        expect(result.notes).toBe('VIP customer');
        expect(result.time_zone).toBe('London');
        expect(result.active).toBe(true);
    });
});

describe('get_user_tickets', () => {
    it('returns shaped tickets array', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ tickets: [mockTicket] }));
        const result = await getToolResult('get_user_tickets', { user_id: 500 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(1001);
        expect(result[0].subject).toBe('Test ticket');
    });

    it('uses correct endpoint with sort params', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ tickets: [] }));
        await getToolResult('get_user_tickets', { user_id: 500 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/users/500/tickets/requested');
        expect(url).toContain('sort_by=updated_at');
    });
});

describe('create_user', () => {
    it('returns user_id and shaped fields', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ user: { ...mockUser, id: 123 } }));
        const result = await getToolResult('create_user', {
            name: 'New User',
            email: 'new@example.com',
        });
        expect(result.user_id).toBe(123);
        expect(result.name).toBe('Sarah Chen');
        expect(result.role).toBe('end-user');
    });

    it('role defaults to end-user in request body', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ user: mockUser }));
        await getToolResult('create_user', { name: 'Test User' });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { user: { role: string } };
        expect(reqBody.user.role).toBe('end-user');
    });
});

describe('update_user', () => {
    it('only sends provided fields in fetch body', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ user: { ...mockUser, name: 'Updated Name' } }));
        await getToolResult('update_user', { user_id: 500, name: 'Updated Name' });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { user: Record<string, unknown> };
        expect(reqBody.user.name).toBe('Updated Name');
        // email not provided, should not be in body
        expect(reqBody.user.email).toBeUndefined();
    });

    it('returns updated_fields list', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ user: mockUser }));
        const result = await getToolResult('update_user', {
            user_id: 500,
            name: 'New Name',
            phone: '+441234567890',
        });
        expect(result.updated_fields).toContain('name');
        expect(result.updated_fields).toContain('phone');
    });
});

describe('get_user_identities', () => {
    it('returns shaped identities array', async () => {
        mockFetch.mockReturnValueOnce(zdOk({
            identities: [
                { id: 1, type: 'email', value: 'sarah@acme.com', verified: true, primary: true },
                { id: 2, type: 'phone_number', value: '+447911123456', verified: false, primary: false },
            ],
        }));
        const result = await getToolResult('get_user_identities', { user_id: 500 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].type).toBe('email');
        expect(result[0].verified).toBe(true);
        expect(result[0].primary).toBe(true);
        expect(result[1].type).toBe('phone_number');
    });
});

// ── Organizations ─────────────────────────────────────────────────────────────

describe('search_organizations', () => {
    it('returns shaped organization array', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ organizations: [mockOrg] }));
        const result = await getToolResult('search_organizations', { query: 'Acme' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(800);
        expect(result[0].name).toBe('Acme Corp');
        expect(result[0].domain_names).toEqual(['acme.com']);
    });
});

describe('get_organization', () => {
    it('returns all org fields', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ organization: mockOrg }));
        const result = await getToolResult('get_organization', { organization_id: 800 });
        expect(result.id).toBe(800);
        expect(result.name).toBe('Acme Corp');
        expect(result.notes).toBe('Key account');
        expect(result.group_id).toBe(700);
    });
});

describe('create_organization', () => {
    it('returns organization_id and shaped fields', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ organization: { ...mockOrg, id: 456 } }));
        const result = await getToolResult('create_organization', {
            name: 'New Corp',
            domain_names: ['newcorp.com'],
        });
        expect(result.organization_id).toBe(456);
        expect(result.name).toBe('Acme Corp');
        expect(result.domain_names).toEqual(['acme.com']);
    });
});

describe('update_organization', () => {
    it('only sends provided fields in fetch body', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ organization: mockOrg }));
        await getToolResult('update_organization', {
            organization_id: 800,
            notes: 'Updated notes',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { organization: Record<string, unknown> };
        expect(reqBody.organization.notes).toBe('Updated notes');
        expect(reqBody.organization.name).toBeUndefined();
    });

    it('returns organization_id and updated_fields', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ organization: mockOrg }));
        const result = await getToolResult('update_organization', {
            organization_id: 800,
            name: 'New Name',
            tags: ['vip'],
        });
        expect(result.organization_id).toBe(800);
        expect(result.updated_fields).toContain('name');
        expect(result.updated_fields).toContain('tags');
    });
});

// ── Knowledge Base ────────────────────────────────────────────────────────────

describe('search_articles', () => {
    it('returns shaped article array with snippet and html_url', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ results: [mockArticle] }));
        const result = await getToolResult('search_articles', { query: 'export data' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(200);
        expect(result[0].title).toBe('How to export your data');
        expect(result[0].snippet).toBeDefined();
        expect(result[0].html_url).toContain('testcompany.zendesk.com');
        expect(result[0].vote_sum).toBe(42);
    });
});

describe('list_articles', () => {
    it('returns shaped article array', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ articles: [mockArticle] }));
        const result = await getToolResult('list_articles');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(200);
        expect(result[0].title).toBe('How to export your data');
        expect(result[0].created_at).toBeDefined();
    });
});

describe('get_article', () => {
    it('strips HTML tags from body', async () => {
        mockFetch.mockReturnValueOnce(zdOk({
            article: { ...mockArticle, body: '<p>Hello <b>world</b> &amp; beyond</p>' },
        }));
        const result = await getToolResult('get_article', { article_id: 200 });
        expect(result.body).not.toContain('<');
        expect(result.body).not.toContain('>');
        expect(result.body).toContain('Hello');
        expect(result.body).toContain('world');
    });
});

describe('create_article', () => {
    it('returns article_id and html_url', async () => {
        mockFetch.mockReturnValueOnce(zdOk({
            article: {
                id: 789,
                title: 'New Article',
                html_url: 'https://testcompany.zendesk.com/hc/en-us/articles/789',
                vote_sum: 0,
                label_names: [],
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
            },
        }));
        const result = await getToolResult('create_article', {
            section_id: 100,
            title: 'New Article',
            body: '<p>Content here</p>',
        });
        expect(result.article_id).toBe(789);
        expect(result.title).toBe('New Article');
        expect(result.html_url).toContain('789');
        expect(result.status).toBe('published');
    });
});

// ── Views & Macros ────────────────────────────────────────────────────────────

describe('list_views', () => {
    it('returns shaped views array', async () => {
        mockFetch.mockReturnValueOnce(zdOk({
            views: [
                { id: 1, title: 'All Open', active: true, position: 1 },
                { id: 2, title: 'High Priority', active: true, position: 2 },
            ],
        }));
        const result = await getToolResult('list_views');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(1);
        expect(result[0].title).toBe('All Open');
        expect(result[0].active).toBe(true);
        expect(result[0].position).toBe(1);
    });
});

describe('get_view_tickets', () => {
    it('returns shaped tickets array', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ tickets: [mockTicket] }));
        const result = await getToolResult('get_view_tickets', { view_id: 1 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(1001);
        expect(result[0].subject).toBe('Test ticket');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/views/1/tickets');
    });
});

describe('list_macros', () => {
    it('returns shaped macros array with actions', async () => {
        mockFetch.mockReturnValueOnce(zdOk({
            macros: [
                {
                    id: 1,
                    title: 'Close and Tag',
                    active: true,
                    actions: [
                        { field: 'status', value: 'closed' },
                        { field: 'set_tags', value: 'resolved' },
                    ],
                },
            ],
        }));
        const result = await getToolResult('list_macros');
        expect(result[0].id).toBe(1);
        expect(result[0].title).toBe('Close and Tag');
        expect(Array.isArray(result[0].actions)).toBe(true);
        expect(result[0].actions[0].field).toBe('status');
    });

    it('with query uses search endpoint', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ macros: [] }));
        await getToolResult('list_macros', { query: 'close' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/macros/search');
        expect(url).toContain('close');
    });

    it('without query uses active endpoint', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ macros: [] }));
        await getToolResult('list_macros');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/macros/active');
    });
});

// ── Analytics ─────────────────────────────────────────────────────────────────

describe('get_satisfaction_ratings', () => {
    it('returns shaped ratings array', async () => {
        mockFetch.mockReturnValueOnce(zdOk({
            satisfaction_ratings: [
                {
                    id: 1,
                    score: 'good',
                    comment: 'Great support!',
                    ticket_id: 1001,
                    requester_id: 500,
                    assignee_id: 600,
                    created_at: '2024-01-01T00:00:00Z',
                },
            ],
        }));
        const result = await getToolResult('get_satisfaction_ratings');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(1);
        expect(result[0].score).toBe('good');
        expect(result[0].comment).toBe('Great support!');
        expect(result[0].ticket_id).toBe(1001);
    });

    it('with score filter includes score in query params', async () => {
        mockFetch.mockReturnValueOnce(zdOk({ satisfaction_ratings: [] }));
        await getToolResult('get_satisfaction_ratings', { score: 'bad' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('score=bad');
    });
});

describe('get_ticket_metrics', () => {
    it('returns shaped metrics response', async () => {
        mockFetch.mockReturnValueOnce(zdOk({
            ticket_metric: {
                reply_time_in_minutes: { calendar: 15, business: 10 },
                first_resolution_time_in_minutes: { calendar: 120, business: 90 },
                full_resolution_time_in_minutes: { calendar: 240, business: 180 },
                reopens: 1,
                replies: 3,
                solved_at: '2024-01-02T00:00:00Z',
                created_at: '2024-01-01T00:00:00Z',
            },
        }));
        const result = await getToolResult('get_ticket_metrics', { ticket_id: 1001 });
        expect(result.ticket_id).toBe(1001);
        expect(result.reply_time_in_minutes.calendar).toBe(15);
        expect(result.reply_time_in_minutes.business).toBe(10);
        expect(result.reopens).toBe(1);
        expect(result.replies).toBe(3);
        expect(result.solved_at).toBe('2024-01-02T00:00:00Z');
    });

    it('missing ticket_id returns validation error', async () => {
        const body = await callTool('get_ticket_metrics', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('ticket_id');
    });
});

// ── Error mapping ─────────────────────────────────────────────────────────────

describe('Error mapping', () => {
    it('401 → message contains "Authentication failed"', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
        )));
        const body = await callTool('list_tickets', {});
        expect(body.error!.message).toContain('Authentication failed');
    });

    it('403 → message contains "Permission denied"', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ error: 'Forbidden' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
        )));
        const body = await callTool('list_tickets', {});
        expect(body.error!.message).toContain('Permission denied');
    });

    it('404 → message contains "Not found"', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ error: 'RecordNotFound', description: 'Record not found' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
        )));
        const body = await callTool('get_ticket', { ticket_id: 99999 });
        expect(body.error!.message).toContain('Not found');
    });

    it('422 with error/description shape → description in message', async () => {
        mockFetch.mockReturnValueOnce(zdErr('RecordInvalid', "Subject can't be blank"));
        const body = await callTool('create_ticket', { subject: 'test', body: 'test' });
        expect(body.error!.message).toContain('Validation error');
        expect(body.error!.message).toContain("Subject can't be blank");
    });

    it('422 with details.base shape → base description in message', async () => {
        mockFetch.mockReturnValueOnce(zdValidationErr('base', "Subject can't be blank"));
        const body = await callTool('create_ticket', { subject: 'test', body: 'test' });
        expect(body.error!.message).toContain('Validation error');
        expect(body.error!.message).toContain("Subject can't be blank");
    });

    it('429 → message contains "Rate limited"', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ error: 'TooManyRequests' }),
            {
                status: 429,
                headers: { 'Content-Type': 'application/json', 'retry-after': '30' },
            },
        )));
        const body = await callTool('list_tickets', {});
        expect(body.error!.message).toContain('Rate limited');
        expect(body.error!.message).toContain('30s');
    });
});

// ── E2E tests (skipped unless env vars set) ───────────────────────────────────

describe.skipIf(!process.env.ZENDESK_SUBDOMAIN)('E2E — real Zendesk API', () => {
    const e2eSubdomain = process.env.ZENDESK_SUBDOMAIN!;
    const e2eEmail = process.env.ZENDESK_EMAIL!;
    const e2eToken = process.env.ZENDESK_API_TOKEN!;

    function makeE2EReq(toolName: string, args: Record<string, unknown>) {
        return new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-ZENDESK-SUBDOMAIN': e2eSubdomain,
                'X-Mcp-Secret-ZENDESK-EMAIL': e2eEmail,
                'X-Mcp-Secret-ZENDESK-API-TOKEN': e2eToken,
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: toolName, arguments: args },
            }),
        });
    }

    it('search_users returns array', async () => {
        vi.restoreAllMocks();
        const req = makeE2EReq('search_users', { query: 'admin' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text);
        expect(Array.isArray(result)).toBe(true);
    });

    it('list_views returns views', async () => {
        vi.restoreAllMocks();
        const req = makeE2EReq('list_views', {});
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text);
        expect(Array.isArray(result)).toBe(true);
    });

    it('list_macros returns macros', async () => {
        vi.restoreAllMocks();
        const req = makeE2EReq('list_macros', {});
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text);
        expect(Array.isArray(result)).toBe(true);
    });
});
