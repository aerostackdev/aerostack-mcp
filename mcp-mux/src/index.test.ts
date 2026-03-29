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
            'X-Mcp-Secret-MUX-TOKEN-ID': 'test-token-id',
            'X-Mcp-Secret-MUX-TOKEN-SECRET': 'test-token-secret',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-mux', () => {
    describe('GET /', () => {
        it('returns status ok with correct server name and tool count', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-mux');
            expect(body.tools).toBe(8);
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-mux');
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
            expect(names).toContain('list_assets');
            expect(names).toContain('get_asset');
            expect(names).toContain('delete_asset');
            expect(names).toContain('create_upload');
            expect(names).toContain('get_upload');
            expect(names).toContain('list_live_streams');
            expect(names).toContain('create_live_stream');
            expect(names).toContain('get_asset_playback_id');
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
        it('returns -32001 when both secrets are missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_assets', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });

        it('returns -32001 when TOKEN_SECRET is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mcp-Secret-MUX-TOKEN-ID': 'test-id',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_assets', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('list_assets', () => {
        it('returns assets list', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ data: [{ id: 'asset1', status: 'ready' }, { id: 'asset2', status: 'preparing' }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_assets', arguments: { limit: 10 } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.assets).toHaveLength(2);
            expect(data.assets[0].id).toBe('asset1');
        });

        it('uses basic auth with correct credentials', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ data: [] }));
            await worker.fetch(makeReq('tools/call', { name: 'list_assets', arguments: {} }));
            const callHeaders = mockFetch.mock.calls[0][1].headers;
            expect(callHeaders['Authorization']).toMatch(/^Basic /);
        });

        it('handles API error gracefully', async () => {
            mockFetch.mockReturnValueOnce(apiErr(401));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_assets', arguments: {} }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('get_asset', () => {
        it('returns asset details', async () => {
            const asset = { id: 'asset1', status: 'ready', duration: 120 };
            mockFetch.mockReturnValueOnce(apiOk({ data: asset }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_asset', arguments: { id: 'asset1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.id).toBe('asset1');
            expect(data.status).toBe('ready');
        });

        it('returns error when id is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_asset', arguments: {} }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('delete_asset', () => {
        it('deletes an asset (204 response)', async () => {
            mockFetch.mockReturnValueOnce(apiEmpty(204));
            const res = await worker.fetch(makeReq('tools/call', { name: 'delete_asset', arguments: { id: 'asset1' } }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('deleted');
        });
    });

    describe('create_upload', () => {
        it('creates an upload URL', async () => {
            const upload = { id: 'upload1', url: 'https://upload.mux.com/...' };
            mockFetch.mockReturnValueOnce(apiOk({ data: upload }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'create_upload', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.id).toBe('upload1');
            expect(data.url).toBeDefined();
        });
    });

    describe('create_live_stream', () => {
        it('creates a live stream with stream key', async () => {
            const stream = { id: 'stream1', stream_key: 'key123', status: 'idle' };
            mockFetch.mockReturnValueOnce(apiOk({ data: stream }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'create_live_stream', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.id).toBe('stream1');
            expect(data.stream_key).toBe('key123');
        });
    });

    describe('get_asset_playback_id', () => {
        it('returns playback IDs for an asset', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ data: [{ id: 'pb1', policy: 'public' }] }));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'get_asset_playback_id',
                arguments: { asset_id: 'asset1' },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.playback_ids[0].id).toBe('pb1');
        });

        it('returns error when asset_id is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'get_asset_playback_id',
                arguments: {},
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });
});
