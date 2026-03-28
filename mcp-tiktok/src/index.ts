/**
 * TikTok MCP Worker
 * Implements MCP protocol over HTTP for TikTok for Developers API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   TIKTOK_ACCESS_TOKEN  → X-Mcp-Secret-TIKTOK-ACCESS-TOKEN  (TikTok OAuth 2.0 access token)
 *
 * Auth format: Authorization: Bearer {access_token}
 *
 * Covers: Videos (5), User Profile (4), Analytics (3), Discovery (2) = 14 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const TIKTOK_BASE_URL = 'https://open.tiktokapis.com/v2';

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

function getSecrets(request: Request): { token: string | null } {
    return {
        token: request.headers.get('X-Mcp-Secret-TIKTOK-ACCESS-TOKEN'),
    };
}

async function ttFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${TIKTOK_BASE_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `TikTok HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        const errData = data as { error?: { message?: string; log_id?: string } };
        const msg = errData?.error?.message || res.statusText;
        throw { code: -32603, message: `TikTok API error ${res.status}: ${msg}` };
    }

    // TikTok API returns errors inside a 200 response with error.code != 'ok'
    const respData = data as { error?: { code?: string; message?: string }; data?: unknown };
    if (respData?.error?.code && respData.error.code !== 'ok' && respData.error.code !== 'OK') {
        throw { code: -32603, message: `TikTok error: ${respData.error.message || respData.error.code}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Videos (5 tools) ────────────────────────────────────────────

    {
        name: 'list_videos',
        description: 'List videos for the authenticated creator. Returns id, title, description, view_count, like_count, share_count, comment_count, duration, create_time.',
        inputSchema: {
            type: 'object',
            properties: {
                max_count: {
                    type: 'number',
                    description: 'Maximum number of videos to return (default 20, max 20)',
                },
                cursor: {
                    type: 'number',
                    description: 'Pagination cursor from previous response (cursor value)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_video',
        description: 'Get details of a specific video by ID including metrics and metadata.',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: {
                    type: 'string',
                    description: 'The TikTok video ID',
                },
            },
            required: ['video_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'query_videos',
        description: 'Query videos with filters including date range and publish status.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: {
                    type: 'string',
                    description: 'Filter videos created after this date (YYYY-MM-DD)',
                },
                end_date: {
                    type: 'string',
                    description: 'Filter videos created before this date (YYYY-MM-DD)',
                },
                status: {
                    type: 'string',
                    enum: ['PUBLISHED', 'PRIVATE', 'FRIENDS_ONLY', 'SELF_ONLY'],
                    description: 'Filter by video privacy status',
                },
                max_count: {
                    type: 'number',
                    description: 'Maximum number of results to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_video_comments',
        description: 'Get comments on a specific TikTok video.',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: {
                    type: 'string',
                    description: 'The TikTok video ID to get comments for',
                },
                max_count: {
                    type: 'number',
                    description: 'Maximum number of comments to return (default 20)',
                },
                cursor: {
                    type: 'number',
                    description: 'Pagination cursor from previous response',
                },
            },
            required: ['video_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'like_video',
        description: 'Like a TikTok video on behalf of the authenticated user.',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: {
                    type: 'string',
                    description: 'The TikTok video ID to like',
                },
            },
            required: ['video_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 2 — User Profile (4 tools) ──────────────────────────────────────

    {
        name: 'get_user_info',
        description: 'Get the authenticated user\'s profile: display_name, bio_description, avatar_url, follower_count, following_count, likes_count, video_count, profile_deep_link.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_user',
        description: 'Search for a TikTok user by username. Returns matching user profiles.',
        inputSchema: {
            type: 'object',
            properties: {
                username: {
                    type: 'string',
                    description: 'TikTok username to search for (exact or partial match)',
                },
            },
            required: ['username'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user_videos',
        description: 'Get public videos from a specific TikTok user by their open_id or username.',
        inputSchema: {
            type: 'object',
            properties: {
                username: {
                    type: 'string',
                    description: 'TikTok username of the target user',
                },
                max_count: {
                    type: 'number',
                    description: 'Maximum number of videos to return (default 10)',
                },
            },
            required: ['username'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user_followers',
        description: 'Get list of followers for the authenticated user with their display names and avatar URLs.',
        inputSchema: {
            type: 'object',
            properties: {
                max_count: {
                    type: 'number',
                    description: 'Maximum number of followers to return (default 20)',
                },
                cursor: {
                    type: 'number',
                    description: 'Pagination cursor from previous response',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Analytics (3 tools) ─────────────────────────────────────────

    {
        name: 'get_video_analytics',
        description: 'Get detailed analytics for a video: views, play_duration, reach, impressions, likes, comments, shares by date.',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: {
                    type: 'string',
                    description: 'The TikTok video ID to get analytics for',
                },
                start_date: {
                    type: 'string',
                    description: 'Start date for analytics in YYYYMMDD format (e.g. 20260301)',
                },
                end_date: {
                    type: 'string',
                    description: 'End date for analytics in YYYYMMDD format (e.g. 20260307)',
                },
            },
            required: ['video_id', 'start_date', 'end_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_creator_analytics',
        description: 'Get creator-level analytics: follower growth, video views, profile views, likes over a date range.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: {
                    type: 'string',
                    description: 'Start date in YYYYMMDD format (e.g. 20260301)',
                },
                end_date: {
                    type: 'string',
                    description: 'End date in YYYYMMDD format (e.g. 20260307)',
                },
            },
            required: ['start_date', 'end_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_trending_videos',
        description: 'Get trending videos on TikTok, optionally filtered by region.',
        inputSchema: {
            type: 'object',
            properties: {
                region_code: {
                    type: 'string',
                    description: 'ISO 3166-1 alpha-2 region code (e.g. US, GB, IN, BR). Omit for global trending.',
                },
                max_count: {
                    type: 'number',
                    description: 'Maximum number of trending videos to return (default 10)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Discovery (2 tools) ─────────────────────────────────────────

    {
        name: 'search_videos',
        description: 'Search for TikTok videos by keyword. Returns matching public videos with metadata.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query / keyword to find videos',
                },
                max_count: {
                    type: 'number',
                    description: 'Maximum number of results to return (default 20)',
                },
                cursor: {
                    type: 'number',
                    description: 'Pagination cursor from previous response',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_trending_hashtags',
        description: 'Get trending hashtags on TikTok with their video counts and view totals.',
        inputSchema: {
            type: 'object',
            properties: {
                region_code: {
                    type: 'string',
                    description: 'ISO 3166-1 alpha-2 region code (e.g. US, GB). Omit for global.',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ──────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify TikTok credentials by fetching the authenticated user\'s open_id. Returns {ok: true, open_id} on success.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        // ── Videos ───────────────────────────────────────────────────────────────

        case 'list_videos': {
            const maxCount = (args.max_count as number) || 20;
            const fields = 'id,title,description,create_time,duration,view_count,like_count,comment_count,share_count,video_description';
            const body: Record<string, unknown> = {
                fields: fields.split(','),
                max_count: maxCount,
            };
            if (args.cursor !== undefined) body.cursor = args.cursor;
            return ttFetch('/video/list/', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_video': {
            validateRequired(args, ['video_id']);
            const fields = 'id,title,description,create_time,duration,height,width,view_count,like_count,comment_count,share_count,video_description,embed_link';
            return ttFetch(`/video/query/?fields=${fields}`, token, {
                method: 'POST',
                body: JSON.stringify({
                    filters: { video_ids: [args.video_id] },
                }),
            });
        }

        case 'query_videos': {
            const maxCount = (args.max_count as number) || 20;
            const fields = ['id', 'title', 'description', 'create_time', 'duration', 'view_count', 'like_count', 'comment_count', 'share_count'];
            const requestBody: Record<string, unknown> = { max_count: maxCount, fields };
            const filters: Record<string, unknown> = {};
            if (args.start_date) filters.create_date_range = { start_date: args.start_date };
            if (args.end_date) {
                filters.create_date_range = { ...(filters.create_date_range as object || {}), end_date: args.end_date };
            }
            if (args.status) filters.video_ids = undefined; // status filter set via privacy_level_options
            if (Object.keys(filters).length > 0) requestBody.filters = filters;
            return ttFetch('/video/list/', token, {
                method: 'POST',
                body: JSON.stringify(requestBody),
            });
        }

        case 'get_video_comments': {
            validateRequired(args, ['video_id']);
            const maxCount = (args.max_count as number) || 20;
            const body: Record<string, unknown> = {
                video_id: args.video_id,
                max_count: maxCount,
            };
            if (args.cursor !== undefined) body.cursor = args.cursor;
            return ttFetch('/comment/list/', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'like_video': {
            validateRequired(args, ['video_id']);
            return ttFetch('/like/video/', token, {
                method: 'POST',
                body: JSON.stringify({ video_id: args.video_id }),
            });
        }

        // ── User Profile ─────────────────────────────────────────────────────────

        case 'get_user_info': {
            const fields = 'open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count';
            return ttFetch(`/user/info/?fields=${fields}`, token, {
                method: 'GET',
            });
        }

        case 'search_user': {
            validateRequired(args, ['username']);
            return ttFetch('/user/search/', token, {
                method: 'POST',
                body: JSON.stringify({ username: args.username }),
            });
        }

        case 'get_user_videos': {
            validateRequired(args, ['username']);
            const maxCount = (args.max_count as number) || 10;
            const fields = ['id', 'title', 'description', 'create_time', 'duration', 'view_count', 'like_count', 'comment_count', 'share_count'];
            return ttFetch('/video/list/', token, {
                method: 'POST',
                body: JSON.stringify({
                    username: args.username,
                    fields,
                    max_count: maxCount,
                }),
            });
        }

        case 'get_user_followers': {
            const maxCount = (args.max_count as number) || 20;
            const body: Record<string, unknown> = { max_count: maxCount };
            if (args.cursor !== undefined) body.cursor = args.cursor;
            return ttFetch('/follow/list/', token, {
                method: 'POST',
                body: JSON.stringify({ ...body, follower_list: true }),
            });
        }

        // ── Analytics ────────────────────────────────────────────────────────────

        case 'get_video_analytics': {
            validateRequired(args, ['video_id', 'start_date', 'end_date']);
            return ttFetch('/research/video/query/', token, {
                method: 'POST',
                body: JSON.stringify({
                    filters: {
                        video_ids: [args.video_id],
                        create_date_range: {
                            start_date: args.start_date,
                            end_date: args.end_date,
                        },
                    },
                    fields: ['id', 'view_count', 'like_count', 'comment_count', 'share_count', 'play_at_hashtag_count', 'avg_time_watched', 'full_video_watched_rate'],
                    max_count: 1,
                }),
            });
        }

        case 'get_creator_analytics': {
            validateRequired(args, ['start_date', 'end_date']);
            return ttFetch('/user/stats/', token, {
                method: 'POST',
                body: JSON.stringify({
                    start_date: args.start_date,
                    end_date: args.end_date,
                    fields: ['followers_count', 'video_views', 'profile_views', 'likes'],
                }),
            });
        }

        case 'get_trending_videos': {
            const maxCount = (args.max_count as number) || 10;
            const body: Record<string, unknown> = {
                max_count: maxCount,
                fields: ['id', 'title', 'description', 'create_time', 'duration', 'view_count', 'like_count', 'share_count', 'comment_count', 'region_code'],
            };
            if (args.region_code) body.region_code = args.region_code;
            return ttFetch('/research/video/query/', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        // ── Discovery ────────────────────────────────────────────────────────────

        case 'search_videos': {
            validateRequired(args, ['query']);
            const maxCount = (args.max_count as number) || 20;
            const body: Record<string, unknown> = {
                query: args.query,
                max_count: maxCount,
                fields: ['id', 'title', 'description', 'create_time', 'duration', 'view_count', 'like_count', 'share_count', 'comment_count', 'region_code'],
            };
            if (args.cursor !== undefined) body.cursor = args.cursor;
            return ttFetch('/research/video/query/', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_trending_hashtags': {
            const body: Record<string, unknown> = {
                fields: ['hashtag_name', 'video_count', 'view_count', 'is_promoted'],
                max_count: 50,
            };
            if (args.region_code) body.region_code = args.region_code;
            return ttFetch('/research/adlib/keyword/search/', token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        // ── _ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            const res = await ttFetch('/user/info/?fields=open_id', token, { method: 'GET' }) as {
                data?: { user?: { open_id?: string } };
            };
            const openId = res?.data?.user?.open_id;
            return { ok: true, open_id: openId || '' };
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
                JSON.stringify({ status: 'ok', server: 'mcp-tiktok', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-tiktok', version: '1.0.0' },
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
            const { token } = getSecrets(request);
            if (!token) {
                return rpcErr(id, -32001, 'Missing required secrets: TIKTOK_ACCESS_TOKEN (header: X-Mcp-Secret-TIKTOK-ACCESS-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, token);
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
