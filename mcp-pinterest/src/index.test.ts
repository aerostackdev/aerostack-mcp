import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TOKEN = 'test_pinterest_access_token_abc123';

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function withAuth(headers: Record<string, string> = {}) {
  return { 'X-Mcp-Secret-PINTEREST-ACCESS-TOKEN': TOKEN, ...headers };
}

function mockJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => mockFetch.mockReset());

describe('mcp-pinterest', () => {
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
    expect(json.result.serverInfo.name).toBe('mcp-pinterest');
  });

  it('tools/list returns 12 tools', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const json = await res.json() as { result: { tools: unknown[] } };
    expect(json.result.tools).toHaveLength(12);
  });

  it('returns -32001 when auth header missing', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_boards', arguments: {} } }));
    const json = await res.json() as { error: { code: number; message: string } };
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('PINTEREST_ACCESS_TOKEN');
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

  // ── get_current_user ─────────────────────────────────────────────────────────
  it('get_current_user calls /user_account endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ username: 'testuser', id: '123' }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_current_user', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.username).toBe('testuser');
    expect(mockFetch.mock.calls[0][0]).toContain('/user_account');
  });

  // ── list_boards ───────────────────────────────────────────────────────────────
  it('list_boards returns boards', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ items: [{ id: 'B1', name: 'My Board' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_boards', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.items[0].name).toBe('My Board');
  });

  // ── create_board ──────────────────────────────────────────────────────────────
  it('create_board sends POST with name', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ id: 'B2', name: 'Travel' }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_board', arguments: { name: 'Travel' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.name).toBe('Travel');
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('create_board fails without name', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_board', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32603);
  });

  // ── delete_board ──────────────────────────────────────────────────────────────
  it('delete_board sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ deleted: true }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_board', arguments: { boardId: 'B1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.deleted).toBe(true);
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });

  // ── list_pins ─────────────────────────────────────────────────────────────────
  it('list_pins returns pins for board', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ items: [{ id: 'P1', title: 'Sunset' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_pins', arguments: { boardId: 'B1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.items[0].title).toBe('Sunset');
    expect(mockFetch.mock.calls[0][0]).toContain('/boards/B1/pins');
  });

  // ── create_pin ────────────────────────────────────────────────────────────────
  it('create_pin sends correct media_source', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ id: 'P2', media_source: { source_type: 'image_url' } }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'create_pin',
          arguments: { board_id: 'B1', image_url: 'https://example.com/image.jpg', title: 'Beautiful' },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.id).toBe('P2');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.media_source.source_type).toBe('image_url');
    expect(body.media_source.url).toBe('https://example.com/image.jpg');
  });

  // ── delete_pin ────────────────────────────────────────────────────────────────
  it('delete_pin sends DELETE to pin endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ deleted: true }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_pin', arguments: { pinId: 'P1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.deleted).toBe(true);
  });

  // ── get_analytics ─────────────────────────────────────────────────────────────
  it('get_analytics includes metric types in URL', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ all: { daily_metrics: [] } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_analytics', arguments: { startDate: '2026-03-01', endDate: '2026-03-29' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    JSON.parse(json.result.content[0].text);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('IMPRESSION');
    expect(url).toContain('ENGAGEMENTS');
    expect(url).toContain('start_date=2026-03-01');
  });

  // ── update_board ──────────────────────────────────────────────────────────────
  it('update_board sends PATCH', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ id: 'B1', name: 'Updated Travel' }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'update_board', arguments: { boardId: 'B1', name: 'Updated Travel' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.name).toBe('Updated Travel');
    expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
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

  // ── uses Bearer auth ─────────────────────────────────────────────────────────
  it('uses Bearer authorization header', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({}));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_current_user', arguments: {} } },
      withAuth(),
    ));
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });
});
