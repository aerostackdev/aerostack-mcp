import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown = { success: true }, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

function apiErr(status: number, error = 'Bad Request') {
    return Promise.resolve(new Response(JSON.stringify({ error }), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://mcp-segment.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function withKey(headers: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-SEGMENT-WRITE-KEY': 'mock-write-key', ...headers };
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(makeRequest(body, headers ?? withKey()));
    return res.json() as Promise<any>;
}

// ── Protocol tests ────────────────────────────────────────────────────────────

describe('Protocol', () => {
    it('GET / health check returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-segment.workers.dev/', { method: 'GET' }));
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-segment');
        expect(body.tools).toBe(7);
    });

    it('initialize returns protocol info', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        expect(data.result.protocolVersion).toBe('2024-11-05');
        expect(data.result.serverInfo.name).toBe('mcp-segment');
    });

    it('tools/list returns exactly 7 tools', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        expect(data.result.tools).toHaveLength(7);
        const names = data.result.tools.map((t: any) => t.name);
        expect(names).toContain('track_event');
        expect(names).toContain('identify_user');
        expect(names).toContain('batch_track');
    });

    it('unknown method returns -32601', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 2, method: 'unknown/method' });
        expect(data.error.code).toBe(-32601);
    });

    it('parse error returns -32700', async () => {
        const res = await worker.fetch(new Request('https://mcp-segment.workers.dev/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-json{',
        }));
        const data = await res.json() as any;
        expect(data.error.code).toBe(-32700);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('https://mcp-segment.workers.dev/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });
});

// ── Auth test ─────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing write key header returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'track_event', arguments: { user_id: 'u1', event: 'Test' } } },
            {} // no key header
        );
        expect(data.error.code).toBe(-32001);
        expect(data.error.message).toContain('SEGMENT_WRITE_KEY');
    });
});

// ── Tool: track_event ─────────────────────────────────────────────────────────

describe('Tool: track_event', () => {
    it('sends track event and returns success', async () => {
        mockFetch.mockReturnValueOnce(apiOk());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'track_event', arguments: { user_id: 'u1', event: 'Button Clicked', properties: { button: 'signup' } } }
        });
        expect(data.result.content[0].type).toBe('text');
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/track');
        const body = JSON.parse(opts.body);
        expect(body.userId).toBe('u1');
        expect(body.event).toBe('Button Clicked');
        expect(body.properties.button).toBe('signup');
    });

    it('uses Basic auth with write key as password', async () => {
        mockFetch.mockReturnValueOnce(apiOk());
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'track_event', arguments: { user_id: 'u1', event: 'Test' } }
        });
        const [, opts] = mockFetch.mock.calls[0];
        const expectedAuth = `Basic ${btoa(':mock-write-key')}`;
        expect(opts.headers['Authorization']).toBe(expectedAuth);
    });

    it('includes optional fields when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk());
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: {
                name: 'track_event',
                arguments: {
                    user_id: 'u1', event: 'Test',
                    anonymous_id: 'anon-123',
                    timestamp: '2024-01-01T00:00:00Z'
                }
            }
        });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.anonymousId).toBe('anon-123');
        expect(body.timestamp).toBe('2024-01-01T00:00:00Z');
    });

    it('API error maps to -32603', async () => {
        mockFetch.mockReturnValueOnce(apiErr(400, 'Invalid write key'));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'track_event', arguments: { user_id: 'u1', event: 'Test' } }
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Segment API error 400');
    });
});

// ── Tool: identify_user ───────────────────────────────────────────────────────

describe('Tool: identify_user', () => {
    it('sends identify call with traits', async () => {
        mockFetch.mockReturnValueOnce(apiOk());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'identify_user', arguments: { user_id: 'u1', traits: { email: 'test@example.com', name: 'Alice' } } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/identify');
        const body = JSON.parse(opts.body);
        expect(body.userId).toBe('u1');
        expect(body.traits.email).toBe('test@example.com');
    });

    it('includes anonymous_id when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk());
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'identify_user', arguments: { user_id: 'u1', traits: { email: 'a@b.com' }, anonymous_id: 'anon-456' } }
        });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.anonymousId).toBe('anon-456');
    });
});

// ── Tool: group_user ──────────────────────────────────────────────────────────

describe('Tool: group_user', () => {
    it('sends group call with group_id and traits', async () => {
        mockFetch.mockReturnValueOnce(apiOk());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'group_user', arguments: { user_id: 'u1', group_id: 'acme-corp', traits: { name: 'Acme Corp', industry: 'Tech' } } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/group');
        const body = JSON.parse(opts.body);
        expect(body.groupId).toBe('acme-corp');
        expect(body.traits.name).toBe('Acme Corp');
    });
});

// ── Tool: page_view ───────────────────────────────────────────────────────────

describe('Tool: page_view', () => {
    it('sends page call with url and title as properties', async () => {
        mockFetch.mockReturnValueOnce(apiOk());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'page_view', arguments: { user_id: 'u1', name: 'Home', url: 'https://example.com', title: 'Home Page' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/page');
        const body = JSON.parse(opts.body);
        expect(body.name).toBe('Home');
        expect(body.properties.url).toBe('https://example.com');
        expect(body.properties.title).toBe('Home Page');
    });

    it('sends minimal page call with only user_id', async () => {
        mockFetch.mockReturnValueOnce(apiOk());
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'page_view', arguments: { user_id: 'u1' } }
        });
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/page');
        const body = JSON.parse(opts.body);
        expect(body.userId).toBe('u1');
    });
});

// ── Tool: screen_view ─────────────────────────────────────────────────────────

describe('Tool: screen_view', () => {
    it('sends screen call', async () => {
        mockFetch.mockReturnValueOnce(apiOk());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'screen_view', arguments: { user_id: 'u1', name: 'Dashboard', properties: { tab: 'overview' } } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/screen');
        const body = JSON.parse(opts.body);
        expect(body.name).toBe('Dashboard');
        expect(body.properties.tab).toBe('overview');
    });
});

// ── Tool: alias_user ──────────────────────────────────────────────────────────

describe('Tool: alias_user', () => {
    it('sends alias call with previousId', async () => {
        mockFetch.mockReturnValueOnce(apiOk());
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'alias_user', arguments: { user_id: 'new-user-id', previous_id: 'anon-old-id' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/alias');
        const body = JSON.parse(opts.body);
        expect(body.userId).toBe('new-user-id');
        expect(body.previousId).toBe('anon-old-id');
    });
});

// ── Tool: batch_track ─────────────────────────────────────────────────────────

describe('Tool: batch_track', () => {
    it('sends batch of events and returns count', async () => {
        mockFetch.mockReturnValueOnce(apiOk());
        const events = [
            { type: 'track', userId: 'u1', event: 'Page View' },
            { type: 'track', userId: 'u2', event: 'Button Clicked' },
            { type: 'identify', userId: 'u1', traits: { email: 'a@b.com' } },
        ];
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'batch_track', arguments: { events } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.count).toBe(3);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/batch');
        const body = JSON.parse(opts.body);
        expect(body.batch).toHaveLength(3);
    });

    it('throws error when events exceed 500', async () => {
        const events = Array.from({ length: 501 }, (_, i) => ({ type: 'track', userId: `u${i}`, event: 'Test' }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'batch_track', arguments: { events } }
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('max 500');
    });
});

// ── E2E ───────────────────────────────────────────────────────────────────────

describe.skipIf(!process.env.SEGMENT_WRITE_KEY)('E2E', () => {
    it('health check works', async () => {
        const res = await worker.fetch(new Request('https://mcp-segment.workers.dev/', { method: 'GET' }));
        expect(res.status).toBe(200);
    });
});
