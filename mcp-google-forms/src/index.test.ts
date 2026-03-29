import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const makeRequest = (method: string, body?: unknown, headers?: Record<string, string>) =>
  new Request('https://example.com/', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const withToken = { 'X-Mcp-Secret-GOOGLE-FORMS-ACCESS-TOKEN': 'test-token' };

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('mcp-google-forms', () => {
  it('GET returns server info', async () => {
    const res = await worker.fetch(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json() as { name: string };
    expect(data.name).toBe('mcp-google-forms');
  });

  it('returns 405 for non-GET/POST', async () => {
    const res = await worker.fetch(makeRequest('PUT'));
    expect(res.status).toBe(405);
  });

  it('returns parse error for invalid JSON', async () => {
    const res = await worker.fetch(
      new Request('https://example.com/', { method: 'POST', body: 'bad', headers: { 'Content-Type': 'application/json' } }),
    );
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it('initialize returns protocol version', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'initialize' }));
    const data = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(data.result.protocolVersion).toBe('2024-11-05');
    expect(data.result.serverInfo.name).toBe('mcp-google-forms');
  });

  it('tools/list returns 10 tools', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const data = await res.json() as { result: { tools: unknown[] } };
    expect(data.result.tools).toHaveLength(10);
  });

  it('tools/list has annotations on all tools', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const data = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
    data.result.tools.forEach(t => expect(t.annotations).toBeDefined());
  });

  it('tools/call requires auth header', async () => {
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_forms_via_drive', arguments: {} },
    }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32001);
  });

  it('unknown method returns -32601', async () => {
    const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'foo' }));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });

  it('unknown tool returns -32603', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'fake_tool', arguments: {} },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('get_form fetches by form ID', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ formId: 'f1', info: { title: 'Survey' } }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_form', arguments: { form_id: 'f1' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/forms/f1'),
      expect.anything(),
    );
  });

  it('create_form sends title in info', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ formId: 'f1' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'create_form', arguments: { title: 'My Survey' } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { info: { title: string } };
    expect(callBody.info.title).toBe('My Survey');
  });

  it('list_responses uses pageSize', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ responses: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_responses', arguments: { form_id: 'f1', page_size: 10 } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('pageSize=10'),
      expect.anything(),
    );
  });

  it('add_question sends createItem request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ replies: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'add_question', arguments: { form_id: 'f1', title: 'What is your name?' } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { requests: Array<{ createItem: { item: { title: string } } }> };
    expect(callBody.requests[0].createItem.item.title).toBe('What is your name?');
  });

  it('delete_item sends deleteItem request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ replies: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'delete_item', arguments: { form_id: 'f1', index: 2 } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { requests: Array<{ deleteItem: { location: { index: number } } }> };
    expect(callBody.requests[0].deleteItem.location.index).toBe(2);
  });

  it('list_forms_via_drive queries Drive API', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ files: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_forms_via_drive', arguments: {} },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('drive/v3/files'),
      expect.anything(),
    );
  });

  it('get_form_schema returns items array', async () => {
    const items = [{ itemId: 'q1', title: 'Question 1' }];
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ formId: 'f1', items }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_form_schema', arguments: { form_id: 'f1' } },
    }, withToken));
    const data = await res.json() as { result: { content: Array<{ text: string }> } };
    expect(data.result.content[0].text).toContain('Question 1');
  });

  it('batch_update_form passes requests through', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ replies: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    const requests = [{ createItem: { item: { title: 'Q' }, location: { index: 0 } } }];
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'batch_update_form', arguments: { form_id: 'f1', requests } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as { requests: unknown[] };
    expect(callBody.requests).toEqual(requests);
  });

  it('add_question with choice type includes options', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ replies: [] }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'add_question', arguments: { form_id: 'f1', title: 'Pick one', question_type: 'MULTIPLE_CHOICE', options: ['A', 'B', 'C'] } },
    }, withToken));
    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as {
      requests: Array<{
        createItem: {
          item: { questionItem: { question: { choiceQuestion: { options: Array<{ value: string }> } } } }
        }
      }>
    };
    expect(callBody.requests[0].createItem.item.questionItem.question.choiceQuestion.options).toHaveLength(3);
  });

  it('API error returns -32603', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));
    vi.stubGlobal('fetch', mockFetch);
    const res = await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_form', arguments: { form_id: 'nonexistent' } },
    }, withToken));
    const data = await res.json() as { error: { code: number } };
    expect(data.error.code).toBe(-32603);
  });

  it('get_response fetches specific response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ responseId: 'r1' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'get_response', arguments: { form_id: 'f1', response_id: 'r1' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/responses/r1'),
      expect.anything(),
    );
  });

  it('update_form sends PATCH with updateFormInfo', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ form: {} }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
    await worker.fetch(makeRequest('POST', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'update_form', arguments: { form_id: 'f1', title: 'New Title' } },
    }, withToken));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/forms/f1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
