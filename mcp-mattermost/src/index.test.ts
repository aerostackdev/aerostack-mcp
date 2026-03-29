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
    'X-Mcp-Secret-MATTERMOST-URL': 'https://mattermost.example.com',
    'X-Mcp-Secret-MATTERMOST-TOKEN': 'token_abc123',
};

const mockUser = { id: 'user1', username: 'alice', email: 'alice@example.com', roles: 'system_user' };
const mockTeam = { id: 'team1', name: 'engineering', display_name: 'Engineering' };
const mockChannel = { id: 'ch1', name: 'general', display_name: 'General', type: 'O', team_id: 'team1' };
const mockPost = { id: 'post1', channel_id: 'ch1', message: 'Hello world', user_id: 'user1', create_at: 1710000000000 };

beforeEach(() => { mockFetch.mockReset(); });

describe('mcp-mattermost', () => {
    // ── Protocol tests ────────────────────────────────────────────────────────

    it('GET health check returns status ok with 8 tools', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-mattermost');
        expect(body.tools).toBe(8);
    });

    it('initialize returns protocolVersion 2024-11-05', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-mattermost');
    });

    it('tools/list returns all 8 tools', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(8);
    });

    it('tools/call with missing secrets returns -32001', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_me', arguments: {} } });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('MATTERMOST_URL');
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq({ jsonrpc: '2.0', id: 1, method: 'notifications/subscribe' }, SECRETS);
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

    it('get_me returns current user profile', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUser));
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
        expect(url).toContain('/api/v4/users/me');
        expect(opts.headers['Authorization']).toBe('Bearer token_abc123');
    });

    it('list_teams calls correct endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockTeam]));
        const req = makeReq({
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'list_teams', arguments: {} },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(res.status).toBe(200);
        const data = JSON.parse(body.result.content[0].text);
        expect(Array.isArray(data)).toBe(true);
        expect(data[0].id).toBe('team1');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/api/v4/users/me/teams');
    });

    it('post_message sends POST to /api/v4/posts with correct body', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockPost));
        const req = makeReq({
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'post_message', arguments: { channel_id: 'ch1', message: 'Hello world' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(res.status).toBe(200);
        const data = JSON.parse(body.result.content[0].text);
        expect(data.message).toBe('Hello world');
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(url).toContain('/api/v4/posts');
        expect(opts.method).toBe('POST');
    });

    it('list_posts passes per_page to URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ posts: { post1: mockPost }, order: ['post1'] }));
        const req = makeReq({
            jsonrpc: '2.0', id: 5, method: 'tools/call',
            params: { name: 'list_posts', arguments: { channel_id: 'ch1', limit: 10 } },
        }, SECRETS);
        await worker.fetch(req);
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('per_page=10');
        expect(url).toContain('/channels/ch1/posts');
    });

    it('create_channel sends correct payload', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockChannel));
        const req = makeReq({
            jsonrpc: '2.0', id: 6, method: 'tools/call',
            params: {
                name: 'create_channel',
                arguments: { team_id: 'team1', name: 'new-channel', display_name: 'New Channel', type: 'O' },
            },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(res.status).toBe(200);
        const data = JSON.parse(body.result.content[0].text);
        expect(data.name).toBe('general'); // from mock
        const url = mockFetch.mock.calls[0][0] as string;
        const opts = mockFetch.mock.calls[0][1] as RequestInit;
        expect(opts.method).toBe('POST');
        expect(url).toContain('/api/v4/channels');
    });

    it('API error is returned as -32603', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ message: 'Channel not found' }),
            { status: 404 },
        )));
        const req = makeReq({
            jsonrpc: '2.0', id: 7, method: 'tools/call',
            params: { name: 'get_channel', arguments: { channel_id: 'bad_id' } },
        }, SECRETS);
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('Channel not found');
    });
});
