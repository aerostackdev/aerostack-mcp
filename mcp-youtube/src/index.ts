/**
 * YouTube MCP Worker
 * Implements MCP protocol over HTTP for YouTube Data API v3 operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   YOUTUBE_API_KEY          → X-Mcp-Secret-YOUTUBE-API-KEY          (API key for read operations)
 *   YOUTUBE_ACCESS_TOKEN     → X-Mcp-Secret-YOUTUBE-ACCESS-TOKEN     (OAuth token for write operations)
 *
 * Auth format: API key appended as ?key= query param (reads); Authorization: Bearer {token} (writes)
 *
 * Covers: Videos (6), Channels (5), Playlists (5), Comments & Analytics (4) = 20 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const YT_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const YT_ANALYTICS_BASE = 'https://youtubeanalytics.googleapis.com/v2';

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

function getSecrets(request: Request): { apiKey: string | null; accessToken: string | null } {
    return {
        apiKey: request.headers.get('X-Mcp-Secret-YOUTUBE-API-KEY'),
        accessToken: request.headers.get('X-Mcp-Secret-YOUTUBE-ACCESS-TOKEN'),
    };
}

async function ytFetch(
    path: string,
    apiKey: string | null,
    accessToken: string | null,
    options: RequestInit = {},
): Promise<unknown> {
    const separator = path.includes('?') ? '&' : '?';
    const url = (path.startsWith('http') ? path : `${YT_BASE_URL}${path}`) +
        (apiKey ? `${separator}key=${encodeURIComponent(apiKey)}` : '');

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `YouTube HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'error' in data) {
            const errObj = (data as { error: { message?: string; errors?: Array<{ message: string }> } }).error;
            msg = errObj.message || (errObj.errors?.[0]?.message) || msg;
        }
        throw { code: -32603, message: `YouTube API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Videos (6 tools) ────────────────────────────────────────────

    {
        name: 'search_videos',
        description: 'Search YouTube videos by keyword. Returns video IDs, titles, descriptions, channel info, and thumbnails.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query keywords',
                },
                maxResults: {
                    type: 'number',
                    description: 'Max number of results to return (1-50, default 10)',
                },
                order: {
                    type: 'string',
                    enum: ['relevance', 'date', 'viewCount', 'rating'],
                    description: 'Sort order (default: relevance)',
                },
                videoDuration: {
                    type: 'string',
                    enum: ['short', 'medium', 'long'],
                    description: 'Filter by duration: short (<4 min), medium (4-20 min), long (>20 min)',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_video',
        description: 'Get full details for a video by ID: title, description, duration, viewCount, likeCount, publishedAt, channelId.',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: {
                    type: 'string',
                    description: 'YouTube video ID (11-character string, e.g. dQw4w9WgXcQ)',
                },
            },
            required: ['video_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_channel_videos',
        description: 'List the most recent videos uploaded by a specific channel.',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: {
                    type: 'string',
                    description: 'YouTube channel ID (e.g. UCxxxxxxxxxxxxxxxxxxxxxx)',
                },
                maxResults: {
                    type: 'number',
                    description: 'Max number of results to return (1-50, default 10)',
                },
                order: {
                    type: 'string',
                    enum: ['relevance', 'date', 'viewCount', 'rating'],
                    description: 'Sort order (default: date)',
                },
            },
            required: ['channel_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_video_categories',
        description: 'Get the list of available YouTube video categories for a given region.',
        inputSchema: {
            type: 'object',
            properties: {
                region_code: {
                    type: 'string',
                    description: 'ISO 3166-1 alpha-2 region code (e.g. US, GB, IN — default: US)',
                },
                hl: {
                    type: 'string',
                    description: 'Language for category titles (BCP-47, e.g. en, fr — default: en)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'rate_video',
        description: 'Like, dislike, or remove rating from a video. Requires OAuth access token.',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: {
                    type: 'string',
                    description: 'YouTube video ID to rate',
                },
                rating: {
                    type: 'string',
                    enum: ['like', 'dislike', 'none'],
                    description: 'Rating to apply: like, dislike, or none (removes existing rating)',
                },
            },
            required: ['video_id', 'rating'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_video_captions',
        description: 'List available captions/subtitle tracks for a video (language, name, trackKind).',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: {
                    type: 'string',
                    description: 'YouTube video ID',
                },
            },
            required: ['video_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Channels (5 tools) ──────────────────────────────────────────

    {
        name: 'get_channel',
        description: 'Get channel details by channel ID: title, description, subscriberCount, videoCount, viewCount, thumbnails.',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: {
                    type: 'string',
                    description: 'YouTube channel ID (e.g. UCxxxxxxxxxxxxxxxxxxxxxx)',
                },
            },
            required: ['channel_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_channels',
        description: 'Search YouTube channels by keyword. Returns channel ID, title, description, and thumbnails.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query for channel names or topics',
                },
                maxResults: {
                    type: 'number',
                    description: 'Max number of channels to return (1-50, default 10)',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_my_channel',
        description: 'Get the authenticated user\'s own channel stats: title, subscriberCount, videoCount, viewCount. Requires OAuth.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_channel_sections',
        description: 'Get the featured sections on a channel page (playlists, subscriptions, liked videos, etc.).',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: {
                    type: 'string',
                    description: 'YouTube channel ID',
                },
            },
            required: ['channel_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'subscribe_to_channel',
        description: 'Subscribe the authenticated user to a channel. Requires OAuth access token.',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: {
                    type: 'string',
                    description: 'YouTube channel ID to subscribe to',
                },
            },
            required: ['channel_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 3 — Playlists (5 tools) ─────────────────────────────────────────

    {
        name: 'list_playlists',
        description: 'List playlists for a channel or the authenticated user. Returns id, title, description, itemCount, publishedAt.',
        inputSchema: {
            type: 'object',
            properties: {
                channel_id: {
                    type: 'string',
                    description: 'YouTube channel ID. Omit to list the authenticated user\'s playlists.',
                },
                maxResults: {
                    type: 'number',
                    description: 'Max number of playlists to return (1-50, default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_playlist',
        description: 'Get playlist details by ID: title, description, itemCount, publishedAt, thumbnails, privacyStatus.',
        inputSchema: {
            type: 'object',
            properties: {
                playlist_id: {
                    type: 'string',
                    description: 'YouTube playlist ID',
                },
            },
            required: ['playlist_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_playlist',
        description: 'Create a new YouTube playlist. Requires OAuth access token.',
        inputSchema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Playlist title (required)',
                },
                description: {
                    type: 'string',
                    description: 'Playlist description',
                },
                privacyStatus: {
                    type: 'string',
                    enum: ['public', 'private', 'unlisted'],
                    description: 'Playlist visibility (default: public)',
                },
            },
            required: ['title'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_playlist',
        description: 'Update a playlist\'s title, description, or privacy status. Requires OAuth access token.',
        inputSchema: {
            type: 'object',
            properties: {
                playlist_id: {
                    type: 'string',
                    description: 'YouTube playlist ID to update',
                },
                title: {
                    type: 'string',
                    description: 'New playlist title',
                },
                description: {
                    type: 'string',
                    description: 'New playlist description',
                },
                privacyStatus: {
                    type: 'string',
                    enum: ['public', 'private', 'unlisted'],
                    description: 'New privacy status',
                },
            },
            required: ['playlist_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_playlist',
        description: 'Delete a YouTube playlist by ID. Requires OAuth access token.',
        inputSchema: {
            type: 'object',
            properties: {
                playlist_id: {
                    type: 'string',
                    description: 'YouTube playlist ID to delete',
                },
            },
            required: ['playlist_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 4 — Comments & Analytics (4 tools) ──────────────────────────────

    {
        name: 'list_comments',
        description: 'Get top-level comments for a YouTube video, sorted by time or relevance.',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: {
                    type: 'string',
                    description: 'YouTube video ID to fetch comments for',
                },
                maxResults: {
                    type: 'number',
                    description: 'Max number of comment threads to return (1-100, default 20)',
                },
                order: {
                    type: 'string',
                    enum: ['time', 'relevance'],
                    description: 'Sort order for comments (default: relevance)',
                },
            },
            required: ['video_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'reply_to_comment',
        description: 'Post a reply to an existing top-level comment. Requires OAuth access token.',
        inputSchema: {
            type: 'object',
            properties: {
                parent_id: {
                    type: 'string',
                    description: 'ID of the top-level comment thread to reply to',
                },
                text: {
                    type: 'string',
                    description: 'Text content of the reply',
                },
            },
            required: ['parent_id', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_video_analytics',
        description: 'Get analytics for a specific video owned by the authenticated user: views, watchTime, likes, subscribersGained by date range. Requires OAuth.',
        inputSchema: {
            type: 'object',
            properties: {
                video_id: {
                    type: 'string',
                    description: 'YouTube video ID to get analytics for',
                },
                start_date: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format (default: 30 days ago)',
                },
                end_date: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format (default: today)',
                },
            },
            required: ['video_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_channel_analytics',
        description: 'Get channel-level analytics: views, estimatedMinutesWatched, subscribersGained, subscribersLost, estimatedRevenue by date range. Requires OAuth.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format (default: 30 days ago)',
                },
                end_date: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format (default: today)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ──────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify credentials by calling a cheap read endpoint. Returns channel list for authenticated user.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Utility: date helpers ──────────────────────────────────────────────────────

function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
}

function today(): string {
    return new Date().toISOString().split('T')[0];
}

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string | null,
    accessToken: string | null,
): Promise<unknown> {
    switch (name) {
        // ── Videos ──────────────────────────────────────────────────────────────

        case 'search_videos': {
            validateRequired(args, ['query']);
            const params = new URLSearchParams({
                part: 'snippet',
                q: args.query as string,
                type: 'video',
                maxResults: String((args.maxResults as number) || 10),
                order: (args.order as string) || 'relevance',
            });
            if (args.videoDuration) params.set('videoDuration', args.videoDuration as string);
            return ytFetch(`/search?${params}`, apiKey, accessToken);
        }

        case 'get_video': {
            validateRequired(args, ['video_id']);
            const params = new URLSearchParams({
                part: 'snippet,contentDetails,statistics',
                id: args.video_id as string,
            });
            return ytFetch(`/videos?${params}`, apiKey, accessToken);
        }

        case 'list_channel_videos': {
            validateRequired(args, ['channel_id']);
            const params = new URLSearchParams({
                part: 'snippet',
                channelId: args.channel_id as string,
                type: 'video',
                maxResults: String((args.maxResults as number) || 10),
                order: (args.order as string) || 'date',
            });
            return ytFetch(`/search?${params}`, apiKey, accessToken);
        }

        case 'get_video_categories': {
            const params = new URLSearchParams({
                part: 'snippet',
                regionCode: (args.region_code as string) || 'US',
                hl: (args.hl as string) || 'en',
            });
            return ytFetch(`/videoCategories?${params}`, apiKey, accessToken);
        }

        case 'rate_video': {
            validateRequired(args, ['video_id', 'rating']);
            if (!accessToken) throw new Error('rate_video requires YOUTUBE_ACCESS_TOKEN (OAuth)');
            const params = new URLSearchParams({
                id: args.video_id as string,
                rating: args.rating as string,
            });
            return ytFetch(`/videos/rate?${params}`, null, accessToken, { method: 'POST' });
        }

        case 'get_video_captions': {
            validateRequired(args, ['video_id']);
            const params = new URLSearchParams({
                part: 'snippet',
                videoId: args.video_id as string,
            });
            return ytFetch(`/captions?${params}`, apiKey, accessToken);
        }

        // ── Channels ────────────────────────────────────────────────────────────

        case 'get_channel': {
            validateRequired(args, ['channel_id']);
            const params = new URLSearchParams({
                part: 'snippet,statistics,brandingSettings',
                id: args.channel_id as string,
            });
            return ytFetch(`/channels?${params}`, apiKey, accessToken);
        }

        case 'search_channels': {
            validateRequired(args, ['query']);
            const params = new URLSearchParams({
                part: 'snippet',
                q: args.query as string,
                type: 'channel',
                maxResults: String((args.maxResults as number) || 10),
            });
            return ytFetch(`/search?${params}`, apiKey, accessToken);
        }

        case 'get_my_channel': {
            if (!accessToken) throw new Error('get_my_channel requires YOUTUBE_ACCESS_TOKEN (OAuth)');
            const params = new URLSearchParams({
                part: 'snippet,statistics',
                mine: 'true',
            });
            return ytFetch(`/channels?${params}`, null, accessToken);
        }

        case 'get_channel_sections': {
            validateRequired(args, ['channel_id']);
            const params = new URLSearchParams({
                part: 'snippet,contentDetails',
                channelId: args.channel_id as string,
            });
            return ytFetch(`/channelSections?${params}`, apiKey, accessToken);
        }

        case 'subscribe_to_channel': {
            validateRequired(args, ['channel_id']);
            if (!accessToken) throw new Error('subscribe_to_channel requires YOUTUBE_ACCESS_TOKEN (OAuth)');
            return ytFetch('/subscriptions?part=snippet', null, accessToken, {
                method: 'POST',
                body: JSON.stringify({
                    snippet: {
                        resourceId: {
                            kind: 'youtube#channel',
                            channelId: args.channel_id,
                        },
                    },
                }),
            });
        }

        // ── Playlists ────────────────────────────────────────────────────────────

        case 'list_playlists': {
            const params = new URLSearchParams({
                part: 'snippet,contentDetails',
                maxResults: String((args.maxResults as number) || 20),
            });
            if (args.channel_id) {
                params.set('channelId', args.channel_id as string);
            } else {
                if (!accessToken) throw new Error('list_playlists without channel_id requires YOUTUBE_ACCESS_TOKEN (OAuth)');
                params.set('mine', 'true');
            }
            return ytFetch(`/playlists?${params}`, apiKey, accessToken);
        }

        case 'get_playlist': {
            validateRequired(args, ['playlist_id']);
            const params = new URLSearchParams({
                part: 'snippet,contentDetails,status',
                id: args.playlist_id as string,
            });
            return ytFetch(`/playlists?${params}`, apiKey, accessToken);
        }

        case 'create_playlist': {
            validateRequired(args, ['title']);
            if (!accessToken) throw new Error('create_playlist requires YOUTUBE_ACCESS_TOKEN (OAuth)');
            return ytFetch('/playlists?part=snippet,status', null, accessToken, {
                method: 'POST',
                body: JSON.stringify({
                    snippet: {
                        title: args.title,
                        description: args.description || '',
                    },
                    status: {
                        privacyStatus: (args.privacyStatus as string) || 'public',
                    },
                }),
            });
        }

        case 'update_playlist': {
            validateRequired(args, ['playlist_id']);
            if (!accessToken) throw new Error('update_playlist requires YOUTUBE_ACCESS_TOKEN (OAuth)');
            const body: Record<string, unknown> = {
                id: args.playlist_id,
                snippet: {},
                status: {},
            };
            if (args.title !== undefined) (body.snippet as Record<string, unknown>).title = args.title;
            if (args.description !== undefined) (body.snippet as Record<string, unknown>).description = args.description;
            if (args.privacyStatus !== undefined) (body.status as Record<string, unknown>).privacyStatus = args.privacyStatus;
            return ytFetch('/playlists?part=snippet,status', null, accessToken, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'delete_playlist': {
            validateRequired(args, ['playlist_id']);
            if (!accessToken) throw new Error('delete_playlist requires YOUTUBE_ACCESS_TOKEN (OAuth)');
            const params = new URLSearchParams({ id: args.playlist_id as string });
            return ytFetch(`/playlists?${params}`, null, accessToken, { method: 'DELETE' });
        }

        // ── Comments & Analytics ─────────────────────────────────────────────────

        case 'list_comments': {
            validateRequired(args, ['video_id']);
            const params = new URLSearchParams({
                part: 'snippet',
                videoId: args.video_id as string,
                maxResults: String((args.maxResults as number) || 20),
                order: (args.order as string) || 'relevance',
                textFormat: 'plainText',
            });
            return ytFetch(`/commentThreads?${params}`, apiKey, accessToken);
        }

        case 'reply_to_comment': {
            validateRequired(args, ['parent_id', 'text']);
            if (!accessToken) throw new Error('reply_to_comment requires YOUTUBE_ACCESS_TOKEN (OAuth)');
            return ytFetch('/comments?part=snippet', null, accessToken, {
                method: 'POST',
                body: JSON.stringify({
                    snippet: {
                        parentId: args.parent_id,
                        textOriginal: args.text,
                    },
                }),
            });
        }

        case 'get_video_analytics': {
            validateRequired(args, ['video_id']);
            if (!accessToken) throw new Error('get_video_analytics requires YOUTUBE_ACCESS_TOKEN (OAuth)');
            const startDate = (args.start_date as string) || daysAgo(30);
            const endDate = (args.end_date as string) || today();
            const params = new URLSearchParams({
                ids: 'channel==MINE',
                startDate,
                endDate,
                metrics: 'views,estimatedMinutesWatched,likes,dislikes,subscribersGained,subscribersLost',
                filters: `video==${args.video_id}`,
                dimensions: 'day',
            });
            return ytFetch(`${YT_ANALYTICS_BASE}/reports?${params}`, null, accessToken);
        }

        case 'get_channel_analytics': {
            if (!accessToken) throw new Error('get_channel_analytics requires YOUTUBE_ACCESS_TOKEN (OAuth)');
            const startDate = (args.start_date as string) || daysAgo(30);
            const endDate = (args.end_date as string) || today();
            const params = new URLSearchParams({
                ids: 'channel==MINE',
                startDate,
                endDate,
                metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost,estimatedRevenue',
                dimensions: 'day',
            });
            return ytFetch(`${YT_ANALYTICS_BASE}/reports?${params}`, null, accessToken);
        }

        case '_ping': {
            if (!apiKey && !accessToken) {
                throw new Error('At least one of YOUTUBE_API_KEY or YOUTUBE_ACCESS_TOKEN is required');
            }
            if (accessToken) {
                const params = new URLSearchParams({ part: 'snippet,statistics', mine: 'true' });
                return ytFetch(`/channels?${params}`, null, accessToken);
            }
            // API key ping: fetch video categories as a cheap public call
            const params = new URLSearchParams({ part: 'snippet', regionCode: 'US', hl: 'en' });
            return ytFetch(`/videoCategories?${params}`, apiKey, null);
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
                JSON.stringify({ status: 'ok', server: 'mcp-youtube', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-youtube', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            // Validate secrets — at least one must be present
            const { apiKey, accessToken } = getSecrets(request);
            if (!apiKey && !accessToken) {
                return rpcErr(id, -32001, 'Missing required secrets: YOUTUBE_API_KEY (header: X-Mcp-Secret-YOUTUBE-API-KEY) or YOUTUBE_ACCESS_TOKEN (header: X-Mcp-Secret-YOUTUBE-ACCESS-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, apiKey, accessToken);
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
