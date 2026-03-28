import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'EAABsbCS1iHgBOtest_token_abc123';
const ACCOUNT_ID = '17841400000000001';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockMedia = {
    id: '17854360229135492',
    caption: 'Beautiful sunset over the mountains #travel #nature',
    media_type: 'IMAGE',
    media_url: 'https://example.com/photo.jpg',
    thumbnail_url: null,
    timestamp: '2026-03-01T12:00:00+0000',
    permalink: 'https://www.instagram.com/p/ABC123/',
    like_count: 245,
    comments_count: 18,
};

const mockMediaList = {
    data: [
        { id: '17854360229135492', caption: 'Post 1', media_type: 'IMAGE', media_url: 'https://example.com/1.jpg', timestamp: '2026-03-01T12:00:00+0000', permalink: 'https://www.instagram.com/p/ABC123/' },
        { id: '17854360229135493', caption: 'Post 2', media_type: 'VIDEO', media_url: 'https://example.com/2.mp4', timestamp: '2026-02-28T10:00:00+0000', permalink: 'https://www.instagram.com/p/DEF456/' },
    ],
    paging: {
        cursors: { before: 'cursor_before', after: 'cursor_after' },
        next: 'https://graph.facebook.com/next',
    },
};

const mockComment = {
    id: '17858893269000001',
    text: 'Amazing shot!',
    username: 'user123',
    timestamp: '2026-03-01T14:00:00+0000',
};

const mockContainer = { id: '17855590435581234' };
const mockPublish = { id: '17854360229135999' };

const mockInsights = {
    data: [
        { name: 'impressions', period: 'lifetime', values: [{ value: 1250 }], title: 'Impressions' },
        { name: 'reach', period: 'lifetime', values: [{ value: 980 }], title: 'Reach' },
        { name: 'likes', period: 'lifetime', values: [{ value: 245 }], title: 'Likes' },
        { name: 'comments', period: 'lifetime', values: [{ value: 18 }], title: 'Comments' },
        { name: 'saved', period: 'lifetime', values: [{ value: 42 }], title: 'Saved' },
    ],
};

const mockAccountInfo = {
    id: ACCOUNT_ID,
    name: 'My Instagram Business',
    username: 'mybusiness',
};

const mockHashtagSearch = {
    data: [{ id: '17841593698074077' }],
};

const mockHashtagMedia = {
    data: [
        { id: '17854360229135001', caption: 'Travel photo', media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/XYZ/', timestamp: '2026-03-01T12:00:00+0000' },
    ],
    paging: { cursors: { after: 'next_cursor' } },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function igOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function igErr(error: { message: string; code: number }, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ error }), {
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
        headers['X-Mcp-Secret-INSTAGRAM-ACCESS-TOKEN'] = ACCESS_TOKEN;
    }
    if (!missingSecrets.includes('accountId')) {
        headers['X-Mcp-Secret-INSTAGRAM-BUSINESS-ACCOUNT-ID'] = ACCOUNT_ID;
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
    it('GET / returns status ok with server mcp-instagram and tools 17', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-instagram');
        expect(body.tools).toBe(17);
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
        expect(body.result.serverInfo.name).toBe('mcp-instagram');
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
        expect(body.error?.message).toContain('INSTAGRAM_ACCESS_TOKEN');
    });

    it('returns -32001 when accountId is missing', async () => {
        const body = await callTool('_ping', {}, ['accountId']);
        expect(body.error?.code).toBe(-32001);
        expect(body.error?.message).toContain('INSTAGRAM_BUSINESS_ACCOUNT_ID');
    });
});

// ── Group 1 — Media & Posts ───────────────────────────────────────────────────

describe('get_media', () => {
    it('returns media details for a given media_id', async () => {
        mockFetch.mockResolvedValueOnce(igOk(mockMedia));
        const result = await getToolResult('get_media', { media_id: '17854360229135492' });
        expect(result.id).toBe('17854360229135492');
        expect(result.media_type).toBe('IMAGE');
        expect(result.like_count).toBe(245);
    });

    it('throws when media_id is missing', async () => {
        const body = await callTool('get_media', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('media_id');
    });

    it('handles Instagram API error', async () => {
        mockFetch.mockResolvedValueOnce(igErr({ message: 'Invalid OAuth access token', code: 190 }, 400));
        const body = await callTool('get_media', { media_id: 'invalid' });
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('400');
    });
});

describe('list_media', () => {
    it('returns paginated media list', async () => {
        mockFetch.mockResolvedValueOnce(igOk(mockMediaList));
        const result = await getToolResult('list_media', { limit: 2 });
        expect(result.data).toHaveLength(2);
        expect(result.paging.cursors.after).toBe('cursor_after');
    });

    it('uses default limit when not specified', async () => {
        mockFetch.mockResolvedValueOnce(igOk(mockMediaList));
        const result = await getToolResult('list_media', {});
        expect(result.data).toBeDefined();
    });
});

describe('create_photo_post', () => {
    it('creates container then publishes photo', async () => {
        mockFetch
            .mockResolvedValueOnce(igOk(mockContainer))
            .mockResolvedValueOnce(igOk(mockPublish));
        const result = await getToolResult('create_photo_post', {
            image_url: 'https://example.com/photo.jpg',
            caption: 'Check out this amazing view! #travel',
        });
        expect(result.id).toBe(mockPublish.id);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws when image_url is missing', async () => {
        const body = await callTool('create_photo_post', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('image_url');
    });
});

describe('create_video_post', () => {
    it('creates and publishes a reel by default', async () => {
        mockFetch
            .mockResolvedValueOnce(igOk(mockContainer))
            .mockResolvedValueOnce(igOk(mockPublish));
        const result = await getToolResult('create_video_post', {
            video_url: 'https://example.com/video.mp4',
            caption: 'New reel! #reels',
        });
        expect(result.id).toBe(mockPublish.id);
    });

    it('throws when video_url is missing', async () => {
        const body = await callTool('create_video_post', {});
        expect(body.error?.code).toBe(-32603);
    });
});

describe('create_carousel_post', () => {
    it('creates child containers, carousel, then publishes', async () => {
        mockFetch
            .mockResolvedValueOnce(igOk({ id: 'child1' }))
            .mockResolvedValueOnce(igOk({ id: 'child2' }))
            .mockResolvedValueOnce(igOk(mockContainer))
            .mockResolvedValueOnce(igOk(mockPublish));
        const result = await getToolResult('create_carousel_post', {
            image_urls: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
            caption: 'Multi-photo post',
        });
        expect(result.id).toBe(mockPublish.id);
        expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('throws when fewer than 2 images provided', async () => {
        const body = await callTool('create_carousel_post', { image_urls: ['https://example.com/1.jpg'] });
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('at least 2');
    });

    it('throws when image_urls is missing', async () => {
        const body = await callTool('create_carousel_post', {});
        expect(body.error?.code).toBe(-32603);
    });
});

describe('delete_media', () => {
    it('deletes a media object', async () => {
        mockFetch.mockResolvedValueOnce(igOk({ success: true }));
        const result = await getToolResult('delete_media', { media_id: '17854360229135492' });
        expect(result.success).toBe(true);
    });

    it('throws when media_id is missing', async () => {
        const body = await callTool('delete_media', {});
        expect(body.error?.code).toBe(-32603);
    });
});

// ── Group 2 — Comments & Engagement ──────────────────────────────────────────

describe('get_comments', () => {
    it('returns comments for a media object', async () => {
        mockFetch.mockResolvedValueOnce(igOk({ data: [mockComment], paging: {} }));
        const result = await getToolResult('get_comments', { media_id: '17854360229135492' });
        expect(result.data[0].text).toBe('Amazing shot!');
        expect(result.data[0].username).toBe('user123');
    });

    it('throws when media_id is missing', async () => {
        const body = await callTool('get_comments', {});
        expect(body.error?.code).toBe(-32603);
    });
});

describe('reply_to_comment', () => {
    it('posts a reply to a comment', async () => {
        mockFetch.mockResolvedValueOnce(igOk({ id: '17858893269000002', timestamp: '2026-03-01T15:00:00+0000' }));
        const result = await getToolResult('reply_to_comment', {
            comment_id: '17858893269000001',
            message: 'Thank you so much!',
        });
        expect(result.id).toBeDefined();
    });

    it('throws when comment_id is missing', async () => {
        const body = await callTool('reply_to_comment', { message: 'hi' });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('comment_id');
    });

    it('throws when message is missing', async () => {
        const body = await callTool('reply_to_comment', { comment_id: '12345' });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('message');
    });
});

describe('delete_comment', () => {
    it('deletes a comment', async () => {
        mockFetch.mockResolvedValueOnce(igOk({ success: true }));
        const result = await getToolResult('delete_comment', { comment_id: '17858893269000001' });
        expect(result.success).toBe(true);
    });

    it('throws when comment_id is missing', async () => {
        const body = await callTool('delete_comment', {});
        expect(body.error?.code).toBe(-32603);
    });
});

describe('get_media_insights', () => {
    it('returns engagement metrics for a post', async () => {
        mockFetch.mockResolvedValueOnce(igOk(mockInsights));
        const result = await getToolResult('get_media_insights', { media_id: '17854360229135492' });
        expect(result.data[0].name).toBe('impressions');
        expect(result.data[0].values[0].value).toBe(1250);
    });

    it('throws when media_id is missing', async () => {
        const body = await callTool('get_media_insights', {});
        expect(body.error?.code).toBe(-32603);
    });
});

// ── Group 3 — Account & Stories ───────────────────────────────────────────────

describe('get_account_insights', () => {
    it('returns account insights for date range', async () => {
        const mockAccountInsights = {
            data: [
                { name: 'impressions', period: 'day', values: [{ value: 500, end_time: '2026-03-01T08:00:00+0000' }] },
                { name: 'reach', period: 'day', values: [{ value: 380, end_time: '2026-03-01T08:00:00+0000' }] },
            ],
        };
        mockFetch.mockResolvedValueOnce(igOk(mockAccountInsights));
        const result = await getToolResult('get_account_insights', {
            since: '2026-03-01',
            until: '2026-03-07',
        });
        expect(result.data[0].name).toBe('impressions');
    });

    it('throws when since is missing', async () => {
        const body = await callTool('get_account_insights', { until: '2026-03-07' });
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('since');
    });
});

describe('get_followers_demographics', () => {
    it('returns demographics breakdown by age', async () => {
        const mockDemographics = {
            data: [{ name: 'follower_demographics', id: ACCOUNT_ID }],
        };
        mockFetch.mockResolvedValueOnce(igOk(mockDemographics));
        const result = await getToolResult('get_followers_demographics', { breakdown: 'age' });
        expect(result.data).toBeDefined();
    });

    it('uses age as default breakdown', async () => {
        mockFetch.mockResolvedValueOnce(igOk({ data: [] }));
        await getToolResult('get_followers_demographics', {});
        const callUrl = mockFetch.mock.calls[0][0] as string;
        expect(callUrl).toContain('breakdown=age');
    });
});

describe('get_stories', () => {
    it('returns active stories for the account', async () => {
        const mockStories = {
            data: [
                { id: '17854360229135400', media_type: 'IMAGE', media_url: 'https://example.com/story.jpg', timestamp: '2026-03-01T12:00:00+0000', permalink: 'https://www.instagram.com/stories/1/' },
            ],
        };
        mockFetch.mockResolvedValueOnce(igOk(mockStories));
        const result = await getToolResult('get_stories', {});
        expect(result.data[0].media_type).toBe('IMAGE');
    });
});

describe('get_story_insights', () => {
    it('returns insights for a story', async () => {
        const mockStoryInsights = {
            data: [
                { name: 'impressions', period: 'lifetime', values: [{ value: 340 }] },
                { name: 'reach', period: 'lifetime', values: [{ value: 290 }] },
                { name: 'exits', period: 'lifetime', values: [{ value: 12 }] },
            ],
        };
        mockFetch.mockResolvedValueOnce(igOk(mockStoryInsights));
        const result = await getToolResult('get_story_insights', { story_id: '17854360229135400' });
        expect(result.data[0].name).toBe('impressions');
    });

    it('throws when story_id is missing', async () => {
        const body = await callTool('get_story_insights', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('story_id');
    });
});

// ── Group 4 — Hashtags & Discovery ───────────────────────────────────────────

describe('search_hashtag', () => {
    it('searches hashtag and returns top media', async () => {
        mockFetch
            .mockResolvedValueOnce(igOk(mockHashtagSearch))
            .mockResolvedValueOnce(igOk(mockHashtagMedia));
        const result = await getToolResult('search_hashtag', { hashtag: 'travel' });
        expect(result.hashtag_id).toBe('17841593698074077');
        expect(result.hashtag).toBe('travel');
        expect(result.top_media.data).toHaveLength(1);
    });

    it('returns empty result when hashtag not found', async () => {
        mockFetch.mockResolvedValueOnce(igOk({ data: [] }));
        const result = await getToolResult('search_hashtag', { hashtag: 'nonexistent12345xyz' });
        expect(result.data).toHaveLength(0);
    });

    it('throws when hashtag is missing', async () => {
        const body = await callTool('search_hashtag', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('hashtag');
    });
});

describe('get_hashtag_insights', () => {
    it('returns hashtag info and recent media', async () => {
        mockFetch
            .mockResolvedValueOnce(igOk({ id: '17841593698074077', name: 'travel' }))
            .mockResolvedValueOnce(igOk(mockHashtagMedia));
        const result = await getToolResult('get_hashtag_insights', { hashtag_id: '17841593698074077' });
        expect(result.hashtag_info.name).toBe('travel');
        expect(result.recent_media.data).toBeDefined();
    });

    it('throws when hashtag_id is missing', async () => {
        const body = await callTool('get_hashtag_insights', {});
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('hashtag_id');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns ok: true with account id and name on success', async () => {
        mockFetch.mockResolvedValueOnce(igOk(mockAccountInfo));
        const result = await getToolResult('_ping', {});
        expect(result.ok).toBe(true);
        expect(result.account_id).toBe(ACCOUNT_ID);
        expect(result.name).toBe('My Instagram Business');
    });

    it('propagates API error on invalid token', async () => {
        mockFetch.mockResolvedValueOnce(igErr({ message: 'Invalid OAuth access token.', code: 190 }, 401));
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
