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
            'X-Mcp-Secret-MONGODB-APP-ID': 'test-app-id',
            'X-Mcp-Secret-MONGODB-API-KEY': 'test-api-key',
            'X-Mcp-Secret-MONGODB-CLUSTER': 'test-cluster',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-mongodb', () => {
    describe('GET /', () => {
        it('returns status ok', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-mongodb');
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-mongodb');
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
            expect(names).toContain('find_one');
            expect(names).toContain('find');
            expect(names).toContain('insert_one');
            expect(names).toContain('insert_many');
            expect(names).toContain('update_one');
            expect(names).toContain('update_many');
            expect(names).toContain('delete_one');
            expect(names).toContain('delete_many');
            expect(names).toContain('aggregate');
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
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find', arguments: { database: 'test', collection: 'users' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });

        it('returns -32001 when MONGODB-API-KEY is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mcp-Secret-MONGODB-APP-ID': 'test-app-id',
                    'X-Mcp-Secret-MONGODB-CLUSTER': 'test-cluster',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find', arguments: { database: 'test', collection: 'users' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('find', () => {
        it('happy path returns documents', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ documents: [{ _id: '1', name: 'Alice' }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'find', arguments: { database: 'mydb', collection: 'users' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.documents).toHaveLength(1);
            expect(data.documents[0].name).toBe('Alice');
        });

        it('returns error text when database is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'find', arguments: { collection: 'users' } }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });

        it('returns error text when collection is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'find', arguments: { database: 'mydb' } }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('insert_one', () => {
        it('happy path returns insertedId', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ insertedId: 'abc123' }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'insert_one', arguments: { database: 'mydb', collection: 'users', document: { name: 'Bob' } } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.insertedId).toBe('abc123');
        });

        it('handles API error gracefully', async () => {
            mockFetch.mockReturnValueOnce(apiErr(400, 'Invalid document'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'insert_one', arguments: { database: 'mydb', collection: 'users', document: { name: 'Bob' } } }));
            const body = await res.json() as any;
            // mongoFetch throws on non-ok, so we get an RPC error
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('aggregate', () => {
        it('happy path returns aggregation result', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ documents: [{ total: 42 }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'aggregate', arguments: { database: 'mydb', collection: 'orders', pipeline: [{ $group: { _id: null, total: { $sum: '$amount' } } }] } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.documents[0].total).toBe(42);
        });

        it('returns error text when pipeline is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'aggregate', arguments: { database: 'mydb', collection: 'orders' } }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('update_one', () => {
        it('happy path returns matched/modified counts', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ matchedCount: 1, modifiedCount: 1 }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'update_one', arguments: { database: 'mydb', collection: 'users', filter: { _id: '1' }, update: { $set: { name: 'Alice Updated' } } } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.matchedCount).toBe(1);
            expect(data.modifiedCount).toBe(1);
        });
    });

    describe('delete_one', () => {
        it('happy path returns deleted count', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ deletedCount: 1 }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'delete_one', arguments: { database: 'mydb', collection: 'users', filter: { _id: '1' } } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.deletedCount).toBe(1);
        });
    });
});
