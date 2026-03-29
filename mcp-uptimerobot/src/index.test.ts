import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'ur123456-abcdef0123456789abcdef01';

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function withAuth(headers: Record<string, string> = {}) {
  return { 'X-Mcp-Secret-UPTIMEROBOT-API-KEY': API_KEY, ...headers };
}

function mockForm(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => mockFetch.mockReset());

describe('mcp-uptimerobot', () => {
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
    expect(json.result.serverInfo.name).toBe('mcp-uptimerobot');
  });

  it('tools/list returns 12 tools', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const json = await res.json() as { result: { tools: unknown[] } };
    expect(json.result.tools).toHaveLength(12);
  });

  it('returns -32001 when auth header missing', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_monitors', arguments: {} } }));
    const json = await res.json() as { error: { code: number; message: string } };
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('UPTIMEROBOT_API_KEY');
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

  // ── Auth is in body not header ────────────────────────────────────────────────
  it('api_key is sent in POST body, not header', async () => {
    mockFetch.mockResolvedValueOnce(mockForm({ stat: 'ok', account: { email: 'test@test.com' } }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_account_details', arguments: {} } },
      withAuth(),
    ));
    const call = mockFetch.mock.calls[0];
    const bodyText = call[1].body as string;
    expect(bodyText).toContain('api_key=');
    expect(bodyText).toContain(API_KEY);
    const headers = call[1].headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  // ── get_account_details ────────────────────────────────────────────────────
  it('get_account_details returns account info', async () => {
    mockFetch.mockResolvedValueOnce(mockForm({ stat: 'ok', account: { email: 'test@test.com', monitor_limit: 50 } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_account_details', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.account.email).toBe('test@test.com');
  });

  // ── list_monitors ────────────────────────────────────────────────────────────
  it('list_monitors returns monitors', async () => {
    mockFetch.mockResolvedValueOnce(mockForm({ stat: 'ok', monitors: [{ id: 123, url: 'https://example.com', status: 2 }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_monitors', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.monitors[0].status).toBe(2);
  });

  // ── create_monitor ───────────────────────────────────────────────────────────
  it('create_monitor sends correct params', async () => {
    mockFetch.mockResolvedValueOnce(mockForm({ stat: 'ok', monitor: { id: 456 } }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'create_monitor',
          arguments: { friendly_name: 'My Site', url: 'https://mysite.com', type: 1 },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.monitor.id).toBe(456);
    const bodyText = mockFetch.mock.calls[0][1].body as string;
    expect(bodyText).toContain('friendly_name=My+Site');
    expect(bodyText).toContain('url=https');
  });

  it('create_monitor fails without required fields', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_monitor', arguments: { friendly_name: 'Test' } } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32603);
  });

  // ── pause_monitor ────────────────────────────────────────────────────────────
  it('pause_monitor sends status=0', async () => {
    mockFetch.mockResolvedValueOnce(mockForm({ stat: 'ok', monitor: { id: 123 } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pause_monitor', arguments: { id: '123' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.stat).toBe('ok');
    const bodyText = mockFetch.mock.calls[0][1].body as string;
    expect(bodyText).toContain('status=0');
  });

  // ── resume_monitor ───────────────────────────────────────────────────────────
  it('resume_monitor sends status=1', async () => {
    mockFetch.mockResolvedValueOnce(mockForm({ stat: 'ok', monitor: { id: 123 } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'resume_monitor', arguments: { id: '123' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    JSON.parse(json.result.content[0].text);
    const bodyText = mockFetch.mock.calls[0][1].body as string;
    expect(bodyText).toContain('status=1');
  });

  // ── delete_monitor ───────────────────────────────────────────────────────────
  it('delete_monitor sends to deleteMonitor endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockForm({ stat: 'ok', monitor: { id: 123 } }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_monitor', arguments: { id: '123' } } },
      withAuth(),
    ));
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('deleteMonitor');
  });

  // ── list_alert_contacts ───────────────────────────────────────────────────────
  it('list_alert_contacts returns contacts', async () => {
    mockFetch.mockResolvedValueOnce(mockForm({ stat: 'ok', alert_contacts: [{ id: '1', type: 2, value: 'alert@test.com' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_alert_contacts', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.alert_contacts[0].value).toBe('alert@test.com');
  });

  // ── get_public_status_pages ───────────────────────────────────────────────────
  it('get_public_status_pages returns pages', async () => {
    mockFetch.mockResolvedValueOnce(mockForm({ stat: 'ok', psps: [{ id: 1, friendly_name: 'My Status Page' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_public_status_pages', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.psps[0].friendly_name).toBe('My Status Page');
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('getPSPs');
  });

  // ── create_alert_contact ──────────────────────────────────────────────────────
  it('create_alert_contact sends correct params', async () => {
    mockFetch.mockResolvedValueOnce(mockForm({ stat: 'ok', alertcontact: { id: '99' } }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'create_alert_contact',
          arguments: { type: 2, value: 'alert@example.com', friendly_name: 'Dev Team Email' },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.stat).toBe('ok');
    const bodyText = mockFetch.mock.calls[0][1].body as string;
    expect(bodyText).toContain('type=2');
    expect(bodyText).toContain('value=alert%40example.com');
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
