import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const makeRequest = (method: string, body?: unknown, headers?: Record<string, string>) =>
  new Request('https://example.com/', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const withToken = { 'X-Mcp-Secret-WRIKE-ACCESS-TOKEN': 'test-token' };

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('mcp-wrike', () => {
  it('GET returns server info', async () => {
    const res = await worker.fetch(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string };
    expect(data.name).toBe('mcp-wrike');
  });

  it('returns 405 for non-GET/POST', async () => {
    const res = await worker.fetch(makeRequest('PUT'));
    expect(res.status).toBe(405);
  });

  it('returns parse error for invalid JSON', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/', { method: 'POST', body: 'oops', headers: { 'Content-Type': 'application/json' } }),
    );
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it('initialize returns protocol version', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'initialize' }));
    const data = await res.json() as { result: { protocolVersion: string } };
    expect(data.result.protocolVersion).toBe('2024-11-05');
  });

  it('tools/list returns 14 tools', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const data = await res.json() as { result: { tools: unknown[] } };
    expect(data.result.tools).toHaveLength(14);
  });

  it('tools/list has annotations', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const data = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
    data.result.tools.forEach(t => expect(t.annotations).toBeDefined());
  });

  it('tools/call requires auth header', async () => {
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_folders', arguments: {} },
    }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('unknown method returns -32601', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'bad' }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });

  it('unknown tool returns -32603', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'unknown_tool', arguments: {} },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('get_current_user hits contacts?me=true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_current_user', arguments: {} },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('me=true'),
      expect.anything(),
    );
  });

  it('list_folders fetches /folders', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_folders', arguments: {} },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/folders'),
      expect.anything(),
    );
  });

  it('create_task sends POST with title', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 't1' }] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'create_task', arguments: { folder_id: 'f1', title: 'My Task' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/folders/f1/tasks'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('delete_task returns deleted:true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'delete_task', arguments: { task_id: 't1' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('"deleted": true');
  });

  it('create_comment sends POST to task comments', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'create_comment', arguments: { task_id: 't1', text: 'Looking good!' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/tasks/t1/comments'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('list_tasks appends status filter when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_tasks', arguments: { folder_id: 'f1', status: 'Active' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('status=Active'),
      expect.anything(),
    );
  });

  it('update_task sends PUT', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'update_task', arguments: { task_id: 't1', title: 'Updated', status: 'Completed' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/tasks/t1'),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('list_timelogs fetches task timelogs', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_timelogs', arguments: { task_id: 't1' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/timelogs'),
      expect.anything(),
    );
  });

  it('API error returns -32603', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_folders', arguments: {} },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('get_contact fetches contact by ID', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'c1', firstName: 'Alice' }] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_contact', arguments: { contact_id: 'c1' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/contacts/c1'),
      expect.anything(),
    );
  });

  it('create_folder sends POST to parent folder', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'f2' }] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'create_folder', arguments: { parent_folder_id: 'pf1', title: 'New Folder' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/folders/pf1/folders'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
