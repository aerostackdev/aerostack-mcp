import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const makeRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://worker.test/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const AUTH = { 'X-Mcp-Secret-FLY-API-TOKEN': 'test-fly-token' };

describe('mcp-fly-io', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('GET returns server info', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', { method: 'GET' }));
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string };
    expect(data.name).toBe('mcp-fly-io');
  });

  it('non-POST/GET returns 405', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', { method: 'PUT' }));
    expect(res.status).toBe(405);
  });

  it('invalid JSON returns parse error', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'bad',
    }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it('initialize returns server info', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const data = await res.json() as { result: { serverInfo: { name: string } } };
    expect(data.result.serverInfo.name).toBe('mcp-fly-io');
  });

  it('tools/list returns 12 tools', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const data = await res.json() as { result: { tools: unknown[] } };
    expect(data.result.tools.length).toBe(12);
  });

  it('tools/call without api key returns -32001', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_apps', arguments: { org_slug: 'myorg' } } }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('unknown method returns -32601', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'other/method', params: {} }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });

  it('unknown tool returns -32603', async () => {
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'not_a_tool', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('list_apps requires org_slug', async () => {
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_apps', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number; message: string } };
    expect(data.error.code).toBe(-32603);
    expect(data.error.message).toContain('org_slug');
  });

  it('list_apps calls correct endpoint with org_slug param', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ apps: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_apps', arguments: { org_slug: 'my-org' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/apps');
    expect(url).toContain('org_slug=my-org');
  });

  it('create_app sends POST with correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'app-1' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_app', arguments: { app_name: 'my-app', org_slug: 'my-org' } } },
      AUTH
    ));
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.app_name).toBe('my-app');
    expect(body.org_slug).toBe('my-org');
  });

  it('delete_app sends DELETE request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_app', arguments: { app_name: 'my-app' } } },
      AUTH
    ));
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(data.result.content[0].text).deleted).toBe(true);
  });

  it('list_machines calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_machines', arguments: { app_name: 'my-app' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/apps/my-app/machines');
  });

  it('create_machine sends image in config', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'machine-1' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_machine', arguments: { app_name: 'my-app', image: 'nginx:latest', region: 'iad' } } },
      AUTH
    ));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.config.image).toBe('nginx:latest');
    expect(body.region).toBe('iad');
  });

  it('start_machine sends POST to start endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'started' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'start_machine', arguments: { app_name: 'my-app', machine_id: 'm1' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/machines/m1/start');
  });

  it('delete_machine uses force=true param', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_machine', arguments: { app_name: 'my-app', machine_id: 'm1' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('force=true');
  });

  it('stop_machine sends signal and timeout', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'stop_machine', arguments: { app_name: 'my-app', machine_id: 'm1', signal: 'SIGKILL', timeout: 30 } } },
      AUTH
    ));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.signal).toBe('SIGKILL');
    expect(body.timeout).toBe(30);
  });

  it('API error returns -32603', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_app', arguments: { app_name: 'missing' } } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });
});
