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
            'X-Mcp-Secret-CLICKHOUSE-URL': 'https://test.clickhouse.cloud:8443',
            'X-Mcp-Secret-CLICKHOUSE-USER': 'default',
            'X-Mcp-Secret-CLICKHOUSE-PASSWORD': 'test-password',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-clickhouse', () => {
    describe('GET /', () => {
        it('returns status ok', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-clickhouse');
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-clickhouse');
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
            expect(names).toContain('query');
            expect(names).toContain('list_databases');
            expect(names).toContain('list_tables');
            expect(names).toContain('describe_table');
            expect(names).toContain('insert');
            expect(names).toContain('count');
            expect(names).toContain('show_create');
            expect(names).toContain('system_metrics');
            expect(names).toContain('table_sizes');
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
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'query', arguments: { sql: 'SELECT 1' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });

        it('returns -32001 when CLICKHOUSE-PASSWORD is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mcp-Secret-CLICKHOUSE-URL': 'https://test.clickhouse.cloud:8443',
                    'X-Mcp-Secret-CLICKHOUSE-USER': 'default',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'query', arguments: { sql: 'SELECT 1' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('query', () => {
        it('happy path returns JSON data', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ meta: [{ name: 'count()', type: 'UInt64' }], data: [{ 'count()': '100' }], rows: 1, statistics: {} }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'query', arguments: { sql: 'SELECT count() FROM events' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.rows).toBe(1);
            expect(data.data).toHaveLength(1);
        });

        it('returns error when sql is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'query', arguments: {} }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('list_databases', () => {
        it('happy path returns databases', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ meta: [{ name: 'name', type: 'String' }], data: [{ name: 'default' }, { name: 'analytics' }], rows: 2, statistics: {} }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_databases', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.data).toHaveLength(2);
        });
    });

    describe('count', () => {
        it('happy path returns count', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ meta: [{ name: 'count()', type: 'UInt64' }], data: [{ 'count()': '42' }], rows: 1, statistics: {} }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'count', arguments: { table: 'events' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.data[0]['count()']).toBe('42');
        });
    });

    describe('insert', () => {
        it('happy path inserts rows', async () => {
            mockFetch.mockReturnValueOnce(Promise.resolve(new Response('', { status: 200 })));
            const res = await worker.fetch(makeReq('tools/call', { name: 'insert', arguments: { table: 'events', rows: [{ id: 1, name: 'test' }] } }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Inserted');
            expect(text).toContain('1 row(s)');
        });

        it('handles insert error', async () => {
            mockFetch.mockReturnValueOnce(Promise.resolve(new Response('Code: 60. Table default.bad does not exist', { status: 404 })));
            const res = await worker.fetch(makeReq('tools/call', { name: 'insert', arguments: { table: 'bad', rows: [{ id: 1 }] } }));
            const body = await res.json() as any;
            expect(body.error).toBeDefined();
        });
    });
});
