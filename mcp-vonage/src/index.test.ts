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

beforeEach(() => { mockFetch.mockReset(); });

function withSecrets(extra: Record<string, string> = {}) {
    return {
        'X-Mcp-Secret-VONAGE-API-KEY': 'test-api-key',
        'X-Mcp-Secret-VONAGE-API-SECRET': 'test-api-secret',
        ...extra,
    };
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(new Request('https://mcp-vonage.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers ?? withSecrets()) },
        body: JSON.stringify(body),
    }));
    return res.json() as Promise<Record<string, unknown>>;
}

describe('Protocol', () => {
    it('GET returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-vonage.workers.dev/', { method: 'GET' }));
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

    it('missing API secret returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_balance', arguments: {} } },
            { 'X-Mcp-Secret-VONAGE-API-KEY': 'key-only' },
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
    it('send_sms uses form-encoded POST', async () => {
        mockFetch.mockReturnValue(apiOk({
            messages: [{ status: '0', message_id: 'abc123' }],
        }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_sms', arguments: { to: '+15551234567', from: 'Test', text: 'Hello' } },
        });
        const call = mockFetch.mock.calls[0];
        const [url, opts] = call as [string, RequestInit];
        expect(url).toBe('https://rest.nexmo.com/sms/json');
        expect(opts.method).toBe('POST');
        const headers = opts.headers as Record<string, string>;
        expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
        const body = opts.body as string;
        const params = new URLSearchParams(body);
        expect(params.get('to')).toBe('+15551234567');
        expect(params.get('from')).toBe('Test');
        expect(params.get('text')).toBe('Hello');
        expect(params.get('api_key')).toBe('test-api-key');
    });

    it('get_balance calls correct URL with credentials', async () => {
        mockFetch.mockReturnValue(apiOk({ value: 10.5, autoReload: false }));
        await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_balance', arguments: {} } });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('https://rest.nexmo.com/account/get-balance');
        expect(url).toContain('api_key=test-api-key');
        expect(url).toContain('api_secret=test-api-secret');
    });

    it('send_verify sends number and brand', async () => {
        mockFetch.mockReturnValue(apiOk({ request_id: 'req123', status: '0' }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'send_verify', arguments: { number: '+15551234567', brand: 'MyApp', code_length: 6 } },
        });
        const call = mockFetch.mock.calls[0];
        const body = new URLSearchParams(call[1].body as string);
        expect(body.get('number')).toBe('+15551234567');
        expect(body.get('brand')).toBe('MyApp');
        expect(body.get('code_length')).toBe('6');
    });

    it('check_verify sends request_id and code', async () => {
        mockFetch.mockReturnValue(apiOk({ status: '0', event_id: 'evt1' }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'check_verify', arguments: { request_id: 'req123', code: '1234' } },
        });
        const call = mockFetch.mock.calls[0];
        const body = new URLSearchParams(call[1].body as string);
        expect(body.get('request_id')).toBe('req123');
        expect(body.get('code')).toBe('1234');
    });

    it('cancel_verify sends cmd=cancel', async () => {
        mockFetch.mockReturnValue(apiOk({ status: '0', command: 'cancel' }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'cancel_verify', arguments: { request_id: 'req123' } },
        });
        const call = mockFetch.mock.calls[0];
        const body = new URLSearchParams(call[1].body as string);
        expect(body.get('cmd')).toBe('cancel');
    });

    it('get_sms_pricing includes country param', async () => {
        mockFetch.mockReturnValue(apiOk({ countryCode: 'US', countryName: 'United States', networks: [] }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_sms_pricing', arguments: { country_code: 'US' } },
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('country=US');
        expect(url).toContain('/account/get-pricing/outbound/sms');
    });
});
