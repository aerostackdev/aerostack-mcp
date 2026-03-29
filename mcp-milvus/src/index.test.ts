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
    return Promise.resolve(new Response(JSON.stringify({ message: 'Error' }), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-MILVUS-ENDPOINT': 'https://test.zillizcloud.com',
            'X-Mcp-Secret-MILVUS-TOKEN': 'test-token',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-milvus', () => {
    describe('GET /', () => {
        it('returns status ok with correct server name and tool count', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-milvus');
            expect(body.tools).toBe(7);
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-milvus');
            expect(body.result.serverInfo.version).toBe('1.0.0');
            expect(body.result.protocolVersion).toBe('2024-11-05');
        });
    });

    describe('tools/list', () => {
        it('returns exactly 7 tools', async () => {
            const res = await worker.fetch(makeReq('tools/list'));
            const body = await res.json() as any;
            expect(body.result.tools).toHaveLength(7);
            const names = body.result.tools.map((t: any) => t.name);
            expect(names).toContain('list_collections');
            expect(names).toContain('describe_collection');
            expect(names).toContain('create_collection');
            expect(names).toContain('drop_collection');
            expect(names).toContain('insert');
            expect(names).toContain('search');
            expect(names).toContain('query');
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
        it('returns -32001 when secrets are missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_collections', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });

        it('returns -32001 when only endpoint is provided', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mcp-Secret-MILVUS-ENDPOINT': 'https://test.zillizcloud.com',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_collections', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('list_collections', () => {
        it('returns collection list', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ code: 0, data: ['col1', 'col2'] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_collections', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.data).toContain('col1');
        });

        it('uses v2/vectordb endpoint', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ code: 0, data: [] }));
            await worker.fetch(makeReq('tools/call', { name: 'list_collections', arguments: {} }));
            expect(mockFetch.mock.calls[0][0]).toContain('v2/vectordb/collections/list');
        });

        it('handles API error gracefully', async () => {
            mockFetch.mockReturnValueOnce(apiErr(403));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_collections', arguments: {} }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('create_collection', () => {
        it('creates a collection with dimension', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ code: 0, data: {} }));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'create_collection',
                arguments: { collectionName: 'myVectors', dimension: 1536 },
            }));
            const body = await res.json() as any;
            expect(body.result).toBeDefined();
            expect(body.error).toBeUndefined();
            expect(mockFetch.mock.calls[0][0]).toContain('collections/create');
        });

        it('returns error when collectionName or dimension is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'create_collection',
                arguments: { collectionName: 'myVectors' },
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('search', () => {
        it('searches with vector data', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ code: 0, data: [{ id: 1, distance: 0.95 }] }));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'search',
                arguments: {
                    collectionName: 'myVectors',
                    data: [[0.1, 0.2, 0.3]],
                    limit: 5,
                },
            }));
            const body = await res.json() as any;
            const result = JSON.parse(body.result.content[0].text);
            expect(result.data[0].id).toBe(1);
        });

        it('returns error when data is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'search',
                arguments: { collectionName: 'myVectors' },
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('query', () => {
        it('queries with filter expression', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ code: 0, data: [{ id: 1 }] }));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'query',
                arguments: { collectionName: 'myVectors', filter: 'id in [1, 2]' },
            }));
            const body = await res.json() as any;
            const result = JSON.parse(body.result.content[0].text);
            expect(result.data).toHaveLength(1);
        });
    });

    describe('insert', () => {
        it('inserts entities', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ code: 0, data: { insertCount: 2 } }));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'insert',
                arguments: {
                    collectionName: 'myVectors',
                    data: [{ id: 1, vector: [0.1, 0.2] }, { id: 2, vector: [0.3, 0.4] }],
                },
            }));
            const body = await res.json() as any;
            const result = JSON.parse(body.result.content[0].text);
            expect(result.data.insertCount).toBe(2);
        });
    });
});
