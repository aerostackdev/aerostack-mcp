import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TOKEN = 'test_productboard_token_abc123xyz';

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function withAuth(headers: Record<string, string> = {}) {
  return { 'X-Mcp-Secret-PRODUCTBOARD-ACCESS-TOKEN': TOKEN, ...headers };
}

function mockJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => mockFetch.mockReset());

describe('mcp-productboard', () => {
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
    expect(json.result.serverInfo.name).toBe('mcp-productboard');
  });

  it('tools/list returns 12 tools', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const json = await res.json() as { result: { tools: unknown[] } };
    expect(json.result.tools).toHaveLength(12);
  });

  it('returns -32001 when auth header missing', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_features', arguments: {} } }));
    const json = await res.json() as { error: { code: number; message: string } };
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('PRODUCTBOARD_ACCESS_TOKEN');
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

  // ── X-Version header is sent ──────────────────────────────────────────────────
  it('sends X-Version: 1 header', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [] }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_features', arguments: {} } },
      withAuth(),
    ));
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-Version']).toBe('1');
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  // ── list_features ────────────────────────────────────────────────────────────
  it('list_features returns features', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'F1', type: 'feature' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_features', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data[0].type).toBe('feature');
  });

  it('list_features with product filter adds query param', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [] }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_features', arguments: { productId: 'PROD1' } } },
      withAuth(),
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('product.id=PROD1');
  });

  // ── create_feature ────────────────────────────────────────────────────────────
  it('create_feature sends correct JSON:API body', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { id: 'F2', type: 'feature' } }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'create_feature',
          arguments: { name: 'Dark Mode', statusId: 'STATUS1' },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.type).toBe('feature');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.data.type).toBe('feature');
    expect(body.data.attributes.name).toBe('Dark Mode');
    expect(body.data.attributes.status.id).toBe('STATUS1');
  });

  it('create_feature fails without required fields', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_feature', arguments: { name: 'Feature' } } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32603);
  });

  // ── delete_feature ────────────────────────────────────────────────────────────
  it('delete_feature sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ deleted: true }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_feature', arguments: { featureId: 'F1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.deleted).toBe(true);
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });

  // ── list_products ─────────────────────────────────────────────────────────────
  it('list_products returns products', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'PROD1', type: 'product' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_products', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data[0].type).toBe('product');
  });

  // ── create_note ───────────────────────────────────────────────────────────────
  it('create_note sends correct note structure', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { id: 'NOTE1', type: 'note' } }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'create_note',
          arguments: { title: 'User feedback', content: 'Users want dark mode', customerEmail: 'user@test.com' },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.type).toBe('note');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.data.type).toBe('note');
    expect(body.data.attributes.title).toBe('User feedback');
  });

  // ── list_releases ─────────────────────────────────────────────────────────────
  it('list_releases calls /releases endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'REL1', type: 'release' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_releases', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data[0].type).toBe('release');
    expect(mockFetch.mock.calls[0][0]).toContain('/releases');
  });

  // ── list_notes ────────────────────────────────────────────────────────────────
  it('list_notes filters by featureId', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'NOTE2' }] }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_notes', arguments: { featureId: 'F1' } } },
      withAuth(),
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('feature.id=F1');
  });

  // ── get_component ─────────────────────────────────────────────────────────────
  it('get_component returns component details', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { id: 'COMP1', type: 'component', attributes: { name: 'Backend' } } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_component', arguments: { componentId: 'COMP1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.type).toBe('component');
    expect(mockFetch.mock.calls[0][0]).toContain('/components/COMP1');
  });

  // ── update_feature ────────────────────────────────────────────────────────────
  it('update_feature sends PUT with attributes', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { id: 'F1', type: 'feature', attributes: { name: 'Dark Mode v2' } } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'update_feature', arguments: { featureId: 'F1', name: 'Dark Mode v2' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.attributes.name).toBe('Dark Mode v2');
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
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
