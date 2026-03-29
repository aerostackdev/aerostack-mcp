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
        'X-Mcp-Secret-SENDBIRD-API-TOKEN': 'test-api-token',
        'X-Mcp-Secret-SENDBIRD-APP-ID': 'test-app-id',
        ...extra,
    };
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(new Request('https://mcp-sendbird.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers ?? withSecrets()) },
        body: JSON.stringify(body),
    }));
    return res.json() as Promise<Record<string, unknown>>;
}

describe('Protocol', () => {
    it('GET returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-sendbird.workers.dev/', { method: 'GET' }));
        const body = await res.json() as Record<string, unknown>;
        expect(body.status).toBe('ok');
        expect(body.tools).toBe(8);
    });

    it('initialize returns protocol info', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        expect((data.result as Record<string, unknown>).protocolVersion).toBe('2024-11-05');
    });

    it('tools/list returns all 8 tools', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        const tools = (data.result as Record<string, unknown>).tools as unknown[];
        expect(tools.length).toBe(8);
    });

    it('missing API token returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_channels', arguments: {} } },
            {},
        );
        expect((data.error as Record<string, unknown>).code).toBe(-32001);
    });

    it('missing APP ID returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_channels', arguments: {} } },
            { 'X-Mcp-Secret-SENDBIRD-API-TOKEN': 'token-only' },
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
    it('list_channels calls correct URL', async () => {
        mockFetch.mockReturnValue(apiOk({ channels: [] }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_channels', arguments: { limit: 5 } } });
        expect(data.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api-test-app-id.sendbird.com/v3/group_channels?limit=5',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('get_channel calls correct URL', async () => {
        mockFetch.mockReturnValue(apiOk({ channel_url: 'my-channel', name: 'Test' }));
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_channel', arguments: { channel_url: 'my-channel' } } });
        expect(data.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api-test-app-id.sendbird.com/v3/group_channels/my-channel',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('create_channel sends correct body', async () => {
        mockFetch.mockReturnValue(apiOk({ channel_url: 'new-channel', name: 'New' }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_channel', arguments: { user_ids: ['u1', 'u2'], name: 'New' } },
        });
        expect(data.result).toBeDefined();
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(reqBody.user_ids).toEqual(['u1', 'u2']);
        expect(reqBody.name).toBe('New');
    });

    it('send_message sets message_type MESG', async () => {
        mockFetch.mockReturnValue(apiOk({ message_id: 123, message: 'hello' }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_message', arguments: { channel_url: 'ch1', user_id: 'u1', message: 'hello' } },
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(reqBody.message_type).toBe('MESG');
        expect(reqBody.message).toBe('hello');
    });

    it('create_user sends correct body', async () => {
        mockFetch.mockReturnValue(apiOk({ user_id: 'u1', nickname: 'Alice' }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_user', arguments: { user_id: 'u1', nickname: 'Alice' } },
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(reqBody.user_id).toBe('u1');
        expect(reqBody.nickname).toBe('Alice');
    });

    it('delete_message calls DELETE endpoint', async () => {
        mockFetch.mockReturnValue(apiOk({ message_id: 42 }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'delete_message', arguments: { channel_url: 'ch1', message_id: '42' } },
        });
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api-test-app-id.sendbird.com/v3/group_channels/ch1/messages/42',
            expect.objectContaining({ method: 'DELETE' }),
        );
    });

    it('API 401 error returns -32603 with message', async () => {
        mockFetch.mockReturnValue(apiErr(401, 'Unauthorized'));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_users', arguments: {} },
        });
        expect((data.error as Record<string, unknown>).code).toBe(-32603);
        expect((data.error as Record<string, unknown>).message).toContain('Invalid or expired');
    });
});
