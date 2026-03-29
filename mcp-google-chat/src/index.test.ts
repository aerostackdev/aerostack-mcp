import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const makeRequest = (method: string, body?: unknown, headers?: Record<string, string>) =>
  new Request('https://example.com/', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const withToken = { 'X-Mcp-Secret-GOOGLE-CHAT-ACCESS-TOKEN': 'test-token' };

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('mcp-google-chat', () => {
  it('GET returns server info', async () => {
    const res = await worker.fetch(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string };
    expect(data.name).toBe('mcp-google-chat');
  });

  it('returns 405 for non-GET/POST', async () => {
    const res = await worker.fetch(makeRequest('PATCH'));
    expect(res.status).toBe(405);
  });

  it('returns parse error for invalid JSON', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/', { method: 'POST', body: '!invalid', headers: { 'Content-Type': 'application/json' } }),
    );
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it('initialize returns protocol version', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'initialize' }));
    const data = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(data.result.protocolVersion).toBe('2024-11-05');
    expect(data.result.serverInfo.name).toBe('mcp-google-chat');
  });

  it('tools/list returns 12 tools', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const data = await res.json() as { result: { tools: unknown[] } };
    expect(data.result.tools).toHaveLength(12);
  });

  it('tools/list has annotations on all tools', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const data = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
    data.result.tools.forEach(t => expect(t.annotations).toBeDefined());
  });

  it('tools/call requires auth header', async () => {
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_spaces', arguments: {} },
    }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('unknown method returns -32601', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'nomethod' }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });

  it('unknown tool returns -32603', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'unknown', arguments: {} },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('list_spaces fetches /spaces', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ spaces: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_spaces', arguments: {} },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/spaces'),
      expect.anything(),
    );
  });

  it('send_message posts to space messages', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'spaces/X/messages/Y' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'send_message', arguments: { space_name: 'spaces/ABC', text: 'Hello team' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/spaces/ABC/messages'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('delete_message returns deleted:true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'delete_message', arguments: { space_name: 'spaces/ABC', message_id: 'msg1' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('"deleted": true');
  });

  it('update_message sends PATCH with updateMask', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'Updated' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'update_message', arguments: { space_name: 'spaces/ABC', message_id: 'msg1', text: 'Updated' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('updateMask=text'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('create_reaction sends emoji unicode', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'spaces/X/messages/Y/reactions/Z' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'create_reaction', arguments: { space_name: 'spaces/ABC', message_id: 'msg1', emoji_unicode: '1f44d' } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { emoji: { unicode: string } };
    expect(callBody.emoji.unicode).toBe('1f44d');
  });

  it('list_reactions fetches message reactions', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reactions: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_reactions', arguments: { space_name: 'spaces/ABC', message_id: 'msg1' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/reactions'),
      expect.anything(),
    );
  });

  it('delete_reaction returns deleted:true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'delete_reaction', arguments: { space_name: 'spaces/ABC', message_id: 'msg1', reaction_name: 'react1' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('"deleted": true');
  });

  it('list_messages uses pageSize param', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_messages', arguments: { space_name: 'spaces/ABC', page_size: 10 } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('pageSize=10'),
      expect.anything(),
    );
  });

  it('API error returns -32603', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_spaces', arguments: {} },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('get_space fetches space by name', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'spaces/ABC', displayName: 'Team Chat' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_space', arguments: { space_name: 'spaces/ABC' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/spaces/ABC'),
      expect.anything(),
    );
  });

  it('get_member fetches member resource', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'spaces/ABC/members/u1' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_member', arguments: { space_name: 'spaces/ABC', member_name: 'u1' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/members/u1'),
      expect.anything(),
    );
  });
});
