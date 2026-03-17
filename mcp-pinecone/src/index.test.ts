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
            'X-Mcp-Secret-PINECONE-API-KEY': 'test-pinecone-api-key',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-pinecone', () => {
    describe('GET /', () => {
        it('returns status ok', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-pinecone');
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-pinecone');
            expect(body.result.serverInfo.version).toBe('1.0.0');
            expect(body.result.protocolVersion).toBe('2024-11-05');
        });
    });

    describe('tools/list', () => {
        it('returns exactly 10 tools', async () => {
            const res = await worker.fetch(makeReq('tools/list'));
            const body = await res.json() as any;
            expect(body.result.tools).toHaveLength(10);
            const names = body.result.tools.map((t: any) => t.name);
            expect(names).toContain('_ping');
            expect(names).toContain('list_indexes');
            expect(names).toContain('describe_index');
            expect(names).toContain('query');
            expect(names).toContain('upsert');
            expect(names).toContain('fetch');
            expect(names).toContain('delete_vectors');
            expect(names).toContain('describe_stats');
            expect(names).toContain('list_vectors');
            expect(names).toContain('update_vector');
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
        it('returns -32001 when PINECONE-API-KEY is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_indexes', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('list_indexes', () => {
        it('happy path returns indexes', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ indexes: [{ name: 'my-index', dimension: 1536, metric: 'cosine' }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_indexes', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.indexes).toHaveLength(1);
            expect(data.indexes[0].name).toBe('my-index');
        });

        it('handles API error gracefully', async () => {
            mockFetch.mockReturnValueOnce(apiErr(401, 'Unauthorized'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_indexes', arguments: {} }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('query', () => {
        it('happy path returns matches', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ matches: [{ id: 'vec1', score: 0.95, metadata: { title: 'Hello' } }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'query', arguments: { index_host: 'my-index-abc123.svc.pinecone.io', vector: [0.1, 0.2, 0.3], topK: 5 } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.matches).toHaveLength(1);
            expect(data.matches[0].id).toBe('vec1');
            expect(data.matches[0].score).toBe(0.95);
        });

        it('returns error text when neither vector nor id is provided', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'query', arguments: { index_host: 'my-index-abc123.svc.pinecone.io' } }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
            expect(text).toContain('vector');
        });

        it('works with id-based query', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ matches: [{ id: 'vec2', score: 0.88 }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'query', arguments: { index_host: 'my-index-abc123.svc.pinecone.io', id: 'vec1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.matches[0].id).toBe('vec2');
        });
    });

    describe('describe_stats', () => {
        it('happy path returns vector count', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ totalVectorCount: 1000, dimension: 1536, namespaces: { '': { vectorCount: 1000 } } }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'describe_stats', arguments: { index_host: 'my-index-abc123.svc.pinecone.io' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.totalVectorCount).toBe(1000);
        });
    });

    describe('upsert', () => {
        it('happy path upserts vectors', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ upsertedCount: 2 }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'upsert', arguments: {
                index_host: 'my-index-abc123.svc.pinecone.io',
                vectors: [
                    { id: 'v1', values: [0.1, 0.2] },
                    { id: 'v2', values: [0.3, 0.4] },
                ],
            } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.upsertedCount).toBe(2);
        });
    });

    describe('describe_index', () => {
        it('happy path returns index details', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ name: 'my-index', dimension: 1536, metric: 'cosine', host: 'my-index-abc123.svc.pinecone.io', status: { ready: true } }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'describe_index', arguments: { index_name: 'my-index' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.name).toBe('my-index');
            expect(data.dimension).toBe(1536);
        });
    });
});
