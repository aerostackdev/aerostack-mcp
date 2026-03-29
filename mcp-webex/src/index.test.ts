import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const makeRequest = (method: string, body?: unknown, headers?: Record<string, string>) =>
  new Request('https://example.com/', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const withToken = { 'X-Mcp-Secret-WEBEX-ACCESS-TOKEN': 'test-token' };

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('mcp-webex', () => {
  it('GET returns server info', async () => {
    const res = await worker.fetch(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string };
    expect(data.name).toBe('mcp-webex');
  });

  it('returns 405 for non-GET/POST', async () => {
    const res = await worker.fetch(makeRequest('DELETE'));
    expect(res.status).toBe(405);
  });

  it('returns parse error for invalid JSON', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/', { method: 'POST', body: 'nope', headers: { 'Content-Type': 'application/json' } }),
    );
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it('initialize returns protocol version', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'initialize' }));
    const data = await res.json() as { result: { protocolVersion: string } };
    expect(data.result.protocolVersion).toBe('2024-11-05');
  });

  it('tools/list returns 14 tools', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const data = await res.json() as { result: { tools: unknown[] } };
    expect(data.result.tools).toHaveLength(14);
  });

  it('tools/list has annotations on all tools', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const data = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
    data.result.tools.forEach(t => expect(t.annotations).toBeDefined());
  });

  it('tools/call requires auth header', async () => {
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_current_user', arguments: {} },
    }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('unknown method returns -32601', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'zzz' }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });

  it('unknown tool returns -32603', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'nonexistent', arguments: {} },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('get_current_user hits /people/me', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'u1', emails: ['a@b.com'] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_current_user', arguments: {} },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/people/me'),
      expect.anything(),
    );
  });

  it('list_rooms defaults to group type', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_rooms', arguments: {} },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('type=group'),
      expect.anything(),
    );
  });

  it('send_message posts with roomId', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'm1' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'send_message', arguments: { room_id: 'r1', text: 'Hello!' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('send_message requires at least one recipient', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'send_message', arguments: { text: 'hi' } },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('delete_message returns deleted:true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'delete_message', arguments: { message_id: 'm1' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('"deleted": true');
  });

  it('add_member posts membership with email', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'mem1' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'add_member', arguments: { room_id: 'r1', person_email: 'user@test.com' } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { personEmail: string };
    expect(callBody.personEmail).toBe('user@test.com');
  });

  it('create_meeting sends title and times', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'meet1', title: 'Standup' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'create_meeting', arguments: { title: 'Standup', start: '2024-01-15T09:00:00Z', end: '2024-01-15T09:30:00Z' } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { title: string };
    expect(callBody.title).toBe('Standup');
  });

  it('list_memberships includes roomId query', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_memberships', arguments: { room_id: 'r1' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('roomId=r1'),
      expect.anything(),
    );
  });

  it('API error returns -32603', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_current_user', arguments: {} },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('remove_member returns deleted:true', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'remove_member', arguments: { membership_id: 'mem1' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('"deleted": true');
  });

  it('create_team sends team name', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'team1', name: 'Engineering' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'create_team', arguments: { name: 'Engineering' } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { name: string };
    expect(callBody.name).toBe('Engineering');
  });
});
