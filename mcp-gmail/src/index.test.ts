import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ────────────────────────────────────────────────────────────────

const TOKEN = 'ya29.test_gmail_access_token_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockMessage: Record<string, unknown> = {
    id: 'msg001',
    threadId: 'thread001',
    labelIds: ['INBOX', 'UNREAD'],
    snippet: 'Hello, this is a test email snippet...',
    sizeEstimate: 1234,
    internalDate: '1704067200000',
    payload: {
        headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'To', value: 'me@example.com' },
            { name: 'Subject', value: 'Test Email Subject' },
            { name: 'Date', value: 'Mon, 1 Jan 2024 00:00:00 +0000' },
            { name: 'Message-ID', value: '<msg001@mail.example.com>' },
        ],
        mimeType: 'text/plain',
        body: { data: 'SGVsbG8gV29ybGQ=', size: 11 },
    },
};

const mockThread: Record<string, unknown> = {
    id: 'thread001',
    snippet: 'Thread snippet here...',
    historyId: '12345',
    messages: [mockMessage],
};

const mockLabel: Record<string, unknown> = {
    id: 'Label_abc123',
    name: 'Work/Invoices',
    type: 'user',
    messageListVisibility: 'show',
    labelListVisibility: 'labelShow',
    messagesTotal: 42,
    messagesUnread: 5,
    threadsTotal: 30,
    threadsUnread: 3,
};

const mockDraft: Record<string, unknown> = {
    id: 'draft001',
    message: {
        id: 'msg_draft001',
        threadId: 'thread_draft001',
    },
};

const mockProfile: Record<string, unknown> = {
    emailAddress: 'me@example.com',
    messagesTotal: 12345,
    threadsTotal: 5678,
    historyId: '99999',
};

const mockAttachment: Record<string, unknown> = {
    attachmentId: 'att001',
    size: 10240,
    data: 'base64urlEncodedDataHere',
};

const mockSentMessage: Record<string, unknown> = {
    id: 'msg123',
    threadId: 'thread123',
    labelIds: ['SENT'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function gmailOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function gmailErr(message: string, status = 400, gmailStatus = 'INVALID_ARGUMENT') {
    return Promise.resolve(new Response(JSON.stringify({
        error: { code: status, message, status: gmailStatus },
    }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function gmail204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function makeReq(method: string, params?: unknown, missingAuth = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingAuth) headers['X-Mcp-Secret-GMAIL-ACCESS-TOKEN'] = TOKEN;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(toolName: string, args: Record<string, unknown> = {}, missingAuth = false) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingAuth);
}

async function callToolRaw(toolName: string, args: Record<string, unknown> = {}, missingAuth = false) {
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
    const body = await callToolRaw(toolName, args);
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
    it('GET / returns status ok with server mcp-gmail and tools 20', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-gmail');
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
        expect(body.result.serverInfo.name).toBe('mcp-gmail');
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
    it('missing token returns -32001 with GMAIL_ACCESS_TOKEN in message', async () => {
        const body = await callToolRaw('list_messages', {}, true);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('GMAIL_ACCESS_TOKEN');
    });

    it('Gmail 401 maps to Authentication failed message', async () => {
        mockFetch.mockReturnValueOnce(gmailErr('Invalid Credentials', 401, 'UNAUTHENTICATED'));
        const body = await callToolRaw('list_messages', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Authentication failed');
    });

    it('auth header uses Bearer token format', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({ messages: [] }));
        await getToolResult('list_messages');
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });
});

// ── Reading Messages ──────────────────────────────────────────────────────────

describe('list_messages', () => {
    it('returns messages array and resultSizeEstimate', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({
            messages: [{ id: 'msg001', threadId: 'thread001' }],
            resultSizeEstimate: 1,
        }));
        const result = await getToolResult('list_messages');
        expect(Array.isArray(result.messages)).toBe(true);
        expect(result.messages[0].id).toBe('msg001');
        expect(result.resultSizeEstimate).toBe(1);
    });

    it('with query appends q param to URL', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({ messages: [], resultSizeEstimate: 0 }));
        await getToolResult('list_messages', { query: 'is:unread' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('q=is%3Aunread');
    });

    it('with pageToken appends pageToken param', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({ messages: [], resultSizeEstimate: 0 }));
        await getToolResult('list_messages', { pageToken: 'nextPage123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('pageToken=nextPage123');
    });

    it('empty inbox returns empty messages array', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({ resultSizeEstimate: 0 }));
        const result = await getToolResult('list_messages');
        expect(result.messages).toEqual([]);
    });
});

describe('get_message', () => {
    it('returns shaped message with from, to, subject, date', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockMessage));
        const result = await getToolResult('get_message', { id: 'msg001' });
        expect(result.id).toBe('msg001');
        expect(result.threadId).toBe('thread001');
        expect(result.from).toBe('sender@example.com');
        expect(result.subject).toBe('Test Email Subject');
        expect(result.snippet).toBe('Hello, this is a test email snippet...');
    });

    it('missing id returns validation error', async () => {
        const body = await callToolRaw('get_message', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });

    it('with format=metadata passes format to URL', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockMessage));
        await getToolResult('get_message', { id: 'msg001', format: 'metadata' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('format=metadata');
    });
});

describe('search_messages', () => {
    it('returns query, messages, and resultSizeEstimate', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({
            messages: [{ id: 'msg001', threadId: 'thread001' }],
            resultSizeEstimate: 5,
        }));
        const result = await getToolResult('search_messages', { query: 'from:boss@example.com' });
        expect(result.query).toBe('from:boss@example.com');
        expect(Array.isArray(result.messages)).toBe(true);
        expect(result.resultSizeEstimate).toBe(5);
    });

    it('missing query returns validation error', async () => {
        const body = await callToolRaw('search_messages', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('query');
    });

    it('query is encoded in URL', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({ messages: [] }));
        await getToolResult('search_messages', { query: 'is:unread has:attachment' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('q=is%3Aunread');
    });
});

describe('list_threads', () => {
    it('returns threads array', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({
            threads: [{ id: 'thread001', snippet: 'Thread snippet', historyId: '12345' }],
            resultSizeEstimate: 1,
        }));
        const result = await getToolResult('list_threads');
        expect(Array.isArray(result.threads)).toBe(true);
        expect(result.threads[0].id).toBe('thread001');
    });

    it('with query appends q to URL', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({ threads: [] }));
        await getToolResult('list_threads', { query: 'label:INBOX' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('q=label%3AINBOX');
    });
});

describe('get_thread', () => {
    it('returns thread with messages array', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockThread));
        const result = await getToolResult('get_thread', { id: 'thread001' });
        expect(result.id).toBe('thread001');
        expect(result.messageCount).toBe(1);
        expect(Array.isArray(result.messages)).toBe(true);
        expect(result.messages[0].id).toBe('msg001');
    });

    it('missing id returns validation error', async () => {
        const body = await callToolRaw('get_thread', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Sending ───────────────────────────────────────────────────────────────────

describe('send_email', () => {
    it('returns message id and threadId on success', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockSentMessage));
        const result = await getToolResult('send_email', {
            to: 'recipient@example.com',
            subject: 'Hello',
            body: 'Test message body',
        });
        expect(result.id).toBe('msg123');
        expect(result.threadId).toBe('thread123');
    });

    it('missing to returns validation error', async () => {
        const body = await callToolRaw('send_email', { subject: 'Hi' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('to');
    });

    it('missing subject returns validation error', async () => {
        const body = await callToolRaw('send_email', { to: 'test@example.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('subject');
    });

    it('sends raw base64url-encoded body to Gmail API', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockSentMessage));
        await getToolResult('send_email', {
            to: 'test@example.com',
            subject: 'Test',
            body: 'Hello world',
        });
        const call = mockFetch.mock.calls[0];
        const url = call[0] as string;
        expect(url).toContain('/users/me/messages/send');
        const reqBody = JSON.parse(call[1].body as string) as { raw: string };
        expect(typeof reqBody.raw).toBe('string');
        expect(reqBody.raw.length).toBeGreaterThan(0);
        // Verify no padding chars (base64url)
        expect(reqBody.raw).not.toContain('=');
    });

    it('with thread_id includes threadId in request body', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockSentMessage));
        await getToolResult('send_email', {
            to: 'test@example.com',
            subject: 'Reply',
            body: 'test',
            thread_id: 'thread999',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { raw: string; threadId: string };
        expect(reqBody.threadId).toBe('thread999');
    });

    it('with array of recipients joins them with comma', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockSentMessage));
        await getToolResult('send_email', {
            to: ['alice@example.com', 'bob@example.com'],
            subject: 'Multi-recipient',
            body: 'Hi all',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { raw: string };
        // Decode the base64url raw to verify To header
        const decoded = decodeURIComponent(escape(atob(reqBody.raw.replace(/-/g, '+').replace(/_/g, '/'))));
        expect(decoded).toContain('alice@example.com, bob@example.com');
    });

    it('with html_body uses text/html content type', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockSentMessage));
        await getToolResult('send_email', {
            to: 'test@example.com',
            subject: 'HTML email',
            html_body: '<p>Hello</p>',
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { raw: string };
        const decoded = decodeURIComponent(escape(atob(reqBody.raw.replace(/-/g, '+').replace(/_/g, '/'))));
        expect(decoded).toContain('Content-Type: text/html');
        expect(decoded).toContain('<p>Hello</p>');
    });
});

describe('reply_to_message', () => {
    it('fetches original message and sends reply in same thread', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockMessage)); // fetch original
        mockFetch.mockReturnValueOnce(gmailOk(mockSentMessage)); // send reply
        const result = await getToolResult('reply_to_message', {
            message_id: 'msg001',
            body: 'Thanks for your email',
        });
        expect(result.id).toBe('msg123');
        expect(result.threadId).toBe('thread123');
        expect(result.repliedTo).toBe('msg001');
    });

    it('missing message_id returns validation error', async () => {
        const body = await callToolRaw('reply_to_message', { body: 'test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('message_id');
    });

    it('reply uses threadId from original in send request', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockMessage));
        mockFetch.mockReturnValueOnce(gmailOk(mockSentMessage));
        await getToolResult('reply_to_message', {
            message_id: 'msg001',
            body: 'reply text',
        });
        const sendCall = mockFetch.mock.calls[1];
        const sendBody = JSON.parse(sendCall[1].body as string) as { threadId: string };
        expect(sendBody.threadId).toBe('thread001');
    });
});

describe('forward_message', () => {
    it('fetches original and sends forward with Fwd: subject prefix', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockMessage));
        mockFetch.mockReturnValueOnce(gmailOk(mockSentMessage));
        const result = await getToolResult('forward_message', {
            message_id: 'msg001',
            to: 'colleague@example.com',
        });
        expect(result.id).toBe('msg123');
        expect(result.subject).toBe('Fwd: Test Email Subject');
        expect(result.forwardedFrom).toBe('msg001');
    });

    it('missing message_id returns validation error', async () => {
        const body = await callToolRaw('forward_message', { to: 'test@example.com' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('message_id');
    });

    it('missing to returns validation error', async () => {
        const body = await callToolRaw('forward_message', { message_id: 'msg001' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('to');
    });

    it('with note prepends note before forwarded content', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockMessage));
        mockFetch.mockReturnValueOnce(gmailOk(mockSentMessage));
        await getToolResult('forward_message', {
            message_id: 'msg001',
            to: 'colleague@example.com',
            note: 'FYI - please review',
        });
        const sendCall = mockFetch.mock.calls[1];
        const sendBody = JSON.parse(sendCall[1].body as string) as { raw: string };
        const decoded = decodeURIComponent(escape(atob(sendBody.raw.replace(/-/g, '+').replace(/_/g, '/'))));
        expect(decoded).toContain('FYI - please review');
    });
});

describe('create_draft', () => {
    it('returns draftId and messageId', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockDraft));
        const result = await getToolResult('create_draft', {
            to: 'test@example.com',
            subject: 'Draft email',
            body: 'Draft body',
        });
        expect(result.draftId).toBe('draft001');
        expect(result.messageId).toBe('msg_draft001');
    });

    it('sends to /users/me/drafts endpoint', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockDraft));
        await getToolResult('create_draft', { to: 'test@example.com', subject: 'Draft' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/users/me/drafts');
    });

    it('missing to returns validation error', async () => {
        const body = await callToolRaw('create_draft', { subject: 'Draft' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('to');
    });
});

// ── Labels ────────────────────────────────────────────────────────────────────

describe('list_labels', () => {
    it('returns array of shaped labels', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({ labels: [mockLabel] }));
        const result = await getToolResult('list_labels');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe('Label_abc123');
        expect(result[0].name).toBe('Work/Invoices');
        expect(result[0].type).toBe('user');
    });

    it('empty labels returns empty array', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({ labels: [] }));
        const result = await getToolResult('list_labels');
        expect(result).toEqual([]);
    });
});

describe('get_label', () => {
    it('returns label details with message counts', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockLabel));
        const result = await getToolResult('get_label', { id: 'Label_abc123' });
        expect(result.id).toBe('Label_abc123');
        expect(result.name).toBe('Work/Invoices');
        expect(result.messagesTotal).toBe(42);
        expect(result.messagesUnread).toBe(5);
    });

    it('missing id returns validation error', async () => {
        const body = await callToolRaw('get_label', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_label', () => {
    it('returns new label with id and name', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockLabel));
        const result = await getToolResult('create_label', { name: 'Work/Invoices' });
        expect(result.id).toBe('Label_abc123');
        expect(result.name).toBe('Work/Invoices');
    });

    it('missing name returns validation error', async () => {
        const body = await callToolRaw('create_label', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });

    it('sends POST to /users/me/labels', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockLabel));
        await getToolResult('create_label', { name: 'Test Label' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/users/me/labels');
        expect(call[1].method).toBe('POST');
    });
});

describe('modify_message_labels', () => {
    it('returns updated message with new labelIds', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({
            ...mockMessage,
            labelIds: ['INBOX', 'STARRED'],
        }));
        const result = await getToolResult('modify_message_labels', {
            id: 'msg001',
            addLabelIds: ['STARRED'],
            removeLabelIds: ['UNREAD'],
        });
        expect(result.id).toBe('msg001');
        expect(result.labelIds).toContain('STARRED');
    });

    it('missing id returns validation error', async () => {
        const body = await callToolRaw('modify_message_labels', { addLabelIds: ['STARRED'] });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Management ────────────────────────────────────────────────────────────────

describe('trash_message', () => {
    it('returns trashed message with trashed=true', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({
            ...mockMessage,
            labelIds: ['TRASH'],
        }));
        const result = await getToolResult('trash_message', { id: 'msg001' });
        expect(result.id).toBe('msg001');
        expect(result.trashed).toBe(true);
    });

    it('missing id returns validation error', async () => {
        const body = await callToolRaw('trash_message', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });

    it('sends POST to /trash endpoint', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockMessage));
        await getToolResult('trash_message', { id: 'msg001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/messages/msg001/trash');
    });
});

describe('delete_message', () => {
    it('returns deleted=true on 204 response', async () => {
        mockFetch.mockReturnValueOnce(gmail204());
        const result = await getToolResult('delete_message', { id: 'msg001' });
        expect(result.deleted).toBe(true);
        expect(result.id).toBe('msg001');
    });

    it('missing id returns validation error', async () => {
        const body = await callToolRaw('delete_message', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });

    it('sends DELETE to message URL', async () => {
        mockFetch.mockReturnValueOnce(gmail204());
        await getToolResult('delete_message', { id: 'msg001' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/messages/msg001');
        expect(call[1].method).toBe('DELETE');
    });
});

describe('mark_as_read', () => {
    it('returns read=true and message id', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({
            ...mockMessage,
            labelIds: ['INBOX'],
        }));
        const result = await getToolResult('mark_as_read', { id: 'msg001' });
        expect(result.id).toBe('msg001');
        expect(result.read).toBe(true);
    });

    it('sends removeLabelIds: [UNREAD] in body', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockMessage));
        await getToolResult('mark_as_read', { id: 'msg001' });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { removeLabelIds: string[] };
        expect(reqBody.removeLabelIds).toContain('UNREAD');
    });

    it('missing id returns validation error', async () => {
        const body = await callToolRaw('mark_as_read', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('mark_as_unread', () => {
    it('returns unread=true and message id', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({
            ...mockMessage,
            labelIds: ['INBOX', 'UNREAD'],
        }));
        const result = await getToolResult('mark_as_unread', { id: 'msg001' });
        expect(result.id).toBe('msg001');
        expect(result.unread).toBe(true);
    });

    it('sends addLabelIds: [UNREAD] in body', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockMessage));
        await getToolResult('mark_as_unread', { id: 'msg001' });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as { addLabelIds: string[] };
        expect(reqBody.addLabelIds).toContain('UNREAD');
    });

    it('missing id returns validation error', async () => {
        const body = await callToolRaw('mark_as_unread', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Profile & Settings ────────────────────────────────────────────────────────

describe('get_profile', () => {
    it('returns email address and counts', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockProfile));
        const result = await getToolResult('get_profile');
        expect(result.emailAddress).toBe('me@example.com');
        expect(result.messagesTotal).toBe(12345);
        expect(result.threadsTotal).toBe(5678);
    });

    it('hits /users/me/profile endpoint', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockProfile));
        await getToolResult('get_profile');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/users/me/profile');
    });
});

describe('list_drafts', () => {
    it('returns drafts array with id and messageId', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({
            drafts: [mockDraft],
            resultSizeEstimate: 1,
        }));
        const result = await getToolResult('list_drafts');
        expect(Array.isArray(result.drafts)).toBe(true);
        expect(result.drafts[0].id).toBe('draft001');
        expect(result.drafts[0].messageId).toBe('msg_draft001');
    });

    it('empty drafts returns empty array', async () => {
        mockFetch.mockReturnValueOnce(gmailOk({ drafts: [] }));
        const result = await getToolResult('list_drafts');
        expect(result.drafts).toEqual([]);
    });
});

describe('get_attachment', () => {
    it('returns attachment data and size', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockAttachment));
        const result = await getToolResult('get_attachment', {
            message_id: 'msg001',
            attachment_id: 'att001',
        });
        expect(result.attachmentId).toBe('att001');
        expect(result.size).toBe(10240);
        expect(result.data).toBe('base64urlEncodedDataHere');
    });

    it('missing message_id returns validation error', async () => {
        const body = await callToolRaw('get_attachment', { attachment_id: 'att001' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('message_id');
    });

    it('missing attachment_id returns validation error', async () => {
        const body = await callToolRaw('get_attachment', { message_id: 'msg001' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('attachment_id');
    });

    it('hits correct attachment endpoint URL', async () => {
        mockFetch.mockReturnValueOnce(gmailOk(mockAttachment));
        await getToolResult('get_attachment', {
            message_id: 'msg001',
            attachment_id: 'att001',
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/messages/msg001/attachments/att001');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('Gmail 403 returns Permission denied message', async () => {
        mockFetch.mockReturnValueOnce(gmailErr('Insufficient permissions', 403, 'PERMISSION_DENIED'));
        const body = await callToolRaw('list_messages', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Permission denied');
    });

    it('Gmail 404 returns Not found message', async () => {
        mockFetch.mockReturnValueOnce(gmailErr('Requested entity was not found', 404, 'NOT_FOUND'));
        const body = await callToolRaw('get_message', { id: 'nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Not found');
    });

    it('Gmail 429 returns Rate limited message', async () => {
        mockFetch.mockReturnValueOnce(gmailErr('Rate Limit Exceeded', 429, 'RESOURCE_EXHAUSTED'));
        const body = await callToolRaw('list_messages', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Rate limited');
    });

    it('unknown tool returns error', async () => {
        const req = makeToolReq('unknown_gmail_tool', {});
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error).toBeDefined();
        expect(body.error.message).toContain('Unknown tool');
    });
});

// ── E2E (skipped — require real Gmail OAuth token) ────────────────────────────

describe.skip('E2E — real Gmail API', () => {
    it('get_profile returns authenticated user email', async () => {
        const result = await getToolResult('get_profile');
        expect(result.emailAddress).toMatch(/@/);
    });

    it('list_messages returns messages from inbox', async () => {
        const result = await getToolResult('list_messages', { query: 'in:inbox', max: 5 });
        expect(Array.isArray(result.messages)).toBe(true);
    });

    it('list_labels returns at least INBOX label', async () => {
        const result = await getToolResult('list_labels');
        expect(Array.isArray(result)).toBe(true);
        const inbox = (result as Array<{ id: string }>).find(l => l.id === 'INBOX');
        expect(inbox).toBeDefined();
    });
});
