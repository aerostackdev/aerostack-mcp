import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test_salesloft_api_key_abc123';

function makeRequest(method: string, body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://worker.example.com/', {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
}

function withSecret(headers: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-SALESLOFT-API-KEY': API_KEY, ...headers };
}

function mockOk(data: unknown) {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(data), { status: 200 }));
}

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol tests ─────────────────────────────────────────────────────────────

describe('GET health check', () => {
    it('returns status ok with tool count', async () => {
        const res = await worker.fetch(new Request('https://worker.example.com/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-salesloft');
        expect(body.tools).toBe(7);
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
    it('returns all 7 tools', async () => {
        const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 2, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(7);
    });
});

describe('missing secret', () => {
    it('returns -32001 when SALESLOFT_API_KEY is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'list_people', arguments: {} },
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
            jsonrpc: '2.0', id: 5, method: 'notifications/unknown',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

// ── Tool tests ─────────────────────────────────────────────────────────────────

describe('list_people', () => {
    it('calls Salesloft people endpoint and returns results', async () => {
        const mockData = {
            data: [{ id: 1, email_address: 'alice@example.com', first_name: 'Alice', last_name: 'Smith' }],
            metadata: { total_count: 1 },
        };
        mockOk(mockData);

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: { name: 'list_people', arguments: { limit: 10 } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('Alice');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/people?per_page=10'),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${API_KEY}` }) }),
        );
    });
});

describe('get_person', () => {
    it('fetches a single person by ID', async () => {
        mockOk({ data: { id: 42, email_address: 'bob@example.com', first_name: 'Bob' } });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 11, method: 'tools/call',
            params: { name: 'get_person', arguments: { id: 42 } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('Bob');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/people/42'),
            expect.anything(),
        );
    });

    it('returns error when id is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 12, method: 'tools/call',
            params: { name: 'get_person', arguments: {} },
        }, withSecret()));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_person', () => {
    it('creates a person with email and optional fields', async () => {
        mockOk({ data: { id: 99, email_address: 'new@example.com', first_name: 'New' } });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 13, method: 'tools/call',
            params: { name: 'create_person', arguments: { email_address: 'new@example.com', first_name: 'New', last_name: 'User' } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('new@example.com');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/people'),
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('returns error when email_address is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 14, method: 'tools/call',
            params: { name: 'create_person', arguments: { first_name: 'NoEmail' } },
        }, withSecret()));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('email_address');
    });
});

describe('list_cadences', () => {
    it('calls cadences endpoint with per_page', async () => {
        mockOk({ data: [{ id: 1, name: 'Outbound Cadence' }] });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 15, method: 'tools/call',
            params: { name: 'list_cadences', arguments: {} },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('Outbound Cadence');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/cadences?per_page=25'),
            expect.anything(),
        );
    });
});
