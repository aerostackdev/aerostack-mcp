import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const makeRequest = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://worker.test/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const AUTH = {
  'X-Mcp-Secret-TRELLO-API-KEY': 'test-api-key',
  'X-Mcp-Secret-TRELLO-TOKEN': 'test-token',
};

describe('mcp-trello', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('GET returns server info', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', { method: 'GET' }));
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string };
    expect(data.name).toBe('mcp-trello');
  });

  it('non-POST/GET returns 405', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', { method: 'PUT' }));
    expect(res.status).toBe(405);
  });

  it('invalid JSON returns parse error', async () => {
    const res = await worker.fetch(new Request('https://worker.test/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{{bad',
    }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it('initialize returns server info', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const data = await res.json() as { result: { serverInfo: { name: string } } };
    expect(data.result.serverInfo.name).toBe('mcp-trello');
  });

  it('tools/list returns 14 tools', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const data = await res.json() as { result: { tools: unknown[] } };
    expect(data.result.tools.length).toBe(14);
  });

  it('tools/call without any api key returns -32001', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_boards', arguments: {} } }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('tools/call with only api key (no token) returns -32001', async () => {
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_boards', arguments: {} } },
      { 'X-Mcp-Secret-TRELLO-API-KEY': 'test-api-key' }
    ));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('unknown method returns -32601', async () => {
    const res = await worker.fetch(makeRequest({ jsonrpc: '2.0', id: 1, method: 'nope', params: {} }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });

  it('unknown tool returns -32603', async () => {
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'bad_tool', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('list_boards appends key and token as query params', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_boards', arguments: {} } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('key=test-api-key');
    expect(url).toContain('token=test-token');
    expect(url).toContain('/members/me/boards');
  });

  it('get_board calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'board-1' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_board', arguments: { boardId: 'abc123' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/boards/abc123');
  });

  it('create_board sends POST', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'new-board' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_board', arguments: { name: 'My Board' } } },
      AUTH
    ));
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('create_card sends POST with required fields', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'card-1' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_card', arguments: { idList: 'list-1', name: 'My Card', desc: 'Description' } } },
      AUTH
    ));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.idList).toBe('list-1');
    expect(body.name).toBe('My Card');
    expect(body.desc).toBe('Description');
  });

  it('update_card sends PUT', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'card-1' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'update_card', arguments: { cardId: 'card-1', name: 'Updated Name' } } },
      AUTH
    ));
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
  });

  it('delete_card sends DELETE and returns deleted=true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_card', arguments: { cardId: 'card-1' } } },
      AUTH
    ));
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(data.result.content[0].text).deleted).toBe(true);
  });

  it('add_card_comment calls correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'action-1' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_card_comment', arguments: { cardId: 'card-1', text: 'Great card!' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/cards/card-1/actions/comments');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.text).toBe('Great card!');
  });

  it('archive_list sends PUT with value=true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'list-1', closed: true }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'archive_list', arguments: { listId: 'list-1' } } },
      AUTH
    ));
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.value).toBe(true);
  });

  it('list_cards includes fields param', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_cards', arguments: { listId: 'list-1' } } },
      AUTH
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('fields=');
  });

  it('API error returns -32603', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_boards', arguments: {} } },
      AUTH
    ));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });
});
