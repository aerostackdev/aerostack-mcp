/**
 * Telegram MCP Worker
 * Implements MCP protocol over HTTP for Telegram Bot API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: TELEGRAM_BOT_TOKEN → header: X-Mcp-Secret-TELEGRAM-BOT-TOKEN
 *
 * Architecture: Telegram Bot API (REST, not MTProto).
 * Cloudflare Workers are stateless — pure fetch(), no persistent connections.
 * Covers all practical bot use cases: send/receive messages, manage groups/channels/members.
 */

const TG_API = 'https://api.telegram.org';

// ── TypeScript interfaces ────────────────────────────────────────────────────

interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    can_join_groups?: boolean;
    can_read_all_group_messages?: boolean;
    supports_inline_queries?: boolean;
}

interface TelegramChat {
    id: number;
    type: string;
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
    description?: string;
    invite_link?: string;
    pinned_message?: TelegramMessage;
    slow_mode_delay?: number;
    linked_chat_id?: number;
}

interface TelegramMessage {
    message_id: number;
    from?: TelegramUser;
    chat: TelegramChat;
    date: number;
    text?: string;
    caption?: string;
    edit_date?: number;
    document?: { file_id: string; file_name?: string; file_size?: number };
    photo?: Array<{ file_id: string; width: number; height: number; file_size?: number }>;
    poll?: { id: string; question: string };
}

interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    edited_message?: TelegramMessage;
    channel_post?: TelegramMessage;
    callback_query?: {
        id: string;
        from: TelegramUser;
        message?: TelegramMessage;
        data?: string;
    };
}

interface TelegramChatMember {
    status: string;
    user: TelegramUser;
    is_anonymous?: boolean;
    custom_title?: string;
    can_post_messages?: boolean;
    can_edit_messages?: boolean;
    can_delete_messages?: boolean;
    can_manage_chat?: boolean;
    can_restrict_members?: boolean;
    can_promote_members?: boolean;
    can_change_info?: boolean;
    can_invite_users?: boolean;
    can_pin_messages?: boolean;
    can_manage_video_chats?: boolean;
    until_date?: number;
}

interface TelegramFile {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
}

interface TelegramWebhookInfo {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_message?: string;
    last_error_date?: number;
    max_connections?: number;
}

interface TelegramInvoice {
    title: string;
    description: string;
    start_parameter: string;
    currency: string;
    total_amount: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rpcOk(id: number | string, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: number | string | null, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

async function tg(method: string, token: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const url = `${TG_API}/bot${token}/${method}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    });

    const text = await res.text();
    let data: { ok: boolean; result?: unknown; error_code?: number; description?: string; parameters?: { retry_after?: number } };
    try {
        data = JSON.parse(text) as typeof data;
    } catch {
        throw new Error(`Telegram HTTP ${res.status}: ${text}`);
    }

    if (!data.ok) {
        const code = data.error_code ?? res.status;
        const desc = data.description ?? '';
        const retryAfter = data.parameters?.retry_after;

        if (code === 401) {
            throw new Error('Invalid bot token — check TELEGRAM_BOT_TOKEN in workspace secrets');
        }
        if (code === 403 && desc.toLowerCase().includes('bot was blocked')) {
            const chatId = params.chat_id ?? 'unknown';
            throw new Error(`User ${chatId} has blocked this bot`);
        }
        if (code === 403 && desc.toLowerCase().includes('not enough rights')) {
            throw new Error('Bot lacks admin rights in this chat — promote bot to admin');
        }
        if (code === 400 && desc.toLowerCase().includes('chat not found')) {
            throw new Error('chat_id not found — ensure bot is a member of this chat');
        }
        if (code === 400 && desc.toLowerCase().includes('user not found')) {
            throw new Error('user_id not found — user must have started this bot first');
        }
        if (code === 400 && desc.toLowerCase().includes('message is too long')) {
            throw new Error('Message exceeds 4096 characters — split into multiple sends');
        }
        if (code === 400 && desc.includes('PEER_ID_INVALID')) {
            throw new Error('Invalid chat_id format — use numeric ID or @username');
        }
        if (code === 429) {
            throw new Error(`Telegram rate limit hit — retry after ${retryAfter ?? '?'}s`);
        }
        throw new Error(`Telegram error ${code}: ${desc}`);
    }

    return data.result;
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
    // Internal — credential validation
    {
        name: '_ping',
        description: 'Verify bot token by calling getMe. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    // Group 1 — Bot Config
    {
        name: 'get_me',
        description: 'Get information about the bot itself — username, ID, capabilities (can_join_groups, supports_inline_queries, etc.)',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_my_commands',
        description: 'Get the current command list visible to users in the bot menu. Optionally filter by language.',
        inputSchema: {
            type: 'object',
            properties: {
                language_code: { type: 'string', description: 'BCP-47 language code for localized commands (optional, e.g. "en", "ru")' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'set_my_commands',
        description: 'Set or replace the bot command list shown to users in the menu. Replaces all existing commands.',
        inputSchema: {
            type: 'object',
            properties: {
                commands: {
                    type: 'array',
                    description: 'List of commands to set (replaces all existing commands)',
                    items: {
                        type: 'object',
                        properties: {
                            command: { type: 'string', description: 'Command without slash, lowercase (e.g. "start", "help", "status")' },
                            description: { type: 'string', description: 'What this command does — shown to users in menu (max 256 chars)' },
                        },
                        required: ['command', 'description'],
                    },
                },
                language_code: { type: 'string', description: 'BCP-47 language code for localized commands (optional)' },
            },
            required: ['commands'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_webhook_info',
        description: 'Get current webhook configuration — URL, pending update count, last error message. Useful for diagnosing webhook issues.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // Group 2 — Receiving Messages
    {
        name: 'get_updates',
        description: 'Pull pending messages and events via long polling. Use offset (last update_id + 1) to mark previous updates as read. Returns up to 100 updates.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Messages to return (1-100, default 20)' },
                offset: { type: 'number', description: 'Mark all updates before this ID as read (use last update_id + 1)' },
                allowed_updates: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Filter update types: message, edited_message, channel_post, callback_query, etc.',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_chat_history',
        description: 'Get recent messages in a specific chat by filtering updates from getUpdates. NOTE: Bot API has no dedicated getChatHistory endpoint — this tool calls getUpdates with a large limit and filters by chat_id. Only returns messages the bot has received (not full chat history). For complete history, store messages as they arrive.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID to filter messages for (numeric or @username)' },
                limit: { type: 'number', description: 'Max updates to scan (1-100, default 100)' },
            },
            required: ['chat_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // Group 3 — Sending Messages
    {
        name: 'send_message',
        description: 'Send a text message to a chat. Supports HTML/Markdown formatting, reply buttons, inline keyboard, and reply-to.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username. Private: numeric user ID. Group: negative ID. Channel: @channelname' },
                text: { type: 'string', description: 'Message text (max 4096 chars)' },
                parse_mode: { type: 'string', enum: ['HTML', 'Markdown', 'MarkdownV2'], description: 'Text formatting mode (default HTML)' },
                reply_to_message_id: { type: 'number', description: 'Reply to a specific message ID (optional)' },
                disable_notification: { type: 'boolean', description: 'Send silently — no notification sound (optional)' },
                protect_content: { type: 'boolean', description: 'Prevent forwarding/saving (optional)' },
                inline_keyboard: {
                    type: 'array',
                    description: 'Inline button rows. Each row is array of {text, url} or {text, callback_data} buttons',
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                text: { type: 'string' },
                                url: { type: 'string' },
                                callback_data: { type: 'string' },
                            },
                        },
                    },
                },
            },
            required: ['chat_id', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_photo',
        description: 'Send a photo to a chat. Accepts a URL (bot downloads it) or a file_id (previously uploaded photo).',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                photo: { type: 'string', description: 'Photo URL (https://) or Telegram file_id' },
                caption: { type: 'string', description: 'Optional caption text (max 1024 chars)' },
                parse_mode: { type: 'string', enum: ['HTML', 'Markdown', 'MarkdownV2'], description: 'Caption formatting mode (optional)' },
            },
            required: ['chat_id', 'photo'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_document',
        description: 'Send a file/document to a chat. Accepts a URL (bot downloads it) or a file_id.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                document: { type: 'string', description: 'Document URL (https://) or Telegram file_id' },
                caption: { type: 'string', description: 'Optional caption text (optional)' },
                parse_mode: { type: 'string', enum: ['HTML', 'Markdown', 'MarkdownV2'], description: 'Caption formatting mode (optional)' },
            },
            required: ['chat_id', 'document'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_poll',
        description: 'Send a multiple-choice or quiz poll to a chat.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                question: { type: 'string', description: 'Poll question (max 300 chars)' },
                options: { type: 'array', items: { type: 'string' }, description: 'Poll answer options (2-10 options, max 100 chars each)' },
                is_anonymous: { type: 'boolean', description: 'Whether votes are anonymous (default true)' },
                type: { type: 'string', enum: ['regular', 'quiz'], description: 'Poll type: regular (multiple choice) or quiz (one correct answer, default regular)' },
                allows_multiple_answers: { type: 'boolean', description: 'Allow multiple answers — only for regular polls (optional)' },
                correct_option_id: { type: 'number', description: 'Index of correct answer (0-based) — required for quiz type' },
                explanation: { type: 'string', description: 'Text shown when quiz is answered (optional, quiz only)' },
            },
            required: ['chat_id', 'question', 'options'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_invoice',
        description: 'Send a Telegram native payment invoice to a chat. Requires a payment provider token from BotFather.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                title: { type: 'string', description: 'Product name (max 32 chars)' },
                description: { type: 'string', description: 'Product description (max 255 chars)' },
                payload: { type: 'string', description: 'Internal bot payload (not shown to user, for order tracking)' },
                provider_token: { type: 'string', description: 'Payment provider token from BotFather (@payments)' },
                currency: { type: 'string', description: 'Three-letter ISO 4217 currency code (e.g. USD, EUR)' },
                prices: {
                    type: 'array',
                    description: 'Price breakdown array',
                    items: {
                        type: 'object',
                        properties: {
                            label: { type: 'string', description: 'Line item label' },
                            amount: { type: 'number', description: 'Amount in smallest currency units (cents for USD)' },
                        },
                        required: ['label', 'amount'],
                    },
                },
            },
            required: ['chat_id', 'title', 'description', 'payload', 'provider_token', 'currency', 'prices'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'edit_message',
        description: 'Edit the text of a previously sent message (bot-authored messages only).',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                message_id: { type: 'number', description: 'ID of the message to edit' },
                text: { type: 'string', description: 'New message text (max 4096 chars)' },
                parse_mode: { type: 'string', enum: ['HTML', 'Markdown', 'MarkdownV2'], description: 'Text formatting mode (optional)' },
            },
            required: ['chat_id', 'message_id', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_message',
        description: 'Delete a message from a chat. Bot must be admin with delete_messages permission in groups/channels.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                message_id: { type: 'number', description: 'ID of the message to delete' },
            },
            required: ['chat_id', 'message_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // Group 4 — Chat & User Intelligence
    {
        name: 'get_chat',
        description: 'Get detailed information about a chat, group, or channel — title, description, member count, invite link, pinned message.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID (numeric) or @username for public chats/channels' },
            },
            required: ['chat_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_chat_member',
        description: 'Get a specific user\'s status and permissions in a chat — member/admin/banned, join date, permission flags.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                user_id: { type: 'number', description: 'Telegram user ID' },
            },
            required: ['chat_id', 'user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_chat_member_count',
        description: 'Get the total number of members in a group or channel.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
            },
            required: ['chat_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_chat_administrators',
        description: 'Get the full list of administrators in a group or channel with their permission flags.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
            },
            required: ['chat_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user_profile_photos',
        description: 'Get a user\'s profile photo history (returns file_ids — use get_file to get download URLs).',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'number', description: 'Telegram user ID' },
                limit: { type: 'number', description: 'Number of photos to return (1-100, default 5)' },
                offset: { type: 'number', description: 'Skip this many photos from the start (optional)' },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_file',
        description: 'Get file info and a download URL for any file sent to the bot (photos, documents, audio, etc.).',
        inputSchema: {
            type: 'object',
            properties: {
                file_id: { type: 'string', description: 'Telegram file_id (from message, photo, document, etc.)' },
            },
            required: ['file_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // Group 5 — Moderation
    {
        name: 'ban_member',
        description: 'Ban a user from a group or channel. Bot must be admin with ban_users permission.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                user_id: { type: 'number', description: 'Telegram user ID to ban' },
                until_date: { type: 'number', description: 'Unix timestamp when ban lifts (0 or omit = permanent)' },
                revoke_messages: { type: 'boolean', description: 'Delete all messages from this user in the chat (optional)' },
            },
            required: ['chat_id', 'user_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'unban_member',
        description: 'Remove a ban from a user, allowing them to rejoin via invite link.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                user_id: { type: 'number', description: 'Telegram user ID to unban' },
                only_if_banned: { type: 'boolean', description: 'Only unban if actually banned (avoids kicking non-banned members, default true)' },
            },
            required: ['chat_id', 'user_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'restrict_member',
        description: 'Restrict a group member\'s permissions (mute, prevent media/polls/links). Bot must be admin.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                user_id: { type: 'number', description: 'Telegram user ID to restrict' },
                until_date: { type: 'number', description: 'Unix timestamp when restriction lifts (0 = permanent)' },
                can_send_messages: { type: 'boolean', description: 'Allow sending text messages (default false = muted)' },
                can_send_media: { type: 'boolean', description: 'Allow sending media (photos, videos, default false)' },
                can_send_polls: { type: 'boolean', description: 'Allow sending polls (default false)' },
                can_send_other_messages: { type: 'boolean', description: 'Allow stickers, GIFs, games (default false)' },
                can_add_web_page_previews: { type: 'boolean', description: 'Allow link previews (default false)' },
            },
            required: ['chat_id', 'user_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'promote_member',
        description: 'Grant admin rights to a group/channel member with specific permission flags. Bot must be admin.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                user_id: { type: 'number', description: 'Telegram user ID to promote' },
                can_manage_chat: { type: 'boolean', description: 'Access basic admin actions (optional)' },
                can_post_messages: { type: 'boolean', description: 'Post messages in channels (optional)' },
                can_edit_messages: { type: 'boolean', description: 'Edit messages in channels (optional)' },
                can_delete_messages: { type: 'boolean', description: 'Delete messages of other members (optional)' },
                can_manage_video_chats: { type: 'boolean', description: 'Manage video chats (optional)' },
                can_restrict_members: { type: 'boolean', description: 'Restrict and unrestrict members (optional)' },
                can_promote_members: { type: 'boolean', description: 'Add new admins (optional)' },
                can_change_info: { type: 'boolean', description: 'Change chat title/description/photo (optional)' },
                can_invite_users: { type: 'boolean', description: 'Invite new members (optional)' },
                can_pin_messages: { type: 'boolean', description: 'Pin messages (optional)' },
            },
            required: ['chat_id', 'user_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'pin_message',
        description: 'Pin a message in a group or channel. Bot must have pin_messages permission.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                message_id: { type: 'number', description: 'ID of the message to pin' },
                disable_notification: { type: 'boolean', description: 'Pin silently without notifying members (default false)' },
            },
            required: ['chat_id', 'message_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // Group 6 — Group & Channel Management
    {
        name: 'set_chat_title',
        description: 'Rename a group or channel. Bot must be admin with change_info permission.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                title: { type: 'string', description: 'New chat title (1-255 chars)' },
            },
            required: ['chat_id', 'title'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'set_chat_description',
        description: 'Update the description of a group or channel. Bot must be admin with change_info permission.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                description: { type: 'string', description: 'New chat description (max 255 chars)' },
            },
            required: ['chat_id', 'description'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_invite_link',
        description: 'Create a unique invite link for a chat with optional expiry, member limit, and join request approval.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                name: { type: 'string', description: 'Label for the invite link (optional, shown in admin panel)' },
                expire_date: { type: 'number', description: 'Unix timestamp when link expires (optional)' },
                member_limit: { type: 'number', description: 'Max number of members who can join via this link (1-99999, optional)' },
                creates_join_request: { type: 'boolean', description: 'If true, users must be approved by admin before joining (optional)' },
            },
            required: ['chat_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_chat_action',
        description: 'Show a typing/uploading indicator in a chat. Actions auto-clear after 5 seconds or when a message is sent.',
        inputSchema: {
            type: 'object',
            properties: {
                chat_id: { type: 'string', description: 'Chat ID or @username' },
                action: {
                    type: 'string',
                    enum: [
                        'typing',
                        'upload_photo',
                        'record_video',
                        'upload_video',
                        'record_voice',
                        'upload_voice',
                        'upload_document',
                        'choose_sticker',
                        'find_location',
                        'record_video_note',
                        'upload_video_note',
                    ],
                    description: 'Action type: typing, upload_photo, record_video, upload_video, record_voice, upload_voice, upload_document, choose_sticker, find_location, record_video_note, upload_video_note',
                },
            },
            required: ['chat_id', 'action'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool implementations ──────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {

        case '_ping': {
            const data = await tg('getMe', token) as TelegramUser;
            return { content: [{ type: 'text', text: `Connected to Telegram bot @${data.username ?? data.first_name} (ID: ${data.id})` }] };
        }

        // ── Group 1: Bot Config ────────────────────────────────────────────

        case 'get_me': {
            const data = await tg('getMe', token) as TelegramUser;
            return {
                id: data.id,
                username: data.username ?? null,
                first_name: data.first_name,
                last_name: data.last_name ?? null,
                is_bot: data.is_bot,
                can_join_groups: data.can_join_groups ?? null,
                can_read_all_group_messages: data.can_read_all_group_messages ?? null,
                supports_inline_queries: data.supports_inline_queries ?? null,
            };
        }

        case 'get_my_commands': {
            const params: Record<string, unknown> = {};
            if (args.language_code) {
                params.language_code = args.language_code;
            }
            const data = await tg('getMyCommands', token, params) as Array<{ command: string; description: string }>;
            return data;
        }

        case 'set_my_commands': {
            validateRequired(args, ['commands']);
            const params: Record<string, unknown> = { commands: args.commands };
            if (args.language_code) params.language_code = args.language_code;
            await tg('setMyCommands', token, params);
            const commands = args.commands as Array<unknown>;
            return { success: true, count: commands.length };
        }

        case 'get_webhook_info': {
            const data = await tg('getWebhookInfo', token) as TelegramWebhookInfo;
            return {
                url: data.url,
                has_custom_certificate: data.has_custom_certificate,
                pending_update_count: data.pending_update_count,
                last_error_message: data.last_error_message ?? null,
                last_error_date: data.last_error_date ?? null,
                max_connections: data.max_connections ?? null,
            };
        }

        // ── Group 2: Receiving Messages ────────────────────────────────────

        case 'get_updates': {
            const params: Record<string, unknown> = {
                limit: Math.min(Number(args.limit ?? 20), 100),
            };
            if (args.offset !== undefined) params.offset = args.offset;
            if (args.allowed_updates !== undefined) params.allowed_updates = args.allowed_updates;

            const data = await tg('getUpdates', token, params) as TelegramUpdate[];
            return data.map((u: TelegramUpdate) => {
                const msg = u.message ?? u.edited_message ?? u.channel_post;
                const type = u.message ? 'message'
                    : u.edited_message ? 'edited_message'
                        : u.channel_post ? 'channel_post'
                            : u.callback_query ? 'callback_query'
                                : 'unknown';
                return {
                    update_id: u.update_id,
                    type,
                    message: msg ? {
                        id: msg.message_id,
                        from: msg.from ? {
                            id: msg.from.id,
                            username: msg.from.username ?? null,
                            first_name: msg.from.first_name,
                            is_bot: msg.from.is_bot,
                        } : null,
                        chat: {
                            id: msg.chat.id,
                            type: msg.chat.type,
                            title: msg.chat.title ?? null,
                            username: msg.chat.username ?? null,
                        },
                        text: msg.text ?? null,
                        date: msg.date,
                    } : null,
                    callback_query: u.callback_query ? {
                        id: u.callback_query.id,
                        from: {
                            id: u.callback_query.from.id,
                            username: u.callback_query.from.username ?? null,
                        },
                        data: u.callback_query.data ?? null,
                    } : null,
                };
            });
        }

        case 'get_chat_history': {
            validateRequired(args, ['chat_id']);
            const limit = Math.min(Number(args.limit ?? 100), 100);
            const data = await tg('getUpdates', token, { limit }) as TelegramUpdate[];
            const chatId = String(args.chat_id);
            const messages = data
                .filter((u: TelegramUpdate) => {
                    const msg = u.message ?? u.edited_message ?? u.channel_post;
                    if (!msg) return false;
                    return String(msg.chat.id) === chatId || msg.chat.username === chatId.replace('@', '');
                })
                .map((u: TelegramUpdate) => {
                    const msg = (u.message ?? u.edited_message ?? u.channel_post)!;
                    return {
                        update_id: u.update_id,
                        message_id: msg.message_id,
                        from: msg.from ? {
                            id: msg.from.id,
                            username: msg.from.username ?? null,
                            first_name: msg.from.first_name,
                        } : null,
                        text: msg.text ?? null,
                        date: msg.date,
                    };
                });
            return messages;
        }

        // ── Group 3: Sending Messages ──────────────────────────────────────

        case 'send_message': {
            validateRequired(args, ['chat_id', 'text']);
            const params: Record<string, unknown> = {
                chat_id: args.chat_id,
                text: args.text,
                parse_mode: args.parse_mode ?? 'HTML',
            };
            if (args.reply_to_message_id !== undefined) params.reply_to_message_id = args.reply_to_message_id;
            if (args.disable_notification !== undefined) params.disable_notification = args.disable_notification;
            if (args.protect_content !== undefined) params.protect_content = args.protect_content;
            if (args.inline_keyboard) {
                params.reply_markup = {
                    inline_keyboard: args.inline_keyboard,
                };
            }
            const data = await tg('sendMessage', token, params) as TelegramMessage;
            return {
                message_id: data.message_id,
                chat_id: data.chat.id,
                text: data.text ?? null,
                date: data.date,
            };
        }

        case 'send_photo': {
            validateRequired(args, ['chat_id', 'photo']);
            const params: Record<string, unknown> = {
                chat_id: args.chat_id,
                photo: args.photo,
            };
            if (args.caption) params.caption = args.caption;
            if (args.parse_mode) params.parse_mode = args.parse_mode;
            const data = await tg('sendPhoto', token, params) as TelegramMessage;
            return {
                message_id: data.message_id,
                chat_id: data.chat.id,
                caption: data.caption ?? null,
            };
        }

        case 'send_document': {
            validateRequired(args, ['chat_id', 'document']);
            const params: Record<string, unknown> = {
                chat_id: args.chat_id,
                document: args.document,
            };
            if (args.caption) params.caption = args.caption;
            if (args.parse_mode) params.parse_mode = args.parse_mode;
            const data = await tg('sendDocument', token, params) as TelegramMessage;
            return {
                message_id: data.message_id,
                chat_id: data.chat.id,
                filename: data.document?.file_name ?? null,
            };
        }

        case 'send_poll': {
            validateRequired(args, ['chat_id', 'question', 'options']);
            const options = args.options as string[];
            if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
                throw new Error('options must be an array of 2-10 strings');
            }
            const params: Record<string, unknown> = {
                chat_id: args.chat_id,
                question: args.question,
                options,
                is_anonymous: args.is_anonymous !== false,
                type: args.type ?? 'regular',
            };
            if (args.allows_multiple_answers !== undefined) params.allows_multiple_answers = args.allows_multiple_answers;
            if (args.correct_option_id !== undefined) params.correct_option_id = args.correct_option_id;
            if (args.explanation) params.explanation = args.explanation;
            const data = await tg('sendPoll', token, params) as TelegramMessage;
            return {
                message_id: data.message_id,
                poll_id: data.poll?.id ?? null,
                question: data.poll?.question ?? args.question,
            };
        }

        case 'send_invoice': {
            validateRequired(args, ['chat_id', 'title', 'description', 'payload', 'provider_token', 'currency', 'prices']);
            const data = await tg('sendInvoice', token, {
                chat_id: args.chat_id,
                title: args.title,
                description: args.description,
                payload: args.payload,
                provider_token: args.provider_token,
                currency: args.currency,
                prices: args.prices,
            }) as TelegramMessage;
            return {
                message_id: data.message_id,
                chat_id: data.chat.id,
            };
        }

        case 'edit_message': {
            validateRequired(args, ['chat_id', 'message_id', 'text']);
            const params: Record<string, unknown> = {
                chat_id: args.chat_id,
                message_id: args.message_id,
                text: args.text,
            };
            if (args.parse_mode) params.parse_mode = args.parse_mode;
            const data = await tg('editMessageText', token, params) as TelegramMessage;
            return {
                message_id: data.message_id,
                text: data.text ?? null,
                edit_date: data.edit_date ?? null,
            };
        }

        case 'delete_message': {
            validateRequired(args, ['chat_id', 'message_id']);
            await tg('deleteMessage', token, {
                chat_id: args.chat_id,
                message_id: args.message_id,
            });
            return { success: true, deleted_message_id: args.message_id };
        }

        // ── Group 4: Chat & User Intelligence ─────────────────────────────

        case 'get_chat': {
            validateRequired(args, ['chat_id']);
            const data = await tg('getChat', token, { chat_id: args.chat_id }) as TelegramChat & {
                members_count?: number;
                linked_chat_id?: number;
            };
            return {
                id: data.id,
                type: data.type,
                title: data.title ?? null,
                username: data.username ?? null,
                description: data.description ?? null,
                invite_link: data.invite_link ?? null,
                pinned_message_id: data.pinned_message?.message_id ?? null,
                member_count: data.members_count ?? null,
                slow_mode_delay: data.slow_mode_delay ?? null,
                linked_chat_id: data.linked_chat_id ?? null,
            };
        }

        case 'get_chat_member': {
            validateRequired(args, ['chat_id', 'user_id']);
            const data = await tg('getChatMember', token, {
                chat_id: args.chat_id,
                user_id: args.user_id,
            }) as TelegramChatMember;
            return {
                status: data.status,
                user: {
                    id: data.user.id,
                    username: data.user.username ?? null,
                    first_name: data.user.first_name,
                },
                is_anonymous: data.is_anonymous ?? false,
                can_post_messages: data.can_post_messages ?? null,
                can_delete_messages: data.can_delete_messages ?? null,
                joined_date: data.until_date ? new Date(data.until_date * 1000).toISOString() : null,
            };
        }

        case 'get_chat_member_count': {
            validateRequired(args, ['chat_id']);
            const count = await tg('getChatMemberCount', token, { chat_id: args.chat_id }) as number;
            return { chat_id: args.chat_id, member_count: count };
        }

        case 'get_chat_administrators': {
            validateRequired(args, ['chat_id']);
            const data = await tg('getChatAdministrators', token, { chat_id: args.chat_id }) as TelegramChatMember[];
            return data.map((m: TelegramChatMember) => {
                const permissions: string[] = [];
                if (m.can_manage_chat) permissions.push('can_manage_chat');
                if (m.can_post_messages) permissions.push('can_post_messages');
                if (m.can_edit_messages) permissions.push('can_edit_messages');
                if (m.can_delete_messages) permissions.push('can_delete_messages');
                if (m.can_restrict_members) permissions.push('can_restrict_members');
                if (m.can_promote_members) permissions.push('can_promote_members');
                if (m.can_change_info) permissions.push('can_change_info');
                if (m.can_invite_users) permissions.push('can_invite_users');
                if (m.can_pin_messages) permissions.push('can_pin_messages');
                if (m.can_manage_video_chats) permissions.push('can_manage_video_chats');
                return {
                    user_id: m.user.id,
                    username: m.user.username ?? null,
                    first_name: m.user.first_name,
                    status: m.status,
                    is_anonymous: m.is_anonymous ?? false,
                    permissions,
                };
            });
        }

        case 'get_user_profile_photos': {
            validateRequired(args, ['user_id']);
            const params: Record<string, unknown> = {
                user_id: args.user_id,
                limit: Math.min(Number(args.limit ?? 5), 100),
            };
            if (args.offset !== undefined) params.offset = args.offset;
            const data = await tg('getUserProfilePhotos', token, params) as {
                total_count: number;
                photos: Array<Array<{ file_id: string; width: number; height: number; file_size?: number }>>;
            };
            return data.photos.map((sizes) => {
                const largest = sizes[sizes.length - 1];
                return {
                    file_id: largest.file_id,
                    width: largest.width,
                    height: largest.height,
                    file_size: largest.file_size ?? null,
                    url_hint: 'use get_file tool to get download URL',
                };
            });
        }

        case 'get_file': {
            validateRequired(args, ['file_id']);
            const data = await tg('getFile', token, { file_id: args.file_id }) as TelegramFile;
            return {
                file_id: data.file_id,
                file_path: data.file_path ?? null,
                file_size: data.file_size ?? null,
                download_url: data.file_path
                    ? `${TG_API}/file/bot${token}/${data.file_path}`
                    : null,
            };
        }

        // ── Group 5: Moderation ────────────────────────────────────────────

        case 'ban_member': {
            validateRequired(args, ['chat_id', 'user_id']);
            const params: Record<string, unknown> = {
                chat_id: args.chat_id,
                user_id: args.user_id,
            };
            if (args.until_date !== undefined) params.until_date = args.until_date;
            if (args.revoke_messages !== undefined) params.revoke_messages = args.revoke_messages;
            await tg('banChatMember', token, params);
            const untilDate = args.until_date as number | undefined;
            const until = (!untilDate || untilDate === 0)
                ? 'permanent'
                : new Date(untilDate * 1000).toISOString();
            return { success: true, banned_user_id: args.user_id, until };
        }

        case 'unban_member': {
            validateRequired(args, ['chat_id', 'user_id']);
            await tg('unbanChatMember', token, {
                chat_id: args.chat_id,
                user_id: args.user_id,
                only_if_banned: args.only_if_banned !== false,
            });
            return { success: true, unbanned_user_id: args.user_id };
        }

        case 'restrict_member': {
            validateRequired(args, ['chat_id', 'user_id']);
            const permissions: Record<string, boolean> = {
                can_send_messages: args.can_send_messages === true,
                can_send_audios: args.can_send_media === true,
                can_send_documents: args.can_send_media === true,
                can_send_photos: args.can_send_media === true,
                can_send_videos: args.can_send_media === true,
                can_send_video_notes: args.can_send_media === true,
                can_send_voice_notes: args.can_send_media === true,
                can_send_polls: args.can_send_polls === true,
                can_send_other_messages: args.can_send_other_messages === true,
                can_add_web_page_previews: args.can_add_web_page_previews === true,
                can_change_info: false,
                can_invite_users: false,
                can_pin_messages: false,
            };
            const params: Record<string, unknown> = {
                chat_id: args.chat_id,
                user_id: args.user_id,
                permissions,
            };
            if (args.until_date !== undefined) params.until_date = args.until_date;
            await tg('restrictChatMember', token, params);
            const permissionsSet = Object.entries(permissions)
                .filter(([, v]) => v)
                .map(([k]) => k);
            const untilDate = args.until_date as number | undefined;
            const until = (!untilDate || untilDate === 0) ? 'permanent' : new Date(untilDate * 1000).toISOString();
            return { success: true, user_id: args.user_id, permissions_set: permissionsSet, until };
        }

        case 'promote_member': {
            validateRequired(args, ['chat_id', 'user_id']);
            const params: Record<string, unknown> = {
                chat_id: args.chat_id,
                user_id: args.user_id,
            };
            const permissionKeys = [
                'can_manage_chat', 'can_post_messages', 'can_edit_messages',
                'can_delete_messages', 'can_manage_video_chats', 'can_restrict_members',
                'can_promote_members', 'can_change_info', 'can_invite_users', 'can_pin_messages',
            ];
            const permissionsGranted: string[] = [];
            for (const key of permissionKeys) {
                if (args[key] !== undefined) {
                    params[key] = args[key];
                    if (args[key] === true) permissionsGranted.push(key);
                }
            }
            await tg('promoteChatMember', token, params);
            return { success: true, promoted_user_id: args.user_id, permissions_granted: permissionsGranted };
        }

        case 'pin_message': {
            validateRequired(args, ['chat_id', 'message_id']);
            await tg('pinChatMessage', token, {
                chat_id: args.chat_id,
                message_id: args.message_id,
                disable_notification: args.disable_notification ?? false,
            });
            return { success: true, pinned_message_id: args.message_id };
        }

        // ── Group 6: Group & Channel Management ───────────────────────────

        case 'set_chat_title': {
            validateRequired(args, ['chat_id', 'title']);
            await tg('setChatTitle', token, {
                chat_id: args.chat_id,
                title: args.title,
            });
            return { success: true, chat_id: args.chat_id, new_title: args.title };
        }

        case 'set_chat_description': {
            validateRequired(args, ['chat_id', 'description']);
            await tg('setChatDescription', token, {
                chat_id: args.chat_id,
                description: args.description,
            });
            return { success: true, chat_id: args.chat_id };
        }

        case 'create_invite_link': {
            validateRequired(args, ['chat_id']);
            const params: Record<string, unknown> = { chat_id: args.chat_id };
            if (args.name) params.name = args.name;
            if (args.expire_date !== undefined) params.expire_date = args.expire_date;
            if (args.member_limit !== undefined) params.member_limit = args.member_limit;
            if (args.creates_join_request !== undefined) params.creates_join_request = args.creates_join_request;
            const data = await tg('createChatInviteLink', token, params) as {
                invite_link: string;
                name?: string;
                creator: TelegramUser;
                expire_date?: number;
                member_limit?: number;
            };
            return {
                invite_link: data.invite_link,
                name: data.name ?? null,
                creator_id: data.creator.id,
                expire_date: data.expire_date ? new Date(data.expire_date * 1000).toISOString() : null,
                member_limit: data.member_limit ?? null,
            };
        }

        case 'send_chat_action': {
            validateRequired(args, ['chat_id', 'action']);
            await tg('sendChatAction', token, {
                chat_id: args.chat_id,
                action: args.action,
            });
            return { success: true, action_sent: args.action };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker entry ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-telegram', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-telegram', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-TELEGRAM-BOT-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing TELEGRAM_BOT_TOKEN — add your Telegram bot token to workspace secrets (get one from @BotFather)');
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
