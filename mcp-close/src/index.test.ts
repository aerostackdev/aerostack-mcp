import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_KEY = 'test_close_api_key_abc123xyz';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockUser = {
    id: 'user_abc123',
    email: 'admin@acme.com',
    first_name: 'Alice',
    last_name: 'Admin',
    organizations: [{ id: 'orga_abc123', name: 'Acme Corp' }],
};

const mockLead = {
    id: 'lead_abc123',
    display_name: 'Acme Corp',
    status_id: 'stat_abc123',
    status_label: 'Potential',
    contacts: [{ id: 'cont_abc123', name: 'John Doe' }],
    custom: {},
};

const mockContact = {
    id: 'cont_abc123',
    lead_id: 'lead_abc123',
    name: 'John Doe',
    title: 'CEO',
    emails: [{ email: 'john@acme.com', type: 'office' }],
    phones: [{ phone: '+1-555-000-0001', type: 'office' }],
};

const mockOpportunity = {
    id: 'oppo_abc123',
    lead_id: 'lead_abc123',
    status_id: 'stat_oppo_abc',
    status_label: 'Active',
    status_type: 'active',
    value: 150000,
    value_currency: 'USD',
    value_period: 'monthly',
    confidence: 75,
    expected_date: '2026-06-30',
};

const mockNote = {
    id: 'acti_abc123',
    _type: 'Note',
    lead_id: 'lead_abc123',
    note: 'Had a great call with the team',
    date_created: '2026-03-28T10:00:00Z',
};

const mockTask = {
    id: 'task_abc123',
    lead_id: 'lead_abc123',
    text: 'Follow up with proposal',
    due_date: '2026-04-01',
    is_complete: false,
    assigned_to: 'user_abc123',
};

const mockPipeline = {
    id: 'pipe_abc123',
    name: 'Default Pipeline',
    statuses: [
        { id: 'stat_oppo_abc', label: 'Active', type: 'active' },
        { id: 'stat_oppo_won', label: 'Won', type: 'won' },
    ],
};

const mockStatus = {
    id: 'stat_abc123',
    label: 'Potential',
    organization_id: 'orga_abc123',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function closeOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function closeOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function closeErr(error: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ error }), {
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
    if (!missingSecrets.includes('apiKey')) {
        headers['X-Mcp-Secret-CLOSE-API-KEY'] = API_KEY;
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
    it('GET / returns status ok with server mcp-close and tool count', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-close');
        expect(body.tools).toBeGreaterThan(0);
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
        expect(body.result.serverInfo.name).toBe('mcp-close');
    });

    it('tools/list returns tools with name, description, inputSchema', async () => {
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
    it('missing API key returns -32001 with CLOSE_API_KEY in message', async () => {
        const body = await callTool('list_leads', {}, ['apiKey']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('CLOSE_API_KEY');
    });

    it('Authorization header uses Basic auth format with API key as username', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_leads', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        // Basic base64(apiKey:) — trailing colon, empty password
        const expected = `Basic ${btoa(`${API_KEY}:`)}`;
        expect(headers['Authorization']).toBe(expected);
    });

    it('Basic auth includes trailing colon for empty password', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_leads', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        const authHeader = headers['Authorization'];
        const decoded = atob(authHeader.replace('Basic ', ''));
        expect(decoded).toBe(`${API_KEY}:`);
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns current user info on success', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockUser));
        const result = await getToolResult('_ping');
        expect(result.id).toBe('user_abc123');
        expect(result.email).toBe('admin@acme.com');
    });

    it('calls /me/ endpoint', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockUser));
        await callTool('_ping');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/me/');
    });

    it('returns API error on 401', async () => {
        mockFetch.mockReturnValueOnce(closeErr('Authentication required', 401));
        const body = await callTool('_ping');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('401');
    });
});

// ── Leads ─────────────────────────────────────────────────────────────────────

describe('list_leads', () => {
    it('returns leads array', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [mockLead], has_more: false }));
        const result = await getToolResult('list_leads', {});
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('lead_abc123');
    });

    it('passes query as URL param', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_leads', { query: 'Acme' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('query=Acme');
    });

    it('passes _limit as URL param', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_leads', { _limit: 50 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('_limit=50');
    });
});

describe('get_lead', () => {
    it('fetches lead by ID', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockLead));
        const result = await getToolResult('get_lead', { id: 'lead_abc123' });
        expect(result.id).toBe('lead_abc123');
        expect(result.display_name).toBe('Acme Corp');
    });

    it('calls correct URL with lead ID', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockLead));
        await callTool('get_lead', { id: 'lead_abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/lead/lead_abc123/');
    });

    it('returns error when id is missing', async () => {
        const body = await callTool('get_lead', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_lead', () => {
    it('creates lead and returns result', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockLead));
        const result = await getToolResult('create_lead', { name: 'Acme Corp' });
        expect(result.display_name).toBe('Acme Corp');
    });

    it('uses POST method', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockLead));
        await callTool('create_lead', { name: 'New Lead' });
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callOpts.method).toBe('POST');
    });

    it('returns error when name is missing', async () => {
        const body = await callTool('create_lead', { status_id: 'stat_abc123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });

    it('returns error on API error', async () => {
        mockFetch.mockReturnValueOnce(closeErr('Name is required', 400));
        const body = await callTool('create_lead', { name: '' });
        expect(body.error).toBeDefined();
    });
});

describe('update_lead', () => {
    it('sends PUT to /lead/:id/', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockLead));
        await callTool('update_lead', { id: 'lead_abc123', status_id: 'stat_new' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/lead/lead_abc123/');
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callOpts.method).toBe('PUT');
    });

    it('returns error when id is missing', async () => {
        const body = await callTool('update_lead', { name: 'Updated' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('delete_lead', () => {
    it('sends DELETE to /lead/:id/', async () => {
        mockFetch.mockReturnValueOnce(closeOk204());
        await callTool('delete_lead', { id: 'lead_abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/lead/lead_abc123/');
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callOpts.method).toBe('DELETE');
    });

    it('returns error when id is missing', async () => {
        const body = await callTool('delete_lead', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Contacts ──────────────────────────────────────────────────────────────────

describe('list_contacts', () => {
    it('returns contacts array', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [mockContact], has_more: false }));
        const result = await getToolResult('list_contacts', {});
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe('John Doe');
    });

    it('passes lead_id filter as URL param', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_contacts', { lead_id: 'lead_abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('lead_id=lead_abc123');
    });
});

describe('get_contact', () => {
    it('fetches contact by id', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockContact));
        const result = await getToolResult('get_contact', { id: 'cont_abc123' });
        expect(result.id).toBe('cont_abc123');
    });

    it('returns error when id is missing', async () => {
        const body = await callTool('get_contact', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_contact', () => {
    it('creates contact and returns result', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockContact));
        const result = await getToolResult('create_contact', {
            lead_id: 'lead_abc123',
            name: 'John Doe',
            emails: [{ email: 'john@acme.com', type: 'office' }],
        });
        expect(result.name).toBe('John Doe');
    });

    it('returns error when lead_id is missing', async () => {
        const body = await callTool('create_contact', { name: 'John Doe' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('lead_id');
    });
});

describe('update_contact', () => {
    it('sends PUT to /contact/:id/', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockContact));
        await callTool('update_contact', { id: 'cont_abc123', title: 'CTO' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/contact/cont_abc123/');
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callOpts.method).toBe('PUT');
    });

    it('returns error when id is missing', async () => {
        const body = await callTool('update_contact', { title: 'CTO' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('delete_contact', () => {
    it('sends DELETE to /contact/:id/', async () => {
        mockFetch.mockReturnValueOnce(closeOk204());
        await callTool('delete_contact', { id: 'cont_abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/contact/cont_abc123/');
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callOpts.method).toBe('DELETE');
    });

    it('returns error when id is missing', async () => {
        const body = await callTool('delete_contact', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Opportunities ─────────────────────────────────────────────────────────────

describe('list_opportunities', () => {
    it('returns opportunities array', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [mockOpportunity], has_more: false }));
        const result = await getToolResult('list_opportunities', {});
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('oppo_abc123');
    });

    it('passes status_type filter', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_opportunities', { status_type: 'won' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status_type=won');
    });

    it('passes date_won_start as date_won__gte', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_opportunities', { date_won_start: '2026-01-01' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('date_won__gte=2026-01-01');
    });
});

describe('get_opportunity', () => {
    it('fetches opportunity by id', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockOpportunity));
        const result = await getToolResult('get_opportunity', { id: 'oppo_abc123' });
        expect(result.id).toBe('oppo_abc123');
    });

    it('returns error when id is missing', async () => {
        const body = await callTool('get_opportunity', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_opportunity', () => {
    it('creates opportunity and returns result', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockOpportunity));
        const result = await getToolResult('create_opportunity', {
            lead_id: 'lead_abc123',
            status_id: 'stat_oppo_abc',
            value: 150000,
            value_currency: 'USD',
        });
        expect(result.value).toBe(150000);
    });

    it('uses POST method', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockOpportunity));
        await callTool('create_opportunity', {
            lead_id: 'lead_abc123',
            status_id: 'stat_oppo_abc',
        });
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callOpts.method).toBe('POST');
    });

    it('returns error when lead_id is missing', async () => {
        const body = await callTool('create_opportunity', { status_id: 'stat_oppo_abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('lead_id');
    });

    it('returns error when status_id is missing', async () => {
        const body = await callTool('create_opportunity', { lead_id: 'lead_abc123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('status_id');
    });
});

describe('update_opportunity', () => {
    it('sends PUT to /opportunity/:id/', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockOpportunity));
        await callTool('update_opportunity', { id: 'oppo_abc123', value: 200000 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/opportunity/oppo_abc123/');
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callOpts.method).toBe('PUT');
    });

    it('returns error when id is missing', async () => {
        const body = await callTool('update_opportunity', { value: 200000 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('search_opportunities', () => {
    it('passes query param', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('search_opportunities', { query: 'enterprise deal' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('query=enterprise+deal');
    });
});

// ── Activities ────────────────────────────────────────────────────────────────

describe('list_activities', () => {
    it('returns activities', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [mockNote], has_more: false }));
        const result = await getToolResult('list_activities', { lead_id: 'lead_abc123' });
        expect(result.data).toHaveLength(1);
    });

    it('passes _type filter', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_activities', { _type: 'Note' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('_type=Note');
    });

    it('maps date_created_start to date_created__gte', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_activities', { date_created_start: '2026-03-01T00:00:00Z' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('date_created__gte=');
    });
});

describe('create_note', () => {
    it('creates note and returns result', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockNote));
        const result = await getToolResult('create_note', {
            lead_id: 'lead_abc123',
            note: 'Had a great call',
        });
        expect(result._type).toBe('Note');
        expect(result.note).toBe('Had a great call with the team');
    });

    it('posts to /activity/note/', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockNote));
        await callTool('create_note', { lead_id: 'lead_abc123', note: 'Test note' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/activity/note/');
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(callOpts.method).toBe('POST');
    });

    it('returns error when lead_id is missing', async () => {
        const body = await callTool('create_note', { note: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('lead_id');
    });

    it('returns error when note is missing', async () => {
        const body = await callTool('create_note', { lead_id: 'lead_abc123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('note');
    });
});

describe('create_task', () => {
    it('creates task and returns result', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockTask));
        const result = await getToolResult('create_task', {
            lead_id: 'lead_abc123',
            text: 'Follow up with proposal',
            due_date: '2026-04-01',
        });
        expect(result.text).toBe('Follow up with proposal');
    });

    it('defaults is_complete to false', async () => {
        mockFetch.mockReturnValueOnce(closeOk(mockTask));
        await callTool('create_task', { lead_id: 'lead_abc123', text: 'Task' });
        const callOpts = mockFetch.mock.calls[0][1] as RequestInit;
        const sentBody = JSON.parse(callOpts.body as string);
        expect(sentBody.is_complete).toBe(false);
    });

    it('returns error when lead_id is missing', async () => {
        const body = await callTool('create_task', { text: 'Task' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('lead_id');
    });

    it('returns error when text is missing', async () => {
        const body = await callTool('create_task', { lead_id: 'lead_abc123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('text');
    });
});

describe('list_tasks', () => {
    it('returns tasks', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [mockTask], has_more: false }));
        const result = await getToolResult('list_tasks', {});
        expect(result.data).toHaveLength(1);
        expect(result.data[0].text).toBe('Follow up with proposal');
    });

    it('passes is_complete filter', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_tasks', { is_complete: false });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('is_complete=false');
    });

    it('maps due_date_start to due_date__gte', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_tasks', { due_date_start: '2026-04-01' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('due_date__gte=2026-04-01');
    });
});

// ── Users & Config ────────────────────────────────────────────────────────────

describe('list_users', () => {
    it('returns users list', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [mockUser], has_more: false }));
        const result = await getToolResult('list_users');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].email).toBe('admin@acme.com');
    });

    it('calls /user/ endpoint', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_users');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/user/');
    });
});

describe('list_pipelines', () => {
    it('returns pipelines with statuses', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [mockPipeline], has_more: false }));
        const result = await getToolResult('list_pipelines');
        expect(result.data[0].statuses).toHaveLength(2);
    });

    it('calls /pipeline/ endpoint', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('list_pipelines');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/pipeline/');
    });
});

describe('get_lead_statuses', () => {
    it('returns lead statuses', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [mockStatus], has_more: false }));
        const result = await getToolResult('get_lead_statuses');
        expect(result.data[0].label).toBe('Potential');
    });

    it('calls /status/lead/ endpoint', async () => {
        mockFetch.mockReturnValueOnce(closeOk({ data: [], has_more: false }));
        await callTool('get_lead_statuses');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/status/lead/');
    });
});

// ── Unknown tool ──────────────────────────────────────────────────────────────

describe('Unknown tool', () => {
    it('returns -32601 for unknown tool name', async () => {
        const body = await callTool('does_not_exist', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
        expect(body.error!.message).toContain('does_not_exist');
    });
});
