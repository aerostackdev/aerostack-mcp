import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test_live_mollie_api_key_abc123';

function makeRequest(method: string, body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://worker.example.com/', {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
}

function withSecret(headers: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-MOLLIE-API-KEY': API_KEY, ...headers };
}

function mockOk(data: unknown) {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(data), { status: 200 }));
}

function mockNoContent() {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
}

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol tests ─────────────────────────────────────────────────────────────

describe('GET health check', () => {
    it('returns status ok with 9 tools', async () => {
        const res = await worker.fetch(new Request('https://worker.example.com/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-mollie');
        expect(body.tools).toBe(9);
    });
});

describe('initialize', () => {
    it('returns protocolVersion 2024-11-05', async () => {
        const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'initialize' }));
        const body = await res.json() as { result: { protocolVersion: string } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns all 9 tools', async () => {
        const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 2, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(9);
    });
});

describe('missing secret', () => {
    it('returns -32001 when MOLLIE_API_KEY is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'list_payments', arguments: {} },
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32001);
    });
});

describe('unknown tool', () => {
    it('returns -32601 for unknown tool name', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'nonexistent_tool', arguments: {} },
        }, withSecret()));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

describe('unknown method', () => {
    it('returns -32601 for unknown JSON-RPC method', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 5, method: 'resources/list',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

// ── Tool tests ─────────────────────────────────────────────────────────────────

describe('list_payments', () => {
    it('calls Mollie payments endpoint and returns results', async () => {
        const mockData = {
            _embedded: { payments: [{ id: 'tr_abc123', status: 'paid', amount: { value: '10.00', currency: 'EUR' } }] },
            count: 1,
        };
        mockOk(mockData);

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: { name: 'list_payments', arguments: { limit: 10 } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('tr_abc123');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/payments?limit=10'),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${API_KEY}` }) }),
        );
    });
});

describe('create_payment', () => {
    it('creates a payment with required fields', async () => {
        mockOk({ id: 'tr_new123', status: 'open', _links: { checkout: { href: 'https://checkout.mollie.com/pay/tr_new123' } } });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 11, method: 'tools/call',
            params: {
                name: 'create_payment',
                arguments: { currency: 'EUR', value: '25.00', description: 'Test payment', redirectUrl: 'https://example.com/return' },
            },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('tr_new123');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/payments'),
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('returns error when description is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 12, method: 'tools/call',
            params: { name: 'create_payment', arguments: { currency: 'EUR', value: '10.00', redirectUrl: 'https://example.com' } },
        }, withSecret()));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('description');
    });
});

describe('cancel_payment', () => {
    it('sends DELETE to the payment endpoint', async () => {
        mockNoContent();

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 13, method: 'tools/call',
            params: { name: 'cancel_payment', arguments: { id: 'tr_abc123' } },
        }, withSecret()));

        const body = await res.json() as { result: unknown };
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/payments/tr_abc123'),
            expect.objectContaining({ method: 'DELETE' }),
        );
    });
});

describe('list_subscriptions', () => {
    it('calls subscriptions endpoint for a customer', async () => {
        mockOk({ _embedded: { subscriptions: [] }, count: 0 });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 14, method: 'tools/call',
            params: { name: 'list_subscriptions', arguments: { customer_id: 'cst_abc123', limit: 10 } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('subscriptions');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/customers/cst_abc123/subscriptions'),
            expect.anything(),
        );
    });
});
