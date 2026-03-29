import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test-height-api-key';
const AUTH_HEADERS = { 'X-Mcp-Secret-HEIGHT-API-KEY': API_KEY };

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function mockApiResponse(data: unknown, status = 200) {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(data), { status }));
}

beforeEach(() => { mockFetch.mockReset(); });

describe('Infrastructure', () => {
    it('GET /health returns ok', async () => {
        const res = await worker.fetch(new Request('http://localhost/health'));
        const body = await res.json() as { status: string; mcp: string };
        expect(body.status).toBe('ok');
        expect(body.mcp).toBe('mcp-height');
    });

    it('GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns -32700', async () => {
        const req = new Request('http://localhost/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns server info', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        const body = await res.json() as { result: { serverInfo: { name: string }; protocolVersion: string } };
        expect(body.result.serverInfo.name).toBe('mcp-height');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });

    it('tools/list returns 14 tools', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(14);
    });

    it('unknown method returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 3, method: 'bad/method' }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('tools/call without api key returns -32001', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_lists', arguments: {} } }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32001);
    });

    it('all tools have annotations', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 5, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
        for (const tool of body.result.tools) {
            expect(tool.annotations).toBeDefined();
        }
    });

    it('uses api-key auth header format', async () => {
        mockApiResponse({ list: [] });
        await worker.fetch(makeReq({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'list_lists', arguments: {} } }, AUTH_HEADERS));
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
            headers: expect.objectContaining({ Authorization: `api-key ${API_KEY}` }),
        }));
    });
});

describe('list_lists', () => {
    it('returns lists', async () => {
        mockApiResponse({ list: [{ id: 'lst_1', name: 'Engineering' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_lists', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).list).toHaveLength(1);
    });
});

describe('create_list', () => {
    it('creates list', async () => {
        mockApiResponse({ id: 'lst_new', name: 'Design' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'create_list', arguments: { name: 'Design' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('lst_new');
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST' }));
    });

    it('errors without name', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'create_list', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_tasks', () => {
    it('returns tasks for list', async () => {
        mockApiResponse({ list: [{ id: 'tsk_1', name: 'Fix login bug' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'list_tasks', arguments: { listId: 'lst_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).list).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('listIds[]=lst_1'), expect.any(Object));
    });

    it('errors without listId', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'list_tasks', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_task', () => {
    it('returns task', async () => {
        mockApiResponse({ id: 'tsk_1', name: 'Fix login bug', status: 'inProgress' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'get_task', arguments: { taskId: 'tsk_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('tsk_1');
    });
});

describe('create_task', () => {
    it('creates task', async () => {
        mockApiResponse({ id: 'tsk_new', name: 'New feature' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'create_task', arguments: { name: 'New feature', listId: 'lst_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('tsk_new');
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST' }));
    });

    it('errors without name or listId', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'create_task', arguments: { name: 'Test' } } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('update_task', () => {
    it('updates task', async () => {
        mockApiResponse({ id: 'tsk_1', name: 'Updated feature', status: 'done' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 18, method: 'tools/call', params: { name: 'update_task', arguments: { taskId: 'tsk_1', status: 'done' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).status).toBe('done');
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'PATCH' }));
    });
});

describe('delete_task', () => {
    it('deletes task', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'delete_task', arguments: { taskId: 'tsk_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).deleted).toBe(true);
    });
});

describe('search_tasks', () => {
    it('searches tasks', async () => {
        mockApiResponse({ list: [{ id: 'tsk_2', name: 'Bug fix' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'search_tasks', arguments: { query: 'bug' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).list).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('query='), expect.any(Object));
    });
});

describe('list_users', () => {
    it('returns users', async () => {
        mockApiResponse({ list: [{ id: 'usr_1', name: 'Alice' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'list_users', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).list).toHaveLength(1);
    });
});

describe('list_activities', () => {
    it('returns activities for task', async () => {
        mockApiResponse({ list: [{ id: 'act_1', type: 'statusChange' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'list_activities', arguments: { taskId: 'tsk_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).list).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('taskId=tsk_1'), expect.any(Object));
    });
});

describe('create_field', () => {
    it('creates field', async () => {
        mockApiResponse({ id: 'fld_1', name: 'Priority', type: 'select' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'create_field', arguments: { name: 'Priority', type: 'select', listId: 'lst_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('fld_1');
    });
});

describe('unknown tool', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 24, method: 'tools/call', params: { name: 'bad_tool', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});
