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
function api204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

beforeEach(() => { mockFetch.mockReset(); });

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://mcp-discord.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function withToken(headers: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-DISCORD-BOT-TOKEN': 'mock-bot-token', ...headers };
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(makeRequest(body, headers ?? withToken()));
    return res.json() as Promise<any>;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockBotUser = { id: '123', username: 'TestBot', discriminator: '0', bot: true };
const mockGuild = { id: '456', name: 'Test Server', approximate_member_count: 100, approximate_presence_count: 10, owner_id: '999', preferred_locale: 'en-US', verification_level: 0 };
const mockChannel = { id: '789', name: 'general', type: 0, topic: null, nsfw: false, rate_limit_per_user: 0, parent_id: null, guild_id: '456', position: 0 };
const mockMessages = [{ id: 'msg1', content: 'Hello', author: { id: 'u1', username: 'user' }, timestamp: '2024-01-01T00:00:00Z', pinned: false }];
const mockSentMessage = { id: 'new_msg', channel_id: '789', content: 'test', timestamp: '2024-01-01T00:00:00Z' };
const mockMembers = [{ user: { id: 'u1', username: 'user' }, roles: [], joined_at: '2024-01-01' }];
const mockRoles = [{ id: 'r1', name: 'Admin', color: 16711680, position: 1, mentionable: true, hoist: true, managed: false }];
const mockThread = { id: 'thr1', name: 'My Thread', parent_id: '789', owner_id: 'u1', thread_metadata: { auto_archive_duration: 1440 } };

// ── Protocol tests ────────────────────────────────────────────────────────────

describe('Protocol', () => {
    it('GET / health check returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-discord.workers.dev/', { method: 'GET' }));
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-discord');
        expect(body.tools).toBe(23);
    });

    it('initialize returns protocol info', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        expect(data.result.protocolVersion).toBe('2024-11-05');
        expect(data.result.serverInfo.name).toBe('mcp-discord');
    });

    it('tools/list returns exactly 23 tools', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        expect(data.result.tools).toHaveLength(23);
        const names = data.result.tools.map((t: any) => t.name);
        expect(names).toContain('get_bot_info');
        expect(names).toContain('list_guilds');
        expect(names).toContain('list_active_threads');
    });

    it('unknown method returns -32601', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 2, method: 'unknown/method' });
        expect(data.error.code).toBe(-32601);
    });

    it('parse error returns -32700', async () => {
        const res = await worker.fetch(new Request('https://mcp-discord.workers.dev/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-json{',
        }));
        const data = await res.json() as any;
        expect(data.error.code).toBe(-32700);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('https://mcp-discord.workers.dev/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });
});

// ── Auth test ─────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing token header returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_bot_info', arguments: {} } },
            {} // no token header
        );
        expect(data.error.code).toBe(-32001);
        expect(data.error.message).toContain('DISCORD_BOT_TOKEN');
    });
});

// ── Tool: get_bot_info ────────────────────────────────────────────────────────

describe('Tool: get_bot_info', () => {
    it('returns bot info shape', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBotUser));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_bot_info', arguments: {} } });
        expect(data.result.content[0].type).toBe('text');
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('123');
        expect(result.username).toBe('TestBot');
        expect(result.bot).toBe(true);
    });

    it('401 error maps to -32603', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ message: '401: Unauthorized', code: 0 }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        )));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_bot_info', arguments: {} } });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Invalid bot token');
    });
});

// ── Tool: list_guilds ─────────────────────────────────────────────────────────

describe('Tool: list_guilds', () => {
    it('returns mapped guild list', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockGuild]));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_guilds', arguments: {} } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('456');
        expect(result[0].name).toBe('Test Server');
    });
});

// ── Tool: get_guild ───────────────────────────────────────────────────────────

describe('Tool: get_guild', () => {
    it('returns guild detail', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockGuild));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_guild', arguments: { guild_id: '456' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('456');
        expect(result.member_count).toBe(100);
    });

    it('404 maps to -32603 with not found message', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ message: 'Unknown Guild', code: 10004 }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
        )));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_guild', arguments: { guild_id: 'bad' } } });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Not found');
    });
});

// ── Tool: list_channels ───────────────────────────────────────────────────────

describe('Tool: list_channels', () => {
    it('returns sorted channel list with type names', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockChannel]));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_channels', arguments: { guild_id: '456' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('789');
        expect(result[0].type).toBe('text');
    });
});

// ── Tool: get_channel ─────────────────────────────────────────────────────────

describe('Tool: get_channel', () => {
    it('returns channel detail', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockChannel));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_channel', arguments: { channel_id: '789' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('789');
        expect(result.name).toBe('general');
    });
});

// ── Tool: get_messages ────────────────────────────────────────────────────────

describe('Tool: get_messages', () => {
    it('returns message list with author info', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMessages));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_messages', arguments: { channel_id: '789' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('msg1');
        expect(result[0].content).toBe('Hello');
        expect(result[0].author.username).toBe('user');
    });
});

// ── Tool: send_message ────────────────────────────────────────────────────────

describe('Tool: send_message', () => {
    it('sends message and returns message shape', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSentMessage));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'send_message', arguments: { channel_id: '789', content: 'test' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('new_msg');
        expect(result.content).toBe('test');

        // Verify fetch was called with correct body
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/channels/789/messages');
        const body = JSON.parse(opts.body);
        expect(body.content).toBe('test');
    });

    it('sends embed when embed_title provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockSentMessage, content: 'hi' }));
        await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'send_message', arguments: { channel_id: '789', content: 'hi', embed_title: 'My Embed', embed_color: 5793266 } } });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.embeds[0].title).toBe('My Embed');
        expect(body.embeds[0].color).toBe(5793266);
    });
});

// ── Tool: reply_to_message ────────────────────────────────────────────────────

describe('Tool: reply_to_message', () => {
    it('sends reply with message_reference', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSentMessage));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'reply_to_message', arguments: { channel_id: '789', message_id: 'msg1', content: 'Reply!' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.reply_to_message_id).toBe('msg1');

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.message_reference.message_id).toBe('msg1');
    });
});

// ── Tool: edit_message ────────────────────────────────────────────────────────

describe('Tool: edit_message', () => {
    it('patches message and returns updated content', async () => {
        const edited = { id: 'msg1', content: 'Edited!', edited_timestamp: '2024-01-02T00:00:00Z' };
        mockFetch.mockReturnValueOnce(apiOk(edited));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'edit_message', arguments: { channel_id: '789', message_id: 'msg1', content: 'Edited!' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.content).toBe('Edited!');
    });
});

// ── Tool: delete_message ──────────────────────────────────────────────────────

describe('Tool: delete_message', () => {
    it('returns success on 204', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_message', arguments: { channel_id: '789', message_id: 'msg1' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.deleted_message_id).toBe('msg1');
    });
});

// ── Tool: get_pinned_messages ─────────────────────────────────────────────────

describe('Tool: get_pinned_messages', () => {
    it('returns pinned messages array', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMessages));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_pinned_messages', arguments: { channel_id: '789' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].content).toBe('Hello');
    });
});

// ── Tool: pin_message ─────────────────────────────────────────────────────────

describe('Tool: pin_message', () => {
    it('returns success on 204', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pin_message', arguments: { channel_id: '789', message_id: 'msg1' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.pinned_message_id).toBe('msg1');
    });
});

// ── Tool: add_reaction ────────────────────────────────────────────────────────

describe('Tool: add_reaction', () => {
    it('returns success and encodes emoji in URL', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_reaction', arguments: { channel_id: '789', message_id: 'msg1', emoji: '👍' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.emoji).toBe('👍');

        // Verify emoji is URL-encoded
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain(encodeURIComponent('👍'));
        expect(url).toContain('/@me');
    });
});

// ── Tool: list_members ────────────────────────────────────────────────────────

describe('Tool: list_members', () => {
    it('returns member list', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMembers));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_members', arguments: { guild_id: '456' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].user_id).toBe('u1');
        expect(result[0].username).toBe('user');
    });
});

// ── Tool: get_member ──────────────────────────────────────────────────────────

describe('Tool: get_member', () => {
    it('returns member detail', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ user: { id: 'u1', username: 'user' }, roles: ['r1'], joined_at: '2024-01-01' }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_member', arguments: { guild_id: '456', user_id: 'u1' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.user_id).toBe('u1');
        expect(result.roles).toContain('r1');
    });
});

// ── Tool: list_roles ──────────────────────────────────────────────────────────

describe('Tool: list_roles', () => {
    it('returns sorted role list with hex color', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockRoles));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_roles', arguments: { guild_id: '456' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('r1');
        expect(result[0].color).toBe('#ff0000'); // 16711680 = 0xFF0000
    });
});

// ── Tool: assign_role ─────────────────────────────────────────────────────────

describe('Tool: assign_role', () => {
    it('returns success on 204', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'assign_role', arguments: { guild_id: '456', user_id: 'u1', role_id: 'r1' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.assigned_role_id).toBe('r1');
    });
});

// ── Tool: remove_role ─────────────────────────────────────────────────────────

describe('Tool: remove_role', () => {
    it('returns success on 204', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'remove_role', arguments: { guild_id: '456', user_id: 'u1', role_id: 'r1' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.removed_role_id).toBe('r1');
    });
});

// ── Tool: kick_member ─────────────────────────────────────────────────────────

describe('Tool: kick_member', () => {
    it('returns success on 204', async () => {
        mockFetch.mockReturnValueOnce(api204());
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'kick_member', arguments: { guild_id: '456', user_id: 'u1' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.kicked_user_id).toBe('u1');
    });

    it('includes reason in path when provided', async () => {
        mockFetch.mockReturnValueOnce(api204());
        await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'kick_member', arguments: { guild_id: '456', user_id: 'u1', reason: 'Spam' } } });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('reason=');
    });
});

// ── Tool: create_channel ──────────────────────────────────────────────────────

describe('Tool: create_channel', () => {
    it('creates text channel with default type 0', async () => {
        const created = { id: 'ch2', name: 'new-channel', type: 0, topic: null, parent_id: null, guild_id: '456' };
        mockFetch.mockReturnValueOnce(apiOk(created));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_channel', arguments: { guild_id: '456', name: 'new-channel' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.name).toBe('new-channel');

        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.type).toBe(0);
    });

    it('creates voice channel when type=2', async () => {
        const created = { id: 'ch3', name: 'voice', type: 2, topic: null, parent_id: null, guild_id: '456' };
        mockFetch.mockReturnValueOnce(apiOk(created));
        await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_channel', arguments: { guild_id: '456', name: 'voice', type: 2 } } });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.type).toBe(2);
    });
});

// ── Tool: edit_channel ────────────────────────────────────────────────────────

describe('Tool: edit_channel', () => {
    it('patches channel and returns updated shape', async () => {
        const updated = { id: '789', name: 'renamed', topic: 'New topic', rate_limit_per_user: 5, nsfw: false };
        mockFetch.mockReturnValueOnce(apiOk(updated));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'edit_channel', arguments: { channel_id: '789', name: 'renamed', topic: 'New topic', slowmode_seconds: 5 } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.name).toBe('renamed');
        expect(result.slowmode_seconds).toBe(5);
    });
});

// ── Tool: create_thread ───────────────────────────────────────────────────────

describe('Tool: create_thread', () => {
    it('creates thread from message', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockThread));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_thread', arguments: { channel_id: '789', name: 'My Thread', message_id: 'msg1' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('thr1');
        expect(result.created_from_message).toBe('msg1');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/messages/msg1/threads');
    });

    it('creates standalone thread without message_id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockThread));
        await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_thread', arguments: { channel_id: '789', name: 'Standalone' } } });
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/channels/789/threads');
        const body = JSON.parse(opts.body);
        expect(body.type).toBe(11);
    });
});

// ── Tool: list_active_threads ─────────────────────────────────────────────────

describe('Tool: list_active_threads', () => {
    it('returns thread list', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ threads: [mockThread] }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_active_threads', arguments: { guild_id: '456' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result[0].id).toBe('thr1');
        expect(result[0].name).toBe('My Thread');
    });

    it('returns empty array when no threads', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ threads: [] }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_active_threads', arguments: { guild_id: '456' } } });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(0);
    });
});

// ── Error edge cases ──────────────────────────────────────────────────────────

describe('Error cases', () => {
    it('403 Forbidden maps to missing permission error', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ message: 'Missing Permissions', code: 50013 }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
        )));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_bot_info', arguments: {} } });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Missing Discord permission');
    });

    it('429 Rate limit maps to retry message', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
            JSON.stringify({ message: 'You are being rate limited.', retry_after: 1.5, global: false }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
        )));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_bot_info', arguments: {} } });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Rate limited');
    });
});

// ── E2E ───────────────────────────────────────────────────────────────────────

describe.skipIf(!process.env.DISCORD_BOT_TOKEN)('E2E', () => {
    it('health check works', async () => {
        const res = await worker.fetch(new Request('https://mcp-discord.workers.dev/', { method: 'GET' }));
        expect(res.status).toBe(200);
    });
});
