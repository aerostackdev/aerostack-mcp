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
            'X-Mcp-Secret-WEAVIATE-URL': 'https://test.weaviate.network',
            'X-Mcp-Secret-WEAVIATE-API-KEY': 'test-api-key',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-weaviate', () => {
    describe('GET /', () => {
        it('returns status ok with correct server name and tool count', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-weaviate');
            expect(body.tools).toBe(8);
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo and protocol version', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-weaviate');
            expect(body.result.serverInfo.version).toBe('1.0.0');
            expect(body.result.protocolVersion).toBe('2024-11-05');
            expect(body.result.capabilities.tools).toBeDefined();
        });
    });

    describe('tools/list', () => {
        it('returns exactly 8 tools with expected names', async () => {
            const res = await worker.fetch(makeReq('tools/list'));
            const body = await res.json() as any;
            expect(body.result.tools).toHaveLength(8);
            const names = body.result.tools.map((t: any) => t.name);
            expect(names).toContain('list_collections');
            expect(names).toContain('get_collection');
            expect(names).toContain('create_collection');
            expect(names).toContain('delete_collection');
            expect(names).toContain('add_objects');
            expect(names).toContain('query_objects');
            expect(names).toContain('get_object');
            expect(names).toContain('delete_object');
        });
    });

    describe('unknown method', () => {
        it('returns -32601', async () => {
            const res = await worker.fetch(makeReq('unknown/method'));
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

        it('returns -32001 when only URL is provided but no API key', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mcp-Secret-WEAVIATE-URL': 'https://test.weaviate.network',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_collections', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('list_collections', () => {
        it('returns collections from schema', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ classes: [{ class: 'Article' }, { class: 'Author' }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_collections', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.collections).toHaveLength(2);
            expect(data.collections[0].class).toBe('Article');
        });

        it('handles API error gracefully', async () => {
            mockFetch.mockReturnValueOnce(apiErr(401));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_collections', arguments: {} }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('query_objects', () => {
        it('executes GraphQL query and returns result', async () => {
            const gqlResult = { data: { Get: { Article: [{ title: 'Hello' }] } } };
            mockFetch.mockReturnValueOnce(apiOk(gqlResult));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'query_objects',
                arguments: { query: '{ Get { Article(limit: 1) { title } } }' },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.data.Get.Article[0].title).toBe('Hello');
        });

        it('returns error when query is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'query_objects', arguments: {} }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('get_object', () => {
        it('returns object by className and id', async () => {
            const obj = { class: 'Article', id: 'abc-123', properties: { title: 'Test' } };
            mockFetch.mockReturnValueOnce(apiOk(obj));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'get_object',
                arguments: { className: 'Article', id: 'abc-123' },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.id).toBe('abc-123');
        });

        it('returns error when className or id is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'get_object',
                arguments: { className: 'Article' },
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('create_collection', () => {
        it('creates a collection and returns schema', async () => {
            const schema = { class: 'Product', vectorizer: 'none' };
            mockFetch.mockReturnValueOnce(apiOk(schema));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'create_collection',
                arguments: { name: 'Product', vectorizer: 'none' },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.class).toBe('Product');
        });

        it('returns error when name is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'create_collection',
                arguments: {},
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('add_objects', () => {
        it('uses batch endpoint for multiple objects', async () => {
            mockFetch.mockReturnValueOnce(apiOk([{ result: { status: 'SUCCESS' } }, { result: { status: 'SUCCESS' } }]));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'add_objects',
                arguments: {
                    objects: [
                        { class: 'Article', properties: { title: 'A' } },
                        { class: 'Article', properties: { title: 'B' } },
                    ],
                },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.added).toBe(2);
            // verify batch endpoint was used
            expect(mockFetch.mock.calls[0][0]).toContain('batch/objects');
        });

        it('returns error when objects is empty', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'add_objects',
                arguments: { objects: [] },
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });
});
