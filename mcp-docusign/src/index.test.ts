import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'test_ds_access_token_abc123';
const ACCOUNT_ID = 'test-account-id-12345';
const BASE_URL = 'https://na4.docusign.net';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockEnvelope = {
    envelopeId: 'env-uuid-001',
    status: 'sent',
    emailSubject: 'Please sign this agreement',
    sentDateTime: '2026-03-01T10:00:00Z',
    completedDateTime: null,
    signers: [
        { email: 'alice@example.com', name: 'Alice Smith', status: 'sent', recipientId: '1' },
    ],
};

const mockEnvelopeList = {
    envelopes: [mockEnvelope],
    resultSetSize: '1',
    totalSetSize: '1',
    startPosition: '0',
    endPosition: '0',
};

const mockRecipients = {
    signers: [
        {
            email: 'alice@example.com',
            name: 'Alice Smith',
            status: 'sent',
            recipientId: '1',
            routingOrder: '1',
            signedDateTime: null,
        },
    ],
    carbonCopies: [],
    certifiedDeliveries: [],
    agents: [],
    editors: [],
    intermediaries: [],
    recipientCount: '1',
};

const mockTemplate = {
    templateId: 'tmpl-uuid-001',
    name: 'NDA Template',
    description: 'Standard non-disclosure agreement',
    shared: 'false',
    recipients: {
        signers: [{ roleName: 'Signer', recipientId: '1', routingOrder: '1' }],
    },
    documents: [{ documentId: '1', name: 'nda.pdf', uri: '/envelopes/tmpl-uuid-001/documents/1' }],
    created: '2025-01-01T00:00:00Z',
};

const mockTemplateList = {
    envelopeTemplates: [mockTemplate],
    resultSetSize: '1',
    totalSetSize: '1',
};

const mockFolders = {
    folders: [
        { folderId: 'inbox', name: 'Inbox', type: 'inbox', ownerUserName: 'Alice Smith' },
        { folderId: 'sentitems', name: 'Sent Items', type: 'sentitems', ownerUserName: 'Alice Smith' },
    ],
};

const mockFolderEnvelopes = {
    folderItems: [
        {
            envelopeId: 'env-uuid-001',
            status: 'completed',
            subject: 'Please sign this agreement',
            ownerName: 'Alice Smith',
            sentDateTime: '2026-03-01T10:00:00Z',
        },
    ],
    resultSetSize: '1',
};

const mockAuditEvents = {
    auditEvents: [
        {
            eventFields: [
                { name: 'logTime', value: '2026-03-01T10:00:00Z' },
                { name: 'source', value: 'API' },
                { name: 'action', value: 'Sent' },
                { name: 'envelopeId', value: 'env-uuid-001' },
            ],
        },
        {
            eventFields: [
                { name: 'logTime', value: '2026-03-01T11:30:00Z' },
                { name: 'source', value: 'Web' },
                { name: 'action', value: 'Signed' },
                { name: 'userName', value: 'Alice Smith' },
            ],
        },
    ],
};

const mockDocuments = {
    envelopeDocuments: [
        { documentId: '1', name: 'agreement.pdf', type: 'content', uri: '/envelopes/env-uuid-001/documents/1', order: '1' },
        { documentId: 'certificate', name: 'Summary', type: 'summary', uri: '/envelopes/env-uuid-001/documents/summary' },
    ],
};

const mockSigningUrl = {
    url: 'https://na4.docusign.net/Signing/MTRedeem/v1/...',
};

const mockAccountInfo = {
    accountId: 'test-account-id-12345',
    accountName: 'Acme Corp',
    planName: 'Business Pro',
    isDefault: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function dsOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function dsOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function dsErr(message: string, errorCode: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ message, errorCode }), {
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
        headers['X-Mcp-Secret-DOCUSIGN-ACCESS-TOKEN'] = ACCESS_TOKEN;
    }
    if (!missingSecrets.includes('accountId')) {
        headers['X-Mcp-Secret-DOCUSIGN-ACCOUNT-ID'] = ACCOUNT_ID;
    }
    if (!missingSecrets.includes('baseUrl')) {
        headers['X-Mcp-Secret-DOCUSIGN-BASE-URL'] = BASE_URL;
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
    it('GET / returns status ok with server mcp-docusign and tools 21', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-docusign');
        expect(body.tools).toBe(21);
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
        expect(body.result.serverInfo.name).toBe('mcp-docusign');
    });

    it('tools/list returns exactly 21 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools).toHaveLength(21);
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
    it('missing token returns -32001 with DOCUSIGN_ACCESS_TOKEN in message', async () => {
        const body = await callTool('list_envelopes', {}, ['token']);
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('DOCUSIGN_ACCESS_TOKEN');
    });

    it('missing accountId returns -32001 with DOCUSIGN_ACCOUNT_ID in message', async () => {
        const body = await callTool('list_envelopes', {}, ['accountId']);
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('DOCUSIGN_ACCOUNT_ID');
    });

    it('missing baseUrl returns -32001 with DOCUSIGN_BASE_URL in message', async () => {
        const body = await callTool('list_envelopes', {}, ['baseUrl']);
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('DOCUSIGN_BASE_URL');
    });

    it('missing all three secrets returns -32001', async () => {
        const body = await callTool('list_envelopes', {}, ['token', 'accountId', 'baseUrl']);
        expect(body.error!.code).toBe(-32001);
    });

    it('Authorization header uses Bearer token format', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockEnvelopeList));
        await callTool('list_envelopes', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it('URL includes account ID and base URL', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockEnvelopeList));
        await callTool('list_envelopes', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(BASE_URL);
        expect(url).toContain(ACCOUNT_ID);
    });
});

// ── Envelopes ─────────────────────────────────────────────────────────────────

describe('list_envelopes', () => {
    it('returns envelope list', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockEnvelopeList));
        const result = await getToolResult('list_envelopes', {});
        expect(result.envelopes).toHaveLength(1);
        expect(result.envelopes[0].envelopeId).toBe('env-uuid-001');
    });

    it('includes status filter in URL when provided', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockEnvelopeList));
        await callTool('list_envelopes', { status: 'completed', count: 50 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=completed');
        expect(url).toContain('count=50');
    });

    it('API error propagates correctly', async () => {
        mockFetch.mockReturnValueOnce(dsErr('Invalid status', 'INVALID_REQUEST_PARAMETER', 400));
        const body = await callTool('list_envelopes', { status: 'invalid' });
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('400');
    });
});

describe('get_envelope', () => {
    it('returns envelope details', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockEnvelope));
        const result = await getToolResult('get_envelope', { envelope_id: 'env-uuid-001' });
        expect(result.envelopeId).toBe('env-uuid-001');
        expect(result.status).toBe('sent');
    });

    it('URL contains envelope ID', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockEnvelope));
        await callTool('get_envelope', { envelope_id: 'env-uuid-001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/envelopes/env-uuid-001');
    });

    it('missing envelope_id returns -32603', async () => {
        const body = await callTool('get_envelope', {});
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('envelope_id');
    });
});

describe('create_envelope', () => {
    it('creates envelope with document and returns envelopeId', async () => {
        mockFetch.mockReturnValueOnce(dsOk({ envelopeId: 'env-new-001', status: 'sent', uri: '/envelopes/env-new-001' }));
        const result = await getToolResult('create_envelope', {
            emailSubject: 'Please sign',
            document_name: 'contract.pdf',
            document_base64: btoa('fake pdf content'),
            recipients: [{ email: 'bob@example.com', name: 'Bob Jones', routingOrder: 1 }],
        });
        expect(result.envelopeId).toBe('env-new-001');
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.emailSubject).toBe('Please sign');
        expect(body.documents[0].name).toBe('contract.pdf');
        expect(body.recipients.signers[0].email).toBe('bob@example.com');
    });

    it('creates template-based envelope with templateRoles', async () => {
        mockFetch.mockReturnValueOnce(dsOk({ envelopeId: 'env-tmpl-001', status: 'sent' }));
        await callTool('create_envelope', {
            emailSubject: 'NDA Signing',
            templateId: 'tmpl-uuid-001',
            recipients: [{ email: 'client@example.com', name: 'Client Name', roleName: 'Signer' }],
        });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(body.templateId).toBe('tmpl-uuid-001');
        expect(body.templateRoles[0].roleName).toBe('Signer');
        expect(body.templateRoles[0].email).toBe('client@example.com');
    });

    it('missing emailSubject returns error', async () => {
        const body = await callTool('create_envelope', {
            recipients: [{ email: 'a@a.com', name: 'A' }],
        });
        expect(body.error!.code).toBe(-32603);
    });

    it('missing recipients returns error', async () => {
        const body = await callTool('create_envelope', { emailSubject: 'Test' });
        expect(body.error!.code).toBe(-32603);
    });
});

describe('void_envelope', () => {
    it('voids envelope with PUT and correct body', async () => {
        mockFetch.mockReturnValueOnce(dsOk({ envelopeId: 'env-uuid-001', status: 'voided' }));
        await getToolResult('void_envelope', { envelope_id: 'env-uuid-001', void_reason: 'Sent by mistake' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('PUT');
        const body = JSON.parse(call[1].body as string);
        expect(body.status).toBe('voided');
        expect(body.voidedReason).toBe('Sent by mistake');
    });

    it('missing void_reason returns error', async () => {
        const body = await callTool('void_envelope', { envelope_id: 'env-uuid-001' });
        expect(body.error!.code).toBe(-32603);
    });
});

describe('resend_envelope', () => {
    it('resends envelope with PUT and resend_envelope=true query param', async () => {
        mockFetch.mockReturnValueOnce(dsOk({ envelopeId: 'env-uuid-001' }));
        await getToolResult('resend_envelope', { envelope_id: 'env-uuid-001' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('PUT');
        const url = call[0] as string;
        expect(url).toContain('resend_envelope=true');
    });

    it('missing envelope_id returns error', async () => {
        const body = await callTool('resend_envelope', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('get_envelope_documents', () => {
    it('returns document list for an envelope', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockDocuments));
        const result = await getToolResult('get_envelope_documents', { envelope_id: 'env-uuid-001' });
        expect(result.envelopeDocuments).toHaveLength(2);
        expect(result.envelopeDocuments[0].name).toBe('agreement.pdf');
    });

    it('URL contains /documents path', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockDocuments));
        await callTool('get_envelope_documents', { envelope_id: 'env-uuid-001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/envelopes/env-uuid-001/documents');
    });

    it('missing envelope_id returns error', async () => {
        const body = await callTool('get_envelope_documents', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('download_envelope_document', () => {
    it('returns base64 encoded PDF content', async () => {
        const pdfContent = 'fake pdf binary';
        const encoder = new TextEncoder();
        const bytes = encoder.encode(pdfContent);
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(bytes, {
            status: 200,
            headers: { 'Content-Type': 'application/pdf' },
        })));
        const result = await getToolResult('download_envelope_document', {
            envelope_id: 'env-uuid-001',
            document_id: '1',
        });
        expect(result.encoding).toBe('base64');
        expect(result.content_type).toBe('application/pdf');
        expect(result.data).toBeTruthy();
    });

    it('missing document_id returns error', async () => {
        const body = await callTool('download_envelope_document', { envelope_id: 'env-uuid-001' });
        expect(body.error!.code).toBe(-32603);
    });
});

// ── Recipients & Signing ──────────────────────────────────────────────────────

describe('get_envelope_recipients', () => {
    it('returns recipients with signers array', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockRecipients));
        const result = await getToolResult('get_envelope_recipients', { envelope_id: 'env-uuid-001' });
        expect(result.signers).toHaveLength(1);
        expect(result.signers[0].email).toBe('alice@example.com');
    });

    it('URL contains /recipients path', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockRecipients));
        await callTool('get_envelope_recipients', { envelope_id: 'env-uuid-001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/envelopes/env-uuid-001/recipients');
    });

    it('missing envelope_id returns error', async () => {
        const body = await callTool('get_envelope_recipients', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('add_recipient', () => {
    it('adds recipient with POST method', async () => {
        mockFetch.mockReturnValueOnce(dsOk({ ...mockRecipients, signers: [...mockRecipients.signers, { email: 'bob@example.com', name: 'Bob', recipientId: '2' }] }));
        await getToolResult('add_recipient', {
            envelope_id: 'env-uuid-001',
            email: 'bob@example.com',
            name: 'Bob Jones',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.signers[0].email).toBe('bob@example.com');
    });

    it('missing required fields returns error', async () => {
        const body = await callTool('add_recipient', { envelope_id: 'env-uuid-001' });
        expect(body.error!.code).toBe(-32603);
    });
});

describe('update_recipient', () => {
    it('updates recipient with PUT method', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockRecipients));
        await getToolResult('update_recipient', {
            envelope_id: 'env-uuid-001',
            recipient_id: '1',
            email: 'newemail@example.com',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('PUT');
        const body = JSON.parse(call[1].body as string);
        expect(body.signers[0].email).toBe('newemail@example.com');
        expect(body.signers[0].recipientId).toBe('1');
    });

    it('missing recipient_id returns error', async () => {
        const body = await callTool('update_recipient', { envelope_id: 'env-uuid-001' });
        expect(body.error!.code).toBe(-32603);
    });
});

describe('delete_recipient', () => {
    it('deletes recipient with DELETE method', async () => {
        mockFetch.mockReturnValueOnce(dsOk204());
        const result = await getToolResult('delete_recipient', {
            envelope_id: 'env-uuid-001',
            recipient_id: '2',
        });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('DELETE');
        const body = JSON.parse(call[1].body as string);
        expect(body.signers[0].recipientId).toBe('2');
    });

    it('missing envelope_id or recipient_id returns error', async () => {
        const body = await callTool('delete_recipient', { envelope_id: 'env-uuid-001' });
        expect(body.error!.code).toBe(-32603);
    });
});

describe('create_signing_url', () => {
    it('returns signing URL with POST to /views/recipient', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockSigningUrl));
        const result = await getToolResult('create_signing_url', {
            envelope_id: 'env-uuid-001',
            recipient_email: 'alice@example.com',
            recipient_name: 'Alice Smith',
            client_user_id: 'user-123',
            return_url: 'https://myapp.com/signed',
        });
        expect(result.url).toContain('docusign.net');
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        const url = call[0] as string;
        expect(url).toContain('/views/recipient');
        const body = JSON.parse(call[1].body as string);
        expect(body.email).toBe('alice@example.com');
        expect(body.clientUserId).toBe('user-123');
        expect(body.returnUrl).toBe('https://myapp.com/signed');
    });

    it('missing required fields returns error', async () => {
        const body = await callTool('create_signing_url', { envelope_id: 'env-uuid-001' });
        expect(body.error!.code).toBe(-32603);
    });
});

// ── Templates ─────────────────────────────────────────────────────────────────

describe('list_templates', () => {
    it('returns template list', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockTemplateList));
        const result = await getToolResult('list_templates', {});
        expect(result.envelopeTemplates).toHaveLength(1);
        expect(result.envelopeTemplates[0].name).toBe('NDA Template');
    });

    it('includes search_text when provided', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockTemplateList));
        await callTool('list_templates', { search_text: 'NDA' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('search_text=NDA');
    });
});

describe('get_template', () => {
    it('returns template details', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockTemplate));
        const result = await getToolResult('get_template', { template_id: 'tmpl-uuid-001' });
        expect(result.templateId).toBe('tmpl-uuid-001');
        expect(result.name).toBe('NDA Template');
    });

    it('URL contains template ID', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockTemplate));
        await callTool('get_template', { template_id: 'tmpl-uuid-001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/templates/tmpl-uuid-001');
    });

    it('missing template_id returns error', async () => {
        const body = await callTool('get_template', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('create_template', () => {
    it('creates template with POST and document', async () => {
        mockFetch.mockReturnValueOnce(dsOk({ templateId: 'tmpl-new-001', name: 'New Template' }));
        const result = await getToolResult('create_template', {
            name: 'Service Agreement',
            document_name: 'agreement.pdf',
            document_base64: btoa('pdf content'),
            role_name: 'Client',
        });
        expect(result.templateId).toBe('tmpl-new-001');
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.name).toBe('Service Agreement');
        expect(body.documents[0].name).toBe('agreement.pdf');
        expect(body.recipients.signers[0].roleName).toBe('Client');
    });

    it('missing required fields returns error', async () => {
        const body = await callTool('create_template', { name: 'Test' });
        expect(body.error!.code).toBe(-32603);
    });
});

describe('send_from_template', () => {
    it('sends envelope from template with templateRoles', async () => {
        mockFetch.mockReturnValueOnce(dsOk({ envelopeId: 'env-from-tmpl-001', status: 'sent' }));
        const result = await getToolResult('send_from_template', {
            template_id: 'tmpl-uuid-001',
            email_subject: 'Please review and sign',
            recipients: [{ role_name: 'Client', email: 'client@example.com', name: 'Client Name' }],
        });
        expect(result.envelopeId).toBe('env-from-tmpl-001');
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string);
        expect(body.templateId).toBe('tmpl-uuid-001');
        expect(body.templateRoles[0].roleName).toBe('Client');
        expect(body.templateRoles[0].email).toBe('client@example.com');
        expect(body.status).toBe('sent');
    });

    it('missing required fields returns error', async () => {
        const body = await callTool('send_from_template', { template_id: 'tmpl-uuid-001' });
        expect(body.error!.code).toBe(-32603);
    });
});

// ── Folders & Audit ───────────────────────────────────────────────────────────

describe('list_folders', () => {
    it('returns folder list', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockFolders));
        const result = await getToolResult('list_folders', {});
        expect(result.folders).toHaveLength(2);
        expect(result.folders[0].folderId).toBe('inbox');
    });

    it('include_items param is included in URL', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockFolders));
        await callTool('list_folders', { include_items: true });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('include_items=true');
    });
});

describe('get_folder_envelopes', () => {
    it('returns envelopes in folder', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockFolderEnvelopes));
        const result = await getToolResult('get_folder_envelopes', { folder_id: 'inbox' });
        expect(result.folderItems).toHaveLength(1);
        expect(result.folderItems[0].envelopeId).toBe('env-uuid-001');
    });

    it('URL contains folder ID', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockFolderEnvelopes));
        await callTool('get_folder_envelopes', { folder_id: 'sentitems' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/folders/sentitems');
    });

    it('missing folder_id returns error', async () => {
        const body = await callTool('get_folder_envelopes', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('get_envelope_audit_events', () => {
    it('returns audit events for envelope', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockAuditEvents));
        const result = await getToolResult('get_envelope_audit_events', { envelope_id: 'env-uuid-001' });
        expect(result.auditEvents).toHaveLength(2);
        const sentEvent = result.auditEvents[0].eventFields.find((f: { name: string }) => f.name === 'action');
        expect(sentEvent.value).toBe('Sent');
    });

    it('URL contains /audit_events path', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockAuditEvents));
        await callTool('get_envelope_audit_events', { envelope_id: 'env-uuid-001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/envelopes/env-uuid-001/audit_events');
    });

    it('missing envelope_id returns error', async () => {
        const body = await callTool('get_envelope_audit_events', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('search_envelopes', () => {
    it('returns search results', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockEnvelopeList));
        const result = await getToolResult('search_envelopes', { query: 'alice@example.com' });
        expect(result.envelopes).toHaveLength(1);
    });

    it('includes query in URL', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockEnvelopeList));
        await callTool('search_envelopes', { query: 'NDA Agreement' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('query=NDA+Agreement');
    });

    it('missing query returns error', async () => {
        const body = await callTool('search_envelopes', {});
        expect(body.error!.code).toBe(-32603);
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns account info', async () => {
        mockFetch.mockReturnValueOnce(dsOk(mockAccountInfo));
        const result = await getToolResult('_ping', {});
        expect(result.accountId).toBe('test-account-id-12345');
        expect(result.accountName).toBe('Acme Corp');
    });

    it('returns -32001 when secrets missing', async () => {
        const body = await callTool('_ping', {}, ['token']);
        expect(body.error!.code).toBe(-32001);
    });
});
