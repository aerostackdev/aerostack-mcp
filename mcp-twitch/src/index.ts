/**
 * Twitch MCP Worker
 * Implements MCP protocol over HTTP for Twitch Helix API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: TWITCH_CLIENT_ID → header: X-Mcp-Secret-TWITCH-CLIENT-ID
 * Secret: TWITCH_CLIENT_SECRET → header: X-Mcp-Secret-TWITCH-CLIENT-SECRET
 *
 * Architecture: Twitch Helix API with OAuth2 client credentials (app access token).
 * Token is fetched on demand and cached per-request.
 */

const HELIX_API = 'https://api.twitch.tv/helix';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

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
        description: 'Verify Twitch credentials by requesting an app access token. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {} },
    },

    // ── Group A: Channels & Search ──────────────────────────────────────────
    {
        name: 'search_channels',
        description: 'Search for Twitch channels by query string. Returns matching channels with broadcaster info, game, language, and live status.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query (channel name or description keyword)' },
                live_only: { type: 'boolean', description: 'Filter to only currently live channels (default false)' },
                first: { type: 'number', description: 'Number of results to return (1-100, default 20)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_channel_info',
        description: 'Get detailed channel information for one or more broadcasters by their user ID',
        inputSchema: {
            type: 'object',
            properties: {
                broadcaster_id: { type: 'string', description: 'Twitch user ID of the broadcaster (numeric, e.g. "141981764")' },
            },
            required: ['broadcaster_id'],
        },
    },

    // ── Group B: Streams ────────────────────────────────────────────────────
    {
        name: 'get_streams',
        description: 'Get currently live streams. Filter by game, language, or specific user IDs.',
        inputSchema: {
            type: 'object',
            properties: {
                game_id: { type: 'string', description: 'Filter by game/category ID (get from search_categories or get_top_games)' },
                user_id: { type: 'string', description: 'Filter by broadcaster user ID' },
                user_login: { type: 'string', description: 'Filter by broadcaster login name (e.g. "shroud")' },
                language: { type: 'string', description: 'Filter by stream language (ISO 639-1 code, e.g. "en", "es", "ja")' },
                first: { type: 'number', description: 'Number of results to return (1-100, default 20)' },
                after: { type: 'string', description: 'Cursor for forward pagination' },
            },
        },
    },

    // ── Group C: Games & Categories ─────────────────────────────────────────
    {
        name: 'search_categories',
        description: 'Search for Twitch categories/games by name (e.g. "Fortnite", "Just Chatting")',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query for game/category name' },
                first: { type: 'number', description: 'Number of results to return (1-100, default 20)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_top_games',
        description: 'Get the most popular games/categories on Twitch right now, ranked by current viewer count',
        inputSchema: {
            type: 'object',
            properties: {
                first: { type: 'number', description: 'Number of results to return (1-100, default 20)' },
                after: { type: 'string', description: 'Cursor for forward pagination' },
            },
        },
    },

    // ── Group D: Clips ──────────────────────────────────────────────────────
    {
        name: 'get_clips',
        description: 'Get clips for a broadcaster. Optionally filter by date range. Returns most popular clips first.',
        inputSchema: {
            type: 'object',
            properties: {
                broadcaster_id: { type: 'string', description: 'Twitch user ID of the broadcaster' },
                started_at: { type: 'string', description: 'Start of date range (RFC 3339 format, e.g. "2026-01-01T00:00:00Z")' },
                ended_at: { type: 'string', description: 'End of date range (RFC 3339 format, e.g. "2026-01-31T23:59:59Z")' },
                first: { type: 'number', description: 'Number of clips to return (1-100, default 20)' },
                after: { type: 'string', description: 'Cursor for forward pagination' },
            },
            required: ['broadcaster_id'],
        },
    },

    // ── Group E: Videos ─────────────────────────────────────────────────────
    {
        name: 'get_videos',
        description: 'Get VODs, highlights, and uploads for a channel. Sorted by most recent by default.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: { type: 'string', description: 'Twitch user ID of the channel' },
                type: {
                    type: 'string',
                    enum: ['all', 'upload', 'archive', 'highlight'],
                    description: 'Video type filter: "all" (default), "upload", "archive" (VODs), "highlight"',
                },
                sort: {
                    type: 'string',
                    enum: ['time', 'trending', 'views'],
                    description: 'Sort order: "time" (default, newest first), "trending", "views"',
                },
                first: { type: 'number', description: 'Number of videos to return (1-100, default 20)' },
                after: { type: 'string', description: 'Cursor for forward pagination' },
            },
            required: ['user_id'],
        },
    },

    // ── Group F: Schedule ───────────────────────────────────────────────────
    {
        name: 'get_stream_schedule',
        description: 'Get a broadcaster\'s stream schedule including upcoming segments and recurring streams',
        inputSchema: {
            type: 'object',
            properties: {
                broadcaster_id: { type: 'string', description: 'Twitch user ID of the broadcaster' },
                first: { type: 'number', description: 'Number of schedule segments to return (1-25, default 20)' },
                after: { type: 'string', description: 'Cursor for forward pagination' },
            },
            required: ['broadcaster_id'],
        },
    },
];

// ── OAuth2 App Access Token ──────────────────────────────────────────────────

async function getAppAccessToken(clientId: string, clientSecret: string): Promise<string> {
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        if (res.status === 401 || res.status === 403) {
            throw new Error('Invalid Twitch credentials — check TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in your workspace secrets');
        }
        throw new Error(`Failed to get Twitch access token: HTTP ${res.status} — ${text}`);
    }

    const data = (await res.json()) as { access_token: string };
    return data.access_token;
}

// ── Twitch Helix API helper ──────────────────────────────────────────────────

async function helix(
    method: string,
    path: string,
    clientId: string,
    accessToken: string,
): Promise<unknown> {
    const res = await fetch(`${HELIX_API}${path}`, {
        method,
        headers: {
            'Client-ID': clientId,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'AerostackMCP/1.0 (https://aerostack.dev)',
        },
    });

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`Twitch HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        const errMsg = data.message as string | undefined;
        if (res.status === 401) throw new Error('Twitch access token expired or invalid — credentials may be wrong');
        if (res.status === 404) throw new Error(`Not found — ${errMsg ?? 'check broadcaster_id or resource ID'}`);
        if (res.status === 429) throw new Error('Rate limited by Twitch — retry after a moment');
        throw new Error(`Twitch API error ${res.status}: ${errMsg ?? text}`);
    }

    return data;
}

// ── Tool implementations ─────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    clientId: string,
    accessToken: string,
): Promise<unknown> {
    switch (name) {

        case '_ping': {
            // Token was already obtained — if we got here, credentials are valid
            return { content: [{ type: 'text', text: `Twitch credentials valid. App access token obtained for client "${clientId}".` }] };
        }

        // ── Channels & Search ───────────────────────────────────────────────

        case 'search_channels': {
            const params = new URLSearchParams({ query: String(args.query) });
            if (args.live_only === true) params.set('live_only', 'true');
            params.set('first', String(Math.min(Number(args.first ?? 20), 100)));
            const data = (await helix('GET', `/search/channels?${params}`, clientId, accessToken)) as any;
            return (data.data ?? []).map((ch: any) => ({
                id: ch.id,
                broadcaster_login: ch.broadcaster_login,
                display_name: ch.display_name,
                game_id: ch.game_id,
                game_name: ch.game_name,
                is_live: ch.is_live,
                title: ch.title,
                started_at: ch.started_at || null,
                broadcaster_language: ch.broadcaster_language,
                thumbnail_url: ch.thumbnail_url,
                tags: ch.tags ?? [],
            }));
        }

        case 'get_channel_info': {
            const data = (await helix('GET', `/channels?broadcaster_id=${args.broadcaster_id}`, clientId, accessToken)) as any;
            const channels = data.data ?? [];
            if (channels.length === 0) throw new Error(`No channel found for broadcaster_id ${args.broadcaster_id}`);
            const ch = channels[0];
            return {
                broadcaster_id: ch.broadcaster_id,
                broadcaster_login: ch.broadcaster_login,
                broadcaster_name: ch.broadcaster_name,
                broadcaster_language: ch.broadcaster_language,
                game_id: ch.game_id,
                game_name: ch.game_name,
                title: ch.title,
                delay: ch.delay,
                tags: ch.tags ?? [],
                content_classification_labels: ch.content_classification_labels ?? [],
                is_branded_content: ch.is_branded_content ?? false,
            };
        }

        // ── Streams ─────────────────────────────────────────────────────────

        case 'get_streams': {
            const params = new URLSearchParams();
            if (args.game_id) params.set('game_id', String(args.game_id));
            if (args.user_id) params.set('user_id', String(args.user_id));
            if (args.user_login) params.set('user_login', String(args.user_login));
            if (args.language) params.set('language', String(args.language));
            if (args.after) params.set('after', String(args.after));
            params.set('first', String(Math.min(Number(args.first ?? 20), 100)));
            const data = (await helix('GET', `/streams?${params}`, clientId, accessToken)) as any;
            return {
                streams: (data.data ?? []).map((s: any) => ({
                    id: s.id,
                    user_id: s.user_id,
                    user_login: s.user_login,
                    user_name: s.user_name,
                    game_id: s.game_id,
                    game_name: s.game_name,
                    type: s.type,
                    title: s.title,
                    viewer_count: s.viewer_count,
                    started_at: s.started_at,
                    language: s.language,
                    thumbnail_url: s.thumbnail_url
                        ? s.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
                        : null,
                    tags: s.tags ?? [],
                    is_mature: s.is_mature ?? false,
                })),
                cursor: data.pagination?.cursor ?? null,
            };
        }

        // ── Games & Categories ──────────────────────────────────────────────

        case 'search_categories': {
            const params = new URLSearchParams({ query: String(args.query) });
            params.set('first', String(Math.min(Number(args.first ?? 20), 100)));
            const data = (await helix('GET', `/search/categories?${params}`, clientId, accessToken)) as any;
            return (data.data ?? []).map((g: any) => ({
                id: g.id,
                name: g.name,
                box_art_url: g.box_art_url
                    ? g.box_art_url.replace('{width}', '144').replace('{height}', '192')
                    : null,
            }));
        }

        case 'get_top_games': {
            const params = new URLSearchParams();
            params.set('first', String(Math.min(Number(args.first ?? 20), 100)));
            if (args.after) params.set('after', String(args.after));
            const data = (await helix('GET', `/games/top?${params}`, clientId, accessToken)) as any;
            return {
                games: (data.data ?? []).map((g: any) => ({
                    id: g.id,
                    name: g.name,
                    box_art_url: g.box_art_url
                        ? g.box_art_url.replace('{width}', '144').replace('{height}', '192')
                        : null,
                })),
                cursor: data.pagination?.cursor ?? null,
            };
        }

        // ── Clips ───────────────────────────────────────────────────────────

        case 'get_clips': {
            const params = new URLSearchParams({ broadcaster_id: String(args.broadcaster_id) });
            if (args.started_at) params.set('started_at', String(args.started_at));
            if (args.ended_at) params.set('ended_at', String(args.ended_at));
            if (args.after) params.set('after', String(args.after));
            params.set('first', String(Math.min(Number(args.first ?? 20), 100)));
            const data = (await helix('GET', `/clips?${params}`, clientId, accessToken)) as any;
            return {
                clips: (data.data ?? []).map((c: any) => ({
                    id: c.id,
                    url: c.url,
                    embed_url: c.embed_url,
                    broadcaster_id: c.broadcaster_id,
                    broadcaster_name: c.broadcaster_name,
                    creator_id: c.creator_id,
                    creator_name: c.creator_name,
                    game_id: c.game_id,
                    language: c.language,
                    title: c.title,
                    view_count: c.view_count,
                    created_at: c.created_at,
                    thumbnail_url: c.thumbnail_url,
                    duration: c.duration,
                    vod_offset: c.vod_offset ?? null,
                })),
                cursor: data.pagination?.cursor ?? null,
            };
        }

        // ── Videos ──────────────────────────────────────────────────────────

        case 'get_videos': {
            const params = new URLSearchParams({ user_id: String(args.user_id) });
            if (args.type && args.type !== 'all') params.set('type', String(args.type));
            if (args.sort) params.set('sort', String(args.sort));
            if (args.after) params.set('after', String(args.after));
            params.set('first', String(Math.min(Number(args.first ?? 20), 100)));
            const data = (await helix('GET', `/videos?${params}`, clientId, accessToken)) as any;
            return {
                videos: (data.data ?? []).map((v: any) => ({
                    id: v.id,
                    stream_id: v.stream_id ?? null,
                    user_id: v.user_id,
                    user_login: v.user_login,
                    user_name: v.user_name,
                    title: v.title,
                    description: v.description,
                    created_at: v.created_at,
                    published_at: v.published_at,
                    url: v.url,
                    thumbnail_url: v.thumbnail_url
                        ? v.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180')
                        : null,
                    viewable: v.viewable,
                    view_count: v.view_count,
                    language: v.language,
                    type: v.type,
                    duration: v.duration,
                })),
                cursor: data.pagination?.cursor ?? null,
            };
        }

        // ── Schedule ────────────────────────────────────────────────────────

        case 'get_stream_schedule': {
            const params = new URLSearchParams({ broadcaster_id: String(args.broadcaster_id) });
            params.set('first', String(Math.min(Number(args.first ?? 20), 25)));
            if (args.after) params.set('after', String(args.after));

            try {
                const data = (await helix('GET', `/schedule?${params}`, clientId, accessToken)) as any;
                const schedule = data.data;
                if (!schedule) return { segments: [], vacation: null, broadcaster_id: args.broadcaster_id };

                return {
                    broadcaster_id: schedule.broadcaster_id,
                    broadcaster_login: schedule.broadcaster_login,
                    broadcaster_name: schedule.broadcaster_name,
                    vacation: schedule.vacation
                        ? { start_time: schedule.vacation.start_time, end_time: schedule.vacation.end_time }
                        : null,
                    segments: (schedule.segments ?? []).map((seg: any) => ({
                        id: seg.id,
                        start_time: seg.start_time,
                        end_time: seg.end_time,
                        title: seg.title,
                        canceled_until: seg.canceled_until ?? null,
                        category: seg.category
                            ? { id: seg.category.id, name: seg.category.name }
                            : null,
                        is_recurring: seg.is_recurring ?? false,
                    })),
                    cursor: data.pagination?.cursor ?? null,
                };
            } catch (e: unknown) {
                // Twitch returns 404 if broadcaster has no schedule set
                const msg = e instanceof Error ? e.message : '';
                if (msg.includes('Not found')) {
                    return { segments: [], vacation: null, broadcaster_id: args.broadcaster_id, note: 'This broadcaster has no schedule configured.' };
                }
                throw e;
            }
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker entry ─────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-twitch', version: '1.0.0', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-twitch', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const clientId = request.headers.get('X-Mcp-Secret-TWITCH-CLIENT-ID');
            const clientSecret = request.headers.get('X-Mcp-Secret-TWITCH-CLIENT-SECRET');
            if (!clientId || !clientSecret) {
                return rpcErr(id, -32001, 'Missing Twitch credentials — add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to workspace secrets');
            }

            try {
                // Get app access token via client credentials flow
                const accessToken = await getAppAccessToken(clientId, clientSecret);
                const result = await callTool(toolName, toolArgs, clientId, accessToken);
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
