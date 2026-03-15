import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const TOKEN = 'test_typeform_token_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockForm = {
    id: 'abc123',
    title: 'Test Form',
    _links: { display: 'https://form.typeform.com/to/abc123' },
    fields: [
        { id: 'f1', title: 'What is your name?', type: 'short_text', ref: 'name_ref' },
    ],
    settings: { language: 'en', progress_bar: 'proportion' },
    workspace: { href: 'https://api.typeform.com/workspaces/ws1' },
    created_at: '2024-01-01T00:00:00Z',
    last_updated_at: '2024-01-02T00:00:00Z',
};

const mockFormsListResponse = {
    page_count: 1,
    total_items: 1,
    items: [{ id: 'abc123', title: 'Test Form', _links: {} }],
};

const mockResponse = {
    response_id: 'r1',
    submitted_at: '2024-01-01T00:00:00Z',
    landed_at: '2024-01-01T00:00:00Z',
    calculated: { score: 0 },
    answers: [{ field: { id: 'f1', type: 'short_text', ref: 'name_ref' }, type: 'text', text: 'Alice' }],
};

const mockResponsesListResponse = {
    total_items: 5,
    page_count: 1,
    items: [mockResponse],
};

const mockWebhook = {
    id: 'wh1',
    form_id: 'abc123',
    tag: 'my-webhook',
    url: 'https://example.com/webhook',
    enabled: true,
    verify_ssl: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
};

const mockWorkspace = {
    id: 'ws1',
    name: 'My Workspace',
    account: { href: 'https://api.typeform.com/accounts/acc1' },
    self: { href: 'https://api.typeform.com/workspaces/ws1' },
    forms: { href: 'https://api.typeform.com/workspaces/ws1/forms', count: 3 },
    created_at: '2023-01-01T00:00:00Z',
};

const mockMe = {
    alias: 'testuser',
    email: 'test@example.com',
    language: 'en',
    _links: { self: 'https://api.typeform.com/me' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function tfOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function tf204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function tfErr(description: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ description }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, missingToken = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingToken) headers['X-Mcp-Secret-TYPEFORM-API-TOKEN'] = TOKEN;
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

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-typeform and tools 16', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-typeform');
        expect(body.tools).toBe(16);
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
        expect(body.result.serverInfo.name).toBe('mcp-typeform');
    });

    it('tools/list returns exactly 16 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(16);
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
    it('missing token returns -32001 with TYPEFORM_API_TOKEN in message', async () => {
        const body = await callTool('list_forms', {}, true);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('TYPEFORM_API_TOKEN');
    });

    it('auth header format uses Bearer token', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockFormsListResponse));
        await callTool('list_forms', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it('Typeform API error propagates with -32603 code', async () => {
        mockFetch.mockReturnValueOnce(tfErr('Form not found', 404));
        const body = await callTool('get_form', { form_id: 'nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('404');
    });
});

// ── Forms ─────────────────────────────────────────────────────────────────────

describe('list_forms', () => {
    it('returns page_count, total_items, and items array', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockFormsListResponse));
        const result = await getToolResult('list_forms');
        expect(result.total_items).toBe(1);
        expect(result.page_count).toBe(1);
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.items[0].id).toBe('abc123');
        expect(result.items[0].title).toBe('Test Form');
    });

    it('defaults page=1 and page_size=10 in query params', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockFormsListResponse));
        await getToolResult('list_forms');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('page=1');
        expect(url).toContain('page_size=10');
    });

    it('with search includes search param in URL', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockFormsListResponse));
        await getToolResult('list_forms', { search: 'survey' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('search=survey');
    });

    it('with workspace_id includes workspace_id in URL', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockFormsListResponse));
        await getToolResult('list_forms', { workspace_id: 'ws1' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('workspace_id=ws1');
    });
});

describe('get_form', () => {
    it('returns full form with fields and settings', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockForm));
        const result = await getToolResult('get_form', { form_id: 'abc123' });
        expect(result.id).toBe('abc123');
        expect(result.title).toBe('Test Form');
        expect(Array.isArray(result.fields)).toBe(true);
        expect(result.fields[0].type).toBe('short_text');
    });

    it('missing form_id returns -32602', async () => {
        const body = await callTool('get_form', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('form_id');
    });

    it('calls correct endpoint /forms/{form_id}', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockForm));
        await getToolResult('get_form', { form_id: 'abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/forms/abc123');
    });
});

describe('create_form', () => {
    it('returns created form with id and title', async () => {
        mockFetch.mockReturnValueOnce(tfOk({ ...mockForm, id: 'new123' }));
        const result = await getToolResult('create_form', {
            title: 'New Survey',
            fields: [{ id: 'f1', title: 'Name', type: 'short_text' }],
        });
        expect(result.id).toBe('new123');
        expect(result.title).toBe('Test Form');
    });

    it('uses POST method', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockForm));
        await getToolResult('create_form', { title: 'My Form' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
    });

    it('missing title returns -32602', async () => {
        const body = await callTool('create_form', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('title');
    });

    it('includes fields in request body when provided', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockForm));
        const fields = [{ id: 'f1', title: 'Name', type: 'short_text' }];
        await getToolResult('create_form', { title: 'My Form', fields });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { fields: unknown[] };
        expect(reqBody.fields).toEqual(fields);
    });
});

describe('update_form', () => {
    it('uses PUT method with form_id in URL', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockForm));
        await getToolResult('update_form', { form_id: 'abc123', title: 'Updated Form' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
        expect(call[0] as string).toContain('/forms/abc123');
    });

    it('missing form_id returns -32602', async () => {
        const body = await callTool('update_form', { title: 'No ID' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('form_id');
    });

    it('missing title returns -32602', async () => {
        const body = await callTool('update_form', { form_id: 'abc123' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('title');
    });
});

describe('delete_form', () => {
    it('returns empty object on 204', async () => {
        mockFetch.mockReturnValueOnce(tf204());
        const result = await getToolResult('delete_form', { form_id: 'abc123' });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('DELETE');
    });

    it('missing form_id returns -32602', async () => {
        const body = await callTool('delete_form', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('form_id');
    });
});

// ── Responses ─────────────────────────────────────────────────────────────────

describe('get_responses', () => {
    it('returns total_items, page_count, and items array', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockResponsesListResponse));
        const result = await getToolResult('get_responses', { form_id: 'abc123' });
        expect(result.total_items).toBe(5);
        expect(result.page_count).toBe(1);
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.items[0].response_id).toBe('r1');
    });

    it('includes sort=submitted_at,desc in URL', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockResponsesListResponse));
        await getToolResult('get_responses', { form_id: 'abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('sort=submitted_at%2Cdesc');
    });

    it('with since includes since param', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockResponsesListResponse));
        await getToolResult('get_responses', { form_id: 'abc123', since: '2024-01-01T00:00:00Z' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('since=');
    });

    it('with completed=false includes completed param', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockResponsesListResponse));
        await getToolResult('get_responses', { form_id: 'abc123', completed: false });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('completed=false');
    });

    it('missing form_id returns -32602', async () => {
        const body = await callTool('get_responses', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('form_id');
    });
});

describe('get_response', () => {
    it('uses included_response_ids param in URL', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockResponsesListResponse));
        await getToolResult('get_response', { form_id: 'abc123', response_id: 'r1' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('included_response_ids=r1');
    });

    it('missing form_id returns -32602', async () => {
        const body = await callTool('get_response', { response_id: 'r1' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('form_id');
    });

    it('missing response_id returns -32602', async () => {
        const body = await callTool('get_response', { form_id: 'abc123' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('response_id');
    });
});

describe('delete_responses', () => {
    it('uses DELETE method with included_response_ids param', async () => {
        mockFetch.mockReturnValueOnce(tf204());
        const result = await getToolResult('delete_responses', {
            form_id: 'abc123',
            response_ids: ['r1', 'r2'],
        });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('DELETE');
        const url = call[0] as string;
        expect(url).toContain('included_response_ids=r1%2Cr2');
    });

    it('accepts comma-separated string as response_ids', async () => {
        mockFetch.mockReturnValueOnce(tf204());
        await getToolResult('delete_responses', { form_id: 'abc123', response_ids: 'r1,r2' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('included_response_ids=r1%2Cr2');
    });

    it('missing form_id returns -32602', async () => {
        const body = await callTool('delete_responses', { response_ids: ['r1'] });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
    });

    it('missing response_ids returns -32602', async () => {
        const body = await callTool('delete_responses', { form_id: 'abc123' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('response_ids');
    });
});

describe('get_response_count', () => {
    it('returns form_id and total_items', async () => {
        mockFetch.mockReturnValueOnce(tfOk({ total_items: 42, page_count: 1, items: [] }));
        const result = await getToolResult('get_response_count', { form_id: 'abc123' });
        expect(result.form_id).toBe('abc123');
        expect(result.total_items).toBe(42);
    });

    it('uses page_size=1 in request', async () => {
        mockFetch.mockReturnValueOnce(tfOk({ total_items: 5, page_count: 1, items: [] }));
        await getToolResult('get_response_count', { form_id: 'abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('page_size=1');
    });

    it('missing form_id returns -32602', async () => {
        const body = await callTool('get_response_count', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('form_id');
    });
});

describe('search_responses', () => {
    it('includes query param in URL', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockResponsesListResponse));
        await getToolResult('search_responses', { form_id: 'abc123', query: 'Alice' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('query=Alice');
    });

    it('defaults page_size=25', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockResponsesListResponse));
        await getToolResult('search_responses', { form_id: 'abc123', query: 'test' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('page_size=25');
    });

    it('missing form_id returns -32602', async () => {
        const body = await callTool('search_responses', { query: 'test' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('form_id');
    });

    it('missing query returns -32602', async () => {
        const body = await callTool('search_responses', { form_id: 'abc123' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('query');
    });
});

// ── Webhooks ──────────────────────────────────────────────────────────────────

describe('list_webhooks', () => {
    it('returns webhooks list', async () => {
        mockFetch.mockReturnValueOnce(tfOk({ items: [mockWebhook] }));
        const result = await getToolResult('list_webhooks', { form_id: 'abc123' });
        expect(result.items).toBeDefined();
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.items[0].tag).toBe('my-webhook');
    });

    it('calls correct endpoint', async () => {
        mockFetch.mockReturnValueOnce(tfOk({ items: [] }));
        await getToolResult('list_webhooks', { form_id: 'abc123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/forms/abc123/webhooks');
    });

    it('missing form_id returns -32602', async () => {
        const body = await callTool('list_webhooks', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('form_id');
    });
});

describe('create_webhook', () => {
    it('uses PUT method with tag in URL', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockWebhook));
        const result = await getToolResult('create_webhook', {
            form_id: 'abc123',
            tag: 'my-webhook',
            url: 'https://example.com/webhook',
        });
        expect(result.tag).toBe('my-webhook');
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
        expect(call[0] as string).toContain('/forms/abc123/webhooks/my-webhook');
    });

    it('sets enabled=true and verify_ssl=true by default', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockWebhook));
        await getToolResult('create_webhook', {
            form_id: 'abc123',
            tag: 'my-webhook',
            url: 'https://example.com/webhook',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { enabled: boolean; verify_ssl: boolean };
        expect(reqBody.enabled).toBe(true);
        expect(reqBody.verify_ssl).toBe(true);
    });

    it('with secret includes secret in request body', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockWebhook));
        await getToolResult('create_webhook', {
            form_id: 'abc123',
            tag: 'my-webhook',
            url: 'https://example.com/webhook',
            secret: 'mysecret',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { secret: string };
        expect(reqBody.secret).toBe('mysecret');
    });

    it('verify_ssl=false can be set explicitly', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockWebhook));
        await getToolResult('create_webhook', {
            form_id: 'abc123',
            tag: 'test',
            url: 'https://example.com/webhook',
            verify_ssl: false,
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { verify_ssl: boolean };
        expect(reqBody.verify_ssl).toBe(false);
    });

    it('missing form_id returns -32602', async () => {
        const body = await callTool('create_webhook', { tag: 'test', url: 'https://example.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
    });

    it('missing tag returns -32602', async () => {
        const body = await callTool('create_webhook', { form_id: 'abc123', url: 'https://example.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('tag');
    });

    it('missing url returns -32602', async () => {
        const body = await callTool('create_webhook', { form_id: 'abc123', tag: 'test' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('url');
    });
});

describe('delete_webhook', () => {
    it('uses DELETE method with tag in URL and returns {}', async () => {
        mockFetch.mockReturnValueOnce(tf204());
        const result = await getToolResult('delete_webhook', { form_id: 'abc123', tag: 'my-webhook' });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('DELETE');
        expect(call[0] as string).toContain('/forms/abc123/webhooks/my-webhook');
    });

    it('missing tag returns -32602', async () => {
        const body = await callTool('delete_webhook', { form_id: 'abc123' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('tag');
    });
});

// ── Workspaces ────────────────────────────────────────────────────────────────

describe('list_workspaces', () => {
    it('returns workspaces list with page and page_size defaults', async () => {
        mockFetch.mockReturnValueOnce(tfOk({ page_count: 1, total_items: 1, items: [mockWorkspace] }));
        const result = await getToolResult('list_workspaces');
        expect(result.total_items).toBe(1);
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.items[0].name).toBe('My Workspace');
    });

    it('defaults page=1 and page_size=10 in URL', async () => {
        mockFetch.mockReturnValueOnce(tfOk({ page_count: 1, total_items: 0, items: [] }));
        await getToolResult('list_workspaces');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/workspaces');
        expect(url).toContain('page=1');
        expect(url).toContain('page_size=10');
    });
});

describe('get_workspace', () => {
    it('returns workspace with id, name, and forms count', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockWorkspace));
        const result = await getToolResult('get_workspace', { workspace_id: 'ws1' });
        expect(result.id).toBe('ws1');
        expect(result.name).toBe('My Workspace');
        expect(result.forms.count).toBe(3);
    });

    it('calls correct endpoint /workspaces/{workspace_id}', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockWorkspace));
        await getToolResult('get_workspace', { workspace_id: 'ws1' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/workspaces/ws1');
    });

    it('missing workspace_id returns -32602', async () => {
        const body = await callTool('get_workspace', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32602);
        expect(body.error!.message).toContain('workspace_id');
    });
});

// ── Account ───────────────────────────────────────────────────────────────────

describe('get_me', () => {
    it('returns account info with alias and email', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockMe));
        const result = await getToolResult('get_me');
        expect(result.alias).toBe('testuser');
        expect(result.email).toBe('test@example.com');
    });

    it('calls GET /me endpoint', async () => {
        mockFetch.mockReturnValueOnce(tfOk(mockMe));
        await getToolResult('get_me');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/me');
    });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe('Error cases', () => {
    it('404 propagates error code -32603 with status in message', async () => {
        mockFetch.mockReturnValueOnce(tfErr('Not Found', 404));
        const body = await callTool('get_form', { form_id: 'nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('404');
    });

    it('401 propagates error code -32603 with status in message', async () => {
        mockFetch.mockReturnValueOnce(tfErr('Unauthorized', 401));
        const body = await callTool('list_forms', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('401');
    });

    it('unknown tool name returns -32601', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
    });
});

// ── E2E tests (skipped unless env vars set) ───────────────────────────────────

describe.skipIf(!process.env.TYPEFORM_API_TOKEN)('E2E — real Typeform API', () => {
    const e2eToken = process.env.TYPEFORM_API_TOKEN!;

    function makeE2EReq(toolName: string, args: Record<string, unknown>) {
        return new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-TYPEFORM-API-TOKEN': e2eToken,
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: toolName, arguments: args },
            }),
        });
    }

    it('get_me returns account info', async () => {
        vi.restoreAllMocks();
        const req = makeE2EReq('get_me', {});
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text);
        expect(result.email).toBeTruthy();
    });

    it('list_forms returns items array', async () => {
        vi.restoreAllMocks();
        const req = makeE2EReq('list_forms', {});
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text);
        expect(Array.isArray(result.items)).toBe(true);
    });

    it('list_workspaces returns items array', async () => {
        vi.restoreAllMocks();
        const req = makeE2EReq('list_workspaces', {});
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text);
        expect(Array.isArray(result.items)).toBe(true);
    });
});
