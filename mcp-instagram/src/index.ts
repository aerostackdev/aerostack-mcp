/**
 * Instagram MCP Worker
 * Implements MCP protocol over HTTP for Instagram Graph API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   INSTAGRAM_ACCESS_TOKEN          → X-Mcp-Secret-INSTAGRAM-ACCESS-TOKEN  (Meta User Access Token)
 *   INSTAGRAM_BUSINESS_ACCOUNT_ID   → X-Mcp-Secret-INSTAGRAM-BUSINESS-ACCOUNT-ID  (Instagram Business Account ID)
 *
 * Auth format: access_token query param or ?access_token={token}
 *
 * Covers: Media & Posts (6), Comments & Engagement (4),
 *         Account & Stories (4), Hashtags & Discovery (2) = 16 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const IG_API_VERSION = 'v18.0';
const IG_BASE_URL = `https://graph.facebook.com/${IG_API_VERSION}`;

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

function getSecrets(request: Request): { token: string | null; accountId: string | null } {
    return {
        token: request.headers.get('X-Mcp-Secret-INSTAGRAM-ACCESS-TOKEN'),
        accountId: request.headers.get('X-Mcp-Secret-INSTAGRAM-BUSINESS-ACCOUNT-ID'),
    };
}

async function igFetch(
    path: string,
    token: string,
    options: RequestInit = {},
    extraParams: Record<string, string> = {},
): Promise<unknown> {
    const separator = path.includes('?') ? '&' : '?';
    const extra = Object.entries(extraParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const url = `${IG_BASE_URL}${path}${separator}access_token=${encodeURIComponent(token)}${extra ? '&' + extra : ''}`;

    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Instagram HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        const errData = data as { error?: { message?: string; error_user_msg?: string } };
        const msg = errData?.error?.error_user_msg || errData?.error?.message || res.statusText;
        throw { code: -32603, message: `Instagram API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Media & Posts (6 tools) ────────────────────────────────────

    {
        name: 'get_media',
        description: 'Get details of a media object (image, video, or reel) by ID. Returns id, caption, media_type, media_url, thumbnail_url, timestamp, permalink, like_count, comments_count.',
        inputSchema: {
            type: 'object',
            properties: {
                media_id: {
                    type: 'string',
                    description: 'The ID of the media object to retrieve',
                },
            },
            required: ['media_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_media',
        description: 'List media objects for the business account with pagination support. Returns id, caption, media_type, media_url, timestamp, permalink.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of media objects to return (default 12, max 100)',
                },
                after: {
                    type: 'string',
                    description: 'Pagination cursor for the next page (from previous response cursors.after)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_photo_post',
        description: 'Create a photo post on the Instagram Business Account. Publishes an image from a public URL with an optional caption.',
        inputSchema: {
            type: 'object',
            properties: {
                image_url: {
                    type: 'string',
                    description: 'Public URL of the image to post (must be publicly accessible)',
                },
                caption: {
                    type: 'string',
                    description: 'Caption text for the post (supports hashtags and @mentions)',
                },
            },
            required: ['image_url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_video_post',
        description: 'Create a video or reel post on the Instagram Business Account. Publishes a video from a public URL with an optional caption.',
        inputSchema: {
            type: 'object',
            properties: {
                video_url: {
                    type: 'string',
                    description: 'Public URL of the video to post (must be publicly accessible, MP4 format)',
                },
                caption: {
                    type: 'string',
                    description: 'Caption text for the video post',
                },
                media_type: {
                    type: 'string',
                    enum: ['VIDEO', 'REELS'],
                    description: 'Type of video post: VIDEO for regular video, REELS for a reel (default: REELS)',
                },
            },
            required: ['video_url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_carousel_post',
        description: 'Create a carousel post with multiple images on the Instagram Business Account.',
        inputSchema: {
            type: 'object',
            properties: {
                image_urls: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of public image URLs for the carousel (2-10 images)',
                },
                caption: {
                    type: 'string',
                    description: 'Caption text for the carousel post',
                },
            },
            required: ['image_urls'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_media',
        description: 'Delete a media object (post) from the Instagram Business Account.',
        inputSchema: {
            type: 'object',
            properties: {
                media_id: {
                    type: 'string',
                    description: 'The ID of the media object to delete',
                },
            },
            required: ['media_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 2 — Comments & Engagement (4 tools) ─────────────────────────────

    {
        name: 'get_comments',
        description: 'Get comments on a media object. Returns comment id, text, username, timestamp.',
        inputSchema: {
            type: 'object',
            properties: {
                media_id: {
                    type: 'string',
                    description: 'The ID of the media object to get comments for',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of comments to return (default 20)',
                },
            },
            required: ['media_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'reply_to_comment',
        description: 'Reply to a comment on a media object. Creates a reply comment.',
        inputSchema: {
            type: 'object',
            properties: {
                comment_id: {
                    type: 'string',
                    description: 'The ID of the comment to reply to',
                },
                message: {
                    type: 'string',
                    description: 'The reply text',
                },
            },
            required: ['comment_id', 'message'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_comment',
        description: 'Delete a comment from a media object.',
        inputSchema: {
            type: 'object',
            properties: {
                comment_id: {
                    type: 'string',
                    description: 'The ID of the comment to delete',
                },
            },
            required: ['comment_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_media_insights',
        description: 'Get engagement metrics for a post: impressions, reach, likes, comments, saves, shares.',
        inputSchema: {
            type: 'object',
            properties: {
                media_id: {
                    type: 'string',
                    description: 'The ID of the media object to get insights for',
                },
            },
            required: ['media_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Account & Stories (4 tools) ─────────────────────────────────

    {
        name: 'get_account_insights',
        description: 'Get account-level insights for a date range: impressions, reach, follower_count, profile_views, website_clicks.',
        inputSchema: {
            type: 'object',
            properties: {
                since: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format (Unix timestamp also accepted)',
                },
                until: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format (Unix timestamp also accepted)',
                },
                period: {
                    type: 'string',
                    enum: ['day', 'week', 'month', 'days_28'],
                    description: 'Aggregation period (default: day)',
                },
            },
            required: ['since', 'until'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_followers_demographics',
        description: 'Get follower demographics breakdown: age ranges, gender distribution, top cities, top countries.',
        inputSchema: {
            type: 'object',
            properties: {
                breakdown: {
                    type: 'string',
                    enum: ['age', 'city', 'country', 'gender'],
                    description: 'Demographic breakdown type (default: age)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_stories',
        description: 'Get current active stories for the Instagram Business Account. Returns id, media_type, media_url, timestamp.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_story_insights',
        description: 'Get insights for a specific story: impressions, reach, exits, replies, taps_forward, taps_back.',
        inputSchema: {
            type: 'object',
            properties: {
                story_id: {
                    type: 'string',
                    description: 'The ID of the story to get insights for',
                },
            },
            required: ['story_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Hashtags & Discovery (2 tools) ──────────────────────────────

    {
        name: 'search_hashtag',
        description: 'Search for a hashtag ID and get top or recent media for that hashtag.',
        inputSchema: {
            type: 'object',
            properties: {
                hashtag: {
                    type: 'string',
                    description: 'Hashtag to search for (without the # symbol, e.g. "travel")',
                },
                type: {
                    type: 'string',
                    enum: ['top_media', 'recent_media'],
                    description: 'Media type to retrieve: top_media (default) or recent_media',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of media objects to return (default 10)',
                },
            },
            required: ['hashtag'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_hashtag_insights',
        description: 'Get post count and recent media for a hashtag by hashtag ID.',
        inputSchema: {
            type: 'object',
            properties: {
                hashtag_id: {
                    type: 'string',
                    description: 'The hashtag ID (obtained from search_hashtag)',
                },
            },
            required: ['hashtag_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ──────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify credentials by fetching the Instagram Business Account name and ID. Returns {ok: true, account_id, name} on success.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    accountId: string,
): Promise<unknown> {
    switch (name) {
        // ── Media & Posts ────────────────────────────────────────────────────────

        case 'get_media': {
            validateRequired(args, ['media_id']);
            const fields = 'id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count';
            return igFetch(`/${args.media_id}?fields=${fields}`, token);
        }

        case 'list_media': {
            const limit = (args.limit as number) || 12;
            const fields = 'id,caption,media_type,media_url,timestamp,permalink';
            let path = `/${accountId}/media?fields=${fields}&limit=${limit}`;
            if (args.after) path += `&after=${encodeURIComponent(args.after as string)}`;
            return igFetch(path, token);
        }

        case 'create_photo_post': {
            validateRequired(args, ['image_url']);
            // Step 1: Create container
            const containerBody: Record<string, string> = { image_url: args.image_url as string };
            if (args.caption) containerBody.caption = args.caption as string;

            const container = await igFetch(`/${accountId}/media`, token, {
                method: 'POST',
                body: JSON.stringify(containerBody),
            }) as { id: string };

            // Step 2: Publish container
            return igFetch(`/${accountId}/media_publish`, token, {
                method: 'POST',
                body: JSON.stringify({ creation_id: container.id }),
            });
        }

        case 'create_video_post': {
            validateRequired(args, ['video_url']);
            const mediaType = (args.media_type as string) || 'REELS';
            const containerBody: Record<string, string> = {
                video_url: args.video_url as string,
                media_type: mediaType,
            };
            if (args.caption) containerBody.caption = args.caption as string;

            const container = await igFetch(`/${accountId}/media`, token, {
                method: 'POST',
                body: JSON.stringify(containerBody),
            }) as { id: string };

            return igFetch(`/${accountId}/media_publish`, token, {
                method: 'POST',
                body: JSON.stringify({ creation_id: container.id }),
            });
        }

        case 'create_carousel_post': {
            validateRequired(args, ['image_urls']);
            const imageUrls = args.image_urls as string[];
            if (!Array.isArray(imageUrls) || imageUrls.length < 2) {
                throw new Error('image_urls must be an array of at least 2 URLs');
            }

            // Step 1: Create child containers
            const childIds: string[] = [];
            for (const imageUrl of imageUrls) {
                const child = await igFetch(`/${accountId}/media`, token, {
                    method: 'POST',
                    body: JSON.stringify({ image_url: imageUrl, is_carousel_item: 'true' }),
                }) as { id: string };
                childIds.push(child.id);
            }

            // Step 2: Create carousel container
            const carouselBody: Record<string, unknown> = {
                media_type: 'CAROUSEL',
                children: childIds.join(','),
            };
            if (args.caption) carouselBody.caption = args.caption;

            const carousel = await igFetch(`/${accountId}/media`, token, {
                method: 'POST',
                body: JSON.stringify(carouselBody),
            }) as { id: string };

            // Step 3: Publish
            return igFetch(`/${accountId}/media_publish`, token, {
                method: 'POST',
                body: JSON.stringify({ creation_id: carousel.id }),
            });
        }

        case 'delete_media': {
            validateRequired(args, ['media_id']);
            return igFetch(`/${args.media_id}`, token, { method: 'DELETE' });
        }

        // ── Comments & Engagement ────────────────────────────────────────────────

        case 'get_comments': {
            validateRequired(args, ['media_id']);
            const limit = (args.limit as number) || 20;
            const fields = 'id,text,username,timestamp,replies{id,text,username,timestamp}';
            return igFetch(`/${args.media_id}/comments?fields=${fields}&limit=${limit}`, token);
        }

        case 'reply_to_comment': {
            validateRequired(args, ['comment_id', 'message']);
            return igFetch(`/${args.comment_id}/replies`, token, {
                method: 'POST',
                body: JSON.stringify({ message: args.message }),
            });
        }

        case 'delete_comment': {
            validateRequired(args, ['comment_id']);
            return igFetch(`/${args.comment_id}`, token, { method: 'DELETE' });
        }

        case 'get_media_insights': {
            validateRequired(args, ['media_id']);
            const metrics = 'impressions,reach,likes,comments,saved,shares,total_interactions';
            return igFetch(`/${args.media_id}/insights?metric=${metrics}`, token);
        }

        // ── Account & Stories ────────────────────────────────────────────────────

        case 'get_account_insights': {
            validateRequired(args, ['since', 'until']);
            const period = (args.period as string) || 'day';
            const metrics = 'impressions,reach,follower_count,profile_views,website_clicks';
            return igFetch(
                `/${accountId}/insights?metric=${metrics}&period=${period}&since=${args.since}&until=${args.until}`,
                token,
            );
        }

        case 'get_followers_demographics': {
            const breakdown = (args.breakdown as string) || 'age';
            return igFetch(
                `/${accountId}/insights?metric=follower_demographics&period=lifetime&breakdown=${breakdown}`,
                token,
            );
        }

        case 'get_stories': {
            const fields = 'id,media_type,media_url,thumbnail_url,timestamp,permalink';
            return igFetch(`/${accountId}/stories?fields=${fields}`, token);
        }

        case 'get_story_insights': {
            validateRequired(args, ['story_id']);
            const metrics = 'impressions,reach,exits,replies,taps_forward,taps_back';
            return igFetch(`/${args.story_id}/insights?metric=${metrics}`, token);
        }

        // ── Hashtags & Discovery ─────────────────────────────────────────────────

        case 'search_hashtag': {
            validateRequired(args, ['hashtag']);
            const limit = (args.limit as number) || 10;
            const mediaType = (args.type as string) || 'top_media';

            // Get hashtag ID first
            const searchRes = await igFetch(
                `/ig_hashtag_search?user_id=${accountId}&q=${encodeURIComponent(args.hashtag as string)}`,
                token,
            ) as { data: Array<{ id: string }> };

            if (!searchRes.data || searchRes.data.length === 0) {
                return { data: [], hashtag: args.hashtag, message: 'No hashtag found' };
            }

            const hashtagId = searchRes.data[0].id;
            const fields = 'id,caption,media_type,media_url,permalink,timestamp';
            const mediaRes = await igFetch(
                `/${hashtagId}/${mediaType}?user_id=${accountId}&fields=${fields}&limit=${limit}`,
                token,
            );

            return { hashtag_id: hashtagId, hashtag: args.hashtag, [mediaType]: mediaRes };
        }

        case 'get_hashtag_insights': {
            validateRequired(args, ['hashtag_id']);
            const fields = 'id,name';
            const hashtagInfo = await igFetch(`/${args.hashtag_id}?fields=${fields}`, token);
            const recentMedia = await igFetch(
                `/${args.hashtag_id}/recent_media?user_id=${accountId}&fields=id,caption,media_type,permalink,timestamp&limit=25`,
                token,
            );
            return { hashtag_info: hashtagInfo, recent_media: recentMedia };
        }

        // ── _ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            const res = await igFetch(`/${accountId}?fields=id,name,username`, token) as {
                id: string;
                name?: string;
                username?: string;
            };
            return { ok: true, account_id: res.id, name: res.name || res.username || '' };
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
                JSON.stringify({ status: 'ok', server: 'mcp-instagram', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-instagram', version: '1.0.0' },
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
            const { token, accountId } = getSecrets(request);
            if (!token || !accountId) {
                const missing = [];
                if (!token) missing.push('INSTAGRAM_ACCESS_TOKEN (header: X-Mcp-Secret-INSTAGRAM-ACCESS-TOKEN)');
                if (!accountId) missing.push('INSTAGRAM_BUSINESS_ACCOUNT_ID (header: X-Mcp-Secret-INSTAGRAM-BUSINESS-ACCOUNT-ID)');
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                const result = await callTool(toolName, args, token, accountId);
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
