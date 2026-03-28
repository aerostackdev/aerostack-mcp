/**
 * Twitter/X MCP Worker
 * Implements MCP protocol over HTTP for Twitter/X API v2 operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   TWITTER_BEARER_TOKEN   → X-Mcp-Secret-TWITTER-BEARER-TOKEN  (App-only auth for read operations)
 *   TWITTER_ACCESS_TOKEN   → X-Mcp-Secret-TWITTER-ACCESS-TOKEN  (OAuth 2.0 user token for write operations)
 *
 * Auth format: Authorization: Bearer {token}
 *   - Read tools (search, get, metrics): use BEARER_TOKEN
 *   - Write tools (create, delete, like, retweet, bookmark): use ACCESS_TOKEN
 *
 * Covers: Tweets (6), Users (5), Lists & Search (4), Spaces & Misc (3) = 18 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const TWITTER_BASE_URL = 'https://api.twitter.com';
const TWITTER_API_VERSION = '/2';

function twitterApiUrl(path: string): string {
    return `${TWITTER_BASE_URL}${TWITTER_API_VERSION}${path}`;
}

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

function getSecrets(request: Request): { bearerToken: string | null; accessToken: string | null } {
    return {
        bearerToken: request.headers.get('X-Mcp-Secret-TWITTER-BEARER-TOKEN'),
        accessToken: request.headers.get('X-Mcp-Secret-TWITTER-ACCESS-TOKEN'),
    };
}

async function twitterFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : twitterApiUrl(path);
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
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
        throw { code: -32603, message: `Twitter HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object') {
            const d = data as { detail?: string; title?: string; errors?: Array<{ message?: string }> };
            msg = d.detail || d.title || (d.errors && d.errors[0]?.message) || msg;
        }
        throw { code: -32603, message: `Twitter API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Tweets (6 tools) ────────────────────────────────────────────

    {
        name: 'get_tweet',
        description: 'Get a tweet by ID. Returns full tweet object including text, author, creation time, and public metrics (likes, retweets, replies, impressions).',
        inputSchema: {
            type: 'object',
            properties: {
                tweet_id: {
                    type: 'string',
                    description: 'The unique numeric ID of the tweet (e.g. "1234567890123456789")',
                },
            },
            required: ['tweet_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_tweets',
        description: 'Search recent tweets (last 7 days) matching a query string. Supports Twitter search operators (from:, to:, #hashtag, "exact phrase", -excluded). Returns tweet text, author, and metrics.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Twitter search query. Supports operators: from:username, to:username, #hashtag, "exact phrase", -word. Example: "aerostack lang:en -is:retweet"',
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum number of results to return (10–100, default 10)',
                },
                next_token: {
                    type: 'string',
                    description: 'Pagination token from a previous search response to fetch the next page',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_tweet',
        description: 'Post a new tweet. Requires TWITTER_ACCESS_TOKEN (user OAuth token). Optionally reply to an existing tweet.',
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text content of the tweet (max 280 characters)',
                },
                reply_to_id: {
                    type: 'string',
                    description: 'Tweet ID to reply to. When set, this tweet is posted as a reply.',
                },
            },
            required: ['text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_tweet',
        description: 'Delete a tweet by ID. Requires TWITTER_ACCESS_TOKEN. You can only delete tweets that belong to the authenticated user.',
        inputSchema: {
            type: 'object',
            properties: {
                tweet_id: {
                    type: 'string',
                    description: 'The unique numeric ID of the tweet to delete',
                },
            },
            required: ['tweet_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'like_tweet',
        description: 'Like a tweet on behalf of the authenticated user. Requires TWITTER_ACCESS_TOKEN and the authenticated user ID.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'The numeric user ID of the authenticated user performing the like action',
                },
                tweet_id: {
                    type: 'string',
                    description: 'The numeric tweet ID to like',
                },
            },
            required: ['user_id', 'tweet_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'retweet',
        description: 'Retweet a tweet on behalf of the authenticated user. Requires TWITTER_ACCESS_TOKEN and the authenticated user ID.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'The numeric user ID of the authenticated user performing the retweet',
                },
                tweet_id: {
                    type: 'string',
                    description: 'The numeric tweet ID to retweet',
                },
            },
            required: ['user_id', 'tweet_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 2 — Users (5 tools) ─────────────────────────────────────────────

    {
        name: 'get_user_by_username',
        description: 'Get a user profile by @username. Returns user ID, name, username, bio, location, follower count, following count, tweet count, and profile image URL.',
        inputSchema: {
            type: 'object',
            properties: {
                username: {
                    type: 'string',
                    description: 'Twitter username without the @ symbol (e.g. "elonmusk")',
                },
            },
            required: ['username'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user_by_id',
        description: 'Get a user profile by their numeric user ID. Returns the same fields as get_user_by_username.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'Numeric Twitter user ID (e.g. "12345678")',
                },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user_tweets',
        description: 'Get recent tweets posted by a specific user. Returns tweet text, ID, creation time, and metrics. Supports pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'Numeric Twitter user ID of the user whose tweets to retrieve',
                },
                max_results: {
                    type: 'number',
                    description: 'Number of tweets to return (5–100, default 10)',
                },
                pagination_token: {
                    type: 'string',
                    description: 'Pagination token from previous response to fetch next page',
                },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user_followers',
        description: 'Get a list of users who follow a specified Twitter user. Returns user IDs, names, and usernames.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'Numeric Twitter user ID whose followers to retrieve',
                },
                max_results: {
                    type: 'number',
                    description: 'Number of followers to return (1–1000, default 100)',
                },
                pagination_token: {
                    type: 'string',
                    description: 'Pagination token from previous response to fetch next page',
                },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user_following',
        description: 'Get a list of accounts that a specified Twitter user follows. Returns user IDs, names, and usernames.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'Numeric Twitter user ID whose following list to retrieve',
                },
                max_results: {
                    type: 'number',
                    description: 'Number of following accounts to return (1–1000, default 100)',
                },
                pagination_token: {
                    type: 'string',
                    description: 'Pagination token from previous response to fetch next page',
                },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Lists & Search (4 tools) ───────────────────────────────────

    {
        name: 'search_users',
        description: 'Search for Twitter users by name or username keyword. Returns a list of matching user profiles.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search term to find users by name or username (e.g. "aerostack developer")',
                },
                max_results: {
                    type: 'number',
                    description: 'Maximum number of results to return (1–100, default 10)',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_trending_topics',
        description: 'Get current trending topics for a given WOEID (Where On Earth ID). Defaults to worldwide trending (WOEID 1). Use WOEID 23424977 for USA, 44418 for London.',
        inputSchema: {
            type: 'object',
            properties: {
                woeid: {
                    type: 'number',
                    description: 'Where On Earth ID (WOEID) for the location. Defaults to 1 (worldwide). Examples: 1=worldwide, 23424977=USA, 44418=London, 615702=San Francisco',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_tweet_metrics',
        description: 'Get detailed engagement metrics for a tweet: impressions, likes, retweets, replies, quotes, bookmarks, and video views (if applicable). Requires TWITTER_ACCESS_TOKEN for non-public metrics.',
        inputSchema: {
            type: 'object',
            properties: {
                tweet_id: {
                    type: 'string',
                    description: 'The numeric ID of the tweet to get metrics for',
                },
            },
            required: ['tweet_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_mentions_timeline',
        description: 'Get tweets that mention the authenticated user. Returns recent tweets where @username appears. Requires TWITTER_ACCESS_TOKEN.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'Numeric user ID of the authenticated user to get mentions for',
                },
                max_results: {
                    type: 'number',
                    description: 'Number of mention tweets to return (5–100, default 10)',
                },
                pagination_token: {
                    type: 'string',
                    description: 'Pagination token from previous response to fetch next page',
                },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Spaces & Misc (3 tools) ────────────────────────────────────

    {
        name: 'get_bookmarks',
        description: 'Get the authenticated user\'s bookmarked tweets. Requires TWITTER_ACCESS_TOKEN.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'Numeric user ID of the authenticated user whose bookmarks to retrieve',
                },
                max_results: {
                    type: 'number',
                    description: 'Number of bookmarks to return (1–100, default 10)',
                },
                pagination_token: {
                    type: 'string',
                    description: 'Pagination token from previous response to fetch next page',
                },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'bookmark_tweet',
        description: 'Bookmark a tweet for the authenticated user. Requires TWITTER_ACCESS_TOKEN.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'Numeric user ID of the authenticated user adding the bookmark',
                },
                tweet_id: {
                    type: 'string',
                    description: 'Numeric tweet ID to bookmark',
                },
            },
            required: ['user_id', 'tweet_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'remove_bookmark',
        description: 'Remove a bookmark for the authenticated user. Requires TWITTER_ACCESS_TOKEN.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'string',
                    description: 'Numeric user ID of the authenticated user removing the bookmark',
                },
                tweet_id: {
                    type: 'string',
                    description: 'Numeric tweet ID to remove from bookmarks',
                },
            },
            required: ['user_id', 'tweet_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── _ping ─────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify credentials by calling GET /2/users/me with the access token. Returns the authenticated user\'s profile if the token is valid.',
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
    bearerToken: string | null,
    accessToken: string | null,
): Promise<unknown> {
    // Helper to pick the right token and throw if missing
    function requireBearer(): string {
        if (!bearerToken) throw new Error('TWITTER_BEARER_TOKEN is required for this tool (header: X-Mcp-Secret-TWITTER-BEARER-TOKEN)');
        return bearerToken;
    }
    function requireAccess(): string {
        if (!accessToken) throw new Error('TWITTER_ACCESS_TOKEN is required for this tool (header: X-Mcp-Secret-TWITTER-ACCESS-TOKEN)');
        return accessToken;
    }
    // Use access token if available, fall back to bearer for read ops
    function anyToken(): string {
        if (accessToken) return accessToken;
        if (bearerToken) return bearerToken;
        throw new Error('No token provided. Add TWITTER_BEARER_TOKEN or TWITTER_ACCESS_TOKEN.');
    }

    switch (name) {
        // ── Tweets ──────────────────────────────────────────────────────────────

        case 'get_tweet': {
            validateRequired(args, ['tweet_id']);
            const params = new URLSearchParams({
                'tweet.fields': 'id,text,author_id,created_at,public_metrics,conversation_id',
                'expansions': 'author_id',
                'user.fields': 'id,name,username',
            });
            return twitterFetch(`/tweets/${args.tweet_id}?${params}`, requireBearer());
        }

        case 'search_tweets': {
            validateRequired(args, ['query']);
            const params = new URLSearchParams({
                query: args.query as string,
                max_results: String(Math.min(100, Math.max(10, (args.max_results as number) || 10))),
                'tweet.fields': 'id,text,author_id,created_at,public_metrics',
                'expansions': 'author_id',
                'user.fields': 'id,name,username',
            });
            if (args.next_token) params.set('next_token', args.next_token as string);
            return twitterFetch(`/tweets/search/recent?${params}`, requireBearer());
        }

        case 'create_tweet': {
            validateRequired(args, ['text']);
            const body: Record<string, unknown> = { text: args.text };
            if (args.reply_to_id) {
                body.reply = { in_reply_to_tweet_id: args.reply_to_id };
            }
            return twitterFetch('/tweets', requireAccess(), {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'delete_tweet': {
            validateRequired(args, ['tweet_id']);
            return twitterFetch(`/tweets/${args.tweet_id}`, requireAccess(), {
                method: 'DELETE',
            });
        }

        case 'like_tweet': {
            validateRequired(args, ['user_id', 'tweet_id']);
            return twitterFetch(`/users/${args.user_id}/likes`, requireAccess(), {
                method: 'POST',
                body: JSON.stringify({ tweet_id: args.tweet_id }),
            });
        }

        case 'retweet': {
            validateRequired(args, ['user_id', 'tweet_id']);
            return twitterFetch(`/users/${args.user_id}/retweets`, requireAccess(), {
                method: 'POST',
                body: JSON.stringify({ tweet_id: args.tweet_id }),
            });
        }

        // ── Users ───────────────────────────────────────────────────────────────

        case 'get_user_by_username': {
            validateRequired(args, ['username']);
            const params = new URLSearchParams({
                'user.fields': 'id,name,username,description,location,public_metrics,profile_image_url,created_at,verified',
            });
            return twitterFetch(`/users/by/username/${encodeURIComponent(args.username as string)}?${params}`, requireBearer());
        }

        case 'get_user_by_id': {
            validateRequired(args, ['user_id']);
            const params = new URLSearchParams({
                'user.fields': 'id,name,username,description,location,public_metrics,profile_image_url,created_at,verified',
            });
            return twitterFetch(`/users/${args.user_id}?${params}`, requireBearer());
        }

        case 'get_user_tweets': {
            validateRequired(args, ['user_id']);
            const params = new URLSearchParams({
                max_results: String(Math.min(100, Math.max(5, (args.max_results as number) || 10))),
                'tweet.fields': 'id,text,created_at,public_metrics,conversation_id',
            });
            if (args.pagination_token) params.set('pagination_token', args.pagination_token as string);
            return twitterFetch(`/users/${args.user_id}/tweets?${params}`, requireBearer());
        }

        case 'get_user_followers': {
            validateRequired(args, ['user_id']);
            const params = new URLSearchParams({
                max_results: String(Math.min(1000, Math.max(1, (args.max_results as number) || 100))),
                'user.fields': 'id,name,username,description,public_metrics',
            });
            if (args.pagination_token) params.set('pagination_token', args.pagination_token as string);
            return twitterFetch(`/users/${args.user_id}/followers?${params}`, requireBearer());
        }

        case 'get_user_following': {
            validateRequired(args, ['user_id']);
            const params = new URLSearchParams({
                max_results: String(Math.min(1000, Math.max(1, (args.max_results as number) || 100))),
                'user.fields': 'id,name,username,description,public_metrics',
            });
            if (args.pagination_token) params.set('pagination_token', args.pagination_token as string);
            return twitterFetch(`/users/${args.user_id}/following?${params}`, requireBearer());
        }

        // ── Lists & Search ──────────────────────────────────────────────────────

        case 'search_users': {
            validateRequired(args, ['query']);
            // Twitter v2 doesn't have a user search endpoint in the free tier.
            // We use the users/by endpoint via username search via tweets search and expand authors,
            // but the practical approach is the v1.1 users/search endpoint via the v2 path.
            // Since Twitter v2 removed user search from basic access, we use search/recent with from: operator
            // to find relevant users, then extract unique authors.
            const params = new URLSearchParams({
                query: `${args.query} -is:retweet`,
                max_results: String(Math.min(100, Math.max(10, (args.max_results as number) || 10))),
                'expansions': 'author_id',
                'user.fields': 'id,name,username,description,public_metrics,profile_image_url',
                'tweet.fields': 'author_id',
            });
            return twitterFetch(`/tweets/search/recent?${params}`, requireBearer());
        }

        case 'get_trending_topics': {
            // Twitter v2 trends endpoint
            const woeid = (args.woeid as number) || 1;
            // Note: Trends are available via the v1.1 API; v2 uses the /trends/by/woeid path for eligible apps
            return twitterFetch(`/trends/by/woeid?ids=${woeid}`, requireBearer());
        }

        case 'get_tweet_metrics': {
            validateRequired(args, ['tweet_id']);
            const token = anyToken();
            // non_public_metrics require OAuth user context; public_metrics available with bearer
            const fields = accessToken
                ? 'public_metrics,non_public_metrics,organic_metrics'
                : 'public_metrics';
            const params = new URLSearchParams({ 'tweet.fields': fields });
            return twitterFetch(`/tweets/${args.tweet_id}?${params}`, token);
        }

        case 'get_mentions_timeline': {
            validateRequired(args, ['user_id']);
            const params = new URLSearchParams({
                max_results: String(Math.min(100, Math.max(5, (args.max_results as number) || 10))),
                'tweet.fields': 'id,text,author_id,created_at,public_metrics,conversation_id',
                'expansions': 'author_id',
                'user.fields': 'id,name,username',
            });
            if (args.pagination_token) params.set('pagination_token', args.pagination_token as string);
            return twitterFetch(`/users/${args.user_id}/mentions?${params}`, requireAccess());
        }

        // ── Bookmarks ───────────────────────────────────────────────────────────

        case 'get_bookmarks': {
            validateRequired(args, ['user_id']);
            const params = new URLSearchParams({
                max_results: String(Math.min(100, Math.max(1, (args.max_results as number) || 10))),
                'tweet.fields': 'id,text,author_id,created_at,public_metrics',
                'expansions': 'author_id',
                'user.fields': 'id,name,username',
            });
            if (args.pagination_token) params.set('pagination_token', args.pagination_token as string);
            return twitterFetch(`/users/${args.user_id}/bookmarks?${params}`, requireAccess());
        }

        case 'bookmark_tweet': {
            validateRequired(args, ['user_id', 'tweet_id']);
            return twitterFetch(`/users/${args.user_id}/bookmarks`, requireAccess(), {
                method: 'POST',
                body: JSON.stringify({ tweet_id: args.tweet_id }),
            });
        }

        case 'remove_bookmark': {
            validateRequired(args, ['user_id', 'tweet_id']);
            return twitterFetch(`/users/${args.user_id}/bookmarks/${args.tweet_id}`, requireAccess(), {
                method: 'DELETE',
            });
        }

        // ── Ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            const token = accessToken || bearerToken;
            if (!token) {
                throw new Error('No token provided. Add TWITTER_ACCESS_TOKEN or TWITTER_BEARER_TOKEN.');
            }
            return twitterFetch('/users/me?user.fields=id,name,username,public_metrics', token);
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
                JSON.stringify({ status: 'ok', server: 'mcp-twitter', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-twitter', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            const { bearerToken, accessToken } = getSecrets(request);

            // At least one token must be present
            if (!bearerToken && !accessToken) {
                return rpcErr(id, -32001, 'Missing required secrets: TWITTER_BEARER_TOKEN (header: X-Mcp-Secret-TWITTER-BEARER-TOKEN) and/or TWITTER_ACCESS_TOKEN (header: X-Mcp-Secret-TWITTER-ACCESS-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, bearerToken, accessToken);
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
