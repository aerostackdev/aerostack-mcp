import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}
function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ errors: [{ description: message }] }), { status, headers: { 'Content-Type': 'application/json' } }));
}
function api204() { return Promise.resolve(new Response(null, { status: 204 })); }

beforeEach(() => { mockFetch.mockReset(); });

function withSecrets(extra: Record<string, string> = {}) {
    return {
        'X-Mcp-Secret-MESSAGEBIRD-API-KEY': 'test-api-key',
        ...extra,
    };
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(new Request('https://mcp-messagebird.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers ?? withSecrets()) },
        body: JSON.stringify(body),
    }));
    return res.json() as Promise<Record<string, unknown>>;
}

describe('Protocol', () => {
    it('GET returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-messagebird.workers.dev/', { method: 'GET' }));
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
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_balance', arguments: {} } },
            {},
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
    it('send_message sends correct body', async () => {
        mockFetch.mockReturnValue(apiOk({ id: 'msg1', recipients: { totalCount: 1 } }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_message', arguments: { originator: 'Test', recipients: ['+15551234567'], body: 'Hello' } },
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(reqBody.originator).toBe('Test');
        expect(reqBody.recipients).toEqual(['+15551234567']);
        expect(reqBody.body).toBe('Hello');
    });

    it('send_message uses AccessKey auth', async () => {
        mockFetch.mockReturnValue(apiOk({ id: 'msg1' }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_message', arguments: { originator: 'Test', recipients: ['+1555'], body: 'Hi' } },
        });
        const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe('AccessKey test-api-key');
    });

    it('get_message calls correct URL', async () => {
        mockFetch.mockReturnValue(apiOk({ id: 'msg123', status: 'delivered' }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_message', arguments: { id: 'msg123' } },
        });
        expect(mockFetch).toHaveBeenCalledWith(
            'https://rest.messagebird.com/messages/msg123',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('delete_message calls DELETE and handles 204', async () => {
        mockFetch.mockReturnValue(api204());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'delete_message', arguments: { id: 'msg123' } },
        });
        expect(data.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://rest.messagebird.com/messages/msg123',
            expect.objectContaining({ method: 'DELETE' }),
        );
    });

    it('get_balance returns balance data', async () => {
        mockFetch.mockReturnValue(apiOk({ payment: 'prepaid', type: 'credits', amount: 9.5, currency: 'EUR' }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_balance', arguments: {} },
        });
        expect(data.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://rest.messagebird.com/balance',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('create_contact sends msisdn and optional fields', async () => {
        mockFetch.mockReturnValue(apiOk({ id: 'contact1', msisdn: 15551234567 }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'create_contact', arguments: { msisdn: '+15551234567', firstName: 'Alice', email: 'alice@example.com' } },
        });
        const call = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(reqBody.msisdn).toBe('+15551234567');
        expect(reqBody.firstName).toBe('Alice');
        expect(reqBody.email).toBe('alice@example.com');
    });

    it('API 401 error returns -32603 with message', async () => {
        mockFetch.mockReturnValue(apiErr(401, 'Request not allowed'));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_balance', arguments: {} },
        });
        expect((data.error as Record<string, unknown>).code).toBe(-32603);
        expect((data.error as Record<string, unknown>).message).toContain('Invalid or expired');
    });
});
