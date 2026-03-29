import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_KEY = 'test_pandadoc_api_key_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockDocument = {
    id: 'doc_abc123',
    name: 'Service Agreement - Acme Corp',
    status: 'document.draft',
    date_created: '2026-03-01T00:00:00.000000Z',
    date_modified: '2026-03-20T12:00:00.000000Z',
    expiration_date: null,
    recipients: [
        {
            email: 'john@acme.com',
            first_name: 'John',
            last_name: 'Doe',
            role: 'Signer',
            status: 'document.sent',
        },
    ],
};

const mockTemplate = {
    id: 'tpl_xyz789',
    uuid: 'tpl_xyz789',
    name: 'Service Agreement Template',
    date_created: '2026-01-01T00:00:00.000000Z',
    date_modified: '2026-02-15T00:00:00.000000Z',
    roles: [{ name: 'Signer' }, { name: 'Approver' }],
};

const mockWebhook = {
    uuid: 'wh_123abc',
    name: 'Document State Watcher',
    url: 'https://example.com/webhooks/pandadoc',
    triggers: ['document_state_changed'],
    payload_type: 'json',
};

const mockFields = {
    fields: [
        { uuid: 'fld_001', name: 'client_name', type: 'text', required: true, value: '' },
        { uuid: 'fld_002', name: 'contract_value', type: 'text', required: false, value: '' },
    ],
};

const mockSection = {
    uuid: 'sec_001',
    name: 'Introduction',
    row_index: 0,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function apiErr(detail: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ detail }), {
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
        headers['X-Mcp-Secret-PANDADOC-API-KEY'] = API_KEY;
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
    it('GET / returns status ok with server mcp-pandadoc and tools 20', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-pandadoc');
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
        const body = await res.json() as {
            result: { protocolVersion: string; serverInfo: { name: string } }
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-pandadoc');
    });

    it('tools/list returns exactly 20 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
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
    it('missing API key returns -32001 with PANDADOC_API_KEY in message', async () => {
        const body = await callTool('list_documents', {}, ['apiKey']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('PANDADOC_API_KEY');
    });

    it('uses API-Key auth header (not Bearer)', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [] }));
        await callTool('list_documents', {});
        const fetchArgs = mockFetch.mock.calls[0];
        expect(fetchArgs[1].headers['Authorization']).toBe(`API-Key ${API_KEY}`);
        expect(fetchArgs[1].headers['Authorization']).not.toContain('Bearer');
    });

    it('PandaDoc API 401 error is surfaced as -32603', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Authentication credentials were not provided.', 401));
        const body = await callTool('list_documents', {});
        expect(body.error!.code).toBe(-32603);
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('_ping calls GET /templates?count=1 and returns data', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockTemplate], count: 1 }));
        const result = await getToolResult('list_templates', { count: 1 });
        expect(result).toBeDefined();

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain('/templates');
    });
});

// ── Documents ─────────────────────────────────────────────────────────────────

describe('Documents', () => {
    it('list_documents returns all documents', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockDocument] }));
        const result = await getToolResult('list_documents', {});
        expect(result).toBeDefined();
    });

    it('list_documents with status filter passes status param', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockDocument] }));
        await getToolResult('list_documents', { status: 'document.completed' });
        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain('status=document.completed');
    });

    it('list_documents with search query passes q param', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockDocument] }));
        await getToolResult('list_documents', { q: 'Acme' });
        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain('q=Acme');
    });

    it('get_document returns document by ID', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockDocument));
        const result = await getToolResult('get_document', { document_id: mockDocument.id });
        expect(result.id).toBe(mockDocument.id);
        expect(result.name).toBe(mockDocument.name);
        expect(result.status).toBe(mockDocument.status);

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain(`/documents/${mockDocument.id}`);
    });

    it('get_document missing document_id returns validation error', async () => {
        const body = await callTool('get_document', {});
        expect(body.error!.message).toContain('document_id');
    });

    it('create_document sends correct payload with recipients and tokens', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockDocument));
        const result = await getToolResult('create_document', {
            name: 'Service Agreement - Acme Corp',
            template_uuid: mockTemplate.uuid,
            recipients: [{ email: 'john@acme.com', first_name: 'John', role: 'Signer' }],
            tokens: [{ name: 'client.name', value: 'Acme Corp' }],
        });
        expect(result.id).toBe(mockDocument.id);

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].method).toBe('POST');
        const sentBody = JSON.parse(fetchCall[1].body as string);
        expect(sentBody.name).toBe('Service Agreement - Acme Corp');
        expect(sentBody.template_uuid).toBe(mockTemplate.uuid);
        expect(sentBody.recipients).toHaveLength(1);
        expect(sentBody.tokens).toHaveLength(1);
    });

    it('create_document missing name returns validation error', async () => {
        const body = await callTool('create_document', { template_uuid: 'tpl_xxx' });
        expect(body.error!.message).toContain('name');
    });

    it('create_document missing template_uuid returns validation error', async () => {
        const body = await callTool('create_document', { name: 'Test Doc' });
        expect(body.error!.message).toContain('template_uuid');
    });

    it('send_document sends POST to /documents/:id/send with message', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: mockDocument.id, status: 'document.sent' }));
        const result = await getToolResult('send_document', {
            document_id: mockDocument.id,
            message: 'Please review and sign.',
            subject: 'Contract for Review',
        });
        expect(result.status).toBe('document.sent');

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain(`/documents/${mockDocument.id}/send`);
        expect(fetchCall[1].method).toBe('POST');
        const sentBody = JSON.parse(fetchCall[1].body as string);
        expect(sentBody.message).toBe('Please review and sign.');
        expect(sentBody.subject).toBe('Contract for Review');
    });

    it('send_document with silent flag sends it', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: mockDocument.id, status: 'document.sent' }));
        await getToolResult('send_document', { document_id: mockDocument.id, silent: true });
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(sentBody.silent).toBe(true);
    });

    it('download_document calls GET with Accept: application/pdf', async () => {
        const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(fakePdf.buffer, {
            status: 200,
            headers: { 'Content-Type': 'application/pdf' },
        })));
        const result = await getToolResult('download_document', { document_id: mockDocument.id });
        expect(result.pdf_base64).toBeTruthy();
        expect(result.content_type).toBe('application/pdf');

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].headers['Accept']).toBe('application/pdf');
    });

    it('delete_document calls DELETE /documents/:id', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        const result = await getToolResult('delete_document', { document_id: mockDocument.id });
        expect(result.success).toBe(true);

        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
        expect(mockFetch.mock.calls[0][0]).toContain(`/documents/${mockDocument.id}`);
    });
});

// ── Templates ─────────────────────────────────────────────────────────────────

describe('Templates', () => {
    it('list_templates returns templates', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockTemplate] }));
        const result = await getToolResult('list_templates', {});
        expect(result).toBeDefined();
    });

    it('list_templates with search params passes them correctly', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockTemplate] }));
        await getToolResult('list_templates', { q: 'Service', tag: 'contracts', count: 10 });
        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain('q=Service');
        expect(url).toContain('tag=contracts');
        expect(url).toContain('count=10');
    });

    it('get_template returns template by UUID', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTemplate));
        const result = await getToolResult('get_template', { template_uuid: mockTemplate.uuid });
        expect(result.name).toBe(mockTemplate.name);
        expect(result.roles).toHaveLength(2);
    });

    it('get_template missing template_uuid returns error', async () => {
        const body = await callTool('get_template', {});
        expect(body.error!.message).toContain('template_uuid');
    });

    it('create_from_pdf sends POST with url field', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockDocument));
        await getToolResult('create_from_pdf', {
            name: 'Uploaded Contract',
            url: 'https://example.com/contract.pdf',
            recipients: [{ email: 'signer@example.com', role: 'Signer' }],
        });

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].method).toBe('POST');
        const sentBody = JSON.parse(fetchCall[1].body as string);
        expect(sentBody.url).toBe('https://example.com/contract.pdf');
        expect(sentBody.name).toBe('Uploaded Contract');
    });

    it('create_from_pdf missing url returns validation error', async () => {
        const body = await callTool('create_from_pdf', { name: 'Test' });
        expect(body.error!.message).toContain('url');
    });

    it('list_template_folders calls /templates/folders', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [] }));
        await getToolResult('list_template_folders', {});
        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain('/templates/folders');
    });
});

// ── Recipients & Fields ───────────────────────────────────────────────────────

describe('Recipients & Fields', () => {
    it('list_recipients fetches document and returns recipients array', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockDocument));
        const result = await getToolResult('list_recipients', { document_id: mockDocument.id });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].email).toBe('john@acme.com');
    });

    it('list_recipients returns empty array when no recipients', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockDocument, recipients: undefined }));
        const result = await getToolResult('list_recipients', { document_id: mockDocument.id });
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(0);
    });

    it('add_recipient sends POST to /documents/:id/recipients', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ id: 'doc_abc123', recipients: [] }));
        await getToolResult('add_recipient', {
            document_id: mockDocument.id,
            email: 'new@example.com',
            first_name: 'New',
            last_name: 'Signer',
            role: 'Signer',
        });

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain(`/documents/${mockDocument.id}/recipients`);
        expect(fetchCall[1].method).toBe('POST');
        const sentBody = JSON.parse(fetchCall[1].body as string);
        expect(sentBody.recipients[0].email).toBe('new@example.com');
        expect(sentBody.recipients[0].role).toBe('Signer');
    });

    it('add_recipient missing email returns validation error', async () => {
        const body = await callTool('add_recipient', { document_id: 'doc_xxx' });
        expect(body.error!.message).toContain('email');
    });

    it('get_document_fields returns fields list', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockFields));
        const result = await getToolResult('get_document_fields', { document_id: mockDocument.id });
        expect(result.fields).toHaveLength(2);
        expect(result.fields[0].name).toBe('client_name');

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain(`/documents/${mockDocument.id}/fields`);
    });

    it('update_field_values sends PUT with fields array', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ fields: [] }));
        await getToolResult('update_field_values', {
            document_id: mockDocument.id,
            fields: { client_name: 'Acme Corp', contract_value: '50000' },
        });

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].method).toBe('PUT');
        const sentBody = JSON.parse(fetchCall[1].body as string);
        expect(Array.isArray(sentBody.fields)).toBe(true);
        const clientField = sentBody.fields.find((f: { name: string }) => f.name === 'client_name');
        expect(clientField.value).toBe('Acme Corp');
    });

    it('update_field_values missing fields returns validation error', async () => {
        const body = await callTool('update_field_values', { document_id: 'doc_xxx' });
        expect(body.error!.message).toContain('fields');
    });
});

// ── Status & Tracking ─────────────────────────────────────────────────────────

describe('Status & Tracking', () => {
    it('get_document_status returns id, name, status only', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockDocument));
        const result = await getToolResult('get_document_status', { document_id: mockDocument.id });
        expect(result.status).toBe('document.draft');
        expect(result.id).toBe(mockDocument.id);
        expect(result.name).toBe(mockDocument.name);
        // Should not include recipients or other fields
        expect(result.recipients).toBeUndefined();
    });

    it('get_document_activity calls /documents/:id/session', async () => {
        const mockActivity = [{ type: 'document_viewed', date: '2026-03-20T10:00:00Z' }];
        mockFetch.mockReturnValueOnce(apiOk(mockActivity));
        const result = await getToolResult('get_document_activity', { document_id: mockDocument.id });
        expect(Array.isArray(result)).toBe(true);

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain(`/documents/${mockDocument.id}/session`);
    });

    it('send_reminder sends POST to /documents/:id/remind', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ success: true }));
        await getToolResult('send_reminder', { document_id: mockDocument.id });

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain(`/documents/${mockDocument.id}/remind`);
        expect(fetchCall[1].method).toBe('POST');
    });

    it('list_document_sections returns sections', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockSection] }));
        const result = await getToolResult('list_document_sections', { document_id: mockDocument.id });
        expect(result).toBeDefined();

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain(`/documents/${mockDocument.id}/sections`);
    });
});

// ── Webhooks ──────────────────────────────────────────────────────────────────

describe('Webhooks', () => {
    it('list_webhooks calls /webhook-subscriptions', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockWebhook]));
        const result = await getToolResult('list_webhooks', {});
        expect(Array.isArray(result)).toBe(true);

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain('/webhook-subscriptions');
    });

    it('create_webhook sends correct payload', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockWebhook));
        const result = await getToolResult('create_webhook', {
            name: 'Document State Watcher',
            url: 'https://example.com/webhooks/pandadoc',
            payload_type: 'json',
            triggers: ['document_state_changed'],
        });
        expect(result.uuid).toBe(mockWebhook.uuid);

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].method).toBe('POST');
        const sentBody = JSON.parse(fetchCall[1].body as string);
        expect(sentBody.name).toBe('Document State Watcher');
        expect(sentBody.url).toBe('https://example.com/webhooks/pandadoc');
        expect(sentBody.triggers).toEqual(['document_state_changed']);
    });

    it('create_webhook missing name returns validation error', async () => {
        const body = await callTool('create_webhook', { url: 'https://example.com/hook' });
        expect(body.error!.message).toContain('name');
    });

    it('create_webhook missing url returns validation error', async () => {
        const body = await callTool('create_webhook', { name: 'Test Hook' });
        expect(body.error!.message).toContain('url');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('API 404 returns -32603 with status in message', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Not found', 404));
        const body = await callTool('get_document', { document_id: 'nonexistent' });
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('404');
    });

    it('API 429 rate limit returns -32603', async () => {
        mockFetch.mockReturnValueOnce(new Response('Too Many Requests', { status: 429 }));
        const body = await callTool('list_documents', {});
        expect(body.error!.code).toBe(-32603);
    });

    it('unknown tool returns -32601', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error!.code).toBe(-32601);
        expect(body.error!.message).toContain('nonexistent_tool');
    });

    it('API error with detail field includes it in message', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Document is not in draft status', 400));
        const body = await callTool('send_document', { document_id: 'doc_completed' });
        expect(body.error!.message).toContain('Document is not in draft status');
    });
});
