/**
 * Reddit MCP Worker
 * Implements MCP protocol over HTTP for Reddit API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   REDDIT_CLIENT_ID      → X-Mcp-Secret-REDDIT-CLIENT-ID      (Reddit app client ID)
 *   REDDIT_CLIENT_SECRET  → X-Mcp-Secret-REDDIT-CLIENT-SECRET  (Reddit app client secret)
 *   REDDIT_ACCESS_TOKEN   → X-Mcp-Secret-REDDIT-ACCESS-TOKEN   (User OAuth token for write operations)
 *
 * Auth format: Authorization: Bearer {access_token}
 * User-Agent: Aerostack-MCP/1.0
 *
 * Covers: Posts/Submissions (6), Comments (4), Subreddits (3), User & Voting (3) = 16 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const REDDIT_BASE_URL = 'https://oauth.reddit.com';
const REDDIT_USER_AGENT = 'Aerostack-MCP/1.0';

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

function getSecrets(request: Request): {
    accessToken: string | null;
} {
    return {
        accessToken: request.headers.get('X-Mcp-Secret-REDDIT-ACCESS-TOKEN'),
    };
}

async function redditFetch(
    path: string,
    accessToken: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${REDDIT_BASE_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': REDDIT_USER_AGENT,
            'Content-Type': options.method === 'POST' ? 'application/x-www-form-urlencoded' : 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return { success: true };

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Reddit HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        const errData = data as { message?: string; error?: string | number };
        const msg = errData?.message || String(errData?.error) || res.statusText;
        throw { code: -32603, message: `Reddit API error ${res.status}: ${msg}` };
    }

    return data;
}

// Helper to encode POST body as form-urlencoded (Reddit's API requirement for write operations)
function toFormBody(params: Record<string, string | number | boolean>): string {
    return Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Posts/Submissions (6 tools) ─────────────────────────────────

    {
        name: 'get_post',
        description: 'Get a Reddit post by ID. Returns title, body (selftext), score, author, subreddit, url, num_comments, created_utc, permalink.',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: {
                    type: 'string',
                    description: 'Reddit post ID (base36, e.g. "t3_abc123" or just "abc123")',
                },
            },
            required: ['post_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_posts',
        description: 'Search posts across Reddit or within a specific subreddit. Supports sorting by relevance, hot, new, or top.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query string',
                },
                subreddit: {
                    type: 'string',
                    description: 'Restrict search to this subreddit (without r/ prefix, e.g. "javascript")',
                },
                sort: {
                    type: 'string',
                    enum: ['relevance', 'hot', 'new', 'top'],
                    description: 'Sort order for results (default: relevance)',
                },
                time_filter: {
                    type: 'string',
                    enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
                    description: 'Time filter for results (default: all)',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of posts to return (default 25, max 100)',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_subreddit_posts',
        description: 'Get posts from a subreddit sorted by hot, new, top, or rising.',
        inputSchema: {
            type: 'object',
            properties: {
                subreddit: {
                    type: 'string',
                    description: 'Subreddit name (without r/ prefix, e.g. "programming")',
                },
                sort: {
                    type: 'string',
                    enum: ['hot', 'new', 'top', 'rising'],
                    description: 'Sort order (default: hot)',
                },
                limit: {
                    type: 'number',
                    description: 'Number of posts to return (default 25, max 100)',
                },
                time: {
                    type: 'string',
                    enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
                    description: 'Time filter for top posts (only applies when sort=top, default: day)',
                },
            },
            required: ['subreddit'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_post',
        description: 'Create a text (self) post in a subreddit. Requires a user OAuth token with submit scope.',
        inputSchema: {
            type: 'object',
            properties: {
                subreddit: {
                    type: 'string',
                    description: 'Target subreddit name (without r/ prefix)',
                },
                title: {
                    type: 'string',
                    description: 'Post title',
                },
                text: {
                    type: 'string',
                    description: 'Post body text (supports Markdown)',
                },
            },
            required: ['subreddit', 'title'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_link_post',
        description: 'Create a link post in a subreddit. Requires a user OAuth token with submit scope.',
        inputSchema: {
            type: 'object',
            properties: {
                subreddit: {
                    type: 'string',
                    description: 'Target subreddit name (without r/ prefix)',
                },
                title: {
                    type: 'string',
                    description: 'Post title',
                },
                url: {
                    type: 'string',
                    description: 'URL to link to',
                },
            },
            required: ['subreddit', 'title', 'url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_post',
        description: 'Delete a post. Only works on posts owned by the authenticated user.',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: {
                    type: 'string',
                    description: 'Full post name (e.g. "t3_abc123")',
                },
            },
            required: ['post_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 2 — Comments (4 tools) ──────────────────────────────────────────

    {
        name: 'get_post_comments',
        description: 'Get comments for a Reddit post. Returns comment tree with score, author, body, and replies.',
        inputSchema: {
            type: 'object',
            properties: {
                post_id: {
                    type: 'string',
                    description: 'Reddit post ID (base36, e.g. "abc123")',
                },
                subreddit: {
                    type: 'string',
                    description: 'Subreddit name (improves URL routing)',
                },
                depth: {
                    type: 'number',
                    description: 'Comment tree depth to fetch (default 3, max 10)',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of top-level comments (default 25)',
                },
                sort: {
                    type: 'string',
                    enum: ['confidence', 'top', 'new', 'controversial', 'old', 'qa'],
                    description: 'Comment sort order (default: confidence)',
                },
            },
            required: ['post_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_comment',
        description: 'Comment on a post or reply to an existing comment. Requires submit scope.',
        inputSchema: {
            type: 'object',
            properties: {
                parent_id: {
                    type: 'string',
                    description: 'Full name of parent (post: "t3_abc123", comment: "t1_xyz789")',
                },
                text: {
                    type: 'string',
                    description: 'Comment body text (supports Markdown)',
                },
            },
            required: ['parent_id', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'edit_comment',
        description: 'Edit the body text of a comment. Only works on comments owned by the authenticated user.',
        inputSchema: {
            type: 'object',
            properties: {
                comment_id: {
                    type: 'string',
                    description: 'Full comment name (e.g. "t1_xyz789")',
                },
                text: {
                    type: 'string',
                    description: 'New comment body text (supports Markdown)',
                },
            },
            required: ['comment_id', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_comment',
        description: 'Delete a comment. Only works on comments owned by the authenticated user.',
        inputSchema: {
            type: 'object',
            properties: {
                comment_id: {
                    type: 'string',
                    description: 'Full comment name (e.g. "t1_xyz789")',
                },
            },
            required: ['comment_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 3 — Subreddits (3 tools) ────────────────────────────────────────

    {
        name: 'get_subreddit',
        description: 'Get subreddit info: subscribers, description, created date, rules, NSFW status, active user count.',
        inputSchema: {
            type: 'object',
            properties: {
                subreddit: {
                    type: 'string',
                    description: 'Subreddit name (without r/ prefix)',
                },
            },
            required: ['subreddit'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_subreddits',
        description: 'Search for subreddits by name or topic. Returns subreddit name, title, subscribers, and description.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query to find subreddits',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of subreddits to return (default 25)',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_subreddit_rules',
        description: 'Get the rules for a subreddit. Returns rule priority, short name, description, and violation reason.',
        inputSchema: {
            type: 'object',
            properties: {
                subreddit: {
                    type: 'string',
                    description: 'Subreddit name (without r/ prefix)',
                },
            },
            required: ['subreddit'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — User & Voting (3 tools) ─────────────────────────────────────

    {
        name: 'get_user_profile',
        description: 'Get a Reddit user\'s public profile: karma breakdown, account age, post/comment history.',
        inputSchema: {
            type: 'object',
            properties: {
                username: {
                    type: 'string',
                    description: 'Reddit username (without u/ prefix)',
                },
            },
            required: ['username'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'vote',
        description: 'Upvote (1), downvote (-1), or clear vote (0) on a post or comment. Requires vote scope.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Full name of post (t3_abc123) or comment (t1_xyz789) to vote on',
                },
                direction: {
                    type: 'number',
                    enum: [1, 0, -1],
                    description: '1 to upvote, -1 to downvote, 0 to clear vote',
                },
            },
            required: ['id', 'direction'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_my_profile',
        description: 'Get the authenticated user\'s own profile: username, karma totals, coins, account age, verified status.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ──────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify Reddit credentials by calling GET /api/v1/me. Returns {ok: true, username, id} on success.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    accessToken: string,
): Promise<unknown> {
    switch (name) {
        // ── Posts/Submissions ────────────────────────────────────────────────────

        case 'get_post': {
            validateRequired(args, ['post_id']);
            const id = (args.post_id as string).replace(/^t3_/, '');
            return redditFetch(`/comments/${id}?limit=1`, accessToken);
        }

        case 'search_posts': {
            validateRequired(args, ['query']);
            const sort = (args.sort as string) || 'relevance';
            const timeFilter = (args.time_filter as string) || 'all';
            const limit = (args.limit as number) || 25;
            const params = new URLSearchParams({
                q: args.query as string,
                sort,
                t: timeFilter,
                limit: String(limit),
                type: 'link',
            });
            if (args.subreddit) params.set('restrict_sr', 'true');
            const subPath = args.subreddit ? `/r/${args.subreddit}` : '';
            return redditFetch(`${subPath}/search?${params.toString()}`, accessToken);
        }

        case 'get_subreddit_posts': {
            validateRequired(args, ['subreddit']);
            const sort = (args.sort as string) || 'hot';
            const limit = (args.limit as number) || 25;
            const params = new URLSearchParams({ limit: String(limit) });
            if (sort === 'top' && args.time) params.set('t', args.time as string);
            return redditFetch(`/r/${args.subreddit}/${sort}?${params.toString()}`, accessToken);
        }

        case 'create_post': {
            validateRequired(args, ['subreddit', 'title']);
            const body: Record<string, string | boolean> = {
                sr: args.subreddit as string,
                kind: 'self',
                title: args.title as string,
                api_type: 'json',
            };
            if (args.text) body.text = args.text as string;
            return redditFetch('/api/submit', accessToken, {
                method: 'POST',
                body: toFormBody(body),
            });
        }

        case 'create_link_post': {
            validateRequired(args, ['subreddit', 'title', 'url']);
            const body = {
                sr: args.subreddit as string,
                kind: 'link',
                title: args.title as string,
                url: args.url as string,
                api_type: 'json',
            };
            return redditFetch('/api/submit', accessToken, {
                method: 'POST',
                body: toFormBody(body),
            });
        }

        case 'delete_post': {
            validateRequired(args, ['post_id']);
            const id = args.post_id as string;
            const fullName = id.startsWith('t3_') ? id : `t3_${id}`;
            return redditFetch('/api/del', accessToken, {
                method: 'POST',
                body: toFormBody({ id: fullName }),
            });
        }

        // ── Comments ─────────────────────────────────────────────────────────────

        case 'get_post_comments': {
            validateRequired(args, ['post_id']);
            const id = (args.post_id as string).replace(/^t3_/, '');
            const depth = (args.depth as number) || 3;
            const limit = (args.limit as number) || 25;
            const sort = (args.sort as string) || 'confidence';
            const params = new URLSearchParams({
                depth: String(depth),
                limit: String(limit),
                sort,
            });
            const sub = args.subreddit ? `/r/${args.subreddit}` : '';
            return redditFetch(`${sub}/comments/${id}?${params.toString()}`, accessToken);
        }

        case 'create_comment': {
            validateRequired(args, ['parent_id', 'text']);
            return redditFetch('/api/comment', accessToken, {
                method: 'POST',
                body: toFormBody({
                    parent: args.parent_id as string,
                    text: args.text as string,
                    api_type: 'json',
                }),
            });
        }

        case 'edit_comment': {
            validateRequired(args, ['comment_id', 'text']);
            const id = args.comment_id as string;
            const fullName = id.startsWith('t1_') ? id : `t1_${id}`;
            return redditFetch('/api/editusertext', accessToken, {
                method: 'POST',
                body: toFormBody({
                    thing_id: fullName,
                    text: args.text as string,
                    api_type: 'json',
                }),
            });
        }

        case 'delete_comment': {
            validateRequired(args, ['comment_id']);
            const id = args.comment_id as string;
            const fullName = id.startsWith('t1_') ? id : `t1_${id}`;
            return redditFetch('/api/del', accessToken, {
                method: 'POST',
                body: toFormBody({ id: fullName }),
            });
        }

        // ── Subreddits ───────────────────────────────────────────────────────────

        case 'get_subreddit': {
            validateRequired(args, ['subreddit']);
            return redditFetch(`/r/${args.subreddit}/about`, accessToken);
        }

        case 'search_subreddits': {
            validateRequired(args, ['query']);
            const limit = (args.limit as number) || 25;
            const params = new URLSearchParams({
                q: args.query as string,
                limit: String(limit),
            });
            return redditFetch(`/subreddits/search?${params.toString()}`, accessToken);
        }

        case 'get_subreddit_rules': {
            validateRequired(args, ['subreddit']);
            return redditFetch(`/r/${args.subreddit}/about/rules`, accessToken);
        }

        // ── User & Voting ────────────────────────────────────────────────────────

        case 'get_user_profile': {
            validateRequired(args, ['username']);
            const [about, overview] = await Promise.all([
                redditFetch(`/user/${args.username}/about`, accessToken),
                redditFetch(`/user/${args.username}/overview?limit=10`, accessToken),
            ]);
            return { about, recent_activity: overview };
        }

        case 'vote': {
            validateRequired(args, ['id', 'direction']);
            return redditFetch('/api/vote', accessToken, {
                method: 'POST',
                body: toFormBody({
                    id: args.id as string,
                    dir: args.direction as number,
                }),
            });
        }

        case 'get_my_profile': {
            return redditFetch('/api/v1/me', accessToken);
        }

        // ── _ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            const res = await redditFetch('/api/v1/me', accessToken) as {
                name?: string;
                id?: string;
            };
            return { ok: true, username: res.name || '', id: res.id || '' };
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
                JSON.stringify({ status: 'ok', server: 'mcp-reddit', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-reddit', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            // Validate secrets — access token required for all operations
            const { accessToken } = getSecrets(request);
            if (!accessToken) {
                return rpcErr(id, -32001, 'Missing required secret: REDDIT_ACCESS_TOKEN (header: X-Mcp-Secret-REDDIT-ACCESS-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, accessToken);
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
