import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}
function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } }));
}
function api204() { return Promise.resolve(new Response(null, { status: 204 })); }

beforeEach(() => { mockFetch.mockReset(); });

function withSecrets(extra: Record<string, string> = {}) {
    return {
        'X-Mcp-Secret-STREAM-API-KEY': 'test-api-key',
        'X-Mcp-Secret-STREAM-API-SECRET': 'test-api-secret',
        ...extra,
    };
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(new Request('https://mcp-stream.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers ?? withSecrets()) },
        body: JSON.stringify(body),
    }));
    return res.json() as Promise<Record<string, unknown>>;
}

describe('Protocol', () => {
    it('GET returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-stream.workers.dev/', { method: 'GET' }));
        const body = await res.json() as Record<string, unknown>;
        expect(body.status).toBe('ok');
        expect(body.tools).toBe(7);
    });

    it('initialize returns protocol info', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        expect((data.result as Record<string, unknown>).protocolVersion).toBe('2024-11-05');
    });

    it('tools/list returns all 7 tools', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        const tools = (data.result as Record<string, unknown>).tools as unknown[];
        expect(tools.length).toBe(7);
    });

    it('missing API key returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_channels', arguments: {} } },
            {},
        );
        expect((data.error as Record<string, unknown>).code).toBe(-32001);
    });

    it('missing API secret returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_channels', arguments: {} } },
            { 'X-Mcp-Secret-STREAM-API-KEY': 'key-only' },
        );
        expect((data.error as Record<string, unknown>).code).toBe(-32001);
    });

    it('unknown tool returns -32603', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'nonexistent', arguments: {} },
        });
        expect((data.error as Record<string, unknown>).code).toBe(-32603);
    });

    it('unknown method returns -32601', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'notifications/initialized' });
        expect((data.error as Record<string, unknown>).code).toBe(-32601);
    });
});

describe('Tools', () => {
    it('list_channels calls GET with encoded payload', async () => {
        mockFetch.mockReturnValue(apiOk({ channels: [] }));
        await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_channels', arguments: { limit: 5 } } });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('https://chat.stream-io-api.com/channels?payload=');
        expect(url).toContain('filter_conditions');
    });

    it('get_channel calls correct URL', async () => {
        mockFetch.mockReturnValue(apiOk({ channel: { id: 'ch1', type: 'messaging' } }));
        await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_channel', arguments: { type: 'messaging', id: 'ch1' } } });
        expect(mockFetch).toHaveBeenCalledWith(
            'https://chat.stream-io-api.com/channels/messaging/ch1',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('create_channel sends data body', async () => {
        mockFetch.mockReturnValue(apiOk({ channel: { id: 'new-ch' } }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_channel', arguments: { type: 'messaging', id: 'new-ch', name: 'Test Channel' } },
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect((reqBody.data as Record<string, unknown>).name).toBe('Test Channel');
    });

    it('send_message sends correct body structure', async () => {
        mockFetch.mockReturnValue(apiOk({ message: { id: 'msg1' } }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_message', arguments: { type: 'messaging', id: 'ch1', text: 'Hello', user_id: 'u1' } },
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        const msg = reqBody.message as Record<string, unknown>;
        expect(msg.text).toBe('Hello');
        expect(msg.user_id).toBe('u1');
    });

    it('create_user sends users map', async () => {
        mockFetch.mockReturnValue(apiOk({ users: {} }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_user', arguments: { user_id: 'user123', name: 'Alice' } },
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        const users = reqBody.users as Record<string, unknown>;
        expect(users['user123']).toEqual({ id: 'user123', name: 'Alice' });
    });

    it('delete_channel calls DELETE', async () => {
        mockFetch.mockReturnValue(apiOk({ duration: '10ms' }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'delete_channel', arguments: { type: 'messaging', id: 'ch1' } },
        });
        expect(mockFetch).toHaveBeenCalledWith(
            'https://chat.stream-io-api.com/channels/messaging/ch1',
            expect.objectContaining({ method: 'DELETE' }),
        );
    });

    it('uses Basic auth header', async () => {
        mockFetch.mockReturnValue(apiOk({ channels: [] }));
        await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_channels', arguments: {} } });
        const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
        expect(headers['Authorization']).toContain('Basic ');
        expect(headers['stream-auth-type']).toBe('basic');
    });
});
