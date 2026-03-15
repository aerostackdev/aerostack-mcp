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
            'X-Mcp-Secret-SUPABASE-URL': 'https://xyzabc.supabase.co',
            'X-Mcp-Secret-SUPABASE-ANON-KEY': 'eyJanon_key_here',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-supabase', () => {
    describe('GET /', () => {
        it('returns status ok', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-supabase');
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-supabase');
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
            expect(names).toContain('list_tables');
            expect(names).toContain('select');
            expect(names).toContain('insert');
            expect(names).toContain('update');
            expect(names).toContain('delete');
            expect(names).toContain('rpc');
            expect(names).toContain('storage_list');
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
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'select', arguments: { table: 'users' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });

        it('returns -32001 when SUPABASE-URL is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mcp-Secret-SUPABASE-ANON-KEY': 'eyJanon_key_here',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'select', arguments: { table: 'users' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('list_tables', () => {
        it('happy path returns tables', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ definitions: { users: {}, posts: {} } }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_tables', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.tables).toContain('users');
            expect(data.tables).toContain('posts');
        });

        it('handles Supabase error gracefully', async () => {
            mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
                JSON.stringify({ code: '42P01', details: null, hint: null, message: 'relation does not exist' }),
                { status: 404, headers: { 'Content-Type': 'application/json' } }
            )));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_tables', arguments: {} }));
            const body = await res.json() as any;
            // supabase tool returns text error, not RPC error
            expect(body.result).toBeDefined();
        });
    });

    describe('select', () => {
        it('happy path returns rows', async () => {
            mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
                JSON.stringify([{ id: 1, name: 'Alice', email: 'alice@test.com' }]),
                { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } }
            )));
            const res = await worker.fetch(makeReq('tools/call', { name: 'select', arguments: { table: 'users' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.rows).toHaveLength(1);
            expect(data.rows[0].name).toBe('Alice');
        });

        it('handles Supabase relation-not-found error', async () => {
            mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
                JSON.stringify({ code: '42P01', message: 'relation "nonexistent" does not exist' }),
                { status: 404, headers: { 'Content-Type': 'application/json' } }
            )));
            const res = await worker.fetch(makeReq('tools/call', { name: 'select', arguments: { table: 'nonexistent' } }));
            const body = await res.json() as any;
            expect(body.result).toBeDefined();
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('insert', () => {
        it('happy path inserts row', async () => {
            mockFetch.mockReturnValueOnce(apiOk([{ id: 2, name: 'Bob', email: 'bob@test.com' }]));
            const res = await worker.fetch(makeReq('tools/call', { name: 'insert', arguments: { table: 'users', rows: [{ name: 'Bob', email: 'bob@test.com' }] } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data[0].name).toBe('Bob');
        });

        it('handles insert error', async () => {
            mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
                JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint' }),
                { status: 409, headers: { 'Content-Type': 'application/json' } }
            )));
            const res = await worker.fetch(makeReq('tools/call', { name: 'insert', arguments: { table: 'users', rows: [{ id: 1, name: 'Dup' }] } }));
            const body = await res.json() as any;
            expect(body.result).toBeDefined();
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('update', () => {
        it('happy path updates rows', async () => {
            mockFetch.mockReturnValueOnce(apiOk([{ id: 1, name: 'Alice Updated' }]));
            const res = await worker.fetch(makeReq('tools/call', { name: 'update', arguments: { table: 'users', filter: 'id=eq.1', values: { name: 'Alice Updated' } } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data[0].name).toBe('Alice Updated');
        });

        it('handles update error', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'Table not found'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'update', arguments: { table: 'bad', filter: 'id=eq.1', values: { name: 'X' } } }));
            const body = await res.json() as any;
            expect(body.result).toBeDefined();
        });
    });

    describe('delete', () => {
        it('happy path deletes rows', async () => {
            mockFetch.mockReturnValueOnce(apiOk([]));
            const res = await worker.fetch(makeReq('tools/call', { name: 'delete', arguments: { table: 'users', filter: 'id=eq.1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data).toHaveLength(0);
        });

        it('handles delete error', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'Table not found'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'delete', arguments: { table: 'bad', filter: 'id=eq.1' } }));
            const body = await res.json() as any;
            expect(body.result).toBeDefined();
        });
    });

    describe('rpc', () => {
        it('happy path calls function', async () => {
            mockFetch.mockReturnValueOnce(apiOk([{ result: 42 }]));
            const res = await worker.fetch(makeReq('tools/call', { name: 'rpc', arguments: { function_name: 'my_func', params: { x: 1 } } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data[0].result).toBe(42);
        });

        it('handles RPC error', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'Function not found'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'rpc', arguments: { function_name: 'bad_func' } }));
            const body = await res.json() as any;
            expect(body.result).toBeDefined();
        });
    });

    describe('storage_list', () => {
        it('happy path lists storage objects', async () => {
            mockFetch.mockReturnValueOnce(apiOk([{ name: 'image.png', metadata: { size: 1024 } }]));
            const res = await worker.fetch(makeReq('tools/call', { name: 'storage_list', arguments: { bucket: 'avatars' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data[0].name).toBe('image.png');
        });

        it('handles storage error', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'Bucket not found'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'storage_list', arguments: { bucket: 'bad_bucket' } }));
            const body = await res.json() as any;
            expect(body.result).toBeDefined();
        });
    });

    describe.skip('E2E', () => {
        it('select with real Supabase credentials', async () => {
            // Requires SUPABASE_URL and SUPABASE_ANON_KEY — skip in CI
        });
    });
});
