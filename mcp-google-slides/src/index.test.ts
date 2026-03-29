import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const makeRequest = (method: string, body?: unknown, headers?: Record<string, string>) =>
  new Request('https://example.com/', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const withToken = { 'X-Mcp-Secret-GOOGLE-SLIDES-ACCESS-TOKEN': 'test-token' };

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('mcp-google-slides', () => {
  it('GET returns server info', async () => {
    const res = await worker.fetch(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string };
    expect(data.name).toBe('mcp-google-slides');
  });

  it('returns 405 for non-GET/POST', async () => {
    const res = await worker.fetch(makeRequest('PUT'));
    expect(res.status).toBe(405);
  });

  it('returns parse error for invalid JSON', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/', { method: 'POST', body: '{bad', headers: { 'Content-Type': 'application/json' } }),
    );
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it('initialize returns protocol version', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const data = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(data.result.protocolVersion).toBe('2024-11-05');
    expect(data.result.serverInfo.name).toBe('mcp-google-slides');
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

  it('tools/call requires auth token', async () => {
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_presentations', arguments: {} },
    }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('unknown method returns -32601', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'unknown' }));
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

  it('list_presentations queries Drive API', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ files: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_presentations', arguments: {} },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('drive/v3/files'),
      expect.anything(),
    );
  });

  it('create_presentation sends title', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ presentationId: 'p1', title: 'My Deck' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'create_presentation', arguments: { title: 'My Deck' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('My Deck');
  });

  it('get_presentation fetches by ID', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ presentationId: 'p1', slides: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_presentation', arguments: { presentation_id: 'p1' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/presentations/p1'),
      expect.anything(),
    );
  });

  it('get_slide returns slide at index', async () => {
    const slides = [{ objectId: 'slide1' }, { objectId: 'slide2' }];
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slides }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_slide', arguments: { presentation_id: 'p1', slide_index: 1 } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('slide2');
  });

  it('get_slide throws for out-of-range index', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slides: [{ objectId: 'slide1' }] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_slide', arguments: { presentation_id: 'p1', slide_index: 5 } },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('add_slide sends batchUpdate', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ replies: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'add_slide', arguments: { presentation_id: 'p1', insertion_index: 1 } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(':batchUpdate'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('delete_slide sends deleteObject request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ replies: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'delete_slide', arguments: { presentation_id: 'p1', object_id: 'slide1' } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { requests: Array<{ deleteObject: { objectId: string } }> };
    expect(callBody.requests[0].deleteObject.objectId).toBe('slide1');
  });

  it('add_image sends createImage request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ replies: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'add_image', arguments: { presentation_id: 'p1', page_object_id: 'slide1', image_url: 'https://example.com/img.png' } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { requests: Array<{ createImage: { url: string } }> };
    expect(callBody.requests[0].createImage.url).toBe('https://example.com/img.png');
  });

  it('batch_update passes requests through', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ replies: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const requests = [{ insertSlide: { insertionIndex: 0 } }];
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'batch_update', arguments: { presentation_id: 'p1', requests } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { requests: unknown[] };
    expect(callBody.requests).toEqual(requests);
  });

  it('API error propagates as -32603', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_presentations', arguments: {} },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('create_presentation requires title', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'create_presentation', arguments: {} },
    }, withToken));
    const data = await res.json() as { error: { code: number; message: string } };
    expect(data.error.code).toBe(-32603);
    expect(data.error.message).toContain('title');
  });

  it('update_text inserts text at objectId', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ replies: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'update_text', arguments: { presentation_id: 'p1', object_id: 'shape1', text: 'Hello' } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { requests: Array<{ insertText: { objectId: string; text: string } }> };
    expect(callBody.requests[0].insertText.text).toBe('Hello');
  });
});
