import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const makeRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://worker.test/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const AUTH = { 'X-Mcp-Secret-DIGITALOCEAN-TOKEN': 'test-do-token' };

describe('mcp-digitalocean', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('GET returns server info', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', { method: 'GET' }));
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string };
    expect(data.name).toBe('mcp-digitalocean');
  });

  it('non-POST/GET returns 405', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', { method: 'DELETE' }));
    expect(res.status).toBe(405);
  });

  it('invalid JSON returns parse error', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json',
    }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it('initialize returns server info', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const data = await res.json() as { result: { serverInfo: { name: string } } };
    expect(data.result.serverInfo.name).toBe('mcp-digitalocean');
  });

  it('tools/list returns 14 tools', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const data = await res.json() as { result: { tools: unknown[] } };
    expect(data.result.tools.length).toBe(14);
  });

  it('tools/call without api key returns -32001', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_droplets', arguments: {} } }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('unknown method returns -32601', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'no/method', params: {} }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });

  it('unknown tool returns -32603', async () => {
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fake_tool', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('list_droplets calls with pagination params', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ droplets: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_droplets', arguments: {} } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/droplets');
    expect(url).toContain('page=1');
    expect(url).toContain('per_page=20');
  });

  it('get_droplet calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ droplet: { id: 123 } }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_droplet', arguments: { droplet_id: 123 } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/droplets/123');
  });

  it('create_droplet sends POST with required fields', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ droplet: { id: 456 } }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_droplet', arguments: { name: 'my-droplet', region: 'nyc3', size: 's-1vcpu-1gb', image: 'ubuntu-22-04-x64' } } },
      AUTH
    ));
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.name).toBe('my-droplet');
    expect(body.region).toBe('nyc3');
  });

  it('delete_droplet sends DELETE', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_droplet', arguments: { droplet_id: 789 } } },
      AUTH
    ));
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(data.result.content[0].text).deleted).toBe(true);
  });

  it('create_domain sends correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ domain: { name: 'example.com' } }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_domain', arguments: { name: 'example.com', ip_address: '1.2.3.4' } } },
      AUTH
    ));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.name).toBe('example.com');
    expect(body.ip_address).toBe('1.2.3.4');
  });

  it('list_domain_records calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ domain_records: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_domain_records', arguments: { domain_name: 'example.com' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/domains/example.com/records');
  });

  it('list_kubernetes_clusters calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ kubernetes_clusters: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_kubernetes_clusters', arguments: {} } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/kubernetes/clusters');
  });

  it('get_database requires database_cluster_uuid', async () => {
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_database', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number; message: string } };
    expect(data.error.code).toBe(-32603);
    expect(data.error.message).toContain('database_cluster_uuid');
  });

  it('API error returns -32603 with status code', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_droplets', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number; message: string } };
    expect(data.error.code).toBe(-32603);
    expect(data.error.message).toContain('401');
  });

  it('tools/list contains readOnlyHint annotations', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const data = await res.json() as { result: { tools: Array<{ annotations: { readOnlyHint: boolean } }> } };
    const listDroplets = data.result.tools.find((t: { name?: string }) => t.name === 'list_droplets');
    expect(listDroplets?.annotations.readOnlyHint).toBe(true);
    const createDroplet = data.result.tools.find((t: { name?: string }) => t.name === 'create_droplet');
    expect(createDroplet?.annotations.readOnlyHint).toBe(false);
  });

  it('create_domain_record sends correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ domain_record: { id: 1 } }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_domain_record', arguments: { domain_name: 'example.com', type: 'A', name: '@', data: '1.2.3.4' } } },
      AUTH
    ));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.type).toBe('A');
    expect(body.data).toBe('1.2.3.4');
  });
});
