import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Helpers ──────────────────────────────────────────────────────────────────

function tgOk(result: unknown) {
    return Promise.resolve(new Response(JSON.stringify({ ok: true, result }), {
        headers: { 'Content-Type': 'application/json' },
    }));
}

function tgErr(code: number, description: string, parameters?: Record<string, unknown>) {
    return Promise.resolve(new Response(JSON.stringify({ ok: false, error_code: code, description, parameters }), {
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeRequest(method: string, params?: unknown, token: string | null = 'test_token_123') {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token !== null) headers['X-Mcp-Secret-TELEGRAM-BOT-TOKEN'] = token;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolCall(toolName: string, args: Record<string, unknown> = {}, token: string | null = 'test_token_123') {
    return makeRequest('tools/call', { name: toolName, arguments: args }, token);
}

async function callTool(toolName: string, args: Record<string, unknown> = {}, token: string | null = 'test_token_123') {
    const req = makeToolCall(toolName, args, token);
    const res = await worker.fetch(req);
    return res.json() as Promise<{ jsonrpc: string; id: number; result?: { content: [{ type: string; text: string }] }; error?: { code: number; message: string } }>;
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
    it('GET / returns status ok with tool count', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-telegram');
        expect(body.tools).toBe(28);
    });

    it('non-POST returns 405', async () => {
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
        const req = makeRequest('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-telegram');
    });

    it('tools/list returns exactly 28 tools with name, description, inputSchema', async () => {
        const req = makeRequest('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(28);
        for (const tool of body.result.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
        }
    });

    it('unknown method returns -32601', async () => {
        const req = makeRequest('unknown/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing X-Mcp-Secret-TELEGRAM-BOT-TOKEN returns -32001', async () => {
        const body = await callTool('get_me', {}, null);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('TELEGRAM_BOT_TOKEN');
    });

    it('Telegram 401 maps to clean invalid token message', async () => {
        mockFetch.mockReturnValueOnce(tgErr(401, 'Unauthorized'));
        const body = await callTool('get_me', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Invalid bot token');
        expect(body.error!.message).toContain('TELEGRAM_BOT_TOKEN');
    });
});

// ── Group 1: Bot Config ───────────────────────────────────────────────────────

describe('get_me', () => {
    it('returns shaped bot info', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            id: 123456789,
            is_bot: true,
            first_name: 'TestBot',
            username: 'testbot',
            can_join_groups: true,
            can_read_all_group_messages: false,
            supports_inline_queries: false,
        }));
        const result = await getToolResult('get_me');
        expect(result.id).toBe(123456789);
        expect(result.username).toBe('testbot');
        expect(result.is_bot).toBe(true);
        expect(result.first_name).toBe('TestBot');
    });
});

describe('get_my_commands', () => {
    it('returns commands array', async () => {
        mockFetch.mockReturnValueOnce(tgOk([
            { command: 'start', description: 'Start the bot' },
            { command: 'help', description: 'Get help' },
        ]));
        const result = await getToolResult('get_my_commands');
        expect(result).toHaveLength(2);
        expect(result[0].command).toBe('start');
    });

    it('passes language_code to Telegram', async () => {
        mockFetch.mockReturnValueOnce(tgOk([]));
        await getToolResult('get_my_commands', { language_code: 'ru' });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { language_code: string };
        expect(body.language_code).toBe('ru');
    });
});

describe('set_my_commands', () => {
    it('returns success with count', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        const result = await getToolResult('set_my_commands', {
            commands: [
                { command: 'start', description: 'Start' },
                { command: 'help', description: 'Help' },
            ],
        });
        expect(result.success).toBe(true);
        expect(result.count).toBe(2);
    });
});

describe('get_webhook_info', () => {
    it('returns shaped webhook info', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            url: 'https://example.com/webhook',
            has_custom_certificate: false,
            pending_update_count: 3,
            last_error_message: null,
            last_error_date: null,
            max_connections: 40,
        }));
        const result = await getToolResult('get_webhook_info');
        expect(result.url).toBe('https://example.com/webhook');
        expect(result.pending_update_count).toBe(3);
        expect(result.max_connections).toBe(40);
    });
});

// ── Group 2: Receiving Messages ───────────────────────────────────────────────

describe('get_updates', () => {
    it('returns shaped update array', async () => {
        mockFetch.mockReturnValueOnce(tgOk([{
            update_id: 1001,
            message: {
                message_id: 42,
                from: { id: 99, is_bot: false, first_name: 'Alice', username: 'alice' },
                chat: { id: -100001, type: 'group', title: 'Test Group' },
                text: 'Hello!',
                date: 1700000000,
            },
        }]));
        const result = await getToolResult('get_updates');
        expect(result).toHaveLength(1);
        expect(result[0].update_id).toBe(1001);
        expect(result[0].type).toBe('message');
        expect(result[0].message.id).toBe(42);
        expect(result[0].message.text).toBe('Hello!');
    });

    it('passes offset to Telegram API', async () => {
        mockFetch.mockReturnValueOnce(tgOk([]));
        await getToolResult('get_updates', { offset: 500 });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { offset: number };
        expect(body.offset).toBe(500);
    });
});

describe('get_chat_history', () => {
    it('filters updates by chat_id', async () => {
        mockFetch.mockReturnValueOnce(tgOk([
            {
                update_id: 1001,
                message: {
                    message_id: 10,
                    from: { id: 1, is_bot: false, first_name: 'Alice' },
                    chat: { id: -100001, type: 'group', title: 'Group A' },
                    text: 'Message in group A',
                    date: 1700000000,
                },
            },
            {
                update_id: 1002,
                message: {
                    message_id: 20,
                    from: { id: 2, is_bot: false, first_name: 'Bob' },
                    chat: { id: -100002, type: 'group', title: 'Group B' },
                    text: 'Message in group B',
                    date: 1700000001,
                },
            },
        ]));
        const result = await getToolResult('get_chat_history', { chat_id: '-100001' });
        expect(result).toHaveLength(1);
        expect(result[0].message_id).toBe(10);
    });
});

// ── Group 3: Sending Messages ─────────────────────────────────────────────────

describe('send_message', () => {
    it('returns shaped message response', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            message_id: 55,
            chat: { id: 12345, type: 'private' },
            text: 'Hello world',
            date: 1700000000,
        }));
        const result = await getToolResult('send_message', { chat_id: '12345', text: 'Hello world' });
        expect(result.message_id).toBe(55);
        expect(result.chat_id).toBe(12345);
        expect(result.text).toBe('Hello world');
    });

    it('builds reply_markup for inline_keyboard', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            message_id: 56,
            chat: { id: 12345, type: 'private' },
            text: 'Pick one',
            date: 1700000001,
        }));
        await getToolResult('send_message', {
            chat_id: '12345',
            text: 'Pick one',
            inline_keyboard: [[{ text: 'Click me', url: 'https://example.com' }]],
        });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { reply_markup: { inline_keyboard: unknown[][] } };
        expect(body.reply_markup).toBeDefined();
        expect(body.reply_markup.inline_keyboard).toBeDefined();
        expect(body.reply_markup.inline_keyboard[0][0]).toEqual({ text: 'Click me', url: 'https://example.com' });
    });

    it('missing chat_id returns -32603 with validation error', async () => {
        const body = await callTool('send_message', { text: 'Hello' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('chat_id');
    });

    it('missing text returns -32603 with validation error', async () => {
        const body = await callTool('send_message', { chat_id: '12345' });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('text');
    });
});

describe('send_photo', () => {
    it('returns shaped photo response', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            message_id: 60,
            chat: { id: 12345, type: 'private' },
            caption: 'Nice photo',
            photo: [{ file_id: 'abc123', width: 100, height: 100 }],
            date: 1700000000,
        }));
        const result = await getToolResult('send_photo', {
            chat_id: '12345',
            photo: 'https://example.com/photo.jpg',
            caption: 'Nice photo',
        });
        expect(result.message_id).toBe(60);
        expect(result.caption).toBe('Nice photo');
    });
});

describe('send_document', () => {
    it('returns shaped document response', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            message_id: 70,
            chat: { id: 12345, type: 'private' },
            document: { file_id: 'doc123', file_name: 'report.pdf' },
            date: 1700000000,
        }));
        const result = await getToolResult('send_document', {
            chat_id: '12345',
            document: 'https://example.com/report.pdf',
        });
        expect(result.message_id).toBe(70);
        expect(result.filename).toBe('report.pdf');
    });
});

describe('send_poll', () => {
    it('returns shaped poll response', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            message_id: 80,
            chat: { id: -100001, type: 'group' },
            poll: { id: 'poll_123', question: 'Favorite color?' },
            date: 1700000000,
        }));
        const result = await getToolResult('send_poll', {
            chat_id: '-100001',
            question: 'Favorite color?',
            options: ['Red', 'Blue', 'Green'],
        });
        expect(result.message_id).toBe(80);
        expect(result.poll_id).toBe('poll_123');
        expect(result.question).toBe('Favorite color?');
    });
});

describe('send_invoice', () => {
    it('returns shaped invoice response', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            message_id: 90,
            chat: { id: 12345, type: 'private' },
            date: 1700000000,
        }));
        const result = await getToolResult('send_invoice', {
            chat_id: '12345',
            title: 'Premium Plan',
            description: 'Monthly subscription',
            payload: 'order_123',
            provider_token: 'PROVIDER_TOKEN',
            currency: 'USD',
            prices: [{ label: 'Monthly', amount: 999 }],
        });
        expect(result.message_id).toBe(90);
        expect(result.chat_id).toBe(12345);
    });
});

describe('edit_message', () => {
    it('returns message with edit_date', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            message_id: 42,
            chat: { id: 12345, type: 'private' },
            text: 'Updated text',
            edit_date: 1700000100,
            date: 1700000000,
        }));
        const result = await getToolResult('edit_message', {
            chat_id: '12345',
            message_id: 42,
            text: 'Updated text',
        });
        expect(result.message_id).toBe(42);
        expect(result.text).toBe('Updated text');
        expect(result.edit_date).toBe(1700000100);
    });
});

describe('delete_message', () => {
    it('returns success with deleted_message_id', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        const result = await getToolResult('delete_message', { chat_id: '12345', message_id: 42 });
        expect(result.success).toBe(true);
        expect(result.deleted_message_id).toBe(42);
    });
});

// ── Group 4: Chat & User Intelligence ────────────────────────────────────────

describe('get_chat', () => {
    it('returns shaped chat info', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            id: -100001,
            type: 'supergroup',
            title: 'My Group',
            username: 'mygroup',
            description: 'A test group',
            invite_link: 'https://t.me/+abc123',
            members_count: 150,
            slow_mode_delay: 0,
        }));
        const result = await getToolResult('get_chat', { chat_id: '-100001' });
        expect(result.id).toBe(-100001);
        expect(result.type).toBe('supergroup');
        expect(result.title).toBe('My Group');
        expect(result.member_count).toBe(150);
    });
});

describe('get_chat_member', () => {
    it('returns member status and user fields', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            status: 'administrator',
            user: { id: 999, username: 'adminuser', first_name: 'Admin', is_bot: false },
            is_anonymous: false,
            can_delete_messages: true,
        }));
        const result = await getToolResult('get_chat_member', { chat_id: '-100001', user_id: 999 });
        expect(result.status).toBe('administrator');
        expect(result.user.id).toBe(999);
        expect(result.user.username).toBe('adminuser');
    });
});

describe('get_chat_member_count', () => {
    it('returns member_count', async () => {
        mockFetch.mockReturnValueOnce(tgOk(42));
        const result = await getToolResult('get_chat_member_count', { chat_id: '-100001' });
        expect(result.member_count).toBe(42);
        expect(result.chat_id).toBe('-100001');
    });
});

describe('get_chat_administrators', () => {
    it('returns admin array with permissions', async () => {
        mockFetch.mockReturnValueOnce(tgOk([
            {
                status: 'creator',
                user: { id: 1, username: 'owner', first_name: 'Owner', is_bot: false },
                is_anonymous: false,
                can_manage_chat: true,
                can_delete_messages: true,
            },
        ]));
        const result = await getToolResult('get_chat_administrators', { chat_id: '-100001' });
        expect(result).toHaveLength(1);
        expect(result[0].status).toBe('creator');
        expect(result[0].username).toBe('owner');
        expect(Array.isArray(result[0].permissions)).toBe(true);
    });
});

describe('get_user_profile_photos', () => {
    it('returns photos with url_hint', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            total_count: 2,
            photos: [
                [{ file_id: 'small_abc', width: 160, height: 160 }, { file_id: 'large_abc', width: 640, height: 640, file_size: 12345 }],
            ],
        }));
        const result = await getToolResult('get_user_profile_photos', { user_id: 12345 });
        expect(result).toHaveLength(1);
        expect(result[0].file_id).toBe('large_abc');
        expect(result[0].url_hint).toBe('use get_file tool to get download URL');
    });
});

describe('get_file', () => {
    it('constructs download_url with token', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            file_id: 'abc123',
            file_unique_id: 'unique_abc',
            file_path: 'photos/file_1.jpg',
            file_size: 54321,
        }));
        const result = await getToolResult('get_file', { file_id: 'abc123' });
        expect(result.file_id).toBe('abc123');
        expect(result.file_path).toBe('photos/file_1.jpg');
        expect(result.download_url).toBe('https://api.telegram.org/file/bottest_token_123/photos/file_1.jpg');
    });
});

// ── Group 5: Moderation ───────────────────────────────────────────────────────

describe('ban_member', () => {
    it('permanent ban returns until "permanent"', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        const result = await getToolResult('ban_member', { chat_id: '-100001', user_id: 999 });
        expect(result.success).toBe(true);
        expect(result.banned_user_id).toBe(999);
        expect(result.until).toBe('permanent');
    });

    it('timed ban with until_date returns ISO date string', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        const futureTs = 1800000000;
        const result = await getToolResult('ban_member', {
            chat_id: '-100001',
            user_id: 999,
            until_date: futureTs,
        });
        expect(result.until).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

describe('unban_member', () => {
    it('returns success with unbanned_user_id', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        const result = await getToolResult('unban_member', { chat_id: '-100001', user_id: 999 });
        expect(result.success).toBe(true);
        expect(result.unbanned_user_id).toBe(999);
    });
});

describe('restrict_member', () => {
    it('builds ChatPermissions object in Telegram API call', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        await getToolResult('restrict_member', {
            chat_id: '-100001',
            user_id: 777,
            can_send_messages: false,
            can_send_media: false,
        });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as { permissions: Record<string, boolean> };
        expect(body.permissions).toBeDefined();
        expect(typeof body.permissions).toBe('object');
        expect(body.permissions.can_send_messages).toBe(false);
        expect(body.permissions.can_send_photos).toBe(false);
    });

    it('returns success with user_id and permissions_set', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        const result = await getToolResult('restrict_member', {
            chat_id: '-100001',
            user_id: 777,
            can_send_messages: true,
        });
        expect(result.success).toBe(true);
        expect(result.user_id).toBe(777);
        expect(Array.isArray(result.permissions_set)).toBe(true);
    });
});

describe('promote_member', () => {
    it('only passes provided permissions to Telegram API', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        await getToolResult('promote_member', {
            chat_id: '-100001',
            user_id: 888,
            can_delete_messages: true,
            can_pin_messages: true,
        });
        const call = mockFetch.mock.calls[0];
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(body.can_delete_messages).toBe(true);
        expect(body.can_pin_messages).toBe(true);
        expect(body.can_manage_chat).toBeUndefined();
    });

    it('returns success with promoted_user_id and permissions_granted', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        const result = await getToolResult('promote_member', {
            chat_id: '-100001',
            user_id: 888,
            can_delete_messages: true,
        });
        expect(result.success).toBe(true);
        expect(result.promoted_user_id).toBe(888);
        expect(result.permissions_granted).toContain('can_delete_messages');
    });
});

describe('pin_message', () => {
    it('returns success with pinned_message_id', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        const result = await getToolResult('pin_message', { chat_id: '-100001', message_id: 42 });
        expect(result.success).toBe(true);
        expect(result.pinned_message_id).toBe(42);
    });
});

// ── Group 6: Group & Channel Management ──────────────────────────────────────

describe('set_chat_title', () => {
    it('returns success with new_title', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        const result = await getToolResult('set_chat_title', { chat_id: '-100001', title: 'New Title' });
        expect(result.success).toBe(true);
        expect(result.new_title).toBe('New Title');
    });
});

describe('set_chat_description', () => {
    it('returns success with chat_id', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        const result = await getToolResult('set_chat_description', {
            chat_id: '-100001',
            description: 'A great community',
        });
        expect(result.success).toBe(true);
        expect(result.chat_id).toBe('-100001');
    });
});

describe('create_invite_link', () => {
    it('returns invite_link in response', async () => {
        mockFetch.mockReturnValueOnce(tgOk({
            invite_link: 'https://t.me/+xyzABC123',
            name: 'Summer Campaign',
            creator: { id: 1, is_bot: false, first_name: 'Owner' },
            expire_date: 1800000000,
            member_limit: 100,
        }));
        const result = await getToolResult('create_invite_link', { chat_id: '-100001', name: 'Summer Campaign' });
        expect(result.invite_link).toBe('https://t.me/+xyzABC123');
        expect(result.name).toBe('Summer Campaign');
        expect(result.creator_id).toBe(1);
        expect(result.member_limit).toBe(100);
    });
});

describe('send_chat_action', () => {
    it('returns success with action_sent', async () => {
        mockFetch.mockReturnValueOnce(tgOk(true));
        const result = await getToolResult('send_chat_action', { chat_id: '12345', action: 'typing' });
        expect(result.success).toBe(true);
        expect(result.action_sent).toBe('typing');
    });
});

// ── Error mapping tests ───────────────────────────────────────────────────────

describe('Error mapping', () => {
    it('403 "bot was blocked" → message contains "blocked this bot"', async () => {
        mockFetch.mockReturnValueOnce(tgErr(403, 'Forbidden: bot was blocked by the user'));
        const body = await callTool('send_message', { chat_id: '12345', text: 'Hi' });
        expect(body.error!.message).toContain('blocked this bot');
    });

    it('403 "not enough rights" → message contains "admin"', async () => {
        mockFetch.mockReturnValueOnce(tgErr(403, 'Forbidden: bot has not enough rights'));
        const body = await callTool('send_message', { chat_id: '12345', text: 'Hi' });
        expect(body.error!.message).toContain('admin');
    });

    it('400 "chat not found" → message contains "member of this chat"', async () => {
        mockFetch.mockReturnValueOnce(tgErr(400, 'Bad Request: chat not found'));
        const body = await callTool('send_message', { chat_id: '99999', text: 'Hi' });
        expect(body.error!.message).toContain('member of this chat');
    });

    it('400 "user not found" → message contains "started this bot"', async () => {
        mockFetch.mockReturnValueOnce(tgErr(400, 'Bad Request: user not found'));
        const body = await callTool('get_chat_member', { chat_id: '-100001', user_id: 9999 });
        expect(body.error!.message).toContain('started this bot');
    });

    it('400 "message is too long" → message contains "4096"', async () => {
        mockFetch.mockReturnValueOnce(tgErr(400, 'Bad Request: message is too long'));
        const body = await callTool('send_message', { chat_id: '12345', text: 'x'.repeat(5000) });
        expect(body.error!.message).toContain('4096');
    });

    it('429 with retry_after: 30 → message contains "30s"', async () => {
        mockFetch.mockReturnValueOnce(tgErr(429, 'Too Many Requests: retry after 30', { retry_after: 30 }));
        const body = await callTool('send_message', { chat_id: '12345', text: 'Hi' });
        expect(body.error!.message).toContain('30s');
    });
});

// ── E2E tests (skipped unless TELEGRAM_BOT_TOKEN is set) ─────────────────────

describe.skipIf(!process.env.TELEGRAM_BOT_TOKEN)('E2E — real Telegram API', () => {
    const token = process.env.TELEGRAM_BOT_TOKEN!;

    it('get_me returns valid bot info', async () => {
        vi.restoreAllMocks();
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-TELEGRAM-BOT-TOKEN': token,
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_me', arguments: {} } }),
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text) as { id: number; username: string };
        expect(result.id).toBeTruthy();
        expect(result.username).toBeTruthy();
    });

    it('get_updates returns array', async () => {
        vi.restoreAllMocks();
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-TELEGRAM-BOT-TOKEN': token,
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_updates', arguments: { limit: 5 } } }),
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text);
        expect(Array.isArray(result)).toBe(true);
    });

    it('get_webhook_info returns info', async () => {
        vi.restoreAllMocks();
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-TELEGRAM-BOT-TOKEN': token,
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_webhook_info', arguments: {} } }),
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] } };
        expect(body.result).toBeDefined();
        const result = JSON.parse(body.result!.content[0].text) as { pending_update_count: number };
        expect(result.pending_update_count).toBeDefined();
    });
});
