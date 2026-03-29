import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const makeRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://worker.test/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const AUTH = { 'X-Mcp-Secret-BITBUCKET-TOKEN': 'test-bb-token' };

describe('mcp-bitbucket', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('GET returns server info', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', { method: 'GET' }));
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string };
    expect(data.name).toBe('mcp-bitbucket');
  });

  it('non-POST/GET returns 405', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', { method: 'PUT' }));
    expect(res.status).toBe(405);
  });

  it('invalid JSON returns parse error', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'invalid json',
    }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it('initialize returns server info', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const data = await res.json() as { result: { serverInfo: { name: string } } };
    expect(data.result.serverInfo.name).toBe('mcp-bitbucket');
  });

  it('tools/list returns tools array with 14 tools', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const data = await res.json() as { result: { tools: unknown[] } };
    expect(Array.isArray(data.result.tools)).toBe(true);
    expect(data.result.tools.length).toBe(14);
  });

  it('tools/call without api key returns -32001', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_repositories', arguments: { workspace: 'myws' } } }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('unknown method returns -32601', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'unknown/method', params: {} }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });

  it('unknown tool returns -32603', async () => {
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nonexistent_tool', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('list_repositories missing workspace returns -32603', async () => {
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_repositories', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number; message: string } };
    expect(data.error.code).toBe(-32603);
    expect(data.error.message).toContain('workspace');
  });

  it('list_repositories calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ values: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_repositories', arguments: { workspace: 'myworkspace' } } },
      AUTH
    ));
    const data = await res.json() as { result: unknown };
    expect(data.result).toBeDefined();
    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/repositories/myworkspace');
  });

  it('get_repository calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slug: 'my-repo' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_repository', arguments: { workspace: 'myws', repo_slug: 'my-repo' } } },
      AUTH
    ));
    const data = await res.json() as { result: unknown };
    expect(data.result).toBeDefined();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/repositories/myws/my-repo');
  });

  it('create_repository sends POST', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slug: 'new-repo' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_repository', arguments: { workspace: 'myws', repo_slug: 'new-repo', scm: 'git', is_private: true } } },
      AUTH
    ));
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('list_pull_requests with state filter', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ values: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_pull_requests', arguments: { workspace: 'myws', repo_slug: 'my-repo', state: 'OPEN' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('state=OPEN');
  });

  it('create_pull_request sends correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_pull_request', arguments: { workspace: 'myws', repo_slug: 'my-repo', title: 'My PR', source_branch: 'feature', destination_branch: 'main' } } },
      AUTH
    ));
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(sentBody.title).toBe('My PR');
    expect(sentBody.source.branch.name).toBe('feature');
    expect(sentBody.destination.branch.name).toBe('main');
  });

  it('list_pipelines calls correct endpoint with sort param', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ values: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_pipelines', arguments: { workspace: 'myws', repo_slug: 'my-repo' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('sort=-created_on');
  });

  it('create_pipeline sends correct target body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ uuid: 'abc' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_pipeline', arguments: { workspace: 'myws', repo_slug: 'my-repo', ref_type: 'branch', ref_name: 'main' } } },
      AUTH
    ));
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(sentBody.target.ref_name).toBe('main');
    expect(sentBody.target.ref_type).toBe('branch');
  });

  it('merge_pull_request sends POST to merge endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: 'MERGED' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'merge_pull_request', arguments: { workspace: 'myws', repo_slug: 'my-repo', id: 42, merge_strategy: 'squash' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/pullrequests/42/merge');
  });

  it('API error propagates as -32603', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_repository', arguments: { workspace: 'myws', repo_slug: 'missing' } } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number; message: string } };
    expect(data.error.code).toBe(-32603);
    expect(data.error.message).toContain('404');
  });

  it('get_commit calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hash: 'abc123' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_commit', arguments: { workspace: 'myws', repo_slug: 'my-repo', node: 'abc123' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/commit/abc123');
  });

  it('tools/list includes annotations on all tools', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const data = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
    for (const tool of data.result.tools) {
      expect(tool.annotations).toBeDefined();
    }
  });

  it('initialize returns correct protocol version', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const data = await res.json() as { result: { protocolVersion: string } };
    expect(data.result.protocolVersion).toBe('2024-11-05');
  });

  it('null id is preserved in response', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: null, method: 'tools/list', params: {} }));
    const data = await res.json() as { id: null };
    expect(data.id).toBeNull();
  });
});
