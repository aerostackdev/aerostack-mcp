import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}

function makeReq(body: unknown, headers: Record<string, string> = {}) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

const SECRETS = {
    'X-Mcp-Secret-LINE-CHANNEL-ACCESS-TOKEN': 'line_token_abc123',
};

const mockProfile = {
    userId: 'U12345abcdef',
    displayName: 'Alice',
    pictureUrl: 'https://profile.line-scdn.net/abc',
    statusMessage: 'Hello LINE!',
};

const mockBotInfo = {
    userId: 'Ubot12345',
    basicId: '@bot_basic',
    premiumId: null,
    displayName: 'My Bot',
    pictureUrl: 'https://profile.line-scdn.net/bot',
    chatMode: 'chat',
    markAsReadMode: 'auto',
};

const mockQuota = {
    type: 'limited',
    value: 500,
};

beforeEach(() => { mockFetch.mockReset(); });

describe('mcp-line', () => {
    // ── Protocol tests ────────────────────────────────────────────────────────

    it('GET health check returns status ok with 7 tools', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-line');
        expect(body.tools).toBe(7);
    });

    it('initialize returns protocolVersion 2024-11-05', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-line');
    });

    it('tools/list returns all 7 tools', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(7);
    });

    it('tools/call with missing token returns -32001', async () => {
        const req = makeReq({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_bot_info', arguments: {} },
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('LINE_CHANNEL_ACCESS_TOKEN');
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'ping' }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('unknown tool returns -32601', async () => {
        const req = makeReq({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'delete_message', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    // ── Tool-specific tests ───────────────────────────────────────────────────

    it('get_profile calls /v2/bot/profile/{userId} with Bearer auth', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockProfile));
        const req = makeReq({
            jsonrpc: '2.0', id: 2, method: 'tools/call',
            params: { name: 'get_profile', arguments: { userId: 'U12345abcdef' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(res.status).toBe(200);
        const data = JSON.parse(body.result.content[0].text);
        expect(data.displayName).toBe('Alice');
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
        expect(url).toContain('/v2/bot/profile/U12345abcdef');
        expect(opts.headers['Authorization']).toBe('Bearer line_token_abc123');
    });

    it('get_bot_info calls /v2/bot/info', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBotInfo));
        const req = makeReq({
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'get_bot_info', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.displayName).toBe('My Bot');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/bot/info');
    });

    it('send_push_message sends correct body to /v2/bot/message/push', async () => {
        mockFetch.mockReturnValueOnce(apiOk({}));
        const req = makeReq({
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'send_push_message', arguments: { to: 'U12345', text: 'Hi there!' } },
        }, SECRETS);
        await worker.fetch(req);
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(url).toContain('/v2/bot/message/push');
        expect(opts.method).toBe('POST');
        const sentBody = JSON.parse(opts.body as string) as { to: string; messages: Array<{ type: string; text: string }> };
        expect(sentBody.to).toBe('U12345');
        expect(sentBody.messages[0].type).toBe('text');
        expect(sentBody.messages[0].text).toBe('Hi there!');
    });

    it('broadcast_message sends to /v2/bot/message/broadcast', async () => {
        mockFetch.mockReturnValueOnce(apiOk({}));
        const req = makeReq({
            jsonrpc: '2.0', id: 5, method: 'tools/call',
            params: { name: 'broadcast_message', arguments: { text: 'Hello everyone!' } },
        }, SECRETS);
        await worker.fetch(req);
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(url).toContain('/v2/bot/message/broadcast');
        expect(opts.method).toBe('POST');
    });

    it('get_message_quota returns quota info', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockQuota));
        const req = makeReq({
            jsonrpc: '2.0', id: 6, method: 'tools/call',
            params: { name: 'get_message_quota', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.type).toBe('limited');
        expect(data.value).toBe(500);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v2/bot/message/quota');
    });

    it('send_multicast sends to multiple users', async () => {
        mockFetch.mockReturnValueOnce(apiOk({}));
        const req = makeReq({
            jsonrpc: '2.0', id: 7, method: 'tools/call',
            params: {
                name: 'send_multicast',
                arguments: { to: ['U111', 'U222', 'U333'], text: 'Group message' },
            },
        }, SECRETS);
        await worker.fetch(req);
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(url).toContain('/v2/bot/message/multicast');
        const sentBody = JSON.parse(opts.body as string) as { to: string[]; messages: Array<{ type: string }> };
        expect(sentBody.to).toHaveLength(3);
        expect(sentBody.messages[0].type).toBe('text');
    });
});
