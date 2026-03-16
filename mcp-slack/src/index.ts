/**
 * Slack MCP Worker
 * Implements MCP protocol over HTTP for Slack API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: SLACK_BOT_TOKEN → header: X-Mcp-Secret-SLACK-BOT-TOKEN
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-slack
 */

const SLACK_API = 'https://slack.com/api';

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
    {
        name: '_ping',
        description: 'Verify Slack bot token by calling auth.test. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'list_channels',
        description: 'List public and private channels in the Slack workspace',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max channels to return (default 20, max 200)' },
                exclude_archived: { type: 'boolean', description: 'Exclude archived channels (default true)' },
            },
        },
    },
    {
        name: 'post_message',
        description: 'Post a message to a Slack channel',
        inputSchema: {
            type: 'object',
            properties: {
                channel: { type: 'string', description: 'Channel ID or name (e.g. C01234ABC or #general)' },
                text: { type: 'string', description: 'Message text (supports mrkdwn formatting)' },
                thread_ts: { type: 'string', description: 'Reply in a thread — parent message timestamp (optional)' },
            },
            required: ['channel', 'text'],
        },
    },
    {
        name: 'get_channel_history',
        description: 'Get recent messages from a Slack channel',
        inputSchema: {
            type: 'object',
            properties: {
                channel: { type: 'string', description: 'Channel ID (e.g. C01234ABC)' },
                limit: { type: 'number', description: 'Number of messages to return (default 10, max 50)' },
            },
            required: ['channel'],
        },
    },
    {
        name: 'search_messages',
        description: 'Search for messages across the Slack workspace',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query text' },
                count: { type: 'number', description: 'Number of results (default 5, max 20)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_user_info',
        description: 'Get profile information for a Slack user',
        inputSchema: {
            type: 'object',
            properties: {
                user: { type: 'string', description: 'User ID (e.g. U01234ABC)' },
            },
            required: ['user'],
        },
    },
    {
        name: 'list_users',
        description: 'List members of the Slack workspace',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of users to return (default 20)' },
            },
        },
    },
    {
        name: 'add_reaction',
        description: 'Add an emoji reaction to a Slack message',
        inputSchema: {
            type: 'object',
            properties: {
                channel: { type: 'string', description: 'Channel ID containing the message' },
                timestamp: { type: 'string', description: 'Message timestamp (ts field)' },
                name: { type: 'string', description: 'Emoji name without colons (e.g. thumbsup, tada)' },
            },
            required: ['channel', 'timestamp', 'name'],
        },
    },
];

async function slack(method: string, token: string, params: Record<string, unknown> = {}, isPost = false) {
    let url: string;
    let opts: RequestInit;

    if (isPost) {
        url = `${SLACK_API}/${method}`;
        opts = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify(params),
        };
    } else {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null) qs.set(k, String(v));
        }
        url = `${SLACK_API}/${method}?${qs}`;
        opts = {
            headers: { Authorization: `Bearer ${token}` },
        };
    }

    const res = await fetch(url, opts);
    if (!res.ok) {
        throw new Error(`Slack HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json() as any;
    if (!data.ok) {
        throw new Error(`Slack API error: ${data.error ?? 'unknown'}`);
    }
    return data;
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await slack('auth.test', token) as any;
            if (!data.ok) throw new Error(data.error || 'Auth failed');
            return { content: [{ type: 'text', text: `Connected to Slack workspace "${data.team}" as @${data.user}` }] };
        }

        case 'list_channels': {
            const data = await slack('conversations.list', token, {
                limit: Math.min(Number(args.limit ?? 20), 200),
                exclude_archived: args.exclude_archived !== false ? 'true' : 'false',
                types: 'public_channel,private_channel',
            }) as any;
            return data.channels?.map((c: any) => ({
                id: c.id,
                name: c.name,
                is_private: c.is_private,
                member_count: c.num_members,
                topic: c.topic?.value ?? '',
                purpose: c.purpose?.value ?? '',
            })) ?? [];
        }

        case 'post_message': {
            const body: Record<string, unknown> = { channel: args.channel, text: args.text };
            if (args.thread_ts) body.thread_ts = args.thread_ts;
            const data = await slack('chat.postMessage', token, body, true) as any;
            return { ts: data.ts, channel: data.channel, message_text: args.text };
        }

        case 'get_channel_history': {
            const data = await slack('conversations.history', token, {
                channel: args.channel,
                limit: Math.min(Number(args.limit ?? 10), 50),
            }) as any;
            return data.messages?.map((m: any) => ({
                ts: m.ts,
                user: m.user,
                text: m.text,
                reply_count: m.reply_count ?? 0,
                reactions: m.reactions?.map((r: any) => `${r.name}(${r.count})`) ?? [],
            })) ?? [];
        }

        case 'search_messages': {
            const data = await slack('search.messages', token, {
                query: args.query,
                count: Math.min(Number(args.count ?? 5), 20),
            }) as any;
            return data.messages?.matches?.map((m: any) => ({
                text: m.text,
                user: m.username,
                channel: m.channel?.name ?? m.channel?.id,
                ts: m.ts,
                permalink: m.permalink,
            })) ?? [];
        }

        case 'get_user_info': {
            const data = await slack('users.info', token, { user: args.user }) as any;
            const u = data.user;
            return {
                id: u.id,
                name: u.name,
                real_name: u.real_name,
                email: u.profile?.email,
                title: u.profile?.title,
                is_admin: u.is_admin,
                timezone: u.tz,
            };
        }

        case 'list_users': {
            const data = await slack('users.list', token, {
                limit: Math.min(Number(args.limit ?? 20), 200),
            }) as any;
            return data.members
                ?.filter((u: any) => !u.is_bot && !u.deleted)
                .map((u: any) => ({
                    id: u.id,
                    name: u.name,
                    real_name: u.real_name,
                    email: u.profile?.email,
                    is_admin: u.is_admin,
                })) ?? [];
        }

        case 'add_reaction': {
            await slack('reactions.add', token, {
                channel: args.channel,
                timestamp: args.timestamp,
                name: args.name,
            }, true);
            return { success: true, emoji: args.name };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'slack-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
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
                serverInfo: { name: 'slack-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-SLACK-BOT-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing SLACK_BOT_TOKEN secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
