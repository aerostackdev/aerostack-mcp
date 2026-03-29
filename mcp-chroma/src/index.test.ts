import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
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
            'X-Mcp-Secret-CHROMA-URL': 'http://localhost:8000',
            'X-Mcp-Secret-CHROMA-API-KEY': 'test-token',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-chroma', () => {
    describe('GET /', () => {
        it('returns status ok with correct server name and tool count', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-chroma');
            expect(body.tools).toBe(8);
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-chroma');
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
            expect(names).toContain('list_collections');
            expect(names).toContain('create_collection');
            expect(names).toContain('get_collection');
            expect(names).toContain('delete_collection');
            expect(names).toContain('add');
            expect(names).toContain('query');
            expect(names).toContain('get');
            expect(names).toContain('delete');
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
        it('returns -32001 when CHROMA_URL is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_collections', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('list_collections', () => {
        it('returns collections list', async () => {
            mockFetch.mockReturnValueOnce(apiOk([{ name: 'docs', id: '1' }, { name: 'code', id: '2' }]));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_collections', arguments: { limit: 50 } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data).toHaveLength(2);
            expect(data[0].name).toBe('docs');
        });

        it('uses X-Chroma-Token header (not Authorization)', async () => {
            mockFetch.mockReturnValueOnce(apiOk([]));
            await worker.fetch(makeReq('tools/call', { name: 'list_collections', arguments: {} }));
            const callHeaders = mockFetch.mock.calls[0][1].headers;
            expect(callHeaders['X-Chroma-Token']).toBe('test-token');
            expect(callHeaders['Authorization']).toBeUndefined();
        });

        it('handles API error gracefully', async () => {
            mockFetch.mockReturnValueOnce(apiErr(500));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_collections', arguments: {} }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('query', () => {
        it('queries collection with query_texts', async () => {
            const queryResult = { ids: [['id1']], documents: [['doc1']], distances: [[0.1]] };
            mockFetch.mockReturnValueOnce(apiOk(queryResult));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'query',
                arguments: { name: 'docs', query_texts: ['hello world'], n_results: 5 },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.ids[0][0]).toBe('id1');
        });

        it('returns error when name is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'query', arguments: {} }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('add', () => {
        it('adds documents to a collection', async () => {
            mockFetch.mockReturnValueOnce(apiOk(true));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'add',
                arguments: {
                    name: 'docs',
                    ids: ['id1', 'id2'],
                    documents: ['Hello', 'World'],
                },
            }));
            const body = await res.json() as any;
            expect(body.result).toBeDefined();
            expect(body.error).toBeUndefined();
            // verify correct endpoint
            expect(mockFetch.mock.calls[0][0]).toContain('/add');
        });

        it('returns error when ids is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'add',
                arguments: { name: 'docs' },
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('create_collection', () => {
        it('creates collection and returns schema', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ id: 'abc', name: 'my-collection', metadata: null }));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'create_collection',
                arguments: { name: 'my-collection' },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.name).toBe('my-collection');
        });
    });

    describe('get', () => {
        it('gets documents by ids', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ ids: ['id1'], documents: ['doc'] }));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'get',
                arguments: { name: 'docs', ids: ['id1'] },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.ids[0]).toBe('id1');
        });
    });
});
