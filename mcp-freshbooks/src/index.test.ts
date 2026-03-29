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

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-FRESHBOOKS-ACCESS-TOKEN': 'test_token',
    'X-Mcp-Secret-FRESHBOOKS-ACCOUNT-ID': 'acct_123',
};

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: TEST_HEADERS,
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

// ── Health ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
    it('returns ok', async () => {
        const res = await worker.fetch(new Request('http://localhost/health'));
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('freshbooks-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('freshbooks-mcp');
    });
});

describe('tools/list', () => {
    it('returns 18 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(18);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('create_invoice');
        expect(names).toContain('get_profit_loss');
        expect(names).toContain('send_invoice');
    });
});

describe('missing auth', () => {
    it('returns -32001', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_clients', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('get_account_info', () => {
    it('returns user info', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 1, email: 'user@co.com' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_account_info', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.email).toBe('user@co.com');
    });
});

describe('list_clients', () => {
    it('returns clients', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ response: { result: { clients: [{ id: 1, email: 'client@co.com' }] } } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_clients', arguments: {} }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('includes account_id in URL', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ response: { result: { clients: [] } } }));
        await worker.fetch(makeReq('tools/call', { name: 'list_clients', arguments: {} }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('acct_123');
    });
});

describe('create_client', () => {
    it('creates a client', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ response: { result: { client: { id: 2, email: 'new@client.com' } } } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_client',
            arguments: { email: 'new@client.com', fname: 'Jane' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_client', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_invoice', () => {
    it('creates invoice', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ response: { result: { invoice: { id: 100, total: '500.00' } } } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_invoice',
            arguments: {
                client_id: '1',
                lines: [{ name: 'Consulting', qty: 5, unit_cost: { amount: '100', code: 'USD' } }],
            },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('returns -32603 when client_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_invoice', arguments: { lines: [] } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_invoice', () => {
    it('returns invoice', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ response: { result: { invoice: { id: 100, status: 'sent' } } } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_invoice', arguments: { invoice_id: '100' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('returns -32603 when invoice_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_invoice', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('send_invoice', () => {
    it('sends invoice via email', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ response: { result: { invoice: { id: 100 } } } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'send_invoice', arguments: { invoice_id: '100' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.invoice.action_email).toBe(true);
    });
});

describe('create_payment', () => {
    it('records payment', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ response: { result: { payment: { id: 50 } } } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_payment',
            arguments: { invoice_id: '100', amount: '500.00' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('returns -32603 when amount missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_payment', arguments: { invoice_id: '100' } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_expenses', () => {
    it('returns expenses', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ response: { result: { expenses: [] } } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_expenses', arguments: {} }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('get_profit_loss', () => {
    it('returns P&L report', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ response: { result: { income_total: '10000', expense_total: '3000' } } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_profit_loss',
            arguments: { date_from: '2024-01-01', date_to: '2024-12-31' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('date_from=2024-01-01');
    });

    it('returns -32603 when date_from missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_profit_loss', arguments: { date_to: '2024-12-31' } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_item', () => {
    it('creates item', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ response: { result: { item: { id: 5, name: 'Consulting' } } } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_item', arguments: { name: 'Consulting', unit_cost: '150' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_item', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
