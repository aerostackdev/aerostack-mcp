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
    return Promise.resolve(new Response(JSON.stringify({ error: { message } }), {
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
            'X-Mcp-Secret-RESEND-API-KEY': 're_test_key_abc',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeReqNoAuth(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        expect(body.server).toBe('resend-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('resend-mcp');
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
        expect(names).toContain('send_email');
        expect(names).toContain('get_email');
        expect(names).toContain('list_emails');
        expect(names).toContain('list_domains');
        expect(names).toContain('cancel_email');
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
    it('returns -32001 when no RESEND-API-KEY header', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_domains',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools: happy paths ────────────────────────────────────────────────────────

describe('send_email', () => {
    it('sends an email successfully', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'email_1abc',
            from: 'sender@example.com',
            to: ['recipient@test.com'],
            created_at: '2024-01-01T00:00:00Z',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'send_email',
            arguments: {
                from: 'sender@example.com',
                to: 'recipient@test.com',
                subject: 'Hello',
                html: '<p>Hi</p>',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('email_1abc');
        expect(result.status).toBe('sent');
    });

    it('returns -32603 when html and text are both missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'send_email',
            arguments: {
                from: 'sender@example.com',
                to: 'recipient@test.com',
                subject: 'Hello',
            },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('html or text');
    });

    it('returns -32603 on Resend 422 validation_error', async () => {
        mockFetch.mockResolvedValueOnce(new Response(
            JSON.stringify({ name: 'validation_error', message: 'Invalid email' }),
            { status: 422, headers: { 'Content-Type': 'application/json' } }
        ));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'send_email',
            arguments: {
                from: 'sender@example.com',
                to: 'not-an-email',
                subject: 'Hello',
                html: '<p>Hi</p>',
            },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('Invalid email');
    });

    it('sends plain text email', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'email_text', from: 'a@b.com', to: ['c@d.com'], created_at: '2024-01-01' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'send_email',
            arguments: { from: 'a@b.com', to: 'c@d.com', subject: 'Hi', text: 'Hello there' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('email_text');
    });

    it('handles comma-separated to addresses', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'email_multi', from: 'a@b.com', to: ['c@d.com', 'e@f.com'], created_at: '2024-01-01' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'send_email',
            arguments: { from: 'a@b.com', to: 'c@d.com, e@f.com', subject: 'Hi', html: '<p>Hi</p>' },
        }));
        const body = await res.json() as any;
        expect(body.result.content[0].text).toBeTruthy();
        // Verify the fetch was called with an array
        const fetchCall = mockFetch.mock.calls[0];
        const fetchBody = JSON.parse(fetchCall[1].body);
        expect(Array.isArray(fetchBody.to)).toBe(true);
        expect(fetchBody.to).toHaveLength(2);
    });
});

describe('get_email', () => {
    it('returns email details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'email_1abc',
            from: 'sender@example.com',
            to: ['recipient@test.com'],
            subject: 'Hello',
            html: '<p>Hi</p>',
            created_at: '2024-01-01',
            last_event: 'delivered',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_email',
            arguments: { email_id: 'email_1abc' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('email_1abc');
        expect(result.subject).toBe('Hello');
        expect(result.status).toBe('delivered');
    });

    it('returns -32603 on 404', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(404, 'Email not found'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_email',
            arguments: { email_id: 'bad_id' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_emails', () => {
    it('returns mapped emails', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ id: 'email_1abc', from: 'sender@example.com', to: ['r@t.com'], subject: 'Hello', last_event: 'sent', created_at: '2024-01-01' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_emails',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('email_1abc');
        expect(result[0].status).toBe('sent');
    });

    it('returns empty array when no emails', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_emails',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toEqual([]);
    });
});

describe('list_domains', () => {
    it('returns mapped domains', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ id: 'dom_1', name: 'example.com', status: 'verified', region: 'us-east-1', created_at: '2024-01-01' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_domains',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('dom_1');
        expect(result[0].name).toBe('example.com');
        expect(result[0].status).toBe('verified');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(401, 'Unauthorized'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_domains',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('cancel_email', () => {
    it('cancels a scheduled email', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({}));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'cancel_email',
            arguments: { email_id: 'email_1abc' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.email_id).toBe('email_1abc');
    });

    it('returns -32603 when email not found', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(404, 'Email not found'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'cancel_email',
            arguments: { email_id: 'bad_id' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── E2E (skipped in CI) ───────────────────────────────────────────────────────

describe.skip('E2E — real Resend API', () => {
    it('sends a real email', async () => {
        // Requires RESEND_API_KEY in env
    });
});
