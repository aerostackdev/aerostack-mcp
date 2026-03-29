import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const makeRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://worker.test/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const AUTH = { 'X-Mcp-Secret-PULUMI-ACCESS-TOKEN': 'test-pulumi-token' };

describe('mcp-pulumi', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('GET returns server info', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', { method: 'GET' }));
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string };
    expect(data.name).toBe('mcp-pulumi');
  });

  it('non-POST/GET returns 405', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', { method: 'PATCH' }));
    expect(res.status).toBe(405);
  });

  it('invalid JSON returns parse error', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '!',
    }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it('initialize returns server info', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const data = await res.json() as { result: { serverInfo: { name: string } } };
    expect(data.result.serverInfo.name).toBe('mcp-pulumi');
  });

  it('tools/list returns 12 tools', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const data = await res.json() as { result: { tools: unknown[] } };
    expect(data.result.tools.length).toBe(12);
  });

  it('tools/call without api key returns -32001', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_organizations', arguments: {} } }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('unknown method returns -32601', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'bad', params: {} }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });

  it('unknown tool returns -32603', async () => {
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fake', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('Pulumi uses "token {value}" auth format', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ organizations: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_organizations', arguments: {} } },
      AUTH
    ));
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('token test-pulumi-token');
  });

  it('list_organizations calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ organizations: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_organizations', arguments: {} } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/user/organizations');
  });

  it('list_stacks calls with optional params', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ stacks: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_stacks', arguments: { organization: 'myorg', project: 'myproj' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('organization=myorg');
    expect(url).toContain('project=myproj');
  });

  it('get_stack calls correct path', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ orgName: 'myorg' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_stack', arguments: { organization: 'myorg', project: 'myproj', stack: 'dev' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/stacks/myorg/myproj/dev');
  });

  it('create_stack sends stackName in body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ orgName: 'myorg' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_stack', arguments: { organization: 'myorg', project: 'myproj', stackName: 'staging' } } },
      AUTH
    ));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.stackName).toBe('staging');
  });

  it('create_webhook sends correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'my-hook' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_webhook', arguments: { organization: 'myorg', displayName: 'My Hook', payloadUrl: 'https://example.com/hook', active: true } } },
      AUTH
    ));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.displayName).toBe('My Hook');
    expect(body.payloadUrl).toBe('https://example.com/hook');
    expect(body.active).toBe(true);
  });

  it('delete_webhook sends DELETE', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_webhook', arguments: { organization: 'myorg', webhookName: 'my-hook' } } },
      AUTH
    ));
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(data.result.content[0].text).deleted).toBe(true);
  });

  it('get_stack_updates uses pageSize param', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ updates: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_stack_updates', arguments: { organization: 'myorg', project: 'myproj', stack: 'dev' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('pageSize=10');
  });

  it('API error returns -32603', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_organizations', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });
});
