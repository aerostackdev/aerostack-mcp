/**
 * Facebook Pages MCP Worker
 * Implements MCP protocol over HTTP for Facebook Page management operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   FACEBOOK_PAGE_ACCESS_TOKEN  → X-Mcp-Secret-FACEBOOK-PAGE-ACCESS-TOKEN
 *   FACEBOOK_PAGE_ID            → X-Mcp-Secret-FACEBOOK-PAGE-ID
 *
 * Auth format: access_token={token} appended as query param (Meta Graph API standard)
 *
 * Covers: Page Info (4), Posts (6), Comments (4), Inbox/Messaging (3), Media (3) = 20 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const FB_API_BASE = 'https://graph.facebook.com/v21.0';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

function getSecrets(request: Request): { token: string | null; pageId: string | null } {
    return {
        token: request.headers.get('X-Mcp-Secret-FACEBOOK-PAGE-ACCESS-TOKEN'),
        pageId: request.headers.get('X-Mcp-Secret-FACEBOOK-PAGE-ID'),
    };
}

async function fbFetch(
    path: string,
    token: string,
    options: RequestInit = {},
    extraParams: Record<string, string> = {},
): Promise<unknown> {
    const separator = path.includes('?') ? '&' : '?';
    const extraQuery = Object.keys(extraParams).length
        ? '&' + Object.entries(extraParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
        : '';
    const url = `${FB_API_BASE}${path}${separator}access_token=${encodeURIComponent(token)}${extraQuery}`;

    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Facebook HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        const errData = data as { error?: { message?: string; type?: string } };
        const msg = errData?.error?.message || res.statusText;
        throw { code: -32603, message: `Facebook API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Page Info (4 tools) ─────────────────────────────────────────

    {
        name: 'get_page',
        description: 'Get page details including id, name, about, category, fan_count, website, phone, emails, and link.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_page_insights',
        description: 'Get page-level insights metrics such as impressions, engaged users, fans, and page views.',
        inputSchema: {
            type: 'object',
            properties: {
                metric: {
                    type: 'string',
                    enum: ['page_impressions', 'page_engaged_users', 'page_fans', 'page_views_total'],
                    description: 'The insight metric to retrieve',
                },
                period: {
                    type: 'string',
                    enum: ['day', 'week', 'month'],
                    description: 'Aggregation period (default: day)',
                },
                since: {
                    type: 'string',
                    description: 'Unix timestamp or ISO date for range start (optional)',
                },
                until: {
                    type: 'string',
                    description: 'Unix timestamp or ISO date for range end (optional)',
                },
            },
            required: ['metric'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_follower_count',
        description: 'Get the current follower/fan count for the page using the page_fans metric.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_page_info',
        description: 'Update page about text, description, or website URL.',
        inputSchema: {
            type: 'object',
            properties: {
                about: { type: 'string', description: 'Short description of the page (about text)' },
                description: { type: 'string', description: 'Long-form page description' },
                website: { type: 'string', description: 'Page website URL' },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 2 — Posts (6 tools) ──────────────────────────────────────────────

    {
        name: 'list_posts',
        description: 'List page posts with engagement summaries (likes, comments, shares). Supports pagination via since/until timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of posts to return (default 10, max 100)',
                },
                since: {
                    type: 'string',
                    description: 'Unix timestamp — return posts created after this time (optional)',
                },
                until: {
                    type: 'string',
                    description: 'Unix timestamp — return posts created before this time (optional)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_post',
        description: 'Get full details of a specific post by ID (message, created_time, story, likes, comments, shares).',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: {
                    type: 'string',
                    description: 'Facebook post ID (format: {page_id}_{post_id} or standalone)',
                },
            },
            required: ['post_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_post',
        description: 'Create a text post on the page. Optionally include a link attachment. Set published=false to schedule.',
        inputSchema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Post message text (required)' },
                link: { type: 'string', description: 'URL to attach to the post (optional)' },
                published: {
                    type: 'boolean',
                    description: 'Whether to publish immediately (default: true). Set false to create as unpublished draft.',
                },
            },
            required: ['message'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_photo_post',
        description: 'Create a photo post on the page by providing the URL of the photo image and an optional caption.',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Publicly accessible URL of the photo to post (required)' },
                message: { type: 'string', description: 'Caption/message for the photo (optional)' },
            },
            required: ['url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_post',
        description: 'Permanently delete a post from the page by post ID.',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: {
                    type: 'string',
                    description: 'Facebook post ID to delete',
                },
            },
            required: ['post_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_post_insights',
        description: 'Get engagement metrics for a specific post: impressions, engaged users, and clicks.',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: {
                    type: 'string',
                    description: 'Facebook post ID',
                },
            },
            required: ['post_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Comments (4 tools) ──────────────────────────────────────────

    {
        name: 'list_comments',
        description: 'List comments on a post. Supports pagination and filtering by stream or top-level only.',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: {
                    type: 'string',
                    description: 'Facebook post ID to list comments for',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of comments to return (default 25)',
                },
                filter: {
                    type: 'string',
                    enum: ['stream', 'toplevel'],
                    description: 'Comment filter: stream (all including replies) or toplevel (top-level only). Default: toplevel',
                },
            },
            required: ['post_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'reply_to_comment',
        description: 'Reply to a comment on a post with a message.',
        inputSchema: {
            type: 'object',
            properties: {
                comment_id: {
                    type: 'string',
                    description: 'Comment ID to reply to',
                },
                message: {
                    type: 'string',
                    description: 'Reply message text',
                },
            },
            required: ['comment_id', 'message'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_comment',
        description: 'Permanently delete a comment by comment ID.',
        inputSchema: {
            type: 'object',
            properties: {
                comment_id: {
                    type: 'string',
                    description: 'Comment ID to delete',
                },
            },
            required: ['comment_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'hide_comment',
        description: 'Hide or unhide a comment on a post. Hidden comments are not visible to users other than the author.',
        inputSchema: {
            type: 'object',
            properties: {
                comment_id: {
                    type: 'string',
                    description: 'Comment ID to hide or unhide',
                },
                is_hidden: {
                    type: 'boolean',
                    description: 'true to hide the comment, false to unhide',
                },
            },
            required: ['comment_id', 'is_hidden'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Inbox/Messaging (3 tools) ───────────────────────────────────

    {
        name: 'list_conversations',
        description: 'List page inbox conversations. Returns conversation IDs, participants, and last message preview.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of conversations to return (default 20)',
                },
                folder: {
                    type: 'string',
                    enum: ['inbox', 'other'],
                    description: 'Inbox folder to list (default: inbox)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_conversation',
        description: 'Get a conversation with all its messages by conversation ID.',
        inputSchema: {
            type: 'object',
            properties: {
                conversation_id: {
                    type: 'string',
                    description: 'Conversation ID to retrieve',
                },
            },
            required: ['conversation_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'reply_to_conversation',
        description: 'Send a reply message in an existing conversation.',
        inputSchema: {
            type: 'object',
            properties: {
                conversation_id: {
                    type: 'string',
                    description: 'Conversation ID to reply to',
                },
                message: {
                    type: 'string',
                    description: 'Reply message text to send',
                },
            },
            required: ['conversation_id', 'message'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 5 — Media (3 tools) ──────────────────────────────────────────────

    {
        name: 'list_photos',
        description: 'List photos published on the page with metadata and image URLs.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of photos to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_videos',
        description: 'List videos on the page including title, description, duration, and creation time.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of videos to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_media_insights',
        description: 'Get insights metrics for a specific photo or video (e.g. post_impressions, post_clicks, post_engaged_users).',
        inputSchema: {
            type: 'object',
            properties: {
                media_id: {
                    type: 'string',
                    description: 'Photo or video ID to get insights for',
                },
                metric: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of metric names to retrieve (e.g. ["post_impressions","post_engaged_users","post_clicks"])',
                },
            },
            required: ['media_id', 'metric'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ──────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Validate Facebook Page Access Token and Page ID by fetching basic page identity. Returns page id and name.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    pageId: string,
): Promise<unknown> {
    switch (name) {
        // ── Page Info ───────────────────────────────────────────────────────────

        case 'get_page': {
            const fields = 'id,name,about,category,fan_count,website,phone,emails,link';
            return fbFetch(`/${pageId}?fields=${fields}`, token);
        }

        case 'get_page_insights': {
            validateRequired(args, ['metric']);
            const period = (args.period as string) || 'day';
            let path = `/${pageId}/insights/${args.metric}?period=${period}`;
            if (args.since) path += `&since=${encodeURIComponent(args.since as string)}`;
            if (args.until) path += `&until=${encodeURIComponent(args.until as string)}`;
            return fbFetch(path, token);
        }

        case 'get_follower_count': {
            return fbFetch(`/${pageId}/insights/page_fans?period=day`, token);
        }

        case 'update_page_info': {
            const body: Record<string, unknown> = {};
            if (args.about !== undefined) body.about = args.about;
            if (args.description !== undefined) body.description = args.description;
            if (args.website !== undefined) body.website = args.website;
            return fbFetch(`/${pageId}`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        // ── Posts ───────────────────────────────────────────────────────────────

        case 'list_posts': {
            const limit = (args.limit as number) || 10;
            const fields = 'id,message,created_time,likes.summary(true),comments.summary(true),shares';
            let path = `/${pageId}/feed?fields=${fields}&limit=${limit}`;
            if (args.since) path += `&since=${encodeURIComponent(args.since as string)}`;
            if (args.until) path += `&until=${encodeURIComponent(args.until as string)}`;
            return fbFetch(path, token);
        }

        case 'get_post': {
            validateRequired(args, ['post_id']);
            const fields = 'id,message,created_time,story,likes.summary(true),comments.summary(true),shares';
            return fbFetch(`/${args.post_id}?fields=${fields}`, token);
        }

        case 'create_post': {
            validateRequired(args, ['message']);
            const body: Record<string, unknown> = { message: args.message };
            if (args.link !== undefined) body.link = args.link;
            if (args.published !== undefined) body.published = args.published;
            return fbFetch(`/${pageId}/feed`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'create_photo_post': {
            validateRequired(args, ['url']);
            const body: Record<string, unknown> = { url: args.url };
            if (args.message !== undefined) body.caption = args.message;
            return fbFetch(`/${pageId}/photos`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'delete_post': {
            validateRequired(args, ['post_id']);
            return fbFetch(`/${args.post_id}`, token, { method: 'DELETE' });
        }

        case 'get_post_insights': {
            validateRequired(args, ['post_id']);
            const metrics = 'post_impressions,post_engaged_users,post_clicks';
            return fbFetch(`/${args.post_id}/insights?metric=${metrics}`, token);
        }

        // ── Comments ────────────────────────────────────────────────────────────

        case 'list_comments': {
            validateRequired(args, ['post_id']);
            const limit = (args.limit as number) || 25;
            const filter = (args.filter as string) || 'toplevel';
            return fbFetch(
                `/${args.post_id}/comments?fields=id,message,from,created_time,like_count&filter=${filter}&limit=${limit}`,
                token,
            );
        }

        case 'reply_to_comment': {
            validateRequired(args, ['comment_id', 'message']);
            return fbFetch(`/${args.comment_id}/comments`, token, {
                method: 'POST',
                body: JSON.stringify({ message: args.message }),
            });
        }

        case 'delete_comment': {
            validateRequired(args, ['comment_id']);
            return fbFetch(`/${args.comment_id}`, token, { method: 'DELETE' });
        }

        case 'hide_comment': {
            validateRequired(args, ['comment_id', 'is_hidden']);
            return fbFetch(`/${args.comment_id}`, token, {
                method: 'POST',
                body: JSON.stringify({ is_hidden: args.is_hidden }),
            });
        }

        // ── Inbox/Messaging ─────────────────────────────────────────────────────

        case 'list_conversations': {
            const limit = (args.limit as number) || 20;
            const folder = (args.folder as string) || 'inbox';
            return fbFetch(
                `/${pageId}/conversations?fields=id,participants,updated_time,snippet&limit=${limit}&folder=${folder}`,
                token,
            );
        }

        case 'get_conversation': {
            validateRequired(args, ['conversation_id']);
            return fbFetch(
                `/${args.conversation_id}?fields=id,participants,messages{id,message,from,created_time}`,
                token,
            );
        }

        case 'reply_to_conversation': {
            validateRequired(args, ['conversation_id', 'message']);
            return fbFetch(`/${args.conversation_id}/messages`, token, {
                method: 'POST',
                body: JSON.stringify({ message: args.message }),
            });
        }

        // ── Media ───────────────────────────────────────────────────────────────

        case 'list_photos': {
            const limit = (args.limit as number) || 20;
            return fbFetch(
                `/${pageId}/photos?fields=id,name,created_time,images&type=uploaded&limit=${limit}`,
                token,
            );
        }

        case 'list_videos': {
            const limit = (args.limit as number) || 20;
            return fbFetch(
                `/${pageId}/videos?fields=id,title,description,created_time,length&limit=${limit}`,
                token,
            );
        }

        case 'get_media_insights': {
            validateRequired(args, ['media_id', 'metric']);
            const metrics = Array.isArray(args.metric)
                ? (args.metric as string[]).join(',')
                : (args.metric as string);
            return fbFetch(`/${args.media_id}/insights?metric=${metrics}`, token);
        }

        // ── Ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            return fbFetch(`/${pageId}?fields=id,name`, token);
        }

        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-facebook-pages', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        // ── MCP protocol methods ──────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-facebook-pages', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            // Validate secrets
            const { token, pageId } = getSecrets(request);
            if (!token || !pageId) {
                const missing = [];
                if (!token) missing.push('FACEBOOK_PAGE_ACCESS_TOKEN (header: X-Mcp-Secret-FACEBOOK-PAGE-ACCESS-TOKEN)');
                if (!pageId) missing.push('FACEBOOK_PAGE_ID (header: X-Mcp-Secret-FACEBOOK-PAGE-ID)');
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                const result = await callTool(toolName, args, token, pageId);
                return rpcOk(id, toolOk(result));
            } catch (err: unknown) {
                if (err && typeof err === 'object' && 'code' in err) {
                    const e = err as { code: number; message: string };
                    return rpcErr(id, e.code, e.message);
                }
                if (err instanceof Error) {
                    return rpcErr(id, -32603, err.message);
                }
                return rpcErr(id, -32603, 'Internal error');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
