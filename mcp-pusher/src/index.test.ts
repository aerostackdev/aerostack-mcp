import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(message, { status }));
}

beforeEach(() => { mockFetch.mockReset(); });

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://mcp-pusher.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

const PUSHER_HEADERS = {
    'X-Mcp-Secret-PUSHER-APP-ID': 'app123',
    'X-Mcp-Secret-PUSHER-KEY': 'key456',
    'X-Mcp-Secret-PUSHER-SECRET': 'secret789',
    'X-Mcp-Secret-PUSHER-CLUSTER': 'mt1',
};

function withSecrets(headers: Record<string, string> = {}) {
    return { ...PUSHER_HEADERS, ...headers };
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(makeRequest(body, headers ?? withSecrets()));
    return res.json() as Promise<any>;
}

// ── Protocol tests ────────────────────────────────────────────────────────────

describe('Protocol', () => {
    it('GET / health check returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-pusher.workers.dev/', { method: 'GET' }));
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-pusher');
        expect(body.tools).toBe(8);
    });

    it('initialize returns protocol info', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        expect(data.result.protocolVersion).toBe('2024-11-05');
        expect(data.result.serverInfo.name).toBe('mcp-pusher');
    });

    it('tools/list returns exactly 8 tools', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
        expect(data.result.tools).toHaveLength(8);
        const names = data.result.tools.map((t: any) => t.name);
        expect(names).toContain('trigger_event');
        expect(names).toContain('authenticate_private_channel');
        expect(names).toContain('authenticate_presence_channel');
    });

    it('unknown method returns -32601', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 2, method: 'unknown/method' });
        expect(data.error.code).toBe(-32601);
    });

    it('parse error returns -32700', async () => {
        const res = await worker.fetch(new Request('https://mcp-pusher.workers.dev/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-json{',
        }));
        const data = await res.json() as any;
        expect(data.error.code).toBe(-32700);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('https://mcp-pusher.workers.dev/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });
});

// ── Auth test ─────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing all secrets returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'trigger_event', arguments: { channel: 'test', event_name: 'evt', data: {} } } },
            {} // no secrets
        );
        expect(data.error.code).toBe(-32001);
        expect(data.error.message).toContain('PUSHER_APP_ID');
    });

    it('missing partial secrets returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'trigger_event', arguments: { channel: 'test', event_name: 'evt', data: {} } } },
            { 'X-Mcp-Secret-PUSHER-APP-ID': 'app123' } // only one secret
        );
        expect(data.error.code).toBe(-32001);
        expect(data.error.message).toContain('PUSHER_KEY');
    });
});

// ── Tool: trigger_event ───────────────────────────────────────────────────────

describe('Tool: trigger_event', () => {
    it('triggers event and returns API response', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ channels: { 'my-channel': {} } }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'trigger_event', arguments: { channel: 'my-channel', event_name: 'new-message', data: { text: 'Hello' } } }
        });
        expect(data.result.content[0].type).toBe('text');
        const result = JSON.parse(data.result.content[0].text);
        expect(result.channels).toBeDefined();

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('api-mt1.pusher.com');
        expect(url).toContain('/apps/app123/events');
        const body = JSON.parse(opts.body);
        expect(body.channel).toBe('my-channel');
        expect(body.name).toBe('new-message');
        // data should be JSON stringified
        expect(JSON.parse(body.data)).toEqual({ text: 'Hello' });
    });

    it('includes socket_id in body when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({}));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'trigger_event', arguments: { channel: 'my-channel', event_name: 'evt', data: {}, socket_id: 'socket-123' } }
        });
        const [, opts] = mockFetch.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.socket_id).toBe('socket-123');
    });

    it('URL contains HMAC signature', async () => {
        mockFetch.mockReturnValueOnce(apiOk({}));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'trigger_event', arguments: { channel: 'my-channel', event_name: 'evt', data: {} } }
        });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('auth_signature=');
        expect(url).toContain('auth_key=key456');
        expect(url).toContain('auth_version=1.0');
    });

    it('API error maps to -32603', async () => {
        mockFetch.mockReturnValueOnce(apiErr(403, 'Forbidden'));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'trigger_event', arguments: { channel: 'ch', event_name: 'e', data: {} } }
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Pusher API error 403');
    });
});

// ── Tool: trigger_batch_events ────────────────────────────────────────────────

describe('Tool: trigger_batch_events', () => {
    it('sends batch events', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ batch: [{ status: 200 }, { status: 200 }] }));
        const events = [
            { channel: 'ch1', name: 'evt1', data: { x: 1 } },
            { channel: 'ch2', name: 'evt2', data: { x: 2 } },
        ];
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'trigger_batch_events', arguments: { events } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.batch).toHaveLength(2);

        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toContain('/batch_events');
        const body = JSON.parse(opts.body);
        expect(body.batch).toHaveLength(2);
        // data should be JSON stringified per event
        expect(JSON.parse(body.batch[0].data)).toEqual({ x: 1 });
    });

    it('throws error when events exceed 10', async () => {
        const events = Array.from({ length: 11 }, (_, i) => ({ channel: `ch${i}`, name: 'e', data: {} }));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'trigger_batch_events', arguments: { events } }
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('max 10');
    });
});

// ── Tool: get_channel_info ────────────────────────────────────────────────────

describe('Tool: get_channel_info', () => {
    it('returns channel info', async () => {
        const channelInfo = { occupied: true, user_count: 5, subscription_count: 5 };
        mockFetch.mockReturnValueOnce(apiOk(channelInfo));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_channel_info', arguments: { channel_name: 'presence-room', info: 'user_count' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.occupied).toBe(true);
        expect(result.user_count).toBe(5);

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/channels/presence-room');
        expect(url).toContain('info=user_count');
    });
});

// ── Tool: list_channels ───────────────────────────────────────────────────────

describe('Tool: list_channels', () => {
    it('returns channel list', async () => {
        const channels = { channels: { 'presence-room': { user_count: 3 }, 'my-channel': {} } };
        mockFetch.mockReturnValueOnce(apiOk(channels));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_channels', arguments: { filter_by_prefix: 'presence-' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.channels).toBeDefined();

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/channels');
        expect(url).toContain('filter_by_prefix=presence-');
    });

    it('calls channels endpoint without params', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ channels: {} }));
        await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'list_channels', arguments: {} }
        });
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/apps/app123/channels');
    });
});

// ── Tool: get_channel_users ───────────────────────────────────────────────────

describe('Tool: get_channel_users', () => {
    it('returns list of users in presence channel', async () => {
        const users = { users: [{ id: 'u1' }, { id: 'u2' }] };
        mockFetch.mockReturnValueOnce(apiOk(users));
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_channel_users', arguments: { channel_name: 'presence-room' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.users).toHaveLength(2);
        expect(result.users[0].id).toBe('u1');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/channels/presence-room/users');
    });
});

// ── Tool: get_app_info ────────────────────────────────────────────────────────

describe('Tool: get_app_info', () => {
    it('returns app configuration without calling API', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'get_app_info', arguments: {} }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.app_id).toBe('app123');
        expect(result.key).toBe('key456');
        expect(result.cluster).toBe('mt1');
        // Should not have called fetch
        expect(mockFetch).not.toHaveBeenCalled();
    });
});

// ── Tool: authenticate_private_channel ────────────────────────────────────────

describe('Tool: authenticate_private_channel', () => {
    it('returns auth string for private channel', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'authenticate_private_channel', arguments: { socket_id: '1234.5678', channel_name: 'private-chat' } }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.auth).toBeDefined();
        // auth format: {key}:{signature}
        expect(result.auth).toMatch(/^key456:[a-f0-9]{64}$/);
        // Should not call fetch
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('produces consistent auth for same inputs', async () => {
        const makeCall = () => rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'authenticate_private_channel', arguments: { socket_id: '1234.5678', channel_name: 'private-chat' } }
        });
        const r1 = await makeCall();
        const r2 = await makeCall();
        const auth1 = JSON.parse(r1.result.content[0].text).auth;
        const auth2 = JSON.parse(r2.result.content[0].text).auth;
        expect(auth1).toBe(auth2);
    });
});

// ── Tool: authenticate_presence_channel ───────────────────────────────────────

describe('Tool: authenticate_presence_channel', () => {
    it('returns auth and channel_data for presence channel', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: {
                name: 'authenticate_presence_channel',
                arguments: {
                    socket_id: '1234.5678',
                    channel_name: 'presence-room',
                    user_id: 'user-42',
                    user_info: { name: 'Alice' }
                }
            }
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.auth).toMatch(/^key456:[a-f0-9]{64}$/);
        expect(result.channel_data).toBeDefined();

        const channelData = JSON.parse(result.channel_data);
        expect(channelData.user_id).toBe('user-42');
        expect(channelData.user_info.name).toBe('Alice');
    });

    it('auth differs from private channel auth (includes channel_data)', async () => {
        const privateCall = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'authenticate_private_channel', arguments: { socket_id: '1234.5678', channel_name: 'private-chat' } }
        });
        const presenceCall = await rpc({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: {
                name: 'authenticate_presence_channel',
                arguments: { socket_id: '1234.5678', channel_name: 'presence-chat', user_id: 'u1' }
            }
        });

        const privateAuth = JSON.parse(privateCall.result.content[0].text).auth;
        const presenceAuth = JSON.parse(presenceCall.result.content[0].text).auth;
        // Signatures should differ because the string to sign differs
        expect(privateAuth).not.toBe(presenceAuth);
    });
});

// ── E2E ───────────────────────────────────────────────────────────────────────

describe.skipIf(!process.env.PUSHER_APP_ID)('E2E', () => {
    it('health check works', async () => {
        const res = await worker.fetch(new Request('https://mcp-pusher.workers.dev/', { method: 'GET' }));
        expect(res.status).toBe(200);
    });
});
