import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const BEARER_TOKEN = 'test_bearer_token_AAAAAAAAAAAAAAAAAAAAAxx';
const ACCESS_TOKEN = 'test_access_token_oauth2_user_context_xyz';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockTweet = {
    id: '1234567890123456789',
    text: 'Hello from Aerostack! #AI #developer',
    author_id: '987654321',
    created_at: '2026-03-28T10:00:00.000Z',
    public_metrics: {
        retweet_count: 5,
        like_count: 42,
        reply_count: 3,
        quote_count: 1,
        bookmark_count: 10,
        impression_count: 1500,
    },
};

const mockUser = {
    id: '987654321',
    name: 'Aerostack',
    username: 'aerostackdev',
    description: 'Developer infrastructure platform for AI-native backends',
    location: 'Internet',
    profile_image_url: 'https://pbs.twimg.com/profile_images/123/photo.jpg',
    created_at: '2023-01-01T00:00:00.000Z',
    verified: false,
    public_metrics: {
        followers_count: 1200,
        following_count: 350,
        tweet_count: 980,
        listed_count: 45,
    },
};

const mockSearchResult = {
    data: [mockTweet],
    includes: { users: [mockUser] },
    meta: {
        newest_id: '1234567890123456789',
        oldest_id: '1234567890123456789',
        result_count: 1,
    },
};

const mockUserResponse = {
    data: mockUser,
};

const mockUserTweets = {
    data: [mockTweet],
    meta: { result_count: 1, newest_id: mockTweet.id, oldest_id: mockTweet.id },
};

const mockFollowers = {
    data: [
        { id: '111', name: 'Alice Dev', username: 'alicedev' },
        { id: '222', name: 'Bob Builder', username: 'bobbuilder' },
    ],
    meta: { result_count: 2 },
};

const mockBookmarks = {
    data: [mockTweet],
    meta: { result_count: 1 },
};

const mockMeResponse = {
    data: { id: '987654321', name: 'Aerostack', username: 'aerostackdev' },
};

const mockLikeResponse = {
    data: { liked: true },
};

const mockRetweetResponse = {
    data: { retweeted: true },
};

const mockCreateTweetResponse = {
    data: { id: '9999999999999999999', text: 'Hello from Aerostack! #AI #developer' },
};

const mockDeleteResponse = {
    data: { deleted: true },
};

const mockBookmarkResponse = {
    data: { bookmarked: true },
};

const mockTrends = [
    {
        trends: [
            { name: '#AI', tweet_volume: 150000, url: 'https://twitter.com/search?q=%23AI' },
            { name: '#Cloudflare', tweet_volume: 50000, url: 'https://twitter.com/search?q=%23Cloudflare' },
        ],
        locations: [{ name: 'Worldwide', woeid: 1 }],
    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiErr(data: unknown, status = 400) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function makeReq(
    method: string,
    params?: unknown,
    tokens: { bearer?: boolean; access?: boolean } = { bearer: true, access: true },
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (tokens.bearer !== false) headers['X-Mcp-Secret-TWITTER-BEARER-TOKEN'] = BEARER_TOKEN;
    if (tokens.access !== false) headers['X-Mcp-Secret-TWITTER-ACCESS-TOKEN'] = ACCESS_TOKEN;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(
    toolName: string,
    args: Record<string, unknown> = {},
    tokens: { bearer?: boolean; access?: boolean } = { bearer: true, access: true },
) {
    return makeReq('tools/call', { name: toolName, arguments: args }, tokens);
}

async function callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    tokens: { bearer?: boolean; access?: boolean } = { bearer: true, access: true },
) {
    const req = makeToolReq(toolName, args, tokens);
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
    it('GET / returns status ok with server mcp-twitter and tools 19', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-twitter');
        expect(body.tools).toBe(19);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json{{{',
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
        expect(body.result.serverInfo.name).toBe('mcp-twitter');
    });

    it('tools/list returns exactly 19 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools).toHaveLength(19);
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

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing both tokens returns -32001', async () => {
        const body = await callTool('search_tweets', { query: 'test' }, { bearer: false, access: false });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('TWITTER_BEARER_TOKEN');
    });

    it('Authorization header uses Bearer token format', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSearchResult));
        await callTool('search_tweets', { query: 'aerostack' });
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toMatch(/^Bearer /);
    });

    it('write tools use access token when both are present', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCreateTweetResponse));
        await callTool('create_tweet', { text: 'Hello World' });
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it('read tools fall back to bearer when only bearer is provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUserResponse));
        await callTool('get_user_by_username', { username: 'aerostackdev' }, { bearer: true, access: false });
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${BEARER_TOKEN}`);
    });
});

// ── Group 1: Tweets ───────────────────────────────────────────────────────────

describe('get_tweet', () => {
    it('returns tweet with public_metrics', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockTweet }));
        const result = await getToolResult('get_tweet', { tweet_id: '1234567890123456789' });
        expect(result.data.id).toBe('1234567890123456789');
        expect(result.data.public_metrics.like_count).toBe(42);
    });

    it('missing tweet_id returns validation error', async () => {
        const body = await callTool('get_tweet', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('tweet_id');
    });

    it('API error propagates with status code', async () => {
        mockFetch.mockReturnValueOnce(apiErr({ detail: 'Tweet not found', title: 'Not Found Error' }, 404));
        const body = await callTool('get_tweet', { tweet_id: '0000000000000000001' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('404');
    });

    it('calls correct URL with tweet.fields parameter', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockTweet }));
        await callTool('get_tweet', { tweet_id: '1234567890123456789' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/2/tweets/1234567890123456789');
        expect(url).toContain('tweet.fields');
        expect(url).toContain('public_metrics');
    });
});

describe('search_tweets', () => {
    it('returns matching tweets with meta', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSearchResult));
        const result = await getToolResult('search_tweets', { query: 'aerostack' });
        expect(result.data).toHaveLength(1);
        expect(result.data[0].text).toContain('Aerostack');
        expect(result.meta.result_count).toBe(1);
    });

    it('missing query returns validation error', async () => {
        const body = await callTool('search_tweets', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('query');
    });

    it('passes query to URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSearchResult));
        await callTool('search_tweets', { query: 'aerostack #AI', max_results: 20 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/tweets/search/recent');
        expect(url).toContain('query=');
        expect(url).toContain('aerostack');
    });

    it('includes next_token in URL when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSearchResult));
        await callTool('search_tweets', { query: 'test', next_token: 'abc123token' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('next_token=abc123token');
    });

    it('clamps max_results to minimum 10', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSearchResult));
        await callTool('search_tweets', { query: 'test', max_results: 2 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('max_results=10');
    });
});

describe('create_tweet', () => {
    it('returns created tweet ID and text', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCreateTweetResponse));
        const result = await getToolResult('create_tweet', { text: 'Hello from Aerostack! #AI #developer' });
        expect(result.data.id).toBe('9999999999999999999');
        expect(result.data.text).toContain('Hello from Aerostack');
    });

    it('missing text returns validation error', async () => {
        const body = await callTool('create_tweet', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('text');
    });

    it('sends POST to /2/tweets', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCreateTweetResponse));
        await callTool('create_tweet', { text: 'Test tweet' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/2/tweets');
        expect(call[1].method).toBe('POST');
        const reqBody = JSON.parse(call[1].body as string);
        expect(reqBody.text).toBe('Test tweet');
    });

    it('includes reply object when reply_to_id is provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockCreateTweetResponse));
        await callTool('create_tweet', { text: 'Reply tweet', reply_to_id: '1234567890123456789' });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string);
        expect(reqBody.reply).toBeDefined();
        expect(reqBody.reply.in_reply_to_tweet_id).toBe('1234567890123456789');
    });

    it('requires TWITTER_ACCESS_TOKEN', async () => {
        const body = await callTool('create_tweet', { text: 'Test' }, { bearer: true, access: false });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('TWITTER_ACCESS_TOKEN');
    });
});

describe('delete_tweet', () => {
    it('returns deleted: true', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockDeleteResponse));
        const result = await getToolResult('delete_tweet', { tweet_id: '1234567890123456789' });
        expect(result.data.deleted).toBe(true);
    });

    it('missing tweet_id returns validation error', async () => {
        const body = await callTool('delete_tweet', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('tweet_id');
    });

    it('sends DELETE to correct URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockDeleteResponse));
        await callTool('delete_tweet', { tweet_id: '1234567890123456789' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/2/tweets/1234567890123456789');
        expect(call[1].method).toBe('DELETE');
    });

    it('requires TWITTER_ACCESS_TOKEN', async () => {
        const body = await callTool('delete_tweet', { tweet_id: '123' }, { bearer: true, access: false });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('TWITTER_ACCESS_TOKEN');
    });
});

describe('like_tweet', () => {
    it('returns liked: true', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockLikeResponse));
        const result = await getToolResult('like_tweet', { user_id: '987654321', tweet_id: '1234567890123456789' });
        expect(result.data.liked).toBe(true);
    });

    it('missing user_id returns validation error', async () => {
        const body = await callTool('like_tweet', { tweet_id: '123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('user_id');
    });

    it('missing tweet_id returns validation error', async () => {
        const body = await callTool('like_tweet', { user_id: '987654321' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('tweet_id');
    });

    it('POSTs to /2/users/{user_id}/likes with tweet_id body', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockLikeResponse));
        await callTool('like_tweet', { user_id: '987654321', tweet_id: '111' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/2/users/987654321/likes');
        expect(call[1].method).toBe('POST');
        const reqBody = JSON.parse(call[1].body as string);
        expect(reqBody.tweet_id).toBe('111');
    });
});

describe('retweet', () => {
    it('returns retweeted: true', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockRetweetResponse));
        const result = await getToolResult('retweet', { user_id: '987654321', tweet_id: '1234567890123456789' });
        expect(result.data.retweeted).toBe(true);
    });

    it('missing user_id returns validation error', async () => {
        const body = await callTool('retweet', { tweet_id: '123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('user_id');
    });

    it('POSTs to /2/users/{user_id}/retweets', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockRetweetResponse));
        await callTool('retweet', { user_id: '987654321', tweet_id: '111' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/2/users/987654321/retweets');
        expect(call[1].method).toBe('POST');
    });
});

// ── Group 2: Users ────────────────────────────────────────────────────────────

describe('get_user_by_username', () => {
    it('returns user profile with public_metrics', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUserResponse));
        const result = await getToolResult('get_user_by_username', { username: 'aerostackdev' });
        expect(result.data.username).toBe('aerostackdev');
        expect(result.data.public_metrics.followers_count).toBe(1200);
    });

    it('missing username returns validation error', async () => {
        const body = await callTool('get_user_by_username', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('username');
    });

    it('calls correct URL with user.fields', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUserResponse));
        await callTool('get_user_by_username', { username: 'aerostackdev' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/2/users/by/username/aerostackdev');
        expect(url).toContain('user.fields');
        expect(url).toContain('public_metrics');
    });
});

describe('get_user_by_id', () => {
    it('returns user profile by ID', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUserResponse));
        const result = await getToolResult('get_user_by_id', { user_id: '987654321' });
        expect(result.data.id).toBe('987654321');
        expect(result.data.name).toBe('Aerostack');
    });

    it('missing user_id returns validation error', async () => {
        const body = await callTool('get_user_by_id', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('user_id');
    });

    it('calls correct URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUserResponse));
        await callTool('get_user_by_id', { user_id: '987654321' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/2/users/987654321');
    });
});

describe('get_user_tweets', () => {
    it('returns list of tweets', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUserTweets));
        const result = await getToolResult('get_user_tweets', { user_id: '987654321' });
        expect(result.data).toHaveLength(1);
        expect(result.data[0].text).toContain('Aerostack');
    });

    it('missing user_id returns validation error', async () => {
        const body = await callTool('get_user_tweets', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('user_id');
    });

    it('calls correct URL with max_results', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUserTweets));
        await callTool('get_user_tweets', { user_id: '987654321', max_results: 25 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/2/users/987654321/tweets');
        expect(url).toContain('max_results=25');
    });

    it('includes pagination_token when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUserTweets));
        await callTool('get_user_tweets', { user_id: '987654321', pagination_token: 'page2token' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('pagination_token=page2token');
    });
});

describe('get_user_followers', () => {
    it('returns list of followers', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockFollowers));
        const result = await getToolResult('get_user_followers', { user_id: '987654321' });
        expect(result.data).toHaveLength(2);
        expect(result.data[0].username).toBe('alicedev');
    });

    it('missing user_id returns validation error', async () => {
        const body = await callTool('get_user_followers', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('user_id');
    });

    it('calls correct URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockFollowers));
        await callTool('get_user_followers', { user_id: '987654321' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/2/users/987654321/followers');
    });
});

describe('get_user_following', () => {
    it('returns list of following accounts', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockFollowers));
        const result = await getToolResult('get_user_following', { user_id: '987654321' });
        expect(result.data).toHaveLength(2);
        expect(result.data[1].username).toBe('bobbuilder');
    });

    it('missing user_id returns validation error', async () => {
        const body = await callTool('get_user_following', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('user_id');
    });

    it('calls correct URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockFollowers));
        await callTool('get_user_following', { user_id: '987654321' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/2/users/987654321/following');
    });
});

// ── Group 3: Lists & Search ───────────────────────────────────────────────────

describe('search_users', () => {
    it('returns tweet search results with user expansions', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSearchResult));
        const result = await getToolResult('search_users', { query: 'aerostack' });
        expect(result.includes.users).toHaveLength(1);
        expect(result.includes.users[0].username).toBe('aerostackdev');
    });

    it('missing query returns validation error', async () => {
        const body = await callTool('search_users', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('query');
    });

    it('passes query to search URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockSearchResult));
        await callTool('search_users', { query: 'developer tools', max_results: 15 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/tweets/search/recent');
        expect(url).toContain('developer');
    });
});

describe('get_trending_topics', () => {
    it('returns list of trending topics', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTrends));
        const result = await getToolResult('get_trending_topics', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].trends[0].name).toBe('#AI');
    });

    it('uses woeid=1 by default', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTrends));
        await callTool('get_trending_topics', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('ids=1');
    });

    it('uses custom woeid when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockTrends));
        await callTool('get_trending_topics', { woeid: 23424977 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('ids=23424977');
    });
});

describe('get_tweet_metrics', () => {
    it('returns tweet with public_metrics', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockTweet }));
        const result = await getToolResult('get_tweet_metrics', { tweet_id: '1234567890123456789' });
        expect(result.data.public_metrics.like_count).toBe(42);
        expect(result.data.public_metrics.retweet_count).toBe(5);
    });

    it('missing tweet_id returns validation error', async () => {
        const body = await callTool('get_tweet_metrics', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('tweet_id');
    });

    it('requests non_public_metrics when access token is present', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ data: mockTweet }));
        await callTool('get_tweet_metrics', { tweet_id: '1234567890123456789' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('non_public_metrics');
    });
});

describe('get_mentions_timeline', () => {
    it('returns list of mention tweets', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUserTweets));
        const result = await getToolResult('get_mentions_timeline', { user_id: '987654321' });
        expect(result.data).toHaveLength(1);
    });

    it('missing user_id returns validation error', async () => {
        const body = await callTool('get_mentions_timeline', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('user_id');
    });

    it('calls correct URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUserTweets));
        await callTool('get_mentions_timeline', { user_id: '987654321' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/2/users/987654321/mentions');
    });

    it('requires TWITTER_ACCESS_TOKEN', async () => {
        const body = await callTool('get_mentions_timeline', { user_id: '987654321' }, { bearer: true, access: false });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('TWITTER_ACCESS_TOKEN');
    });
});

// ── Group 4: Bookmarks ────────────────────────────────────────────────────────

describe('get_bookmarks', () => {
    it('returns list of bookmarked tweets', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBookmarks));
        const result = await getToolResult('get_bookmarks', { user_id: '987654321' });
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('1234567890123456789');
    });

    it('missing user_id returns validation error', async () => {
        const body = await callTool('get_bookmarks', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('user_id');
    });

    it('calls correct URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBookmarks));
        await callTool('get_bookmarks', { user_id: '987654321' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/2/users/987654321/bookmarks');
    });

    it('requires TWITTER_ACCESS_TOKEN', async () => {
        const body = await callTool('get_bookmarks', { user_id: '987654321' }, { bearer: true, access: false });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('TWITTER_ACCESS_TOKEN');
    });
});

describe('bookmark_tweet', () => {
    it('returns bookmarked: true', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBookmarkResponse));
        const result = await getToolResult('bookmark_tweet', { user_id: '987654321', tweet_id: '1234567890123456789' });
        expect(result.data.bookmarked).toBe(true);
    });

    it('missing user_id returns validation error', async () => {
        const body = await callTool('bookmark_tweet', { tweet_id: '123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('user_id');
    });

    it('missing tweet_id returns validation error', async () => {
        const body = await callTool('bookmark_tweet', { user_id: '987654321' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('tweet_id');
    });

    it('POSTs to correct URL with tweet_id body', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockBookmarkResponse));
        await callTool('bookmark_tweet', { user_id: '987654321', tweet_id: '111' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/2/users/987654321/bookmarks');
        expect(call[1].method).toBe('POST');
        const reqBody = JSON.parse(call[1].body as string);
        expect(reqBody.tweet_id).toBe('111');
    });
});

describe('remove_bookmark', () => {
    it('returns empty response on success', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        const body = await callTool('remove_bookmark', { user_id: '987654321', tweet_id: '1234567890123456789' });
        expect(body.error).toBeUndefined();
    });

    it('missing user_id returns validation error', async () => {
        const body = await callTool('remove_bookmark', { tweet_id: '123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('user_id');
    });

    it('DELETEs to correct URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk204());
        await callTool('remove_bookmark', { user_id: '987654321', tweet_id: '111' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/2/users/987654321/bookmarks/111');
        expect(call[1].method).toBe('DELETE');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns authenticated user data', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMeResponse));
        const result = await getToolResult('_ping', {});
        expect(result.data.username).toBe('aerostackdev');
        expect(result.data.id).toBe('987654321');
    });

    it('calls /2/users/me endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMeResponse));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/2/users/me');
    });

    it('returns error when no tokens provided', async () => {
        const body = await callTool('_ping', {}, { bearer: false, access: false });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('uses access token over bearer when both present', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMeResponse));
        await callTool('_ping', {}, { bearer: true, access: true });
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });
});
