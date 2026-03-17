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
            'X-Mcp-Secret-TURSO-DATABASE-URL': 'https://test-db.turso.io',
            'X-Mcp-Secret-TURSO-AUTH-TOKEN': 'test-auth-token',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function tursoResponse(cols: { name: string }[], rows: unknown[][], affected = 0) {
    return apiOk({
        results: [{
            response: {
                type: 'execute',
                result: {
                    cols,
                    rows,
                    affected_row_count: affected,
                },
            },
        }],
    });
}

describe('mcp-turso', () => {
    describe('GET /', () => {
        it('returns status ok', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-turso');
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-turso');
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
            expect(names).toContain('execute');
            expect(names).toContain('batch');
            expect(names).toContain('list_tables');
            expect(names).toContain('describe_table');
            expect(names).toContain('query');
            expect(names).toContain('insert');
            expect(names).toContain('update');
            expect(names).toContain('delete_rows');
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
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'execute', arguments: { sql: 'SELECT 1' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });

        it('returns -32001 when TURSO-AUTH-TOKEN is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mcp-Secret-TURSO-DATABASE-URL': 'https://test-db.turso.io',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'execute', arguments: { sql: 'SELECT 1' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('execute', () => {
        it('happy path SELECT returns rows', async () => {
            mockFetch.mockReturnValueOnce(tursoResponse(
                [{ name: 'id' }, { name: 'name' }],
                [[1, 'Alice'], [2, 'Bob']],
            ));
            const res = await worker.fetch(makeReq('tools/call', { name: 'execute', arguments: { sql: 'SELECT id, name FROM users' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.rows).toHaveLength(2);
            expect(data.rows[0].id).toBe(1);
            expect(data.rows[0].name).toBe('Alice');
        });

        it('returns error text when sql is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'execute', arguments: {} }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });

        it('handles Turso API error response', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                results: [{
                    error: { message: 'no such table: nonexistent', code: 'SQLITE_ERROR' },
                }],
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'execute', arguments: { sql: 'SELECT * FROM nonexistent' } }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('list_tables', () => {
        it('happy path returns table names', async () => {
            mockFetch.mockReturnValueOnce(tursoResponse(
                [{ name: 'name' }],
                [['users'], ['posts'], ['comments']],
            ));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_tables', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.tables).toContain('users');
            expect(data.tables).toContain('posts');
            expect(data.tables).toContain('comments');
            expect(data.tables).toHaveLength(3);
        });
    });

    describe('count', () => {
        it('happy path returns count', async () => {
            mockFetch.mockReturnValueOnce(tursoResponse(
                [{ name: 'count' }],
                [[42]],
            ));
            const res = await worker.fetch(makeReq('tools/call', { name: 'count', arguments: { table: 'users' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.table).toBe('users');
            expect(data.count).toBe(42);
        });
    });

    describe('update', () => {
        it('returns error when where clause is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'update', arguments: { table: 'users', values: { name: 'Alice' } } }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
            expect(text).toContain('where');
        });

        it('happy path updates rows', async () => {
            mockFetch.mockReturnValueOnce(tursoResponse(
                [],
                [],
                1,
            ));
            const res = await worker.fetch(makeReq('tools/call', { name: 'update', arguments: { table: 'users', values: { name: 'Alice Updated' }, where: 'id = ?', args: [1] } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.affected_row_count).toBe(1);
        });
    });

    describe('delete_rows', () => {
        it('returns error when where clause is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'delete_rows', arguments: { table: 'users' } }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
            expect(text).toContain('where');
        });
    });
});
