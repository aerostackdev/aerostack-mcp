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
            'X-Mcp-Secret-UPSTASH-REDIS-URL': 'https://test-redis.upstash.io',
            'X-Mcp-Secret-UPSTASH-REDIS-TOKEN': 'test-token-123',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-redis', () => {
    describe('GET /', () => {
        it('returns status ok', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-redis');
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-redis');
            expect(body.result.serverInfo.version).toBe('1.0.0');
            expect(body.result.protocolVersion).toBe('2024-11-05');
        });
    });

    describe('tools/list', () => {
        it('returns exactly 15 tools', async () => {
            const res = await worker.fetch(makeReq('tools/list'));
            const body = await res.json() as any;
            expect(body.result.tools).toHaveLength(15);
            const names = body.result.tools.map((t: any) => t.name);
            expect(names).toContain('_ping');
            expect(names).toContain('get');
            expect(names).toContain('set');
            expect(names).toContain('del');
            expect(names).toContain('keys');
            expect(names).toContain('exists');
            expect(names).toContain('ttl');
            expect(names).toContain('expire');
            expect(names).toContain('hget');
            expect(names).toContain('hset');
            expect(names).toContain('hgetall');
            expect(names).toContain('lpush');
            expect(names).toContain('lrange');
            expect(names).toContain('incr');
            expect(names).toContain('info');
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
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get', arguments: { key: 'foo' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });

        it('returns -32001 when UPSTASH-REDIS-TOKEN is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mcp-Secret-UPSTASH-REDIS-URL': 'https://test-redis.upstash.io',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get', arguments: { key: 'foo' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('get', () => {
        it('happy path returns value', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ result: 'hello' }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get', arguments: { key: 'greeting' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.key).toBe('greeting');
            expect(data.value).toBe('hello');
        });

        it('returns error text when key is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', { name: 'get', arguments: {} }));
            const body = await res.json() as any;
            const text = body.result.content[0].text;
            expect(text).toContain('Error');
        });
    });

    describe('set', () => {
        it('happy path returns OK', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ result: 'OK' }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'set', arguments: { key: 'greeting', value: 'hello' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.key).toBe('greeting');
            expect(data.result).toBe('OK');
        });

        it('handles API error gracefully', async () => {
            mockFetch.mockReturnValueOnce(apiErr(500, 'Internal error'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'set', arguments: { key: 'greeting', value: 'hello' } }));
            const body = await res.json() as any;
            // runCommand throws on non-ok, so we get an RPC error
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('hgetall', () => {
        it('happy path returns fields as object', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ result: ['field1', 'val1', 'field2', 'val2'] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'hgetall', arguments: { key: 'user:1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.key).toBe('user:1');
            expect(data.fields.field1).toBe('val1');
            expect(data.fields.field2).toBe('val2');
        });

        it('returns empty fields for non-existent key', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ result: [] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'hgetall', arguments: { key: 'nonexistent' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.fields).toEqual({});
        });
    });

    describe('keys', () => {
        it('happy path returns matching keys', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ result: ['user:1', 'user:2'] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'keys', arguments: { pattern: 'user:*' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.keys).toEqual(['user:1', 'user:2']);
        });
    });

    describe('incr', () => {
        it('happy path increments value', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ result: 5 }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'incr', arguments: { key: 'counter' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.key).toBe('counter');
            expect(data.value).toBe(5);
        });
    });

    describe('del', () => {
        it('happy path deletes keys', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ result: 2 }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'del', arguments: { keys: ['key1', 'key2'] } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.deleted).toBe(2);
        });
    });
});
