import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const CLIENT_ID = 'test_reddit_client_id';
const CLIENT_SECRET = 'test_reddit_client_secret';
const ACCESS_TOKEN = 'test_reddit_access_token_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockPost = {
    kind: 'Listing',
    data: {
        children: [{
            kind: 't3',
            data: {
                id: 'abc123',
                name: 't3_abc123',
                title: 'How to build an MCP server in TypeScript',
                selftext: 'Great tutorial content here...',
                score: 1542,
                author: 'techdev_user',
                subreddit: 'programming',
                url: 'https://www.reddit.com/r/programming/comments/abc123/',
                num_comments: 87,
                created_utc: 1709280000,
                permalink: '/r/programming/comments/abc123/',
                upvote_ratio: 0.97,
            },
        }],
        after: null,
        before: null,
    },
};

const mockPostListing = {
    kind: 'Listing',
    data: {
        children: [
            {
                kind: 't3',
                data: { id: 'post1', name: 't3_post1', title: 'First post', score: 500, author: 'user1', subreddit: 'javascript', num_comments: 23 },
            },
            {
                kind: 't3',
                data: { id: 'post2', name: 't3_post2', title: 'Second post', score: 320, author: 'user2', subreddit: 'javascript', num_comments: 15 },
            },
        ],
        after: 't3_post2',
        before: null,
    },
};

const mockComments = [
    mockPost,
    {
        kind: 'Listing',
        data: {
            children: [
                {
                    kind: 't1',
                    data: {
                        id: 'comment1',
                        name: 't1_comment1',
                        body: 'Great post! Very helpful.',
                        score: 42,
                        author: 'commenter_user',
                        created_utc: 1709280100,
                        replies: '',
                    },
                },
            ],
            after: null,
        },
    },
];

const mockSubmitResponse = {
    json: {
        errors: [],
        data: {
            url: 'https://www.reddit.com/r/programming/comments/newpost/',
            id: 'newpost',
            name: 't3_newpost',
        },
    },
};

const mockCommentResponse = {
    json: {
        errors: [],
        data: {
            things: [{
                kind: 't1',
                data: { id: 'newcomment', name: 't1_newcomment', body: 'Nice post!', author: 'myuser' },
            }],
        },
    },
};

const mockSubreddit = {
    kind: 't5',
    data: {
        id: 'subid001',
        display_name: 'programming',
        title: 'programming',
        description: 'Computer Programming — the art of writing programs',
        subscribers: 5400000,
        active_user_count: 12500,
        over18: false,
        created_utc: 1134365565,
    },
};

const mockSubredditSearch = {
    kind: 'Listing',
    data: {
        children: [
            { kind: 't5', data: { display_name: 'javascript', title: 'JavaScript', subscribers: 2100000, public_description: 'All about JavaScript' } },
            { kind: 't5', data: { display_name: 'typescript', title: 'TypeScript', subscribers: 580000, public_description: 'TypeScript programming language' } },
        ],
    },
};

const mockSubredditRules = {
    rules: [
        { priority: 1, short_name: 'Be respectful', description: 'Treat others with respect', violation_reason: 'Breaking rule 1' },
        { priority: 2, short_name: 'Stay on topic', description: 'Posts must be related to programming', violation_reason: 'Breaking rule 2' },
    ],
    site_rules: [],
};

const mockUserAbout = {
    kind: 't2',
    data: {
        id: 'user_id_001',
        name: 'techdev_user',
        comment_karma: 12500,
        link_karma: 3200,
        created_utc: 1550000000,
        is_gold: false,
        verified: true,
    },
};

const mockUserOverview = {
    kind: 'Listing',
    data: {
        children: [
            { kind: 't3', data: { id: 'p1', title: 'My post', score: 100 } },
        ],
    },
};

const mockMeProfile = {
    id: 'abc123user',
    name: 'myreddituser',
    total_karma: 15700,
    comment_karma: 12500,
    link_karma: 3200,
    coins: 150,
    created_utc: 1550000000,
    verified: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function redditOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function redditErr(message: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ message, error: status }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('clientId')) {
        headers['X-Mcp-Secret-REDDIT-CLIENT-ID'] = CLIENT_ID;
    }
    if (!missingSecrets.includes('clientSecret')) {
        headers['X-Mcp-Secret-REDDIT-CLIENT-SECRET'] = CLIENT_SECRET;
    }
    if (!missingSecrets.includes('accessToken')) {
        headers['X-Mcp-Secret-REDDIT-ACCESS-TOKEN'] = ACCESS_TOKEN;
    }
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingSecrets);
}

async function callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    const req = makeToolReq(toolName, args, missingSecrets);
    const res = await worker.fetch(req);
    return res.json() as Promise<{
        jsonrpc: string;
        id: number;
        result?: { content: [{ type: string; text: string }] };
        error?: { code: number; message: string };
    }>;
}

async function getToolResult(toolName: string, args: Record<string, unknown> = {}) {
    const body = await callTool(toolName, args);
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    return JSON.parse(body.result!.content[0].text);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-reddit and tools 17', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-reddit');
        expect(body.tools).toBe(17);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'PUT' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'bad json!!!',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { protocolVersion: string; serverInfo: { name: string } }
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-reddit');
    });

    it('tools/list returns all tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools.length).toBeGreaterThan(0);
        for (const tool of body.result.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
        }
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq('unknown/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

// ── Missing credentials ───────────────────────────────────────────────────────

describe('Missing credentials', () => {
    it('returns -32001 when access token is missing', async () => {
        const body = await callTool('_ping', {}, ['accessToken']);
        expect(body.error?.code).toBe(-32001);
        expect(body.error?.message).toContain('REDDIT_ACCESS_TOKEN');
    });
});

// ── Group 1 — Posts/Submissions ───────────────────────────────────────────────

describe('get_post', () => {
    it('returns post details for a given ID', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockComments));
        const result = await getToolResult('get_post', { post_id: 'abc123' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].data.children[0].data.title).toBe('How to build an MCP server in TypeScript');
    });

    it('strips t3_ prefix from post_id', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockComments));
        await getToolResult('get_post', { post_id: 't3_abc123' });
        const callUrl = mockFetch.mock.calls[0][0] as string;
        expect(callUrl).toContain('/comments/abc123');
    });

    it('throws when post_id is missing', async () => {
        const body = await callTool('get_post', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('post_id');
    });

    it('handles Reddit API 404', async () => {
        mockFetch.mockResolvedValueOnce(redditErr('Not found', 404));
        const body = await callTool('get_post', { post_id: 'invalid' });
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('404');
    });
});

describe('search_posts', () => {
    it('searches posts across Reddit', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockPostListing));
        const result = await getToolResult('search_posts', { query: 'TypeScript MCP' });
        expect(result.data.children).toHaveLength(2);
        expect(result.data.children[0].data.title).toBe('First post');
    });

    it('searches within a specific subreddit', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockPostListing));
        await getToolResult('search_posts', { query: 'TypeScript', subreddit: 'javascript' });
        const callUrl = mockFetch.mock.calls[0][0] as string;
        expect(callUrl).toContain('/r/javascript/search');
    });

    it('throws when query is missing', async () => {
        const body = await callTool('search_posts', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('query');
    });
});

describe('get_subreddit_posts', () => {
    it('returns hot posts from subreddit', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockPostListing));
        const result = await getToolResult('get_subreddit_posts', { subreddit: 'programming' });
        expect(result.data.children).toHaveLength(2);
    });

    it('builds correct URL for top posts with time filter', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockPostListing));
        await getToolResult('get_subreddit_posts', {
            subreddit: 'programming',
            sort: 'top',
            time: 'week',
        });
        const callUrl = mockFetch.mock.calls[0][0] as string;
        expect(callUrl).toContain('/r/programming/top');
        expect(callUrl).toContain('t=week');
    });

    it('throws when subreddit is missing', async () => {
        const body = await callTool('get_subreddit_posts', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('subreddit');
    });
});

describe('create_post', () => {
    it('creates a self post successfully', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockSubmitResponse));
        const result = await getToolResult('create_post', {
            subreddit: 'programming',
            title: 'My new post',
            text: 'Post content here',
        });
        expect(result.json.errors).toHaveLength(0);
        expect(result.json.data.name).toBe('t3_newpost');
    });

    it('throws when subreddit is missing', async () => {
        const body = await callTool('create_post', { title: 'My post' });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('subreddit');
    });

    it('throws when title is missing', async () => {
        const body = await callTool('create_post', { subreddit: 'programming' });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('title');
    });
});

describe('create_link_post', () => {
    it('creates a link post successfully', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockSubmitResponse));
        const result = await getToolResult('create_link_post', {
            subreddit: 'programming',
            title: 'Interesting article',
            url: 'https://example.com/article',
        });
        expect(result.json.data.name).toBe('t3_newpost');
    });

    it('throws when url is missing', async () => {
        const body = await callTool('create_link_post', { subreddit: 'programming', title: 'Post' });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('url');
    });
});

describe('delete_post', () => {
    it('deletes a post by full name', async () => {
        mockFetch.mockResolvedValueOnce(redditOk({}));
        const result = await getToolResult('delete_post', { post_id: 't3_abc123' });
        expect(result).toBeDefined();
    });

    it('adds t3_ prefix if not present', async () => {
        mockFetch.mockResolvedValueOnce(redditOk({}));
        await getToolResult('delete_post', { post_id: 'abc123' });
        const callBody = mockFetch.mock.calls[0][1].body as string;
        expect(callBody).toContain('t3_abc123');
    });

    it('throws when post_id is missing', async () => {
        const body = await callTool('delete_post', {});
        expect(body.error?.code).toBe(-32603);
    });
});

// ── Group 2 — Comments ────────────────────────────────────────────────────────

describe('get_post_comments', () => {
    it('returns post with comments', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockComments));
        const result = await getToolResult('get_post_comments', { post_id: 'abc123' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[1].data.children[0].data.body).toBe('Great post! Very helpful.');
    });

    it('strips t3_ prefix from post_id', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockComments));
        await getToolResult('get_post_comments', { post_id: 't3_abc123' });
        const callUrl = mockFetch.mock.calls[0][0] as string;
        expect(callUrl).toContain('/comments/abc123');
    });

    it('throws when post_id is missing', async () => {
        const body = await callTool('get_post_comments', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('post_id');
    });
});

describe('create_comment', () => {
    it('posts a comment on a submission', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockCommentResponse));
        const result = await getToolResult('create_comment', {
            parent_id: 't3_abc123',
            text: 'Great post!',
        });
        expect(result.json.data.things[0].data.body).toBe('Nice post!');
    });

    it('throws when parent_id is missing', async () => {
        const body = await callTool('create_comment', { text: 'Hello' });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('parent_id');
    });

    it('throws when text is missing', async () => {
        const body = await callTool('create_comment', { parent_id: 't3_abc123' });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('text');
    });
});

describe('edit_comment', () => {
    it('edits a comment successfully', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockCommentResponse));
        const result = await getToolResult('edit_comment', {
            comment_id: 't1_comment1',
            text: 'Updated comment text',
        });
        expect(result).toBeDefined();
    });

    it('adds t1_ prefix if not present', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockCommentResponse));
        await getToolResult('edit_comment', { comment_id: 'comment1', text: 'Updated' });
        const callBody = mockFetch.mock.calls[0][1].body as string;
        expect(callBody).toContain('t1_comment1');
    });

    it('throws when comment_id is missing', async () => {
        const body = await callTool('edit_comment', { text: 'Updated' });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('comment_id');
    });
});

describe('delete_comment', () => {
    it('deletes a comment', async () => {
        mockFetch.mockResolvedValueOnce(redditOk({}));
        const result = await getToolResult('delete_comment', { comment_id: 't1_comment1' });
        expect(result).toBeDefined();
    });

    it('throws when comment_id is missing', async () => {
        const body = await callTool('delete_comment', {});
        expect(body.error?.code).toBe(-32603);
    });
});

// ── Group 3 — Subreddits ──────────────────────────────────────────────────────

describe('get_subreddit', () => {
    it('returns subreddit info', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockSubreddit));
        const result = await getToolResult('get_subreddit', { subreddit: 'programming' });
        expect(result.data.display_name).toBe('programming');
        expect(result.data.subscribers).toBe(5400000);
    });

    it('throws when subreddit is missing', async () => {
        const body = await callTool('get_subreddit', {});
        expect(body.error?.code).toBe(-32603);
    });

    it('handles non-existent subreddit', async () => {
        mockFetch.mockResolvedValueOnce(redditErr('Not Found', 404));
        const body = await callTool('get_subreddit', { subreddit: 'this_subreddit_does_not_exist_xyz' });
        expect(body.error).toBeDefined();
    });
});

describe('search_subreddits', () => {
    it('returns matching subreddits', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockSubredditSearch));
        const result = await getToolResult('search_subreddits', { query: 'javascript' });
        expect(result.data.children).toHaveLength(2);
        expect(result.data.children[0].data.display_name).toBe('javascript');
    });

    it('throws when query is missing', async () => {
        const body = await callTool('search_subreddits', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('query');
    });
});

describe('get_subreddit_rules', () => {
    it('returns subreddit rules', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockSubredditRules));
        const result = await getToolResult('get_subreddit_rules', { subreddit: 'programming' });
        expect(result.rules).toHaveLength(2);
        expect(result.rules[0].short_name).toBe('Be respectful');
    });

    it('throws when subreddit is missing', async () => {
        const body = await callTool('get_subreddit_rules', {});
        expect(body.error?.code).toBe(-32603);
    });
});

// ── Group 4 — User & Voting ───────────────────────────────────────────────────

describe('get_user_profile', () => {
    it('returns user profile and recent activity', async () => {
        mockFetch
            .mockResolvedValueOnce(redditOk(mockUserAbout))
            .mockResolvedValueOnce(redditOk(mockUserOverview));
        const result = await getToolResult('get_user_profile', { username: 'techdev_user' });
        expect(result.about.data.name).toBe('techdev_user');
        expect(result.about.data.comment_karma).toBe(12500);
        expect(result.recent_activity).toBeDefined();
    });

    it('throws when username is missing', async () => {
        const body = await callTool('get_user_profile', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('username');
    });
});

describe('vote', () => {
    it('upvotes a post', async () => {
        mockFetch.mockResolvedValueOnce(redditOk({}));
        const result = await getToolResult('vote', { id: 't3_abc123', direction: 1 });
        expect(result).toBeDefined();
        const callBody = mockFetch.mock.calls[0][1].body as string;
        expect(callBody).toContain('dir=1');
    });

    it('downvotes a comment', async () => {
        mockFetch.mockResolvedValueOnce(redditOk({}));
        await getToolResult('vote', { id: 't1_comment1', direction: -1 });
        const callBody = mockFetch.mock.calls[0][1].body as string;
        expect(callBody).toContain('dir=-1');
    });

    it('clears a vote', async () => {
        mockFetch.mockResolvedValueOnce(redditOk({}));
        await getToolResult('vote', { id: 't3_abc123', direction: 0 });
        const callBody = mockFetch.mock.calls[0][1].body as string;
        expect(callBody).toContain('dir=0');
    });

    it('throws when id is missing', async () => {
        const body = await callTool('vote', { direction: 1 });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('id');
    });

    it('throws when direction is missing', async () => {
        const body = await callTool('vote', { id: 't3_abc123' });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('direction');
    });
});

describe('get_my_profile', () => {
    it('returns authenticated user profile', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockMeProfile));
        const result = await getToolResult('get_my_profile', {});
        expect(result.name).toBe('myreddituser');
        expect(result.total_karma).toBe(15700);
    });

    it('handles unauthorized error', async () => {
        mockFetch.mockResolvedValueOnce(redditErr('Unauthorized', 401));
        const body = await callTool('get_my_profile', {});
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('401');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns ok: true with username and id on success', async () => {
        mockFetch.mockResolvedValueOnce(redditOk(mockMeProfile));
        const result = await getToolResult('_ping', {});
        expect(result.ok).toBe(true);
        expect(result.username).toBe('myreddituser');
        expect(result.id).toBe('abc123user');
    });

    it('propagates API error on invalid token', async () => {
        mockFetch.mockResolvedValueOnce(redditErr('Unauthorized', 401));
        const body = await callTool('_ping', {});
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('401');
    });
});

// ── Unknown tool ──────────────────────────────────────────────────────────────

describe('Unknown tool', () => {
    it('returns -32601 for unknown tool', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error?.code).toBe(-32601);
        expect(body.error?.message).toContain('Unknown tool');
    });
});
