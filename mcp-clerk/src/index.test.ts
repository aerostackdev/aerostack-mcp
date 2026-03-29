import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const SECRET_KEY = 'sk_test_clerk_secret_key_abc123xyz';

function makeRequest(method: string, body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://worker.example.com/', {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
}

function withSecret(headers: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-CLERK-SECRET-KEY': SECRET_KEY, ...headers };
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
    it('returns status ok with 10 tools', async () => {
        const res = await worker.fetch(new Request('https://worker.example.com/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-clerk');
        expect(body.tools).toBe(10);
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
    it('returns all 10 tools', async () => {
        const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 2, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(10);
    });
});

describe('missing secret', () => {
    it('returns -32001 when CLERK_SECRET_KEY is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'list_users', arguments: {} },
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32001);
    });
});

describe('unknown tool', () => {
    it('returns -32601 for unknown tool name', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'reset_password', arguments: {} },
        }, withSecret()));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

describe('unknown method', () => {
    it('returns -32601 for unknown JSON-RPC method', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 5, method: 'notifications/subscribed',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

// ── Tool tests ─────────────────────────────────────────────────────────────────

describe('list_users', () => {
    it('calls Clerk users endpoint and returns results', async () => {
        const mockData = [
            { id: 'user_abc123', first_name: 'Alice', last_name: 'Smith', email_addresses: [{ email_address: 'alice@example.com' }] },
        ];
        mockOk(mockData);

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: { name: 'list_users', arguments: { limit: 10 } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('Alice');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/users?limit=10'),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${SECRET_KEY}` }) }),
        );
    });
});

describe('get_user', () => {
    it('fetches user details by ID', async () => {
        mockOk({ id: 'user_xyz789', first_name: 'Bob', last_name: 'Jones', banned: false });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 11, method: 'tools/call',
            params: { name: 'get_user', arguments: { user_id: 'user_xyz789' } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('Bob');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/users/user_xyz789'),
            expect.anything(),
        );
    });

    it('returns error when user_id is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 12, method: 'tools/call',
            params: { name: 'get_user', arguments: {} },
        }, withSecret()));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('user_id');
    });
});

describe('ban_user', () => {
    it('calls ban endpoint with POST method', async () => {
        mockOk({ id: 'user_abc123', banned: true });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 13, method: 'tools/call',
            params: { name: 'ban_user', arguments: { user_id: 'user_abc123' } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('banned');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/users/user_abc123/ban'),
            expect.objectContaining({ method: 'POST' }),
        );
    });
});

describe('delete_user', () => {
    it('sends DELETE to the user endpoint', async () => {
        mockNoContent();

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 14, method: 'tools/call',
            params: { name: 'delete_user', arguments: { user_id: 'user_del999' } },
        }, withSecret()));

        expect(res.status).toBe(200);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/users/user_del999'),
            expect.objectContaining({ method: 'DELETE' }),
        );
    });
});

describe('create_invitation', () => {
    it('creates an invitation with email and optional redirect', async () => {
        mockOk({ id: 'inv_001', email_address: 'invite@example.com', status: 'pending' });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 15, method: 'tools/call',
            params: {
                name: 'create_invitation',
                arguments: { email_address: 'invite@example.com', redirect_url: 'https://app.example.com/welcome' },
            },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('invite@example.com');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/invitations'),
            expect.objectContaining({ method: 'POST' }),
        );
    });
});
