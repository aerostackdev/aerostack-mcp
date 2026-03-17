import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}
function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ error: { message } }), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-ELASTICSEARCH-URL': 'https://test.es.cloud:9243',
            'X-Mcp-Secret-ELASTICSEARCH-API-KEY': 'test-api-key',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-elasticsearch', () => {
    describe('GET /', () => {
        it('returns status ok', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-elasticsearch');
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-elasticsearch');
            expect(body.result.serverInfo.version).toBe('1.0.0');
            expect(body.result.protocolVersion).toBe('2024-11-05');
        });
    });

    describe('tools/list', () => {
        it('returns exactly 13 tools', async () => {
            const res = await worker.fetch(makeReq('tools/list'));
            const body = await res.json() as any;
            expect(body.result.tools).toHaveLength(13);
            const names = body.result.tools.map((t: any) => t.name);
            expect(names).toContain('_ping');
            expect(names).toContain('list_indices');
            expect(names).toContain('get_mapping');
            expect(names).toContain('search');
            expect(names).toContain('index_document');
            expect(names).toContain('get_document');
            expect(names).toContain('update_document');
            expect(names).toContain('delete_document');
            expect(names).toContain('bulk');
            expect(names).toContain('count');
            expect(names).toContain('create_index');
            expect(names).toContain('delete_index');
            expect(names).toContain('cluster_health');
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
        it('returns -32001 when both secrets are missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search', arguments: { index: 'test' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });

        it('returns -32001 when ELASTICSEARCH-API-KEY is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mcp-Secret-ELASTICSEARCH-URL': 'https://test.es.cloud:9243',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search', arguments: { index: 'test' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('_ping', () => {
        it('returns cluster name and version', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ cluster_name: 'my-cluster', version: { number: '8.12.0' } }));
            const res = await worker.fetch(makeReq('tools/call', { name: '_ping', arguments: {} }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('my-cluster');
            expect(text).toContain('8.12.0');
        });
    });

    describe('search', () => {
        it('happy path returns search results', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ hits: { total: { value: 1 }, hits: [{ _id: '1', _source: { title: 'test' } }] } }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'search', arguments: { index: 'articles', query: { match: { title: 'test' } } } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.total.value).toBe(1);
            expect(data.hits).toHaveLength(1);
            expect(data.hits[0]._source.title).toBe('test');
        });

        it('handles search error gracefully', async () => {
            mockFetch.mockReturnValueOnce(apiErr(400, 'parsing_exception'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'search', arguments: { index: 'articles' } }));
            const body = await res.json() as any;
            expect(body.result).toBeDefined();
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('get_document', () => {
        it('happy path returns document', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ _id: '1', _source: { name: 'test' } }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_document', arguments: { index: 'users', id: '1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data._id).toBe('1');
            expect(data._source.name).toBe('test');
        });

        it('handles document not found', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'document_missing_exception'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_document', arguments: { index: 'users', id: 'missing' } }));
            const body = await res.json() as any;
            expect(body.result).toBeDefined();
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('count', () => {
        it('happy path returns count', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ count: 42 }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'count', arguments: { index: 'articles' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.count).toBe(42);
        });
    });

    describe('cluster_health', () => {
        it('happy path returns health status', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ status: 'green', cluster_name: 'my-cluster', number_of_nodes: 3 }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'cluster_health', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.status).toBe('green');
        });
    });
});
