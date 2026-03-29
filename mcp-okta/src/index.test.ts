import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_TOKEN = 'test_okta_api_token_abc123xyz';
const DOMAIN = 'dev-12345.okta.com';

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function withAuth(headers: Record<string, string> = {}) {
  return {
    'X-Mcp-Secret-OKTA-API-TOKEN': API_TOKEN,
    'X-Mcp-Secret-OKTA-DOMAIN': DOMAIN,
    ...headers,
  };
}

function mockJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => mockFetch.mockReset());

describe('mcp-okta', () => {
  // ── Infrastructure ──────────────────────────────────────────────────────────
  it('GET /health returns ok', async () => {
    const res = await worker.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const json = await res.json() as { status: string };
    expect(json.status).toBe('ok');
  });

  it('GET / returns 405', async () => {
    const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('returns -32700 on parse error', async () => {
    const res = await worker.fetch(new Request('http://localhost/', { method: 'POST', body: 'bad json' }));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32700);
  });

  it('initialize returns server info', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const json = await res.json() as { result: { serverInfo: { name: string } } };
    expect(json.result.serverInfo.name).toBe('mcp-okta');
  });

  it('tools/list returns 14 tools', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const json = await res.json() as { result: { tools: unknown[] } };
    expect(json.result.tools).toHaveLength(14);
  });

  it('returns -32001 when both secrets missing', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users', arguments: {} } }));
    const json = await res.json() as { error: { code: number; message: string } };
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('OKTA_API_TOKEN');
    expect(json.error.message).toContain('OKTA_DOMAIN');
  });

  it('returns -32001 when only token missing', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users', arguments: {} } },
      { 'X-Mcp-Secret-OKTA-DOMAIN': DOMAIN },
    ));
    const json = await res.json() as { error: { code: number; message: string } };
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('OKTA_API_TOKEN');
  });

  it('returns -32601 for unknown method', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'unknown/method', params: {} }));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32601);
  });

  it('returns -32601 for unknown tool', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nonexistent_tool', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32601);
  });

  // ── Uses SSWS auth not Bearer ─────────────────────────────────────────────────
  it('uses SSWS authorization header', async () => {
    mockFetch.mockResolvedValueOnce(mockJson([]));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users', arguments: {} } },
      withAuth(),
    ));
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`SSWS ${API_TOKEN}`);
  });

  // ── Uses domain in URL ────────────────────────────────────────────────────────
  it('builds URL from domain secret', async () => {
    mockFetch.mockResolvedValueOnce(mockJson([]));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users', arguments: {} } },
      withAuth(),
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('dev-12345.okta.com');
  });

  // ── list_users ────────────────────────────────────────────────────────────────
  it('list_users returns users', async () => {
    mockFetch.mockResolvedValueOnce(mockJson([{ id: 'U1', profile: { email: 'test@test.com' } }]));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data[0].id).toBe('U1');
  });

  it('list_users with search query', async () => {
    mockFetch.mockResolvedValueOnce(mockJson([{ id: 'U2', profile: { email: 'john@test.com' } }]));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users', arguments: { q: 'john' } } },
      withAuth(),
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('q=john');
  });

  // ── create_user ───────────────────────────────────────────────────────────────
  it('create_user sends correct profile', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ id: 'U3', status: 'STAGED' }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'create_user',
          arguments: { firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com' },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.id).toBe('U3');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.profile.firstName).toBe('Jane');
    expect(body.profile.login).toBe('jane@test.com');
  });

  it('create_user fails without required fields', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_user', arguments: { firstName: 'Jane' } } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32603);
  });

  // ── list_groups ───────────────────────────────────────────────────────────────
  it('list_groups returns groups', async () => {
    mockFetch.mockResolvedValueOnce(mockJson([{ id: 'G1', profile: { name: 'Admins' } }]));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_groups', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data[0].profile.name).toBe('Admins');
  });

  // ── add_user_to_group ─────────────────────────────────────────────────────────
  it('add_user_to_group sends PUT and returns added', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_user_to_group', arguments: { groupId: 'G1', userId: 'U1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.added).toBe(true);
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
  });

  // ── deactivate_user ───────────────────────────────────────────────────────────
  it('deactivate_user sends POST to lifecycle endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({}));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'deactivate_user', arguments: { userId: 'U1' } } },
      withAuth(),
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/lifecycle/deactivate');
  });

  // ── list_user_sessions ────────────────────────────────────────────────────────
  it('list_user_sessions calls sessions endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockJson([{ id: 'SES1', status: 'ACTIVE', createdAt: '2026-03-29T08:00:00Z' }]));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_user_sessions', arguments: { userId: 'U1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data[0].status).toBe('ACTIVE');
    expect(mockFetch.mock.calls[0][0]).toContain('/users/U1/sessions');
  });

  // ── all tools have readOnlyHint annotation ────────────────────────────────────
  it('all tools have readOnlyHint annotation', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const json = await res.json() as { result: { tools: Array<{ annotations: { readOnlyHint: boolean } }> } };
    for (const tool of json.result.tools) {
      expect(tool.annotations).toBeDefined();
      expect(typeof tool.annotations.readOnlyHint).toBe('boolean');
    }
  });
});
