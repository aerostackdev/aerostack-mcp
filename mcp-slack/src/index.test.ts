import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}
function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ error: { message } }), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://mcp-slack.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function withToken(headers: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-SLACK-BOT-TOKEN': 'xoxb-mock-token', ...headers };
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(makeRequest(body, headers ?? withToken()));
    return res.json() as Promise<any>;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockChannelsList = {
    ok: true,
    channels: [{ id: 'C1', name: 'general', is_private: false, num_members: 5, topic: { value: '' }, purpose: { value: '' } }],
};
const mockPostMessage = { ok: true, ts: '1234.5678', channel: 'C1' };
const mockHistory = {
    ok: true,
    messages: [{ ts: '1234.5678', user: 'U1', text: 'Hello', reply_count: 0, reactions: [] }],
};
const mockSearch = {
    ok: true,
    messages: { matches: [{ text: 'Hello', username: 'user', channel: { name: 'general' }, ts: '1234.5678', permalink: 'https://slack.com/msg' }] },
};
const mockUserInfo = {
    ok: true,
    user: { id: 'U1', name: 'user', real_name: 'User One', profile: { email: 'u@c.com', title: 'Dev' }, is_admin: false, tz: 'UTC' },
};
const mockUsersList = {
    ok: true,
    members: [
        { id: 'U1', name: 'user', real_name: 'User', profile: { email: 'u@c.com' }, is_admin: false, is_bot: false, deleted: false },
        { id: 'U2', name: 'bot', real_name: 'Bot', profile: {}, is_admin: false, is_bot: true, deleted: false },
        { id: 'U3', name: 'deleted', real_name: 'Deleted', profile: {}, is_admin: false, is_bot: false, deleted: true },
    ],
};
const mockAddReaction = { ok: true };

// ── Protocol tests ────────────────────────────────────────────────────────────

describe('Protocol', () => {
    it('GET /health returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-slack.workers.dev/health', { method: 'GET' }));
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('slack-mcp');
    });

    it('initialize returns protocol info', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        expect(data.result.protocolVersion).toBe('2024-11-05');
        expect(data.result.serverInfo.name).toBe('slack-mcp');
    });

    it('tools/list returns exactly 7 tools', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        expect(data.result.tools).toHaveLength(7);
        const names = data.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_channels');
        expect(names).toContain('add_reaction');
        expect(names).toContain('search_messages');
    });

    it('unknown method returns -32601', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 2, method: 'bogus/method' });
        expect(data.error.code).toBe(-32601);
    });

    it('parse error returns -32700', async () => {
        const res = await worker.fetch(new Request('https://mcp-slack.workers.dev/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'bad{json',
        }));
        const data = await res.json() as any;
        expect(data.error.code).toBe(-32700);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('https://mcp-slack.workers.dev/', { method: 'PUT' }));
        expect(res.status).toBe(405);
    });
});

// ── Auth test ─────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing token header returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_channels', arguments: {} } },
            {}
        );
        expect(data.error.code).toBe(-32001);
        expect(data.error.message).toContain('SLACK_BOT_TOKEN');
    });
});

// ── Tool: list_channels ───────────────────────────────────────────────────────

describe('Tool: list_channels', () => {
    it('returns mapped channel list', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockChannelsList));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_channels', arguments: {} } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('C1');
        expect(result[0].name).toBe('general');
        expect(result[0].is_private).toBe(false);
    });

    it('Slack ok:false maps to -32603', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ok: false, error: 'channel_not_found' }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_channels', arguments: {} } });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('channel_not_found');
    });
});

// ── Tool: post_message ────────────────────────────────────────────────────────

describe('Tool: post_message', () => {
    it('posts message and returns ts + channel', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockPostMessage));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'post_message', arguments: { channel: 'C1', text: 'Hello world' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.ts).toBe('1234.5678');
        expect(result.channel).toBe('C1');
        expect(result.message_text).toBe('Hello world');
    });

    it('passes thread_ts when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockPostMessage));
        await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'post_message', arguments: { channel: 'C1', text: 'reply', thread_ts: '1000.0001' } } });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.thread_ts).toBe('1000.0001');
    });
});

// ── Tool: get_channel_history ─────────────────────────────────────────────────

describe('Tool: get_channel_history', () => {
    it('returns message history', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockHistory));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_channel_history', arguments: { channel: 'C1' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].ts).toBe('1234.5678');
        expect(result[0].text).toBe('Hello');
        expect(result[0].user).toBe('U1');
    });

    it('Slack ok:false maps to -32603', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ok: false, error: 'not_in_channel' }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_channel_history', arguments: { channel: 'C1' } } });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('not_in_channel');
    });
});

// ── Tool: search_messages ─────────────────────────────────────────────────────

describe('Tool: search_messages', () => {
    it('returns search results', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSearch));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_messages', arguments: { query: 'Hello' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].text).toBe('Hello');
        expect(result[0].user).toBe('user');
        expect(result[0].channel).toBe('general');
        expect(result[0].permalink).toBe('https://slack.com/msg');
    });
});

// ── Tool: get_user_info ───────────────────────────────────────────────────────

describe('Tool: get_user_info', () => {
    it('returns user profile', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUserInfo));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_user_info', arguments: { user: 'U1' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('U1');
        expect(result.real_name).toBe('User One');
        expect(result.email).toBe('u@c.com');
        expect(result.timezone).toBe('UTC');
    });

    it('user not found returns -32603', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ok: false, error: 'user_not_found' }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_user_info', arguments: { user: 'U999' } } });
        expect(data.error.code).toBe(-32603);
    });
});

// ── Tool: list_users ──────────────────────────────────────────────────────────

describe('Tool: list_users', () => {
    it('filters out bots and deleted users', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUsersList));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users', arguments: {} } });
        const result = JSON.parse(data.result.content[0].text);
        // Only U1 should survive (U2 is bot, U3 is deleted)
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('U1');
    });

    it('returns empty array when all users are bots or deleted', async () => {
        mockFetch.mockReturnValueOnce(apiOk({
            ok: true,
            members: [
                { id: 'U2', name: 'bot', real_name: 'Bot', profile: {}, is_admin: false, is_bot: true, deleted: false },
            ],
        }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users', arguments: {} } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(0);
    });
});

// ── Tool: add_reaction ────────────────────────────────────────────────────────

describe('Tool: add_reaction', () => {
    it('returns success', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockAddReaction));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_reaction', arguments: { channel: 'C1', timestamp: '1234.5678', name: 'thumbsup' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.emoji).toBe('thumbsup');
    });

    it('already reacted maps to -32603', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ok: false, error: 'already_reacted' }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_reaction', arguments: { channel: 'C1', timestamp: '1234.5678', name: 'thumbsup' } } });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('already_reacted');
    });
});

// ── E2E ───────────────────────────────────────────────────────────────────────

describe.skipIf(!process.env.SLACK_BOT_TOKEN)('E2E', () => {
    it('health check works', async () => {
        const res = await worker.fetch(new Request('https://mcp-slack.workers.dev/health', { method: 'GET' }));
        expect(res.status).toBe(200);
    });
});
