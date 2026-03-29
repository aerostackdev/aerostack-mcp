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
    'X-Mcp-Secret-ROCKETCHAT-URL': 'https://chat.example.com',
    'X-Mcp-Secret-ROCKETCHAT-TOKEN': 'auth_token_xyz',
    'X-Mcp-Secret-ROCKETCHAT-USER-ID': 'user_id_abc',
};

const mockMe = { _id: 'user_id_abc', name: 'Alice', username: 'alice', email: 'alice@example.com', status: 'online' };
const mockChannelList = { channels: [{ _id: 'ch1', name: 'general', usersCount: 10 }], total: 1 };
const mockChannelInfo = { channel: { _id: 'ch1', name: 'general', usersCount: 10 } };
const mockMessage = { message: { _id: 'msg1', rid: 'ch1', msg: 'Hello!', u: { _id: 'user_id_abc', username: 'alice' } } };
const mockMessages = { messages: [{ _id: 'msg1', msg: 'Hello!', u: { username: 'alice' } }], total: 1 };
const mockRoomInfo = { room: { _id: 'ch1', name: 'general', t: 'c' } };
const mockUsersList = { users: [{ _id: 'user_id_abc', name: 'Alice', username: 'alice' }], total: 1 };

beforeEach(() => { mockFetch.mockReset(); });

describe('mcp-rocketchat', () => {
    // ── Protocol tests ────────────────────────────────────────────────────────

    it('GET health check returns status ok with 8 tools', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-rocketchat');
        expect(body.tools).toBe(8);
    });

    it('initialize returns protocolVersion 2024-11-05', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-rocketchat');
    });

    it('tools/list returns all 8 tools', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(8);
    });

    it('tools/call with missing secrets returns -32001 mentioning all three secrets', async () => {
        const req = makeReq({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_me', arguments: {} },
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('ROCKETCHAT_URL');
        expect(body.error.message).toContain('ROCKETCHAT_TOKEN');
        expect(body.error.message).toContain('ROCKETCHAT_USER_ID');
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
            params: { name: 'nonexistent_tool', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    // ── Tool-specific tests ───────────────────────────────────────────────────

    it('get_me calls /api/v1/me with auth headers', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMe));
        const req = makeReq({
            jsonrpc: '2.0', id: 2, method: 'tools/call',
            params: { name: 'get_me', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(res.status).toBe(200);
        const data = JSON.parse(body.result.content[0].text);
        expect(data.username).toBe('alice');
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
        expect(url).toContain('/api/v1/me');
        expect(opts.headers['X-Auth-Token']).toBe('auth_token_xyz');
        expect(opts.headers['X-User-Id']).toBe('user_id_abc');
    });

    it('list_channels calls channels.list with count param', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockChannelList));
        const req = makeReq({
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'list_channels', arguments: { limit: 20 } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.total).toBe(1);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('channels.list');
        expect(url).toContain('count=20');
    });

    it('send_message posts to /api/v1/chat.postMessage', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMessage));
        const req = makeReq({
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'send_message', arguments: { channel: '#general', text: 'Hello!' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(res.status).toBe(200);
        const data = JSON.parse(body.result.content[0].text);
        expect(data.message._id).toBe('msg1');
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(url).toContain('chat.postMessage');
        expect(opts.method).toBe('POST');
    });

    it('list_messages includes roomId and count in URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMessages));
        const req = makeReq({
            jsonrpc: '2.0', id: 5, method: 'tools/call',
            params: { name: 'list_messages', arguments: { room_id: 'ch1', limit: 25 } },
        }, SECRETS);
        await worker.fetch(req);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('roomId=ch1');
        expect(url).toContain('count=25');
    });

    it('get_room_info calls rooms.info with roomId', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockRoomInfo));
        const req = makeReq({
            jsonrpc: '2.0', id: 6, method: 'tools/call',
            params: { name: 'get_room_info', arguments: { room_id: 'ch1' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.room._id).toBe('ch1');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('rooms.info');
        expect(url).toContain('roomId=ch1');
    });

    it('list_users returns user list', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUsersList));
        const req = makeReq({
            jsonrpc: '2.0', id: 7, method: 'tools/call',
            params: { name: 'list_users', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.users[0].username).toBe('alice');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('users.list');
    });

    it('get_channel calls channels.info with roomName', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockChannelInfo));
        const req = makeReq({
            jsonrpc: '2.0', id: 8, method: 'tools/call',
            params: { name: 'get_channel', arguments: { name: 'general' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        const data = JSON.parse(body.result.content[0].text);
        expect(data.channel.name).toBe('general');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('channels.info');
        expect(url).toContain('roomName=general');
    });
});
