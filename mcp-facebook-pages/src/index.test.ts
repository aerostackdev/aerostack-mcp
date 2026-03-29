import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_TOKEN = 'test_fb_page_access_token_abc123';
const PAGE_ID = '123456789012345';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockPage = {
    id: PAGE_ID,
    name: 'My Test Business Page',
    about: 'A test page for unit testing',
    category: 'Software',
    fan_count: 4200,
    website: 'https://example.com',
    phone: '+1-555-000-0001',
    emails: ['hello@example.com'],
    link: 'https://www.facebook.com/mytestpage',
};

const mockPost = {
    id: `${PAGE_ID}_987654321`,
    message: 'Hello from our page!',
    created_time: '2026-03-15T10:00:00+0000',
    likes: { data: [], summary: { total_count: 42, can_like: true } },
    comments: { data: [], summary: { total_count: 7, can_comment: true } },
    shares: { count: 3 },
};

const mockComment = {
    id: '987654321_111222333',
    message: 'Great post!',
    from: { id: '444555666', name: 'Jane User' },
    created_time: '2026-03-15T11:00:00+0000',
    like_count: 2,
};

const mockConversation = {
    id: 'conv_abc123',
    participants: { data: [{ id: PAGE_ID, name: 'My Test Business Page' }, { id: '999888777', name: 'Customer' }] },
    updated_time: '2026-03-15T12:00:00+0000',
    snippet: 'Hey, I have a question about...',
};

const mockPhoto = {
    id: 'photo_111222',
    name: 'Product launch photo',
    created_time: '2026-03-10T09:00:00+0000',
    images: [{ height: 720, source: 'https://scontent.example.com/photo.jpg', width: 1280 }],
};

const mockVideo = {
    id: 'video_333444',
    title: 'Product Demo Video',
    description: 'A demo of our product features',
    created_time: '2026-03-08T08:00:00+0000',
    length: 120.5,
};

const mockInsights = {
    data: [
        {
            id: `${PAGE_ID}/insights/page_impressions/day`,
            name: 'page_impressions',
            period: 'day',
            values: [
                { value: 1200, end_time: '2026-03-14T07:00:00+0000' },
                { value: 1450, end_time: '2026-03-15T07:00:00+0000' },
            ],
            title: 'Daily Total Impressions',
        },
    ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fbOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function fbErr(errorData: { error: { message: string; type: string; code: number } }, status = 400) {
    return Promise.resolve(new Response(JSON.stringify(errorData), {
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
        headers['X-Mcp-Secret-FACEBOOK-PAGE-ACCESS-TOKEN'] = PAGE_TOKEN;
    }
    if (!missingSecrets.includes('pageId')) {
        headers['X-Mcp-Secret-FACEBOOK-PAGE-ID'] = PAGE_ID;
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
    it('GET / returns status ok with server mcp-facebook-pages and tools 21', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-facebook-pages');
        expect(body.tools).toBe(21);
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
        expect(body.result.serverInfo.name).toBe('mcp-facebook-pages');
    });

    it('tools/list returns all 21 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools).toHaveLength(21);
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
    it('missing token returns -32001 with FACEBOOK_PAGE_ACCESS_TOKEN in message', async () => {
        const body = await callTool('get_page', {}, ['token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('FACEBOOK_PAGE_ACCESS_TOKEN');
    });

    it('missing pageId returns -32001 with FACEBOOK_PAGE_ID in message', async () => {
        const body = await callTool('get_page', {}, ['pageId']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('FACEBOOK_PAGE_ID');
    });

    it('missing both secrets returns -32001', async () => {
        const body = await callTool('get_page', {}, ['token', 'pageId']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('access_token is appended as query param (not header)', async () => {
        mockFetch.mockReturnValueOnce(fbOk(mockPage));
        await callTool('get_page', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`access_token=${PAGE_TOKEN}`);
        const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
        expect(headers?.['Authorization']).toBeUndefined();
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns page id and name on success', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ id: PAGE_ID, name: 'My Test Business Page' }));
        const result = await getToolResult('_ping');
        expect(result.id).toBe(PAGE_ID);
        expect(result.name).toBe('My Test Business Page');
    });

    it('constructs URL with page_id and fields=id,name', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ id: PAGE_ID, name: 'Test' }));
        await callTool('_ping');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`/${PAGE_ID}`);
        expect(url).toContain('fields=id,name');
    });
});

// ── Page Info ─────────────────────────────────────────────────────────────────

describe('get_page', () => {
    it('returns full page details', async () => {
        mockFetch.mockReturnValueOnce(fbOk(mockPage));
        const result = await getToolResult('get_page');
        expect(result.id).toBe(PAGE_ID);
        expect(result.name).toBe('My Test Business Page');
        expect(result.fan_count).toBe(4200);
    });

    it('requests correct fields in URL', async () => {
        mockFetch.mockReturnValueOnce(fbOk(mockPage));
        await callTool('get_page');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('fields=id,name,about,category,fan_count,website,phone,emails,link');
    });

    it('propagates API error as -32603', async () => {
        mockFetch.mockReturnValueOnce(fbErr({
            error: { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190 },
        }, 401));
        const body = await callTool('get_page');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('Invalid OAuth access token');
    });
});

describe('get_page_insights', () => {
    it('returns insights data for page_impressions metric', async () => {
        mockFetch.mockReturnValueOnce(fbOk(mockInsights));
        const result = await getToolResult('get_page_insights', { metric: 'page_impressions' });
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe('page_impressions');
    });

    it('includes period in URL', async () => {
        mockFetch.mockReturnValueOnce(fbOk(mockInsights));
        await callTool('get_page_insights', { metric: 'page_fans', period: 'week' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('page_fans');
        expect(url).toContain('period=week');
    });

    it('missing metric returns validation error', async () => {
        const body = await callTool('get_page_insights', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('metric');
    });
});

describe('get_follower_count', () => {
    it('returns fan count insights', async () => {
        mockFetch.mockReturnValueOnce(fbOk(mockInsights));
        const result = await getToolResult('get_follower_count');
        expect(result.data).toBeDefined();
    });

    it('uses page_fans metric in URL', async () => {
        mockFetch.mockReturnValueOnce(fbOk(mockInsights));
        await callTool('get_follower_count');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('page_fans');
    });
});

describe('update_page_info', () => {
    it('sends POST with updated fields', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ success: true }));
        await callTool('update_page_info', { about: 'New about text', website: 'https://new.example.com' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        const sentBody = JSON.parse(call[1].body as string);
        expect(sentBody.about).toBe('New about text');
        expect(sentBody.website).toBe('https://new.example.com');
    });

    it('returns success response', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ success: true }));
        const result = await getToolResult('update_page_info', { about: 'Updated' });
        expect(result.success).toBe(true);
    });
});

// ── Posts ─────────────────────────────────────────────────────────────────────

describe('list_posts', () => {
    it('returns posts with engagement summaries', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ data: [mockPost], paging: {} }));
        const result = await getToolResult('list_posts');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].message).toBe('Hello from our page!');
    });

    it('uses /{pageId}/feed endpoint', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ data: [], paging: {} }));
        await callTool('list_posts', { limit: 5 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`/${PAGE_ID}/feed`);
        expect(url).toContain('limit=5');
    });
});

describe('get_post', () => {
    it('returns full post details', async () => {
        mockFetch.mockReturnValueOnce(fbOk(mockPost));
        const result = await getToolResult('get_post', { post_id: `${PAGE_ID}_987654321` });
        expect(result.id).toBe(`${PAGE_ID}_987654321`);
        expect(result.message).toBe('Hello from our page!');
    });

    it('missing post_id returns validation error', async () => {
        const body = await callTool('get_post', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('post_id');
    });
});

describe('create_post', () => {
    it('returns new post id', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ id: `${PAGE_ID}_newpost123` }));
        const result = await getToolResult('create_post', { message: 'Test post content' });
        expect(result.id).toContain('newpost123');
    });

    it('sends POST to /{pageId}/feed with message', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ id: `${PAGE_ID}_newpost456` }));
        await callTool('create_post', { message: 'Hello World', link: 'https://example.com' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain(`/${PAGE_ID}/feed`);
        expect(call[1].method).toBe('POST');
        const sentBody = JSON.parse(call[1].body as string);
        expect(sentBody.message).toBe('Hello World');
        expect(sentBody.link).toBe('https://example.com');
    });

    it('missing message returns validation error', async () => {
        const body = await callTool('create_post', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('message');
    });
});

describe('create_photo_post', () => {
    it('posts to /{pageId}/photos with url', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ id: 'photo_new789', post_id: `${PAGE_ID}_photop` }));
        await callTool('create_photo_post', { url: 'https://example.com/image.jpg', message: 'Look at this!' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain(`/${PAGE_ID}/photos`);
        const sentBody = JSON.parse(call[1].body as string);
        expect(sentBody.url).toBe('https://example.com/image.jpg');
        expect(sentBody.caption).toBe('Look at this!');
    });

    it('missing url returns validation error', async () => {
        const body = await callTool('create_photo_post', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('url');
    });
});

describe('delete_post', () => {
    it('sends DELETE request to post endpoint', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ success: true }));
        await callTool('delete_post', { post_id: `${PAGE_ID}_del123` });
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
        expect(mockFetch.mock.calls[0][0]).toContain(`${PAGE_ID}_del123`);
    });

    it('missing post_id returns validation error', async () => {
        const body = await callTool('delete_post', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('post_id');
    });
});

describe('get_post_insights', () => {
    it('returns post metrics including impressions and clicks', async () => {
        const insightsData = {
            data: [
                { name: 'post_impressions', values: [{ value: 500 }] },
                { name: 'post_engaged_users', values: [{ value: 80 }] },
                { name: 'post_clicks', values: [{ value: 40 }] },
            ],
        };
        mockFetch.mockReturnValueOnce(fbOk(insightsData));
        const result = await getToolResult('get_post_insights', { post_id: `${PAGE_ID}_987654321` });
        expect(result.data).toHaveLength(3);
    });

    it('missing post_id returns validation error', async () => {
        const body = await callTool('get_post_insights', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('post_id');
    });
});

// ── Comments ──────────────────────────────────────────────────────────────────

describe('list_comments', () => {
    it('returns comments on a post', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ data: [mockComment], paging: {} }));
        const result = await getToolResult('list_comments', { post_id: `${PAGE_ID}_987654321` });
        expect(result.data).toHaveLength(1);
        expect(result.data[0].message).toBe('Great post!');
    });

    it('includes filter param in URL', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ data: [], paging: {} }));
        await callTool('list_comments', { post_id: `${PAGE_ID}_987654321`, filter: 'stream', limit: 10 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('filter=stream');
        expect(url).toContain('limit=10');
    });

    it('missing post_id returns validation error', async () => {
        const body = await callTool('list_comments', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('post_id');
    });
});

describe('reply_to_comment', () => {
    it('posts reply to comment endpoint', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ id: 'reply_id_new' }));
        const result = await getToolResult('reply_to_comment', {
            comment_id: '987654321_111222333',
            message: 'Thank you!',
        });
        expect(result.id).toBe('reply_id_new');
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('987654321_111222333/comments');
        const sentBody = JSON.parse(call[1].body as string);
        expect(sentBody.message).toBe('Thank you!');
    });

    it('missing comment_id returns validation error', async () => {
        const body = await callTool('reply_to_comment', { message: 'Hi' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('comment_id');
    });

    it('missing message returns validation error', async () => {
        const body = await callTool('reply_to_comment', { comment_id: 'cmt123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('message');
    });
});

describe('delete_comment', () => {
    it('sends DELETE to comment endpoint', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ success: true }));
        await callTool('delete_comment', { comment_id: 'del_comment_id' });
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
        expect(mockFetch.mock.calls[0][0]).toContain('del_comment_id');
    });

    it('missing comment_id returns validation error', async () => {
        const body = await callTool('delete_comment', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('comment_id');
    });
});

describe('hide_comment', () => {
    it('sends POST with is_hidden=true to hide', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ success: true }));
        await callTool('hide_comment', { comment_id: 'hide_cmt_id', is_hidden: true });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('hide_cmt_id');
        expect(call[1].method).toBe('POST');
        const sentBody = JSON.parse(call[1].body as string);
        expect(sentBody.is_hidden).toBe(true);
    });

    it('missing is_hidden returns validation error', async () => {
        const body = await callTool('hide_comment', { comment_id: 'cmt123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('is_hidden');
    });
});

// ── Inbox/Messaging ───────────────────────────────────────────────────────────

describe('list_conversations', () => {
    it('returns conversations list', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ data: [mockConversation], paging: {} }));
        const result = await getToolResult('list_conversations');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('conv_abc123');
    });

    it('uses /{pageId}/conversations endpoint with folder param', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ data: [], paging: {} }));
        await callTool('list_conversations', { folder: 'other', limit: 5 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`/${PAGE_ID}/conversations`);
        expect(url).toContain('folder=other');
        expect(url).toContain('limit=5');
    });
});

describe('get_conversation', () => {
    it('returns conversation with messages', async () => {
        const convWithMessages = {
            ...mockConversation,
            messages: { data: [{ id: 'msg_1', message: 'Hello', from: { id: '999888777', name: 'Customer' }, created_time: '2026-03-15T12:00:00+0000' }] },
        };
        mockFetch.mockReturnValueOnce(fbOk(convWithMessages));
        const result = await getToolResult('get_conversation', { conversation_id: 'conv_abc123' });
        expect(result.id).toBe('conv_abc123');
        expect(result.messages.data).toHaveLength(1);
    });

    it('missing conversation_id returns validation error', async () => {
        const body = await callTool('get_conversation', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('conversation_id');
    });
});

describe('reply_to_conversation', () => {
    it('posts message to conversation messages endpoint', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ id: 'msg_new_reply', recipient_id: '999888777' }));
        await callTool('reply_to_conversation', { conversation_id: 'conv_abc123', message: 'Thanks for reaching out!' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('conv_abc123/messages');
        const sentBody = JSON.parse(call[1].body as string);
        expect(sentBody.message).toBe('Thanks for reaching out!');
    });

    it('missing message returns validation error', async () => {
        const body = await callTool('reply_to_conversation', { conversation_id: 'conv123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('message');
    });
});

// ── Media ─────────────────────────────────────────────────────────────────────

describe('list_photos', () => {
    it('returns photos list', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ data: [mockPhoto], paging: {} }));
        const result = await getToolResult('list_photos');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('photo_111222');
        expect(result.data[0].name).toBe('Product launch photo');
    });

    it('uses /{pageId}/photos endpoint with type=uploaded', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ data: [], paging: {} }));
        await callTool('list_photos', { limit: 10 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`/${PAGE_ID}/photos`);
        expect(url).toContain('type=uploaded');
        expect(url).toContain('limit=10');
    });
});

describe('list_videos', () => {
    it('returns videos list', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ data: [mockVideo], paging: {} }));
        const result = await getToolResult('list_videos');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].title).toBe('Product Demo Video');
        expect(result.data[0].length).toBe(120.5);
    });

    it('uses /{pageId}/videos endpoint', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ data: [], paging: {} }));
        await callTool('list_videos', { limit: 5 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`/${PAGE_ID}/videos`);
    });
});

describe('get_media_insights', () => {
    it('returns insights data for specified metrics', async () => {
        const mediaInsights = {
            data: [
                { name: 'post_impressions', values: [{ value: 300 }] },
                { name: 'post_engaged_users', values: [{ value: 45 }] },
            ],
        };
        mockFetch.mockReturnValueOnce(fbOk(mediaInsights));
        const result = await getToolResult('get_media_insights', {
            media_id: 'photo_111222',
            metric: ['post_impressions', 'post_engaged_users'],
        });
        expect(result.data).toHaveLength(2);
    });

    it('joins metric array with comma in URL', async () => {
        mockFetch.mockReturnValueOnce(fbOk({ data: [] }));
        await callTool('get_media_insights', {
            media_id: 'photo_111222',
            metric: ['post_impressions', 'post_clicks'],
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('metric=post_impressions,post_clicks');
    });

    it('missing media_id returns validation error', async () => {
        const body = await callTool('get_media_insights', { metric: ['post_impressions'] });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('media_id');
    });

    it('missing metric returns validation error', async () => {
        const body = await callTool('get_media_insights', { media_id: 'photo_111222' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('metric');
    });
});

// ── API error handling ────────────────────────────────────────────────────────

describe('API error handling', () => {
    it('Facebook OAuthException returns -32603 with message from error.message', async () => {
        mockFetch.mockReturnValueOnce(fbErr({
            error: { message: 'The access token is not valid', type: 'OAuthException', code: 190 },
        }, 401));
        const body = await callTool('get_page');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('The access token is not valid');
    });

    it('non-JSON response throws -32603 with status code', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response('Service Unavailable', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
        })));
        const body = await callTool('get_page');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });

    it('unknown tool name returns -32601', async () => {
        const body = await callTool('nonexistent_tool');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
        expect(body.error!.message).toContain('Unknown tool');
    });
});
