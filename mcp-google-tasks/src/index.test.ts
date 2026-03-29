import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const makeRequest = (method: string, body?: unknown, headers?: Record<string, string>) =>
  new Request('https://example.com/', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const withToken = { 'X-Mcp-Secret-GOOGLE-TASKS-ACCESS-TOKEN': 'test-token' };

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('mcp-google-tasks', () => {
  it('GET returns server info', async () => {
    const res = await worker.fetch(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string };
    expect(data.name).toBe('mcp-google-tasks');
  });

  it('returns 405 for non-GET/POST', async () => {
    const res = await worker.fetch(makeRequest('DELETE'));
    expect(res.status).toBe(405);
  });

  it('returns parse error for invalid JSON', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/', { method: 'POST', body: 'invalid', headers: { 'Content-Type': 'application/json' } }),
    );
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it('initialize returns protocol version', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const data = await res.json() as { result: { protocolVersion: string } };
    expect(data.result.protocolVersion).toBe('2024-11-05');
  });

  it('tools/list returns 12 tools', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const data = await res.json() as { result: { tools: unknown[] } };
    expect(data.result.tools).toHaveLength(12);
  });

  it('tools/list tools have annotations', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const data = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
    data.result.tools.forEach(tool => {
      expect(tool.annotations).toBeDefined();
    });
  });

  it('tools/call returns -32001 when no auth token', async () => {
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_task_lists', arguments: {} },
    }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('unknown method returns -32601', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'foo/bar' }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });

  it('unknown tool returns -32603', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('list_task_lists calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_task_lists', arguments: {} },
    }, withToken));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/users/@me/lists'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }),
    );
  });

  it('get_task_list requires task_list_id', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_task_list', arguments: {} },
    }, withToken));
    const data = await res.json() as { error: { code: number; message: string } };
    expect(data.error.code).toBe(-32603);
    expect(data.error.message).toContain('task_list_id');
  });

  it('create_task_list sends POST with title', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'tl1', title: 'My List' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'create_task_list', arguments: { title: 'My List' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('My List');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/users/@me/lists'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('delete_task_list returns deleted:true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'delete_task_list', arguments: { task_list_id: 'tl1' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('"deleted": true');
  });

  it('list_tasks includes showCompleted param', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_tasks', arguments: { task_list_id: 'tl1', show_completed: true } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('showCompleted=true'),
      expect.anything(),
    );
  });

  it('create_task sends required fields', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'task1', title: 'Test' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'create_task', arguments: { task_list_id: 'tl1', title: 'Test' } },
    }, withToken));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists/tl1/tasks'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('complete_task patches with completed status', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'task1', status: 'completed' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'complete_task', arguments: { task_list_id: 'tl1', task_id: 'task1' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('completed');
  });

  it('delete_task returns deleted:true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'delete_task', arguments: { task_list_id: 'tl1', task_id: 'task1' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('"deleted": true');
  });

  it('clear_completed_tasks returns cleared:true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'clear_completed_tasks', arguments: { task_list_id: 'tl1' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('"cleared": true');
  });

  it('API error returns -32603', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_task_lists', arguments: {} },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('update_task patches correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'task1' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'update_task', arguments: { task_list_id: 'tl1', task_id: 'task1', title: 'Updated' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists/tl1/tasks/task1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('get_task returns task data', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'task1', title: 'My Task' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_task', arguments: { task_list_id: 'tl1', task_id: 'task1' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('My Task');
  });
});
