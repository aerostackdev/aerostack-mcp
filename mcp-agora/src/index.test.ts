import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}
function apiErr(status: number) {
    return Promise.resolve(new Response(JSON.stringify({ message: 'Error' }), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-AGORA-CUSTOMER-ID': 'test-customer-id',
            'X-Mcp-Secret-AGORA-CUSTOMER-SECRET': 'test-customer-secret',
            'X-Mcp-Secret-AGORA-APP-ID': 'test-app-id',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-agora', () => {
    describe('GET /', () => {
        it('returns status ok with correct server name and tool count', async () => {
            const req = new Request('http://localhost/', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('mcp-agora');
            expect(body.tools).toBe(6);
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('mcp-agora');
            expect(body.result.serverInfo.version).toBe('1.0.0');
            expect(body.result.protocolVersion).toBe('2024-11-05');
        });
    });

    describe('tools/list', () => {
        it('returns exactly 6 tools', async () => {
            const res = await worker.fetch(makeReq('tools/list'));
            const body = await res.json() as any;
            expect(body.result.tools).toHaveLength(6);
            const names = body.result.tools.map((t: any) => t.name);
            expect(names).toContain('query_channel_user_list');
            expect(names).toContain('ban_user_from_channel');
            expect(names).toContain('list_ban_rules');
            expect(names).toContain('delete_ban_rule');
            expect(names).toContain('query_online_channels');
            expect(names).toContain('get_channel_user_count');
        });
    });

    describe('unknown method', () => {
        it('returns -32601', async () => {
            const res = await worker.fetch(makeReq('bad/method'));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32601);
        });
    });

    describe('missing auth secrets', () => {
        it('returns -32001 when all secrets are missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_ban_rules', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });

        it('returns -32001 when APP_ID is missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Mcp-Secret-AGORA-CUSTOMER-ID': 'id',
                    'X-Mcp-Secret-AGORA-CUSTOMER-SECRET': 'secret',
                },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_ban_rules', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('query_channel_user_list', () => {
        it('returns user list for a channel', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ success: true, data: { channel_exist: true, mode: 1, total: 2, users: ['uid1', 'uid2'] } }));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'query_channel_user_list',
                arguments: { channel_name: 'test-channel' },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.data.users).toContain('uid1');
            // verify URL includes app_id and channel_name
            expect(mockFetch.mock.calls[0][0]).toContain('test-app-id');
            expect(mockFetch.mock.calls[0][0]).toContain('test-channel');
        });

        it('returns error when channel_name is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'query_channel_user_list',
                arguments: {},
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });

        it('handles API error gracefully', async () => {
            mockFetch.mockReturnValueOnce(apiErr(403));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'query_channel_user_list',
                arguments: { channel_name: 'test-channel' },
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('ban_user_from_channel', () => {
        it('bans a user with default join_channel privilege', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ status: 'success', id: 42 }));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'ban_user_from_channel',
                arguments: { cname: 'my-channel', uid: 'user123', time: 60 },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.id).toBe(42);
            // verify body sent to Agora includes appid
            const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(sentBody.appid).toBe('test-app-id');
            expect(sentBody.privileges).toContain('join_channel');
        });

        it('returns error when required fields are missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'ban_user_from_channel',
                arguments: { cname: 'channel' },
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('list_ban_rules', () => {
        it('returns ban rules list with app_id in query', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ status: 'success', rules: [{ id: 1, uid: 'u1' }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_ban_rules', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.rules).toHaveLength(1);
            expect(mockFetch.mock.calls[0][0]).toContain('test-app-id');
        });
    });

    describe('delete_ban_rule', () => {
        it('deletes a ban rule by id', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ status: 'success', id: 99 }));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'delete_ban_rule',
                arguments: { id: 99 },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.status).toBe('success');
        });

        it('returns error when id is missing', async () => {
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'delete_ban_rule',
                arguments: {},
            }));
            const body = await res.json() as any;
            expect(body.result.content[0].text).toContain('Error');
        });
    });

    describe('query_online_channels', () => {
        it('lists active channels', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ success: true, data: { channels: [{ channel_name: 'room1', user_count: 5 }] } }));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'query_online_channels',
                arguments: { limit: 10 },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.data.channels[0].channel_name).toBe('room1');
        });
    });

    describe('get_channel_user_count', () => {
        it('returns user count for a channel', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ success: true, data: { channel_exist: true, total: 7 } }));
            const res = await worker.fetch(makeReq('tools/call', {
                name: 'get_channel_user_count',
                arguments: { channel_name: 'my-channel' },
            }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.data.total).toBe(7);
        });
    });
});
