import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}
function apiErr(status: number, reason = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ reason }), { status, headers: { 'Content-Type': 'application/json' } }));
}
function api204() { return Promise.resolve(new Response(null, { status: 204 })); }

beforeEach(() => { mockFetch.mockReset(); });

function withSecrets(extra: Record<string, string> = {}) {
    return {
        'X-Mcp-Secret-CRISP-IDENTIFIER': 'test-identifier',
        'X-Mcp-Secret-CRISP-KEY': 'test-key',
        'X-Mcp-Secret-CRISP-WEBSITE-ID': 'test-website-id',
        ...extra,
    };
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(new Request('https://mcp-crisp.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers ?? withSecrets()) },
        body: JSON.stringify(body),
    }));
    return res.json() as Promise<Record<string, unknown>>;
}

describe('Protocol', () => {
    it('GET returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-crisp.workers.dev/', { method: 'GET' }));
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

    it('missing identifier returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_conversations', arguments: {} } },
            {},
        );
        expect((data.error as Record<string, unknown>).code).toBe(-32001);
    });

    it('missing key returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_conversations', arguments: {} } },
            { 'X-Mcp-Secret-CRISP-IDENTIFIER': 'id-only' },
        );
        expect((data.error as Record<string, unknown>).code).toBe(-32001);
    });

    it('missing website ID returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_conversations', arguments: {} } },
            { 'X-Mcp-Secret-CRISP-IDENTIFIER': 'id', 'X-Mcp-Secret-CRISP-KEY': 'key' },
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
    it('list_conversations calls correct URL with filter', async () => {
        mockFetch.mockReturnValue(apiOk({ data: [] }));
        await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_conversations', arguments: {} } });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toBe('https://api.crisp.chat/v1/website/test-website-id/conversations/1?filter_resolved=false');
    });

    it('uses Basic auth and X-Crisp-Tier header', async () => {
        mockFetch.mockReturnValue(apiOk({ data: [] }));
        await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_conversations', arguments: {} } });
        const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
        expect(headers['Authorization']).toContain('Basic ');
        expect(headers['X-Crisp-Tier']).toBe('plugin');
    });

    it('get_conversation calls correct URL', async () => {
        mockFetch.mockReturnValue(apiOk({ data: { session_id: 'sess1' } }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_conversation', arguments: { session_id: 'sess1' } },
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toBe('https://api.crisp.chat/v1/website/test-website-id/conversation/sess1');
    });

    it('send_message sends correct body structure', async () => {
        mockFetch.mockReturnValue(apiOk({ data: {} }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_message', arguments: { session_id: 'sess1', content: 'Hello there!' } },
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(reqBody.type).toBe('text');
        expect(reqBody.from).toBe('operator');
        expect(reqBody.origin).toBe('chat');
        expect(reqBody.content).toBe('Hello there!');
    });

    it('resolve_conversation sends state=resolved', async () => {
        mockFetch.mockReturnValue(apiOk({ data: {} }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'resolve_conversation', arguments: { session_id: 'sess1' } },
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('PATCH');
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(reqBody.state).toBe('resolved');
    });

    it('assign_conversation sends assigned_agent_id', async () => {
        mockFetch.mockReturnValue(apiOk({ data: {} }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'assign_conversation', arguments: { session_id: 'sess1', assigned_agent_id: 'agent-123' } },
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(reqBody.assigned_agent_id).toBe('agent-123');
    });

    it('list_operators calls operators/list endpoint', async () => {
        mockFetch.mockReturnValue(apiOk({ data: [] }));
        await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_operators', arguments: {} } });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toBe('https://api.crisp.chat/v1/website/test-website-id/operators/list');
    });

    it('API 401 error returns -32603 with message', async () => {
        mockFetch.mockReturnValue(apiErr(401, 'Unauthorized'));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_conversations', arguments: {} },
        });
        expect((data.error as Record<string, unknown>).code).toBe(-32603);
        expect((data.error as Record<string, unknown>).message).toContain('Invalid or expired');
    });
});
