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
            'X-Mcp-Secret-ARANGODB-URL': 'https://test.arangodb.cloud:8529',
            'X-Mcp-Secret-ARANGODB-USERNAME': 'root',
            'X-Mcp-Secret-ARANGODB-PASSWORD': 'test-password',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-arangodb', () => {
    describe('GET /', () => {
        it('returns status ok', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-arangodb');
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-arangodb');
            expect(body.result.serverInfo.version).toBe('1.0.0');
            expect(body.result.protocolVersion).toBe('2024-11-05');
        });
    });

    describe('tools/list', () => {
        it('returns exactly 12 tools', async () => {
            const res = await worker.fetch(makeReq('tools/list'));
            const body = await res.json() as any;
            expect(body.result.tools).toHaveLength(12);
            const names = body.result.tools.map((t: any) => t.name);
            expect(names).toContain('_ping');
            expect(names).toContain('list_databases');
            expect(names).toContain('list_collections');
            expect(names).toContain('create_collection');
            expect(names).toContain('get_document');
            expect(names).toContain('insert_document');
            expect(names).toContain('update_document');
            expect(names).toContain('delete_document');
            expect(names).toContain('aql_query');
            expect(names).toContain('list_graphs');
            expect(names).toContain('traverse');
            expect(names).toContain('collection_count');
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
        it('returns -32001 when all secrets are missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_databases', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });

        it('returns -32001 when ARANGODB-PASSWORD is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mcp-Secret-ARANGODB-URL': 'https://test.arangodb.cloud:8529',
                    'X-Mcp-Secret-ARANGODB-USERNAME': 'root',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_databases', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('list_databases', () => {
        it('happy path returns databases', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ result: ['_system', 'mydb'] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_databases', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.databases).toContain('_system');
            expect(data.databases).toContain('mydb');
        });

        it('handles ArangoDB error gracefully', async () => {
            mockFetch.mockReturnValueOnce(apiErr(403, 'Forbidden'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_databases', arguments: {} }));
            const body = await res.json() as any;
            expect(body.result).toBeDefined();
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('aql_query', () => {
        it('happy path returns query results', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ result: [{ name: 'Alice' }], hasMore: false }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'aql_query', arguments: { query: 'FOR u IN users RETURN u' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.result).toHaveLength(1);
            expect(data.result[0].name).toBe('Alice');
            expect(data.hasMore).toBe(false);
        });

        it('returns error when query is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'aql_query', arguments: {} }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('collection_count', () => {
        it('happy path returns count', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ name: 'users', count: 42 }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'collection_count', arguments: { collection: 'users' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.collection).toBe('users');
            expect(data.count).toBe(42);
        });
    });

    describe('get_document', () => {
        it('returns error when collection or key is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_document', arguments: {} }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });

        it('returns error when only collection is provided', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_document', arguments: { collection: 'users' } }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });
});
