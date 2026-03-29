import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}
function apiEmpty(status = 204) {
    return Promise.resolve(new Response(null, { status }));
}
function apiErr(status: number) {
    return Promise.resolve(new Response(JSON.stringify({ error: 'Error' }), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-VIMEO-ACCESS-TOKEN': 'test-access-token',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-vimeo', () => {
    describe('GET /', () => {
        it('returns status ok with correct server name and tool count', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-vimeo');
            expect(body.tools).toBe(8);
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-vimeo');
            expect(body.result.serverInfo.version).toBe('1.0.0');
            expect(body.result.protocolVersion).toBe('2024-11-05');
        });
    });

    describe('tools/list', () => {
        it('returns exactly 8 tools', async () => {
            const res = await worker.fetch(makeReq('tools/list'));
            const body = await res.json() as any;
            expect(body.result.tools).toHaveLength(8);
            const names = body.result.tools.map((t: any) => t.name);
            expect(names).toContain('get_me');
            expect(names).toContain('list_videos');
            expect(names).toContain('get_video');
            expect(names).toContain('delete_video');
            expect(names).toContain('edit_video');
            expect(names).toContain('list_albums');
            expect(names).toContain('add_video_to_album');
            expect(names).toContain('create_upload_link');
        });
    });

    describe('unknown method', () => {
        it('returns -32601', async () => {
            const res = await worker.fetch(makeReq('bad/method'));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32601);
        });
    });

    describe('missing auth secrets', () => {
        it('returns -32001 when access token is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_me', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('get_me', () => {
        it('returns authenticated user profile', async () => {
            const me = { uri: '/users/123', name: 'Test User', account: 'pro' };
            mockFetch.mockReturnValueOnce(apiOk(me));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_me', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.name).toBe('Test User');
            expect(data.account).toBe('pro');
        });

        it('uses Bearer authorization header', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ name: 'Test' }));
            await worker.fetch(makeReq('tools/call', { name: 'get_me', arguments: {} }));
            const callHeaders = mockFetch.mock.calls[0][1].headers;
            expect(callHeaders['Authorization']).toBe('Bearer test-access-token');
        });

        it('handles API error gracefully', async () => {
            mockFetch.mockReturnValueOnce(apiErr(401));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_me', arguments: {} }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('list_videos', () => {
        it('returns videos list with total', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ data: [{ uri: '/videos/1', name: 'My Video' }], total: 1 }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_videos', arguments: { limit: 10 } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.videos).toHaveLength(1);
            expect(data.videos[0].name).toBe('My Video');
            expect(data.total).toBe(1);
        });
    });

    describe('get_video', () => {
        it('returns video details', async () => {
            const video = { uri: '/videos/123', name: 'Test Video', duration: 60 };
            mockFetch.mockReturnValueOnce(apiOk(video));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_video', arguments: { video_id: '123' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.name).toBe('Test Video');
        });

        it('returns error when video_id is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_video', arguments: {} }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('delete_video', () => {
        it('deletes a video (204 response)', async () => {
            mockFetch.mockReturnValueOnce(apiEmpty(204));
            const res = await worker.fetch(makeReq('tools/call', { name: 'delete_video', arguments: { video_id: '123' } }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('deleted');
        });

        it('returns error when video_id is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'delete_video', arguments: {} }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('edit_video', () => {
        it('updates video metadata', async () => {
            const updated = { uri: '/videos/123', name: 'New Title' };
            mockFetch.mockReturnValueOnce(apiOk(updated));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'edit_video',
                arguments: { video_id: '123', name: 'New Title' },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.name).toBe('New Title');
        });

        it('returns error when video_id is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'edit_video',
                arguments: { name: 'New Title' },
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('add_video_to_album', () => {
        it('adds a video to an album (204 response)', async () => {
            mockFetch.mockReturnValueOnce(apiEmpty(204));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'add_video_to_album',
                arguments: { album_id: 'album1', video_id: '123' },
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('added');
        });

        it('returns error when album_id or video_id is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'add_video_to_album',
                arguments: { album_id: 'album1' },
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('create_upload_link', () => {
        it('creates an upload link', async () => {
            const upload = { uri: '/videos/456', upload: { upload_link: 'https://tus.vimeo.com/...' } };
            mockFetch.mockReturnValueOnce(apiOk(upload));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'create_upload_link',
                arguments: { name: 'New Video', size: 1024000 },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.uri).toBe('/videos/456');
            expect(data.upload.upload_link).toBeDefined();
        });

        it('returns error when name or size is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'create_upload_link',
                arguments: { name: 'Video' },
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });
});
