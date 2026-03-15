import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}
function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ code: 20003, message, status }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-TWILIO-ACCOUNT-SID': 'ACtest123',
            'X-Mcp-Secret-TWILIO-AUTH-TOKEN': 'auth_token_xyz',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeReqNoSid(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-TWILIO-AUTH-TOKEN': 'auth_token_xyz',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeReqNoToken(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-TWILIO-ACCOUNT-SID': 'ACtest123',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

// ── Health check ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
    it('returns status ok', async () => {
        const req = new Request('http://localhost/health');
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('twilio-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('twilio-mcp');
        expect(body.result.serverInfo.version).toBe('1.0.0');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns exactly 5 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(5);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('send_sms');
        expect(names).toContain('list_messages');
        expect(names).toContain('get_message');
        expect(names).toContain('list_phone_numbers');
        expect(names).toContain('get_account_info');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('unknown/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('missing auth', () => {
    it('returns -32001 when TWILIO-ACCOUNT-SID is missing', async () => {
        const res = await worker.fetch(makeReqNoSid('tools/call', {
            name: 'get_account_info',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });

    it('returns -32001 when TWILIO-AUTH-TOKEN is missing', async () => {
        const res = await worker.fetch(makeReqNoToken('tools/call', {
            name: 'get_account_info',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Twilio Basic auth verification ────────────────────────────────────────────

describe('Basic auth header', () => {
    it('uses btoa(accountSid:authToken) for Authorization header', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            sid: 'ACtest123', friendly_name: 'My Account', status: 'active', type: 'Trial',
        }));
        await worker.fetch(makeReq('tools/call', {
            name: 'get_account_info',
            arguments: {},
        }));
        const authHeader = mockFetch.mock.calls[0][1].headers.Authorization;
        const expected = `Basic ${btoa('ACtest123:auth_token_xyz')}`;
        expect(authHeader).toBe(expected);
    });
});

// ── Tools: happy paths ────────────────────────────────────────────────────────

describe('send_sms', () => {
    it('sends an SMS and returns mapped result', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            sid: 'SM123',
            status: 'queued',
            to: '+15551234567',
            from: '+15559876543',
            body: 'Hello',
            date_created: '2024-01-01',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'send_sms',
            arguments: {
                to: '+15551234567',
                from: '+15559876543',
                body: 'Hello',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.sid).toBe('SM123');
        expect(result.status).toBe('queued');
        expect(result.to).toBe('+15551234567');
        expect(result.body).toBe('Hello');
    });

    it('returns -32603 on Twilio 401 error', async () => {
        mockFetch.mockResolvedValueOnce(new Response(
            JSON.stringify({ code: 20003, message: 'Authenticate', status: 401 }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        ));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'send_sms',
            arguments: { to: '+15551234567', from: '+15559876543', body: 'Hello' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('401');
    });

    it('uses form-encoded body for Twilio API', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ sid: 'SM999', status: 'queued', to: '+1', from: '+2', body: 'Hi', date_created: '2024' }));
        await worker.fetch(makeReq('tools/call', {
            name: 'send_sms',
            arguments: { to: '+15551234567', from: '+15559876543', body: 'Test message' },
        }));
        const contentType = mockFetch.mock.calls[0][1].headers['Content-Type'];
        expect(contentType).toBe('application/x-www-form-urlencoded');
    });
});

describe('list_messages', () => {
    it('returns mapped messages', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            messages: [{
                sid: 'SM123', status: 'delivered', to: '+15551234567', from: '+15559876543',
                body: 'Hello', date_created: '2024-01-01', direction: 'outbound-api',
                price: '-0.0075', price_unit: 'USD',
            }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_messages',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].sid).toBe('SM123');
        expect(result[0].status).toBe('delivered');
        expect(result[0].direction).toBe('outbound-api');
        expect(result[0].price).toBe('-0.0075 USD');
    });

    it('returns empty array when no messages', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ messages: [] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_messages',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toEqual([]);
    });
});

describe('get_message', () => {
    it('returns mapped message', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            sid: 'SM123', status: 'delivered', to: '+15551234567', from: '+15559876543',
            body: 'Hello', date_sent: '2024-01-01', direction: 'outbound-api',
            error_code: null, error_message: null, date_created: '2024-01-01',
            price: null, price_unit: 'USD',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_message',
            arguments: { message_sid: 'SM123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.sid).toBe('SM123');
        expect(result.status).toBe('delivered');
        expect(result.date_sent).toBe('2024-01-01');
        expect(result.price).toBeNull();
    });

    it('returns -32603 on 404', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(404, 'Message not found'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_message',
            arguments: { message_sid: 'SMbad' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_phone_numbers', () => {
    it('returns mapped phone numbers', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            incoming_phone_numbers: [{
                sid: 'PN123', phone_number: '+15551234567', friendly_name: 'My Number',
                capabilities: { sms: true, voice: true }, date_created: '2024-01-01',
            }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_phone_numbers',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].sid).toBe('PN123');
        expect(result[0].phone_number).toBe('+15551234567');
        expect(result[0].capabilities.sms).toBe(true);
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(401, 'Authenticate'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_phone_numbers',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_account_info', () => {
    it('returns account information', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            sid: 'ACtest123', friendly_name: 'My Account', status: 'active',
            type: 'Trial', date_created: '2024-01-01',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_account_info',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.sid).toBe('ACtest123');
        expect(result.friendly_name).toBe('My Account');
        expect(result.status).toBe('active');
        expect(result.type).toBe('Trial');
    });

    it('returns -32603 on Twilio 401 error', async () => {
        mockFetch.mockResolvedValueOnce(new Response(
            JSON.stringify({ code: 20003, message: 'Authenticate', status: 401 }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        ));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_account_info',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── E2E (skipped in CI) ───────────────────────────────────────────────────────

describe.skip('E2E — real Twilio API', () => {
    it('gets real account info', async () => {
        // Requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in env
    });
});
