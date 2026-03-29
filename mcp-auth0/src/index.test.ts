import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const MGMT_TOKEN = 'test_auth0_management_token_abc123';
const DOMAIN = 'myapp.auth0.com';

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function withAuth(headers: Record<string, string> = {}) {
  return {
    'X-Mcp-Secret-AUTH0-MANAGEMENT-TOKEN': MGMT_TOKEN,
    'X-Mcp-Secret-AUTH0-DOMAIN': DOMAIN,
    ...headers,
  };
}

function mockJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => mockFetch.mockReset());

describe('mcp-auth0', () => {
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
    expect(json.result.serverInfo.name).toBe('mcp-auth0');
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
    expect(json.error.message).toContain('AUTH0_MANAGEMENT_TOKEN');
    expect(json.error.message).toContain('AUTH0_DOMAIN');
  });

  it('returns -32001 when only domain missing', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users', arguments: {} } },
      { 'X-Mcp-Secret-AUTH0-MANAGEMENT-TOKEN': MGMT_TOKEN },
    ));
    const json = await res.json() as { error: { code: number; message: string } };
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('AUTH0_DOMAIN');
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

  // ── Bearer auth used ─────────────────────────────────────────────────────────
  it('uses Bearer authorization header', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ users: [], total: 0 }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users', arguments: {} } },
      withAuth(),
    ));
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${MGMT_TOKEN}`);
  });

  // ── Uses domain in URL ────────────────────────────────────────────────────────
  it('builds URL from domain secret', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ users: [] }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users', arguments: {} } },
      withAuth(),
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('myapp.auth0.com');
    expect(url).toContain('/api/v2/users');
  });

  // ── list_users ────────────────────────────────────────────────────────────────
  it('list_users returns users with totals', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ users: [{ user_id: 'auth0|U1', email: 'test@test.com' }], total: 1 }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.total).toBe(1);
  });

  // ── create_user ───────────────────────────────────────────────────────────────
  it('create_user sends correct body', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ user_id: 'auth0|U2', email: 'new@test.com' }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'create_user',
          arguments: { connection: 'Username-Password-Authentication', email: 'new@test.com', password: 'Secret123!' },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.user_id).toBe('auth0|U2');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.connection).toBe('Username-Password-Authentication');
  });

  it('create_user fails without required fields', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_user', arguments: { email: 'test@test.com' } } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32603);
  });

  // ── delete_user ───────────────────────────────────────────────────────────────
  it('delete_user sends DELETE and returns deleted', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_user', arguments: { userId: 'auth0|U1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.deleted).toBe(true);
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });

  // ── list_roles ────────────────────────────────────────────────────────────────
  it('list_roles returns roles', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ roles: [{ id: 'R1', name: 'Admin' }], total: 1 }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_roles', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.roles[0].name).toBe('Admin');
  });

  // ── assign_role_to_user ───────────────────────────────────────────────────────
  it('assign_role_to_user sends POST with roles array', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'assign_role_to_user', arguments: { userId: 'auth0|U1', roleId: 'R1' } } },
      withAuth(),
    ));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.roles).toContain('R1');
  });

  // ── list_logs ─────────────────────────────────────────────────────────────────
  it('list_logs returns logs sorted by date', async () => {
    mockFetch.mockResolvedValueOnce(mockJson([{ type: 's', date: '2026-03-29T10:00:00Z' }]));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_logs', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data[0].type).toBe('s');
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('sort=date:-1');
  });

  // ── get_user_roles ────────────────────────────────────────────────────────────
  it('get_user_roles fetches user roles', async () => {
    mockFetch.mockResolvedValueOnce(mockJson([{ id: 'R1', name: 'Admin', description: 'Administrator role' }]));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_user_roles', arguments: { userId: 'auth0|U1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data[0].name).toBe('Admin');
    expect(mockFetch.mock.calls[0][0]).toContain('/roles');
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
