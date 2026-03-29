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
    'X-Mcp-Secret-VIBER-AUTH-TOKEN': 'viber_token_xyz789',
};

const mockAccountInfo = {
    status: 0,
    status_message: 'ok',
    id: 'pa:bot123',
    name: 'My Viber Bot',
    uri: 'myviberbot',
    icon: 'https://example.com/icon.jpg',
    subscribers_count: 1500,
};

const mockSendResult = {
    status: 0,
    status_message: 'ok',
    message_token: 5098034272017990000,
};

const mockBroadcastResult = {
    status: 0,
    status_message: 'ok',
    failed_list: [],
};

const mockUserDetails = {
    status: 0,
    status_message: 'ok',
    message_token: 1234,
    user: {
        id: 'user123',
        name: 'Bob',
        avatar: 'https://avatar.url/bob',
        country: 'UA',
        language: 'en',
        primary_device_os: 'Android',
    },
};

beforeEach(() => { mockFetch.mockReset(); });

describe('mcp-viber', () => {
    // ── Protocol tests ────────────────────────────────────────────────────────

    it('GET health check returns status ok with 5 tools', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-viber');
        expect(body.tools).toBe(5);
    });

    it('initialize returns protocolVersion 2024-11-05', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-viber');
    });

    it('tools/list returns all 5 tools', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(5);
    });

    it('tools/call with missing token returns -32001', async () => {
        const req = makeReq({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_account_info', arguments: {} },
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('VIBER_AUTH_TOKEN');
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
            params: { name: 'send_video', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    // ── Tool-specific tests ───────────────────────────────────────────────────

    it('get_account_info posts to /pa/get_account_info with auth header', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockAccountInfo));
        const req = makeReq({
            jsonrpc: '2.0', id: 2, method: 'tools/call',
            params: { name: 'get_account_info', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(res.status).toBe(200);
        const data = JSON.parse(body.result.content[0].text);
        expect(data.name).toBe('My Viber Bot');
        expect(data.subscribers_count).toBe(1500);
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
        expect(url).toContain('chatapi.viber.com/pa/get_account_info');
        expect(opts.headers['X-Viber-Auth-Token']).toBe('viber_token_xyz789');
    });

    it('send_text_message sends correct body to /pa/send_message', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSendResult));
        const req = makeReq({
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: {
                name: 'send_text_message',
                arguments: { receiver: 'user123', text: 'Hello Bob!', sender_name: 'My Bot' },
            },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(res.status).toBe(200);
        const data = JSON.parse(body.result.content[0].text);
        expect(data.status).toBe(0);
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(url).toContain('/pa/send_message');
        const sentBody = JSON.parse(opts.body as string) as { type: string; receiver: string; sender: { name: string } };
        expect(sentBody.type).toBe('text');
        expect(sentBody.receiver).toBe('user123');
        expect(sentBody.sender.name).toBe('My Bot');
    });

    it('send_picture_message sends type picture', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSendResult));
        const req = makeReq({
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: {
                name: 'send_picture_message',
                arguments: {
                    receiver: 'user123',
                    text: 'Check this out!',
                    media: 'https://example.com/image.jpg',
                    sender_name: 'My Bot',
                },
            },
        }, SECRETS);
        await worker.fetch(req);
        const opts = mockFetch.mock.calls[0][1] as RequestInit;
        const sentBody = JSON.parse(opts.body as string) as { type: string; media: string };
        expect(sentBody.type).toBe('picture');
        expect(sentBody.media).toBe('https://example.com/image.jpg');
    });

    it('broadcast_message sends to broadcast_list', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBroadcastResult));
        const req = makeReq({
            jsonrpc: '2.0', id: 5, method: 'tools/call',
            params: {
                name: 'broadcast_message',
                arguments: {
                    broadcast_list: ['user1', 'user2', 'user3'],
                    text: 'Hello all!',
                    sender_name: 'My Bot',
                },
            },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.failed_list).toHaveLength(0);
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(url).toContain('/pa/broadcast_message');
        const sentBody = JSON.parse(opts.body as string) as { broadcast_list: string[] };
        expect(sentBody.broadcast_list).toHaveLength(3);
    });

    it('get_user_details posts id to /pa/get_user_details', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUserDetails));
        const req = makeReq({
            jsonrpc: '2.0', id: 6, method: 'tools/call',
            params: { name: 'get_user_details', arguments: { user_id: 'user123' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.user.name).toBe('Bob');
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(url).toContain('/pa/get_user_details');
        const sentBody = JSON.parse(opts.body as string) as { id: string };
        expect(sentBody.id).toBe('user123');
    });
});
