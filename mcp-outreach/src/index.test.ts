import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TOKEN = 'ya29.test_outreach_access_token';

function makeRequest(method: string, body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://worker.example.com/', {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
}

function withSecret(headers: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-OUTREACH-ACCESS-TOKEN': TOKEN, ...headers };
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
        expect(body.server).toBe('mcp-outreach');
        expect(body.tools).toBe(8);
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
    it('returns all 8 tools', async () => {
        const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 2, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(8);
    });
});

describe('missing secret', () => {
    it('returns -32001 when OUTREACH_ACCESS_TOKEN is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'list_prospects', arguments: {} },
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32001);
    });
});

describe('unknown tool', () => {
    it('returns -32601 for unknown method name', async () => {
        mockOk({ data: [] });
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
            jsonrpc: '2.0', id: 5, method: 'notifications/something',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

// ── Tool tests ─────────────────────────────────────────────────────────────────

describe('list_prospects', () => {
    it('calls Outreach prospects endpoint and returns results', async () => {
        const mockData = {
            data: [
                { id: '1', type: 'prospect', attributes: { firstName: 'Alice', emails: [{ email: 'alice@example.com' }] } },
            ],
        };
        mockOk(mockData);

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: { name: 'list_prospects', arguments: { limit: 10 } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('Alice');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/prospects?page[size]=10'),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }) }),
        );
    });
});

describe('get_prospect', () => {
    it('fetches a single prospect by ID', async () => {
        mockOk({ data: { id: '42', type: 'prospect', attributes: { firstName: 'Bob', lastName: 'Smith' } } });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 11, method: 'tools/call',
            params: { name: 'get_prospect', arguments: { id: 42 } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('Bob');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/prospects/42'),
            expect.anything(),
        );
    });

    it('returns error when id is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 12, method: 'tools/call',
            params: { name: 'get_prospect', arguments: {} },
        }, withSecret()));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('id');
    });
});

describe('create_prospect', () => {
    it('creates a prospect with email and optional fields', async () => {
        mockOk({ data: { id: '99', type: 'prospect', attributes: { emails: [{ email: 'new@example.com' }], firstName: 'New' } } });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 13, method: 'tools/call',
            params: { name: 'create_prospect', arguments: { email: 'new@example.com', firstName: 'New', title: 'Engineer' } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('new@example.com');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/prospects'),
            expect.objectContaining({ method: 'POST' }),
        );
    });
});

describe('list_sequence_states', () => {
    it('filters by state and calls correct endpoint', async () => {
        mockOk({ data: [] });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 14, method: 'tools/call',
            params: { name: 'list_sequence_states', arguments: { state: 'active', limit: 5 } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('sequenceStates'),
            expect.anything(),
        );
    });
});
