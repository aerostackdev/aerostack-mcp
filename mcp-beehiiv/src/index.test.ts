import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test_beehiiv_api_key_abc123xyz';

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function withAuth(headers: Record<string, string> = {}) {
  return { 'X-Mcp-Secret-BEEHIIV-API-KEY': API_KEY, ...headers };
}

function mockJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => mockFetch.mockReset());

describe('mcp-beehiiv', () => {
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
    expect(json.result.serverInfo.name).toBe('mcp-beehiiv');
  });

  it('tools/list returns 12 tools', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const json = await res.json() as { result: { tools: unknown[] } };
    expect(json.result.tools).toHaveLength(12);
  });

  it('returns -32001 when auth header missing', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_publications', arguments: {} } }));
    const json = await res.json() as { error: { code: number; message: string } };
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('BEEHIIV_API_KEY');
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

  // ── list_publications ────────────────────────────────────────────────────────
  it('list_publications returns publications', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'PUB1', name: 'My Newsletter' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_publications', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data[0].name).toBe('My Newsletter');
  });

  // ── list_posts ────────────────────────────────────────────────────────────────
  it('list_posts includes status filter in URL', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'POST1', title: 'Week 1' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_posts', arguments: { publicationId: 'PUB1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data[0].title).toBe('Week 1');
    expect(mockFetch.mock.calls[0][0]).toContain('status=confirmed');
  });

  it('list_posts fails without publicationId', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_posts', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32603);
  });

  // ── list_subscriptions ───────────────────────────────────────────────────────
  it('list_subscriptions returns subscriptions', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'SUB1', email: 'reader@test.com', status: 'active' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_subscriptions', arguments: { publicationId: 'PUB1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data[0].email).toBe('reader@test.com');
  });

  // ── create_subscription ──────────────────────────────────────────────────────
  it('create_subscription sends POST with email', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { id: 'SUB2', email: 'new@test.com', status: 'active' } }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'create_subscription',
          arguments: { publicationId: 'PUB1', email: 'new@test.com', send_welcome_email: true },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.email).toBe('new@test.com');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.email).toBe('new@test.com');
    expect(body.send_welcome_email).toBe(true);
  });

  // ── delete_subscription ──────────────────────────────────────────────────────
  it('delete_subscription sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_subscription', arguments: { publicationId: 'PUB1', subscriptionId: 'SUB1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    JSON.parse(json.result.content[0].text);
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });

  // ── get_stats ─────────────────────────────────────────────────────────────────
  it('get_stats returns publication stats', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { total_active_subscriptions: 1000, average_open_rate: 0.45 } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_stats', arguments: { publicationId: 'PUB1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.total_active_subscriptions).toBe(1000);
    expect(mockFetch.mock.calls[0][0]).toContain('/stats');
  });

  // ── list_segments ─────────────────────────────────────────────────────────────
  it('list_segments returns segments', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'SEG1', name: 'Engaged readers' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_segments', arguments: { publicationId: 'PUB1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data[0].name).toBe('Engaged readers');
  });

  // ── update_subscription ──────────────────────────────────────────────────────
  it('update_subscription sends PATCH', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { id: 'SUB1', status: 'inactive' } }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'update_subscription',
          arguments: { publicationId: 'PUB1', subscriptionId: 'SUB1', status: 'inactive' },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.status).toBe('inactive');
    expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
  });

  // ── get_segment ───────────────────────────────────────────────────────────────
  it('get_segment returns segment details', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { id: 'SEG1', name: 'Power users', size: 250 } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_segment', arguments: { publicationId: 'PUB1', segmentId: 'SEG1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.name).toBe('Power users');
    expect(mockFetch.mock.calls[0][0]).toContain('/segments/SEG1');
  });

  // ── uses Bearer auth ─────────────────────────────────────────────────────────
  it('uses Bearer authorization header', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [] }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_publications', arguments: {} } },
      withAuth(),
    ));
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${API_KEY}`);
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
