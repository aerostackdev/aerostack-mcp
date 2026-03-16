/**
 * Discord MCP Worker
 * Implements MCP protocol over HTTP for Discord API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: DISCORD_BOT_TOKEN → header: X-Mcp-Secret-DISCORD-BOT-TOKEN
 *
 * Architecture: Discord REST API v10 (not WebSocket Gateway).
 * Cloudflare Workers are stateless — no persistent connections possible.
 * REST covers all practical use cases: read/send messages, manage members/roles/channels.
 */

const DISCORD_API = 'https://discord.com/api/v10';

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

const TOOLS = [
    // Internal — credential validation
    {
        name: '_ping',
        description: 'Verify Discord bot token by calling /users/@me. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {} },
    },
    // ── Group A: Discovery ──────────────────────────────────────────────────
    {
        name: 'get_bot_info',
        description: 'Get information about the connected Discord bot (username, ID, avatar)',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'list_guilds',
        description: 'List all Discord servers (guilds) the bot is a member of',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max guilds to return (default 20, max 200)' },
            },
        },
    },
    {
        name: 'get_guild',
        description: 'Get detailed information about a Discord server including member count, channel count, and description',
        inputSchema: {
            type: 'object',
            properties: {
                guild_id: { type: 'string', description: 'Discord server ID (numeric snowflake, e.g. "1234567890123456789")' },
            },
            required: ['guild_id'],
        },
    },
    {
        name: 'list_channels',
        description: 'List all channels in a Discord server (text, voice, category, forum, announcement)',
        inputSchema: {
            type: 'object',
            properties: {
                guild_id: { type: 'string', description: 'Discord server ID' },
            },
            required: ['guild_id'],
        },
    },
    {
        name: 'get_channel',
        description: 'Get details of a specific Discord channel (name, topic, type, slowmode)',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Discord channel ID' },
            },
            required: ['channel_id'],
        },
    },

    // ── Group B: Messages ───────────────────────────────────────────────────
    {
        name: 'get_messages',
        description: 'Get recent messages from a Discord channel. Use before/after for pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Discord channel ID' },
                limit: { type: 'number', description: 'Number of messages to return (1-100, default 20)' },
                before: { type: 'string', description: 'Get messages before this message ID (for pagination)' },
                after: { type: 'string', description: 'Get messages after this message ID (for pagination)' },
            },
            required: ['channel_id'],
        },
    },
    {
        name: 'send_message',
        description: 'Send a message to a Discord channel. Supports plain text and rich embeds.',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Discord channel ID to send message to' },
                content: { type: 'string', description: 'Message text content (max 2000 characters)' },
                embed_title: { type: 'string', description: 'Optional embed title for rich card messages' },
                embed_description: { type: 'string', description: 'Optional embed description (supports markdown)' },
                embed_color: { type: 'number', description: 'Optional embed sidebar color as integer (e.g. 5793266 for blue, 15158332 for red)' },
                embed_url: { type: 'string', description: 'Optional URL the embed title links to' },
            },
            required: ['channel_id', 'content'],
        },
    },
    {
        name: 'reply_to_message',
        description: 'Reply to a specific message in a Discord channel (creates a threaded reply)',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Discord channel ID' },
                message_id: { type: 'string', description: 'ID of the message to reply to' },
                content: { type: 'string', description: 'Reply text content (max 2000 characters)' },
                mention_author: { type: 'boolean', description: 'Whether to mention/ping the original message author (default false)' },
            },
            required: ['channel_id', 'message_id', 'content'],
        },
    },
    {
        name: 'edit_message',
        description: "Edit a message previously sent by the bot (cannot edit other users' messages)",
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Discord channel ID' },
                message_id: { type: 'string', description: 'ID of the message to edit (must be bot-authored)' },
                content: { type: 'string', description: 'New message content' },
            },
            required: ['channel_id', 'message_id', 'content'],
        },
    },
    {
        name: 'delete_message',
        description: 'Delete a message from a Discord channel (requires Manage Messages permission)',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Discord channel ID' },
                message_id: { type: 'string', description: 'ID of the message to delete' },
            },
            required: ['channel_id', 'message_id'],
        },
    },
    {
        name: 'get_pinned_messages',
        description: 'Get all pinned messages in a Discord channel',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Discord channel ID' },
            },
            required: ['channel_id'],
        },
    },
    {
        name: 'pin_message',
        description: 'Pin a message in a Discord channel (requires Manage Messages permission)',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Discord channel ID' },
                message_id: { type: 'string', description: 'ID of the message to pin' },
            },
            required: ['channel_id', 'message_id'],
        },
    },
    {
        name: 'add_reaction',
        description: 'Add an emoji reaction to a Discord message',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Discord channel ID' },
                message_id: { type: 'string', description: 'ID of the message to react to' },
                emoji: { type: 'string', description: 'Emoji to react with. Standard emoji: use the character (e.g. "👍"). Custom emoji: use "name:id" format (e.g. "myemoji:123456789")' },
            },
            required: ['channel_id', 'message_id', 'emoji'],
        },
    },

    // ── Group C: Members & Roles ────────────────────────────────────────────
    {
        name: 'list_members',
        description: 'List members in a Discord server with their roles and join dates',
        inputSchema: {
            type: 'object',
            properties: {
                guild_id: { type: 'string', description: 'Discord server ID' },
                limit: { type: 'number', description: 'Number of members to return (1-1000, default 50)' },
                after: { type: 'string', description: 'Get members after this user ID (for pagination)' },
            },
            required: ['guild_id'],
        },
    },
    {
        name: 'get_member',
        description: 'Get a specific member\'s profile in a Discord server (username, nickname, roles, join date)',
        inputSchema: {
            type: 'object',
            properties: {
                guild_id: { type: 'string', description: 'Discord server ID' },
                user_id: { type: 'string', description: 'Discord user ID' },
            },
            required: ['guild_id', 'user_id'],
        },
    },
    {
        name: 'list_roles',
        description: 'List all roles in a Discord server with their colors, permissions, and position',
        inputSchema: {
            type: 'object',
            properties: {
                guild_id: { type: 'string', description: 'Discord server ID' },
            },
            required: ['guild_id'],
        },
    },
    {
        name: 'assign_role',
        description: 'Assign a role to a Discord server member (requires Manage Roles permission)',
        inputSchema: {
            type: 'object',
            properties: {
                guild_id: { type: 'string', description: 'Discord server ID' },
                user_id: { type: 'string', description: 'Discord user ID to assign role to' },
                role_id: { type: 'string', description: 'Role ID to assign' },
            },
            required: ['guild_id', 'user_id', 'role_id'],
        },
    },
    {
        name: 'remove_role',
        description: 'Remove a role from a Discord server member (requires Manage Roles permission)',
        inputSchema: {
            type: 'object',
            properties: {
                guild_id: { type: 'string', description: 'Discord server ID' },
                user_id: { type: 'string', description: 'Discord user ID to remove role from' },
                role_id: { type: 'string', description: 'Role ID to remove' },
            },
            required: ['guild_id', 'user_id', 'role_id'],
        },
    },
    {
        name: 'kick_member',
        description: 'Kick (remove) a member from a Discord server. They can rejoin via invite. Requires Kick Members permission.',
        inputSchema: {
            type: 'object',
            properties: {
                guild_id: { type: 'string', description: 'Discord server ID' },
                user_id: { type: 'string', description: 'Discord user ID to kick' },
                reason: { type: 'string', description: 'Reason for kicking (logged in audit log, optional)' },
            },
            required: ['guild_id', 'user_id'],
        },
    },

    // ── Group D: Channels & Threads ─────────────────────────────────────────
    {
        name: 'create_channel',
        description: 'Create a new channel in a Discord server (text, announcement, or category)',
        inputSchema: {
            type: 'object',
            properties: {
                guild_id: { type: 'string', description: 'Discord server ID' },
                name: { type: 'string', description: 'Channel name (lowercase, use hyphens not spaces, e.g. "general-chat")' },
                type: {
                    type: 'number',
                    enum: [0, 2, 4, 5, 15],
                    description: 'Channel type: 0=text, 2=voice, 4=category, 5=announcement, 15=forum (default 0)',
                },
                topic: { type: 'string', description: 'Channel topic/description shown in channel header (optional)' },
                parent_id: { type: 'string', description: 'Category channel ID to nest this channel under (optional)' },
                nsfw: { type: 'boolean', description: 'Mark channel as age-restricted/NSFW (default false)' },
            },
            required: ['guild_id', 'name'],
        },
    },
    {
        name: 'edit_channel',
        description: 'Edit a Discord channel\'s name, topic, or slowmode settings',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Discord channel ID to edit' },
                name: { type: 'string', description: 'New channel name (optional)' },
                topic: { type: 'string', description: 'New channel topic (optional)' },
                slowmode_seconds: { type: 'number', description: 'Slowmode delay in seconds (0 to disable, max 21600, optional)' },
                nsfw: { type: 'boolean', description: 'Toggle NSFW flag (optional)' },
            },
            required: ['channel_id'],
        },
    },
    {
        name: 'create_thread',
        description: 'Create a thread in a Discord channel (from an existing message or as a standalone thread)',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: { type: 'string', description: 'Discord channel ID to create thread in' },
                name: { type: 'string', description: 'Thread name/title' },
                message_id: { type: 'string', description: 'Create thread from this message ID (optional — omit for standalone thread)' },
                auto_archive_minutes: {
                    type: 'number',
                    enum: [60, 1440, 4320, 10080],
                    description: 'Auto-archive after inactivity: 60=1hr, 1440=1day, 4320=3days, 10080=1week (default 1440)',
                },
            },
            required: ['channel_id', 'name'],
        },
    },
    {
        name: 'list_active_threads',
        description: 'List all active (non-archived) threads in a Discord server',
        inputSchema: {
            type: 'object',
            properties: {
                guild_id: { type: 'string', description: 'Discord server ID' },
            },
            required: ['guild_id'],
        },
    },
];

// ── Discord API helper ────────────────────────────────────────────────────────

async function discord(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Promise<unknown> {
    const opts: RequestInit = {
        method,
        headers: {
            Authorization: `Bot ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'AerostackMCP/1.0 (https://aerostack.dev)',
        },
    };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${DISCORD_API}${path}`, opts);

    // 204 No Content — success with no body
    if (res.status === 204) return { success: true };

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`Discord HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        const errCode = data.code as number | undefined;
        const errMsg = data.message as string | undefined;
        if (res.status === 401) throw new Error('Invalid bot token — check DISCORD_BOT_TOKEN in your workspace secrets');
        if (res.status === 403) throw new Error(`Missing Discord permission — ${errMsg ?? 'bot lacks required permission for this action'}`);
        if (res.status === 404) throw new Error(`Not found — check guild_id, channel_id, or user_id (Discord error ${errCode})`);
        if (res.status === 429) {
            const retryAfter = data.retry_after as number | undefined;
            throw new Error(`Rate limited by Discord — retry after ${retryAfter ?? '?'}s`);
        }
        if (errCode === 50001) throw new Error('Bot does not have access to this resource (Missing Access)');
        if (errCode === 50013) throw new Error('Bot is missing the required permission for this action');
        if (errCode === 10003) throw new Error('Unknown channel — channel_id not found');
        if (errCode === 10004) throw new Error('Unknown guild — guild_id not found');
        if (errCode === 10007) throw new Error('Unknown member — user is not in this server');
        throw new Error(`Discord API error ${res.status} (code ${errCode}): ${errMsg ?? text}`);
    }

    return data;
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {

        case '_ping': {
            const data = await discord('GET', '/users/@me', token) as any;
            return { content: [{ type: 'text', text: `Connected to Discord bot "${data.username}#${data.discriminator}" (ID: ${data.id})` }] };
        }

        // ── Discovery ──────────────────────────────────────────────────────

        case 'get_bot_info': {
            const data = await discord('GET', '/users/@me', token) as any;
            return {
                id: data.id,
                username: data.username,
                discriminator: data.discriminator,
                global_name: data.global_name,
                avatar_url: data.avatar
                    ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
                    : null,
                bot: data.bot,
            };
        }

        case 'list_guilds': {
            const limit = Math.min(Number(args.limit ?? 20), 200);
            const data = await discord('GET', `/users/@me/guilds?limit=${limit}`, token) as any[];
            return data.map((g: any) => ({
                id: g.id,
                name: g.name,
                icon_url: g.icon
                    ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`
                    : null,
                owner: g.owner,
                permissions: g.permissions,
            }));
        }

        case 'get_guild': {
            const data = await discord('GET', `/guilds/${args.guild_id}?with_counts=true`, token) as any;
            return {
                id: data.id,
                name: data.name,
                description: data.description,
                member_count: data.approximate_member_count,
                online_count: data.approximate_presence_count,
                icon_url: data.icon
                    ? `https://cdn.discordapp.com/icons/${data.id}/${data.icon}.png`
                    : null,
                owner_id: data.owner_id,
                preferred_locale: data.preferred_locale,
                verification_level: data.verification_level,
                created_at: snowflakeToDate(data.id),
            };
        }

        case 'list_channels': {
            const data = await discord('GET', `/guilds/${args.guild_id}/channels`, token) as any[];
            const typeNames: Record<number, string> = {
                0: 'text', 1: 'dm', 2: 'voice', 3: 'group_dm',
                4: 'category', 5: 'announcement', 10: 'announcement_thread',
                11: 'public_thread', 12: 'private_thread', 13: 'stage',
                14: 'directory', 15: 'forum', 16: 'media',
            };
            return data
                .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
                .map((c: any) => ({
                    id: c.id,
                    name: c.name,
                    type: typeNames[c.type] ?? `unknown(${c.type})`,
                    topic: c.topic ?? null,
                    position: c.position,
                    parent_id: c.parent_id ?? null,
                    nsfw: c.nsfw ?? false,
                    slowmode_seconds: c.rate_limit_per_user ?? 0,
                }));
        }

        case 'get_channel': {
            const data = await discord('GET', `/channels/${args.channel_id}`, token) as any;
            return {
                id: data.id,
                name: data.name,
                type: data.type,
                topic: data.topic ?? null,
                nsfw: data.nsfw ?? false,
                slowmode_seconds: data.rate_limit_per_user ?? 0,
                parent_id: data.parent_id ?? null,
                guild_id: data.guild_id ?? null,
                position: data.position ?? null,
            };
        }

        // ── Messages ───────────────────────────────────────────────────────

        case 'get_messages': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const params = new URLSearchParams({ limit: String(limit) });
            if (args.before) params.set('before', String(args.before));
            if (args.after) params.set('after', String(args.after));
            const data = await discord('GET', `/channels/${args.channel_id}/messages?${params}`, token) as any[];
            return data.map((m: any) => ({
                id: m.id,
                content: m.content,
                author: {
                    id: m.author?.id,
                    username: m.author?.username,
                    global_name: m.author?.global_name,
                    bot: m.author?.bot ?? false,
                },
                timestamp: m.timestamp,
                edited_timestamp: m.edited_timestamp ?? null,
                pinned: m.pinned,
                reply_to: m.referenced_message
                    ? { id: m.referenced_message.id, content: m.referenced_message.content?.slice(0, 100) }
                    : null,
                reactions: m.reactions?.map((r: any) => ({
                    emoji: r.emoji?.name,
                    count: r.count,
                })) ?? [],
                attachments: m.attachments?.map((a: any) => ({ filename: a.filename, url: a.url })) ?? [],
            }));
        }

        case 'send_message': {
            const body: Record<string, unknown> = { content: args.content };
            if (args.embed_title || args.embed_description) {
                const embed: Record<string, unknown> = {};
                if (args.embed_title) embed.title = args.embed_title;
                if (args.embed_description) embed.description = args.embed_description;
                if (args.embed_color) embed.color = args.embed_color;
                if (args.embed_url) embed.url = args.embed_url;
                body.embeds = [embed];
            }
            const data = await discord('POST', `/channels/${args.channel_id}/messages`, token, body) as any;
            return {
                id: data.id,
                channel_id: data.channel_id,
                content: data.content,
                timestamp: data.timestamp,
            };
        }

        case 'reply_to_message': {
            const body: Record<string, unknown> = {
                content: args.content,
                message_reference: {
                    message_id: args.message_id,
                    channel_id: args.channel_id,
                },
                allowed_mentions: {
                    replied_user: args.mention_author === true,
                },
            };
            const data = await discord('POST', `/channels/${args.channel_id}/messages`, token, body) as any;
            return {
                id: data.id,
                channel_id: data.channel_id,
                content: data.content,
                reply_to_message_id: args.message_id,
                timestamp: data.timestamp,
            };
        }

        case 'edit_message': {
            const data = await discord(
                'PATCH',
                `/channels/${args.channel_id}/messages/${args.message_id}`,
                token,
                { content: args.content },
            ) as any;
            return {
                id: data.id,
                content: data.content,
                edited_timestamp: data.edited_timestamp,
            };
        }

        case 'delete_message': {
            await discord('DELETE', `/channels/${args.channel_id}/messages/${args.message_id}`, token);
            return { success: true, deleted_message_id: args.message_id };
        }

        case 'get_pinned_messages': {
            const data = await discord('GET', `/channels/${args.channel_id}/pins`, token) as any[];
            return data.map((m: any) => ({
                id: m.id,
                content: m.content,
                author: { id: m.author?.id, username: m.author?.username },
                timestamp: m.timestamp,
            }));
        }

        case 'pin_message': {
            await discord('PUT', `/channels/${args.channel_id}/pins/${args.message_id}`, token);
            return { success: true, pinned_message_id: args.message_id };
        }

        case 'add_reaction': {
            // Discord expects emoji encoded in URL: standard = raw char, custom = name:id
            const emoji = encodeURIComponent(String(args.emoji));
            await discord(
                'PUT',
                `/channels/${args.channel_id}/messages/${args.message_id}/reactions/${emoji}/@me`,
                token,
            );
            return { success: true, emoji: args.emoji, message_id: args.message_id };
        }

        // ── Members & Roles ────────────────────────────────────────────────

        case 'list_members': {
            const limit = Math.min(Number(args.limit ?? 50), 1000);
            const params = new URLSearchParams({ limit: String(limit) });
            if (args.after) params.set('after', String(args.after));
            const data = await discord('GET', `/guilds/${args.guild_id}/members?${params}`, token) as any[];
            return data.map((m: any) => ({
                user_id: m.user?.id,
                username: m.user?.username,
                global_name: m.user?.global_name,
                nickname: m.nick ?? null,
                roles: m.roles ?? [],
                joined_at: m.joined_at,
                bot: m.user?.bot ?? false,
            }));
        }

        case 'get_member': {
            const data = await discord('GET', `/guilds/${args.guild_id}/members/${args.user_id}`, token) as any;
            return {
                user_id: data.user?.id,
                username: data.user?.username,
                global_name: data.user?.global_name,
                nickname: data.nick ?? null,
                roles: data.roles ?? [],
                joined_at: data.joined_at,
                premium_since: data.premium_since ?? null,
                pending: data.pending ?? false,
                bot: data.user?.bot ?? false,
                avatar_url: data.avatar
                    ? `https://cdn.discordapp.com/guilds/${args.guild_id}/users/${args.user_id}/avatars/${data.avatar}.png`
                    : (data.user?.avatar
                        ? `https://cdn.discordapp.com/avatars/${args.user_id}/${data.user.avatar}.png`
                        : null),
            };
        }

        case 'list_roles': {
            const data = await discord('GET', `/guilds/${args.guild_id}/roles`, token) as any[];
            return data
                .sort((a: any, b: any) => b.position - a.position)
                .map((r: any) => ({
                    id: r.id,
                    name: r.name,
                    color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null,
                    position: r.position,
                    mentionable: r.mentionable,
                    hoist: r.hoist, // shown separately in member list
                    managed: r.managed, // managed by an integration (e.g. bot role)
                }));
        }

        case 'assign_role': {
            await discord(
                'PUT',
                `/guilds/${args.guild_id}/members/${args.user_id}/roles/${args.role_id}`,
                token,
            );
            return { success: true, assigned_role_id: args.role_id, user_id: args.user_id };
        }

        case 'remove_role': {
            await discord(
                'DELETE',
                `/guilds/${args.guild_id}/members/${args.user_id}/roles/${args.role_id}`,
                token,
            );
            return { success: true, removed_role_id: args.role_id, user_id: args.user_id };
        }

        case 'kick_member': {
            const path = `/guilds/${args.guild_id}/members/${args.user_id}`;
            const headers: Record<string, string> = {};
            if (args.reason) headers['X-Audit-Log-Reason'] = encodeURIComponent(String(args.reason));
            // discord() helper handles headers internally — pass reason via query param fallback
            const reasonParam = args.reason
                ? `?reason=${encodeURIComponent(String(args.reason))}`
                : '';
            await discord('DELETE', `${path}${reasonParam}`, token);
            return { success: true, kicked_user_id: args.user_id, reason: args.reason ?? null };
        }

        // ── Channels & Threads ─────────────────────────────────────────────

        case 'create_channel': {
            const body: Record<string, unknown> = {
                name: args.name,
                type: args.type ?? 0,
            };
            if (args.topic) body.topic = args.topic;
            if (args.parent_id) body.parent_id = args.parent_id;
            if (args.nsfw !== undefined) body.nsfw = args.nsfw;
            const data = await discord('POST', `/guilds/${args.guild_id}/channels`, token, body) as any;
            return {
                id: data.id,
                name: data.name,
                type: data.type,
                topic: data.topic ?? null,
                parent_id: data.parent_id ?? null,
                guild_id: data.guild_id,
            };
        }

        case 'edit_channel': {
            const body: Record<string, unknown> = {};
            if (args.name !== undefined) body.name = args.name;
            if (args.topic !== undefined) body.topic = args.topic;
            if (args.slowmode_seconds !== undefined) body.rate_limit_per_user = args.slowmode_seconds;
            if (args.nsfw !== undefined) body.nsfw = args.nsfw;
            const data = await discord('PATCH', `/channels/${args.channel_id}`, token, body) as any;
            return {
                id: data.id,
                name: data.name,
                topic: data.topic ?? null,
                slowmode_seconds: data.rate_limit_per_user ?? 0,
                nsfw: data.nsfw ?? false,
            };
        }

        case 'create_thread': {
            let path: string;
            let body: Record<string, unknown>;

            if (args.message_id) {
                // Thread from existing message
                path = `/channels/${args.channel_id}/messages/${args.message_id}/threads`;
                body = {
                    name: args.name,
                    auto_archive_duration: args.auto_archive_minutes ?? 1440,
                };
            } else {
                // Standalone thread (forum-style or private)
                path = `/channels/${args.channel_id}/threads`;
                body = {
                    name: args.name,
                    auto_archive_duration: args.auto_archive_minutes ?? 1440,
                    type: 11, // public thread
                };
            }
            const data = await discord('POST', path, token, body) as any;
            return {
                id: data.id,
                name: data.name,
                parent_id: data.parent_id,
                owner_id: data.owner_id,
                created_from_message: args.message_id ?? null,
                auto_archive_duration: data.thread_metadata?.auto_archive_duration,
            };
        }

        case 'list_active_threads': {
            const data = await discord('GET', `/guilds/${args.guild_id}/threads/active`, token) as any;
            const threads = data.threads ?? [];
            return threads.map((t: any) => ({
                id: t.id,
                name: t.name,
                parent_id: t.parent_id,
                owner_id: t.owner_id,
                message_count: t.message_count ?? 0,
                member_count: t.member_count ?? 0,
                archived: t.thread_metadata?.archived ?? false,
                auto_archive_duration: t.thread_metadata?.auto_archive_duration,
                created_at: t.thread_metadata?.create_timestamp ?? null,
            }));
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function snowflakeToDate(snowflake: string): string {
    // Discord snowflake: first 42 bits are ms timestamp since Discord epoch (2015-01-01)
    const DISCORD_EPOCH = 1420070400000n;
    const timestamp = (BigInt(snowflake) >> 22n) + DISCORD_EPOCH;
    return new Date(Number(timestamp)).toISOString();
}

// ── Worker entry ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-discord', version: '1.0.0', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-discord', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-DISCORD-BOT-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing DISCORD_BOT_TOKEN — add your Discord bot token to workspace secrets');
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
