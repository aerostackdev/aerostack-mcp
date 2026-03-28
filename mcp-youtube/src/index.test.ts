import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_KEY = 'test_yt_api_key_abc123';
const ACCESS_TOKEN = 'test_yt_access_token_xyz789';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockVideoSnippet = {
    kind: 'youtube#video',
    id: 'dQw4w9WgXcQ',
    snippet: {
        publishedAt: '2009-10-25T06:57:33Z',
        channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
        title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
        description: 'The official video for "Never Gonna Give You Up" by Rick Astley',
        channelTitle: 'Rick Astley',
        thumbnails: {
            default: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg', width: 120, height: 90 },
        },
    },
    contentDetails: { duration: 'PT3M33S', dimension: '2d', definition: 'hd' },
    statistics: { viewCount: '1400000000', likeCount: '14000000', commentCount: '2700000' },
};

const mockSearchResult = {
    kind: 'youtube#searchListResponse',
    etag: 'abc123',
    regionCode: 'US',
    pageInfo: { totalResults: 1, resultsPerPage: 10 },
    items: [
        {
            kind: 'youtube#searchResult',
            etag: 'def456',
            id: { kind: 'youtube#video', videoId: 'dQw4w9WgXcQ' },
            snippet: {
                publishedAt: '2009-10-25T06:57:33Z',
                channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
                title: 'Rick Astley - Never Gonna Give You Up',
                description: 'The official video',
                channelTitle: 'Rick Astley',
            },
        },
    ],
};

const mockChannelResult = {
    kind: 'youtube#channelListResponse',
    etag: 'abc',
    pageInfo: { totalResults: 1, resultsPerPage: 5 },
    items: [
        {
            kind: 'youtube#channel',
            etag: 'xyz',
            id: 'UCuAXFkgsw1L7xaCfnd5JJOw',
            snippet: {
                title: 'Rick Astley',
                description: 'Official Rick Astley channel',
                publishedAt: '2012-02-12T00:00:00Z',
            },
            statistics: {
                viewCount: '2000000000',
                subscriberCount: '3500000',
                videoCount: '100',
            },
        },
    ],
};

const mockPlaylistResult = {
    kind: 'youtube#playlistListResponse',
    etag: 'abc',
    pageInfo: { totalResults: 1, resultsPerPage: 20 },
    items: [
        {
            kind: 'youtube#playlist',
            etag: 'xyz',
            id: 'PLtestplaylist123',
            snippet: {
                publishedAt: '2020-01-01T00:00:00Z',
                title: 'My Favourites',
                description: 'A curated playlist',
                channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
            },
            contentDetails: { itemCount: 15 },
        },
    ],
};

const mockCommentThreadResult = {
    kind: 'youtube#commentThreadListResponse',
    etag: 'abc',
    pageInfo: { totalResults: 2, resultsPerPage: 20 },
    items: [
        {
            kind: 'youtube#commentThread',
            etag: 'xyz',
            id: 'Ugxabc123',
            snippet: {
                videoId: 'dQw4w9WgXcQ',
                topLevelComment: {
                    kind: 'youtube#comment',
                    id: 'Ugxabc123',
                    snippet: {
                        textDisplay: 'Never gonna give you up!',
                        authorDisplayName: 'FanUser1',
                        likeCount: 42,
                        publishedAt: '2024-01-01T12:00:00Z',
                    },
                },
                totalReplyCount: 2,
            },
        },
    ],
};

const mockAnalyticsResult = {
    kind: 'youtubeAnalytics#resultTable',
    columnHeaders: [
        { name: 'day', dataType: 'STRING' },
        { name: 'views', dataType: 'INTEGER' },
        { name: 'estimatedMinutesWatched', dataType: 'INTEGER' },
    ],
    rows: [
        ['2026-03-01', 1234, 5678],
        ['2026-03-02', 2345, 6789],
    ],
};

const mockVideoCategoriesResult = {
    kind: 'youtube#videoCategoryListResponse',
    etag: 'abc',
    items: [
        { kind: 'youtube#videoCategory', etag: 'xyz', id: '1', snippet: { title: 'Film & Animation', assignable: true } },
        { kind: 'youtube#videoCategory', etag: 'xyz2', id: '2', snippet: { title: 'Autos & Vehicles', assignable: true } },
    ],
};

const mockCaptionsResult = {
    kind: 'youtube#captionListResponse',
    etag: 'abc',
    items: [
        {
            kind: 'youtube#caption',
            etag: 'xyz',
            id: 'AUieDabc',
            snippet: {
                videoId: 'dQw4w9WgXcQ',
                lastUpdated: '2020-01-01T00:00:00Z',
                trackKind: 'standard',
                language: 'en',
                name: 'English',
                audioTrackType: 'unknown',
                isCC: false,
                isLarge: false,
                isEasyReader: false,
                isDraft: false,
                isAutoSynced: false,
                status: 'serving',
            },
        },
    ],
};

const mockChannelSectionsResult = {
    kind: 'youtube#channelSectionListResponse',
    etag: 'abc',
    items: [
        {
            kind: 'youtube#channelSection',
            etag: 'xyz',
            id: 'section1',
            snippet: {
                type: 'singlePlaylist',
                channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
                title: 'Featured Playlist',
                position: 0,
            },
            contentDetails: { playlists: ['PLtestplaylist123'] },
        },
    ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ytOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function ytOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function ytErr(message: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({
        error: {
            code: status,
            message,
            errors: [{ message, domain: 'youtube.quota', reason: 'quotaExceeded' }],
        },
    }), {
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
    if (!missingSecrets.includes('apiKey')) {
        headers['X-Mcp-Secret-YOUTUBE-API-KEY'] = API_KEY;
    }
    if (!missingSecrets.includes('accessToken')) {
        headers['X-Mcp-Secret-YOUTUBE-ACCESS-TOKEN'] = ACCESS_TOKEN;
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
    it('GET / returns status ok with server mcp-youtube and tools 21', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-youtube');
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
        expect(body.result.serverInfo.name).toBe('mcp-youtube');
    });

    it('tools/list returns exactly 21 tools with name, description, inputSchema', async () => {
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
    it('missing both secrets returns -32001', async () => {
        const body = await callTool('search_videos', { query: 'test' }, ['apiKey', 'accessToken']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('only apiKey is sufficient for read tools', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockSearchResult));
        const req = makeToolReq('search_videos', { query: 'test' }, ['accessToken']);
        const res = await worker.fetch(req);
        const body = await res.json() as { error?: unknown };
        expect(body.error).toBeUndefined();
    });

    it('only accessToken is sufficient for read tools', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockSearchResult));
        const req = makeToolReq('search_videos', { query: 'test' }, ['apiKey']);
        const res = await worker.fetch(req);
        const body = await res.json() as { error?: unknown };
        expect(body.error).toBeUndefined();
    });

    it('write tool without accessToken returns error message', async () => {
        const req = makeToolReq('rate_video', { video_id: 'dQw4w9WgXcQ', rating: 'like' }, ['accessToken']);
        const res = await worker.fetch(req);
        const body = await res.json() as { error?: { code: number; message: string } };
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('YOUTUBE_ACCESS_TOKEN');
    });

    it('API key is appended as query param in fetch URL', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockSearchResult));
        await callTool('search_videos', { query: 'rick astley' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('key=test_yt_api_key_abc123');
    });

    it('OAuth tools set Authorization Bearer header', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockChannelResult));
        await callTool('get_my_channel', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });
});

// ── Videos ────────────────────────────────────────────────────────────────────

describe('search_videos', () => {
    it('returns search results with items array', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockSearchResult));
        const result = await getToolResult('search_videos', { query: 'rick astley' });
        expect(result.items).toHaveLength(1);
        expect(result.items[0].id.videoId).toBe('dQw4w9WgXcQ');
    });

    it('includes correct query params in URL', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockSearchResult));
        await callTool('search_videos', { query: 'test', maxResults: 5, order: 'date' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('q=test');
        expect(url).toContain('maxResults=5');
        expect(url).toContain('order=date');
        expect(url).toContain('type=video');
    });

    it('supports videoDuration filter', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockSearchResult));
        await callTool('search_videos', { query: 'tutorial', videoDuration: 'long' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('videoDuration=long');
    });

    it('missing query returns -32603 with missing param message', async () => {
        const body = await callTool('search_videos', {});
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('query');
    });

    it('API error propagates correct code and message', async () => {
        mockFetch.mockReturnValueOnce(ytErr('quotaExceeded', 403));
        const body = await callTool('search_videos', { query: 'test' });
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('403');
    });
});

describe('get_video', () => {
    it('returns video details with snippet and statistics', async () => {
        mockFetch.mockReturnValueOnce(ytOk({ ...mockSearchResult, items: [mockVideoSnippet] }));
        const result = await getToolResult('get_video', { video_id: 'dQw4w9WgXcQ' });
        expect(result.items[0].id).toBe('dQw4w9WgXcQ');
        expect(result.items[0].statistics.viewCount).toBe('1400000000');
    });

    it('requests snippet,contentDetails,statistics parts', async () => {
        mockFetch.mockReturnValueOnce(ytOk({ items: [mockVideoSnippet] }));
        await callTool('get_video', { video_id: 'dQw4w9WgXcQ' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('part=snippet%2CcontentDetails%2Cstatistics');
        expect(url).toContain('id=dQw4w9WgXcQ');
    });

    it('missing video_id returns -32603', async () => {
        const body = await callTool('get_video', {});
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('video_id');
    });
});

describe('list_channel_videos', () => {
    it('returns videos for the given channel', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockSearchResult));
        const result = await getToolResult('list_channel_videos', { channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw' });
        expect(result.items).toHaveLength(1);
    });

    it('includes channelId in URL params', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockSearchResult));
        await callTool('list_channel_videos', { channel_id: 'UCtest', maxResults: 25 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('channelId=UCtest');
        expect(url).toContain('maxResults=25');
    });

    it('missing channel_id returns -32603', async () => {
        const body = await callTool('list_channel_videos', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('get_video_categories', () => {
    it('returns category list', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockVideoCategoriesResult));
        const result = await getToolResult('get_video_categories', {});
        expect(result.items).toHaveLength(2);
        expect(result.items[0].snippet.title).toBe('Film & Animation');
    });

    it('defaults to US region', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockVideoCategoriesResult));
        await callTool('get_video_categories', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('regionCode=US');
    });

    it('uses provided region_code', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockVideoCategoriesResult));
        await callTool('get_video_categories', { region_code: 'GB' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('regionCode=GB');
    });
});

describe('rate_video', () => {
    it('rates video using POST method', async () => {
        mockFetch.mockReturnValueOnce(ytOk204());
        const result = await getToolResult('rate_video', { video_id: 'dQw4w9WgXcQ', rating: 'like' });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
    });

    it('includes rating and id in URL params', async () => {
        mockFetch.mockReturnValueOnce(ytOk204());
        await callTool('rate_video', { video_id: 'dQw4w9WgXcQ', rating: 'like' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('id=dQw4w9WgXcQ');
        expect(url).toContain('rating=like');
    });

    it('missing video_id or rating returns error', async () => {
        const body = await callTool('rate_video', { video_id: 'dQw4w9WgXcQ' });
        expect(body.error!.code).toBe(-32603);
    });
});

describe('get_video_captions', () => {
    it('returns caption tracks for a video', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockCaptionsResult));
        const result = await getToolResult('get_video_captions', { video_id: 'dQw4w9WgXcQ' });
        expect(result.items).toHaveLength(1);
        expect(result.items[0].snippet.language).toBe('en');
    });

    it('missing video_id returns error', async () => {
        const body = await callTool('get_video_captions', {});
        expect(body.error!.code).toBe(-32603);
    });
});

// ── Channels ──────────────────────────────────────────────────────────────────

describe('get_channel', () => {
    it('returns channel details with statistics', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockChannelResult));
        const result = await getToolResult('get_channel', { channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw' });
        expect(result.items[0].statistics.subscriberCount).toBe('3500000');
    });

    it('requests correct parts', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockChannelResult));
        await callTool('get_channel', { channel_id: 'UCtest' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('snippet');
        expect(url).toContain('statistics');
        expect(url).toContain('id=UCtest');
    });

    it('missing channel_id returns error', async () => {
        const body = await callTool('get_channel', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('search_channels', () => {
    it('returns channel search results', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockSearchResult));
        const result = await getToolResult('search_channels', { query: 'rick astley' });
        expect(result.items).toHaveLength(1);
    });

    it('sets type=channel in URL', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockSearchResult));
        await callTool('search_channels', { query: 'music' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('type=channel');
    });

    it('missing query returns error', async () => {
        const body = await callTool('search_channels', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('get_my_channel', () => {
    it('returns authenticated user channel with mine=true', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockChannelResult));
        const result = await getToolResult('get_my_channel', {});
        expect(result.items[0].id).toBe('UCuAXFkgsw1L7xaCfnd5JJOw');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('mine=true');
    });

    it('returns error without accessToken', async () => {
        const body = await callTool('get_my_channel', {}, ['accessToken']);
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('YOUTUBE_ACCESS_TOKEN');
    });
});

describe('get_channel_sections', () => {
    it('returns channel sections', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockChannelSectionsResult));
        const result = await getToolResult('get_channel_sections', { channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw' });
        expect(result.items).toHaveLength(1);
        expect(result.items[0].snippet.type).toBe('singlePlaylist');
    });

    it('missing channel_id returns error', async () => {
        const body = await callTool('get_channel_sections', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('subscribe_to_channel', () => {
    it('subscribes using POST with correct body', async () => {
        mockFetch.mockReturnValueOnce(ytOk({ kind: 'youtube#subscription', id: 'sub123' }, 200));
        await getToolResult('subscribe_to_channel', { channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.snippet.resourceId.channelId).toBe('UCuAXFkgsw1L7xaCfnd5JJOw');
        expect(body.snippet.resourceId.kind).toBe('youtube#channel');
    });

    it('missing channel_id returns error', async () => {
        const body = await callTool('subscribe_to_channel', {});
        expect(body.error!.code).toBe(-32603);
    });
});

// ── Playlists ─────────────────────────────────────────────────────────────────

describe('list_playlists', () => {
    it('lists playlists for a channel', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockPlaylistResult));
        const result = await getToolResult('list_playlists', { channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw' });
        expect(result.items).toHaveLength(1);
        expect(result.items[0].id).toBe('PLtestplaylist123');
    });

    it('uses channelId param when channel_id is provided', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockPlaylistResult));
        await callTool('list_playlists', { channel_id: 'UCtest' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('channelId=UCtest');
    });

    it('uses mine=true when no channel_id', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockPlaylistResult));
        await callTool('list_playlists', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('mine=true');
    });
});

describe('get_playlist', () => {
    it('returns playlist details', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockPlaylistResult));
        const result = await getToolResult('get_playlist', { playlist_id: 'PLtestplaylist123' });
        expect(result.items[0].snippet.title).toBe('My Favourites');
    });

    it('missing playlist_id returns error', async () => {
        const body = await callTool('get_playlist', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('create_playlist', () => {
    it('creates playlist with POST and correct body', async () => {
        const created = { ...mockPlaylistResult.items[0], id: 'PLnew123' };
        mockFetch.mockReturnValueOnce(ytOk(created));
        await getToolResult('create_playlist', { title: 'New Playlist', description: 'Test', privacyStatus: 'private' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.snippet.title).toBe('New Playlist');
        expect(body.status.privacyStatus).toBe('private');
    });

    it('missing title returns error', async () => {
        const body = await callTool('create_playlist', {});
        expect(body.error!.code).toBe(-32603);
    });

    it('without accessToken returns OAuth error', async () => {
        const body = await callTool('create_playlist', { title: 'Test' }, ['accessToken']);
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('YOUTUBE_ACCESS_TOKEN');
    });
});

describe('update_playlist', () => {
    it('updates playlist with PUT method', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockPlaylistResult.items[0]));
        await getToolResult('update_playlist', { playlist_id: 'PLtest', title: 'Updated Title' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('PUT');
        const body = JSON.parse(call[1].body as string);
        expect(body.id).toBe('PLtest');
        expect(body.snippet.title).toBe('Updated Title');
    });

    it('missing playlist_id returns error', async () => {
        const body = await callTool('update_playlist', { title: 'Test' });
        expect(body.error!.code).toBe(-32603);
    });
});

describe('delete_playlist', () => {
    it('deletes playlist with DELETE method', async () => {
        mockFetch.mockReturnValueOnce(ytOk204());
        const result = await getToolResult('delete_playlist', { playlist_id: 'PLtest' });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('DELETE');
    });

    it('includes playlist id in URL', async () => {
        mockFetch.mockReturnValueOnce(ytOk204());
        await callTool('delete_playlist', { playlist_id: 'PLdelete123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('id=PLdelete123');
    });

    it('missing playlist_id returns error', async () => {
        const body = await callTool('delete_playlist', {});
        expect(body.error!.code).toBe(-32603);
    });
});

// ── Comments & Analytics ──────────────────────────────────────────────────────

describe('list_comments', () => {
    it('returns comment threads for a video', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockCommentThreadResult));
        const result = await getToolResult('list_comments', { video_id: 'dQw4w9WgXcQ' });
        expect(result.items).toHaveLength(1);
        expect(result.items[0].snippet.topLevelComment.snippet.textDisplay).toBe('Never gonna give you up!');
    });

    it('includes videoId in URL', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockCommentThreadResult));
        await callTool('list_comments', { video_id: 'testVideoId', maxResults: 50, order: 'time' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('videoId=testVideoId');
        expect(url).toContain('maxResults=50');
        expect(url).toContain('order=time');
    });

    it('missing video_id returns error', async () => {
        const body = await callTool('list_comments', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('reply_to_comment', () => {
    it('posts reply with correct parentId and text', async () => {
        const mockReply = { kind: 'youtube#comment', id: 'reply123', snippet: { textDisplay: 'Thanks!' } };
        mockFetch.mockReturnValueOnce(ytOk(mockReply));
        await getToolResult('reply_to_comment', { parent_id: 'Ugxabc123', text: 'Thanks!' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        const body = JSON.parse(call[1].body as string);
        expect(body.snippet.parentId).toBe('Ugxabc123');
        expect(body.snippet.textOriginal).toBe('Thanks!');
    });

    it('missing parent_id or text returns error', async () => {
        const body = await callTool('reply_to_comment', { parent_id: 'abc' });
        expect(body.error!.code).toBe(-32603);
    });

    it('without accessToken returns OAuth error', async () => {
        const body = await callTool('reply_to_comment', { parent_id: 'abc', text: 'hi' }, ['accessToken']);
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('YOUTUBE_ACCESS_TOKEN');
    });
});

describe('get_video_analytics', () => {
    it('returns analytics rows for a video', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockAnalyticsResult));
        const result = await getToolResult('get_video_analytics', { video_id: 'dQw4w9WgXcQ' });
        expect(result.rows).toHaveLength(2);
        expect(result.columnHeaders[1].name).toBe('views');
    });

    it('includes video filter in URL', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockAnalyticsResult));
        await callTool('get_video_analytics', { video_id: 'dQw4w9WgXcQ' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('filters=video');
        expect(url).toContain('dQw4w9WgXcQ');
    });

    it('missing video_id returns error', async () => {
        const body = await callTool('get_video_analytics', {});
        expect(body.error!.code).toBe(-32603);
    });

    it('without accessToken returns OAuth error', async () => {
        const body = await callTool('get_video_analytics', { video_id: 'dQw4w9WgXcQ' }, ['accessToken']);
        expect(body.error!.code).toBe(-32603);
    });
});

describe('get_channel_analytics', () => {
    it('returns channel-level analytics', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockAnalyticsResult));
        const result = await getToolResult('get_channel_analytics', {});
        expect(result.rows).toHaveLength(2);
    });

    it('calls analytics API with channel==MINE', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockAnalyticsResult));
        await callTool('get_channel_analytics', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('youtubeanalytics');
        expect(url).toContain('channel%3D%3DMINE');
    });

    it('without accessToken returns OAuth error', async () => {
        const body = await callTool('get_channel_analytics', {}, ['accessToken']);
        expect(body.error!.code).toBe(-32603);
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns data via API key ping (videoCategories)', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockVideoCategoriesResult));
        const body = await callTool('_ping', {}, ['accessToken']);
        expect(body.error).toBeUndefined();
        expect(body.result).toBeDefined();
    });

    it('returns data via OAuth ping (channels mine)', async () => {
        mockFetch.mockReturnValueOnce(ytOk(mockChannelResult));
        const body = await callTool('_ping', {}, ['apiKey']);
        expect(body.error).toBeUndefined();
        const result = JSON.parse(body.result!.content[0].text);
        expect(result.items[0].id).toBe('UCuAXFkgsw1L7xaCfnd5JJOw');
    });

    it('returns error when both secrets missing', async () => {
        const body = await callTool('_ping', {}, ['apiKey', 'accessToken']);
        expect(body.error!.code).toBe(-32001);
    });
});
