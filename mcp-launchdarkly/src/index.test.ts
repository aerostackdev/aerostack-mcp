import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const makeRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://worker.test/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const AUTH = { 'X-Mcp-Secret-LAUNCHDARKLY-API-KEY': 'test-ld-key' };

describe('mcp-launchdarkly', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('GET returns server info', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', { method: 'GET' }));
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string };
    expect(data.name).toBe('mcp-launchdarkly');
  });

  it('non-POST/GET returns 405', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', { method: 'DELETE' }));
    expect(res.status).toBe(405);
  });

  it('invalid JSON returns parse error', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x',
    }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it('initialize returns server info', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const data = await res.json() as { result: { serverInfo: { name: string } } };
    expect(data.result.serverInfo.name).toBe('mcp-launchdarkly');
  });

  it('tools/list returns 14 tools', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const data = await res.json() as { result: { tools: unknown[] } };
    expect(data.result.tools.length).toBe(14);
  });

  it('tools/call without api key returns -32001', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('unknown method returns -32601', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'x', params: {} }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });

  it('unknown tool returns -32603', async () => {
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'xyz', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('list_projects calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/projects');
  });

  it('LaunchDarkly uses no Bearer prefix in auth header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } },
      AUTH
    ));
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('test-ld-key');
    expect(headers['Authorization']).not.toContain('Bearer');
  });

  it('list_feature_flags includes summary and env params', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_feature_flags', arguments: { projectKey: 'my-project', environmentKey: 'production' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/flags/my-project');
    expect(url).toContain('summary=true');
    expect(url).toContain('env=production');
  });

  it('create_feature_flag sends POST with correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ key: 'my-flag' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_feature_flag', arguments: { projectKey: 'proj1', name: 'My Flag', key: 'my-flag' } } },
      AUTH
    ));
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.name).toBe('My Flag');
    expect(body.key).toBe('my-flag');
  });

  it('toggle_feature_flag sends turnFlagOn instruction', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'toggle_feature_flag', arguments: { projectKey: 'proj1', featureFlagKey: 'my-flag', environmentKey: 'production', enabled: true } } },
      AUTH
    ));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body[0].kind).toBe('turnFlagOn');
  });

  it('toggle_feature_flag sends turnFlagOff when enabled=false', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'toggle_feature_flag', arguments: { projectKey: 'proj1', featureFlagKey: 'my-flag', environmentKey: 'production', enabled: false } } },
      AUTH
    ));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body[0].kind).toBe('turnFlagOff');
  });

  it('delete_feature_flag sends DELETE', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_feature_flag', arguments: { projectKey: 'proj1', featureFlagKey: 'my-flag' } } },
      AUTH
    ));
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('get_audit_log uses default limit=20', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_audit_log', arguments: {} } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('limit=20');
  });

  it('list_segments requires projectKey and environmentKey', async () => {
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_segments', arguments: { projectKey: 'proj1' } } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number; message: string } };
    expect(data.error.code).toBe(-32603);
    expect(data.error.message).toContain('environmentKey');
  });

  it('API error returns -32603', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });
});
