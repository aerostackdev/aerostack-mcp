import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'act.test_tiktok_token_abc123xyz';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockUser = {
    data: {
        user: {
            open_id: 'user_open_id_abc123',
            union_id: 'union_id_xyz789',
            avatar_url: 'https://p16-sign.tiktokcdn.com/avatar.jpg',
            display_name: 'My Brand Account',
            bio_description: 'Official brand TikTok account',
            profile_deep_link: 'https://www.tiktok.com/@mybrand',
            is_verified: true,
            follower_count: 125000,
            following_count: 250,
            likes_count: 980000,
            video_count: 340,
        },
    },
    error: { code: 'ok', message: '' },
};

const mockVideoList = {
    data: {
        videos: [
            {
                id: '7123456789012345678',
                title: 'My latest video',
                description: 'Check this out! #fyp',
                create_time: 1709280000,
                duration: 45,
                view_count: 250000,
                like_count: 18500,
                comment_count: 342,
                share_count: 1200,
            },
            {
                id: '7123456789012345679',
                title: 'Behind the scenes',
                description: 'BTS #brand',
                create_time: 1709193600,
                duration: 30,
                view_count: 89000,
                like_count: 6400,
                comment_count: 98,
                share_count: 450,
            },
        ],
        cursor: 20,
        has_more: true,
    },
    error: { code: 'ok', message: '' },
};

const mockSingleVideo = {
    data: {
        videos: [{
            id: '7123456789012345678',
            title: 'My latest video',
            description: 'Check this out! #fyp',
            create_time: 1709280000,
            duration: 45,
            height: 1920,
            width: 1080,
            view_count: 250000,
            like_count: 18500,
            comment_count: 342,
            share_count: 1200,
            embed_link: 'https://www.tiktok.com/embed/v2/7123456789012345678',
        }],
    },
    error: { code: 'ok', message: '' },
};

const mockComments = {
    data: {
        comments: [
            { cid: 'comment_001', text: 'This is amazing!', create_time: 1709280100, like_count: 45, reply_count: 3, user: { display_name: 'fan123' } },
            { cid: 'comment_002', text: 'Love this content', create_time: 1709280200, like_count: 12, reply_count: 0, user: { display_name: 'user456' } },
        ],
        cursor: 20,
        has_more: false,
    },
    error: { code: 'ok', message: '' },
};

const mockLikeResponse = {
    data: {},
    error: { code: 'ok', message: 'Like successful' },
};

const mockFollowers = {
    data: {
        followers: [
            { open_id: 'follower_001', display_name: 'Fan Account 1', avatar_url: 'https://example.com/avatar1.jpg' },
            { open_id: 'follower_002', display_name: 'Fan Account 2', avatar_url: 'https://example.com/avatar2.jpg' },
        ],
        cursor: 20,
        has_more: true,
    },
    error: { code: 'ok', message: '' },
};

const mockVideoAnalytics = {
    data: {
        videos: [{
            id: '7123456789012345678',
            view_count: 250000,
            like_count: 18500,
            comment_count: 342,
            share_count: 1200,
            avg_time_watched: 32.5,
            full_video_watched_rate: 0.42,
        }],
    },
    error: { code: 'ok', message: '' },
};

const mockCreatorStats = {
    data: {
        follower_count: 125000,
        video_views: 3400000,
        profile_views: 85000,
        likes: 980000,
    },
    error: { code: 'ok', message: '' },
};

const mockTrendingVideos = {
    data: {
        videos: [
            { id: 'trending_001', title: 'Trending video 1', view_count: 5000000, like_count: 400000, region_code: 'US' },
            { id: 'trending_002', title: 'Trending video 2', view_count: 3200000, like_count: 250000, region_code: 'US' },
        ],
    },
    error: { code: 'ok', message: '' },
};

const mockSearchResults = {
    data: {
        videos: [
            { id: 'search_001', title: 'How to code', description: 'Programming tutorial', view_count: 120000, like_count: 8500 },
        ],
        cursor: 20,
        has_more: false,
    },
    error: { code: 'ok', message: '' },
};

const mockHashtags = {
    data: {
        keywords: [
            { hashtag_name: 'fyp', video_count: 5000000000, view_count: 50000000000 },
            { hashtag_name: 'trending', video_count: 2000000000, view_count: 20000000000 },
        ],
    },
    error: { code: 'ok', message: '' },
};

const mockSearchUser = {
    data: {
        user_list: [
            { open_id: 'user_001', display_name: 'Brand Official', avatar_url: 'https://example.com/brand.jpg', follower_count: 50000 },
        ],
    },
    error: { code: 'ok', message: '' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ttOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function ttErr(message: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ error: { code: 'error', message } }), {
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
    if (!missingSecrets.includes('token')) {
        headers['X-Mcp-Secret-TIKTOK-ACCESS-TOKEN'] = ACCESS_TOKEN;
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
    it('GET / returns status ok with server mcp-tiktok and tools 15', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-tiktok');
        expect(body.tools).toBe(15);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'invalid json{{{',
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
        expect(body.result.serverInfo.name).toBe('mcp-tiktok');
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
    it('returns -32001 when token is missing', async () => {
        const body = await callTool('_ping', {}, ['token']);
        expect(body.error?.code).toBe(-32001);
        expect(body.error?.message).toContain('TIKTOK_ACCESS_TOKEN');
    });
});

// ── Group 1 — Videos ─────────────────────────────────────────────────────────

describe('list_videos', () => {
    it('returns a list of videos for the authenticated creator', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockVideoList));
        const result = await getToolResult('list_videos', { max_count: 2 });
        expect(result.data.videos).toHaveLength(2);
        expect(result.data.videos[0].view_count).toBe(250000);
    });

    it('uses default max_count when not specified', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockVideoList));
        await getToolResult('list_videos', {});
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { max_count: number };
        expect(callBody.max_count).toBe(20);
    });
});

describe('get_video', () => {
    it('returns details for a specific video', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockSingleVideo));
        const result = await getToolResult('get_video', { video_id: '7123456789012345678' });
        expect(result.data.videos[0].id).toBe('7123456789012345678');
        expect(result.data.videos[0].embed_link).toBeDefined();
    });

    it('throws when video_id is missing', async () => {
        const body = await callTool('get_video', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('video_id');
    });
});

describe('query_videos', () => {
    it('queries videos with date range filter', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockVideoList));
        const result = await getToolResult('query_videos', {
            start_date: '2026-03-01',
            end_date: '2026-03-07',
        });
        expect(result.data.videos).toBeDefined();
    });

    it('queries videos without filters', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockVideoList));
        const result = await getToolResult('query_videos', {});
        expect(result.data.videos).toBeDefined();
    });
});

describe('get_video_comments', () => {
    it('returns comments for a video', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockComments));
        const result = await getToolResult('get_video_comments', { video_id: '7123456789012345678' });
        expect(result.data.comments).toHaveLength(2);
        expect(result.data.comments[0].text).toBe('This is amazing!');
    });

    it('throws when video_id is missing', async () => {
        const body = await callTool('get_video_comments', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('video_id');
    });

    it('handles API error', async () => {
        mockFetch.mockResolvedValueOnce(ttErr('Video not found', 404));
        const body = await callTool('get_video_comments', { video_id: 'invalid' });
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('404');
    });
});

describe('like_video', () => {
    it('likes a video successfully', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockLikeResponse));
        const result = await getToolResult('like_video', { video_id: '7123456789012345678' });
        expect(result.error.code).toBe('ok');
    });

    it('throws when video_id is missing', async () => {
        const body = await callTool('like_video', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('video_id');
    });
});

// ── Group 2 — User Profile ────────────────────────────────────────────────────

describe('get_user_info', () => {
    it('returns authenticated user profile', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockUser));
        const result = await getToolResult('get_user_info', {});
        expect(result.data.user.display_name).toBe('My Brand Account');
        expect(result.data.user.follower_count).toBe(125000);
    });

    it('handles API authentication error', async () => {
        mockFetch.mockResolvedValueOnce(ttErr('Access token expired', 401));
        const body = await callTool('get_user_info', {});
        expect(body.error).toBeDefined();
    });
});

describe('search_user', () => {
    it('returns users matching username', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockSearchUser));
        const result = await getToolResult('search_user', { username: 'brandofficial' });
        expect(result.data.user_list[0].display_name).toBe('Brand Official');
    });

    it('throws when username is missing', async () => {
        const body = await callTool('search_user', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('username');
    });
});

describe('get_user_videos', () => {
    it('returns public videos for a user', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockVideoList));
        const result = await getToolResult('get_user_videos', { username: 'mybrand', max_count: 5 });
        expect(result.data.videos).toBeDefined();
    });

    it('throws when username is missing', async () => {
        const body = await callTool('get_user_videos', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('username');
    });
});

describe('get_user_followers', () => {
    it('returns follower list', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockFollowers));
        const result = await getToolResult('get_user_followers', { max_count: 2 });
        expect(result.data.followers).toHaveLength(2);
        expect(result.data.followers[0].display_name).toBe('Fan Account 1');
    });

    it('returns default page of followers', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockFollowers));
        const result = await getToolResult('get_user_followers', {});
        expect(result.data.followers).toBeDefined();
    });
});

// ── Group 3 — Analytics ───────────────────────────────────────────────────────

describe('get_video_analytics', () => {
    it('returns analytics for a video in date range', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockVideoAnalytics));
        const result = await getToolResult('get_video_analytics', {
            video_id: '7123456789012345678',
            start_date: '20260301',
            end_date: '20260307',
        });
        expect(result.data.videos[0].view_count).toBe(250000);
        expect(result.data.videos[0].avg_time_watched).toBe(32.5);
    });

    it('throws when video_id is missing', async () => {
        const body = await callTool('get_video_analytics', {
            start_date: '20260301',
            end_date: '20260307',
        });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('video_id');
    });

    it('throws when start_date is missing', async () => {
        const body = await callTool('get_video_analytics', {
            video_id: '7123456789012345678',
            end_date: '20260307',
        });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('start_date');
    });
});

describe('get_creator_analytics', () => {
    it('returns creator stats for date range', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockCreatorStats));
        const result = await getToolResult('get_creator_analytics', {
            start_date: '20260301',
            end_date: '20260307',
        });
        expect(result.data.follower_count).toBe(125000);
        expect(result.data.video_views).toBe(3400000);
    });

    it('throws when date range is missing', async () => {
        const body = await callTool('get_creator_analytics', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('start_date');
    });
});

describe('get_trending_videos', () => {
    it('returns trending videos globally', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockTrendingVideos));
        const result = await getToolResult('get_trending_videos', {});
        expect(result.data.videos).toHaveLength(2);
        expect(result.data.videos[0].view_count).toBe(5000000);
    });

    it('returns trending videos for a specific region', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockTrendingVideos));
        const result = await getToolResult('get_trending_videos', { region_code: 'US' });
        expect(result.data.videos[0].region_code).toBe('US');
    });
});

// ── Group 4 — Discovery ───────────────────────────────────────────────────────

describe('search_videos', () => {
    it('returns videos matching query', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockSearchResults));
        const result = await getToolResult('search_videos', { query: 'coding tutorial' });
        expect(result.data.videos[0].title).toBe('How to code');
    });

    it('throws when query is missing', async () => {
        const body = await callTool('search_videos', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('query');
    });
});

describe('get_trending_hashtags', () => {
    it('returns trending hashtags with counts', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockHashtags));
        const result = await getToolResult('get_trending_hashtags', {});
        expect(result.data.keywords[0].hashtag_name).toBe('fyp');
        expect(result.data.keywords[0].video_count).toBe(5000000000);
    });

    it('accepts region_code filter', async () => {
        mockFetch.mockResolvedValueOnce(ttOk(mockHashtags));
        await getToolResult('get_trending_hashtags', { region_code: 'US' });
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { region_code: string };
        expect(callBody.region_code).toBe('US');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns ok: true with open_id on success', async () => {
        mockFetch.mockResolvedValueOnce(ttOk({ data: { user: { open_id: 'user_open_id_abc123' } }, error: { code: 'ok', message: '' } }));
        const result = await getToolResult('_ping', {});
        expect(result.ok).toBe(true);
        expect(result.open_id).toBe('user_open_id_abc123');
    });

    it('propagates API error on invalid token', async () => {
        mockFetch.mockResolvedValueOnce(ttErr('Access token is invalid or expired', 401));
        const body = await callTool('_ping', {});
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('401');
    });
});

// ── Unknown tool ──────────────────────────────────────────────────────────────

describe('Unknown tool', () => {
    it('returns -32601 for unknown tool name', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error?.code).toBe(-32601);
        expect(body.error?.message).toContain('Unknown tool');
    });
});
