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
            'X-Mcp-Secret-QDRANT-URL': 'https://test.qdrant.io:6333',
            'X-Mcp-Secret-QDRANT-API-KEY': 'test-api-key',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-qdrant', () => {
    describe('GET /', () => {
        it('returns status ok', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-qdrant');
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-qdrant');
            expect(body.result.serverInfo.version).toBe('1.0.0');
            expect(body.result.protocolVersion).toBe('2024-11-05');
        });
    });

    describe('tools/list', () => {
        it('returns exactly 11 tools', async () => {
            const res = await worker.fetch(makeReq('tools/list'));
            const body = await res.json() as any;
            expect(body.result.tools).toHaveLength(11);
            const names = body.result.tools.map((t: any) => t.name);
            expect(names).toContain('_ping');
            expect(names).toContain('list_collections');
            expect(names).toContain('get_collection');
            expect(names).toContain('create_collection');
            expect(names).toContain('delete_collection');
            expect(names).toContain('upsert_points');
            expect(names).toContain('search');
            expect(names).toContain('get_points');
            expect(names).toContain('delete_points');
            expect(names).toContain('scroll');
            expect(names).toContain('count');
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
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_collections', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });

        it('returns -32001 when QDRANT-API-KEY is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mcp-Secret-QDRANT-URL': 'https://test.qdrant.io:6333',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_collections', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('list_collections', () => {
        it('happy path returns collections', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ result: { collections: [{ name: 'test' }] } }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_collections', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.result.collections).toHaveLength(1);
            expect(data.result.collections[0].name).toBe('test');
        });

        it('handles Qdrant error gracefully', async () => {
            mockFetch.mockReturnValueOnce(apiErr(500, 'Internal error'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_collections', arguments: {} }));
            const body = await res.json() as any;
            expect(body.result).toBeDefined();
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('search', () => {
        it('happy path returns results', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ result: [{ id: 1, score: 0.95, payload: { text: 'hello' } }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'search', arguments: { collection_name: 'test', vector: [0.1, 0.2, 0.3] } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.result).toHaveLength(1);
            expect(data.result[0].score).toBe(0.95);
            expect(data.result[0].payload.text).toBe('hello');
        });

        it('returns error when vector is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'search', arguments: { collection_name: 'test' } }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('count', () => {
        it('happy path returns count', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ result: { count: 42 } }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'count', arguments: { collection_name: 'test' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.result.count).toBe(42);
        });
    });

    describe('delete_points', () => {
        it('returns error when neither ids nor filter provided', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'delete_points', arguments: { collection_name: 'test' } }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });
});
