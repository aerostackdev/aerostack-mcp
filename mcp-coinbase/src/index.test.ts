import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test_coinbase_api_key_abc123';

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function withAuth(headers: Record<string, string> = {}) {
  return { 'X-Mcp-Secret-COINBASE-API-KEY': API_KEY, ...headers };
}

function mockJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => mockFetch.mockReset());

describe('mcp-coinbase', () => {
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
    const res = await worker.fetch(new Request('http://localhost/', { method: 'POST', body: 'bad-json' }));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32700);
  });

  it('initialize returns server info', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const json = await res.json() as { result: { serverInfo: { name: string } } };
    expect(json.result.serverInfo.name).toBe('mcp-coinbase');
  });

  it('tools/list returns 12 tools', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const json = await res.json() as { result: { tools: unknown[] } };
    expect(json.result.tools).toHaveLength(12);
  });

  it('returns -32001 when auth header missing', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_current_user', arguments: {} } }));
    const json = await res.json() as { error: { code: number; message: string } };
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('COINBASE_API_KEY');
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
  it('get_current_user calls /user endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { id: 'U1', name: 'Test User' } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_current_user', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.name).toBe('Test User');
    expect(mockFetch.mock.calls[0][0]).toContain('/user');
  });

  // ── list_accounts ────────────────────────────────────────────────────────────
  it('list_accounts returns accounts', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'ACC1', name: 'BTC Wallet', currency: { code: 'BTC' } }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_accounts', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data[0].currency.code).toBe('BTC');
  });

  // ── list_transactions ────────────────────────────────────────────────────────
  it('list_transactions fetches account transactions', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'TX1', type: 'send', amount: { amount: '0.1', currency: 'BTC' } }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_transactions', arguments: { accountId: 'ACC1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data[0].type).toBe('send');
    expect(mockFetch.mock.calls[0][0]).toContain('/accounts/ACC1/transactions');
  });

  it('list_transactions fails without accountId', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_transactions', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32603);
  });

  // ── get_spot_price ───────────────────────────────────────────────────────────
  it('get_spot_price returns price data', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { amount: '65000.00', currency: 'USD' } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_spot_price', arguments: { currencyPair: 'BTC-USD' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.amount).toBe('65000.00');
    expect(mockFetch.mock.calls[0][0]).toContain('/prices/BTC-USD/spot');
  });

  // ── get_buy_price ────────────────────────────────────────────────────────────
  it('get_buy_price returns buy price', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { amount: '65100.00', currency: 'USD' } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_buy_price', arguments: { currencyPair: 'ETH-USD' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.amount).toBe('65100.00');
    expect(mockFetch.mock.calls[0][0]).toContain('/prices/ETH-USD/buy');
  });

  // ── get_exchange_rates ───────────────────────────────────────────────────────
  it('get_exchange_rates returns rates', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { currency: 'USD', rates: { BTC: '0.0000154' } } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_exchange_rates', arguments: { currency: 'USD' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.currency).toBe('USD');
    expect(mockFetch.mock.calls[0][0]).toContain('currency=USD');
  });

  // ── send_money ───────────────────────────────────────────────────────────────
  it('send_money posts with correct type field', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { id: 'TX2', type: 'send', status: 'pending' } }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'send_money',
          arguments: { accountId: 'ACC1', to: '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf', amount: '0.01', currency: 'BTC' },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.type).toBe('send');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.type).toBe('send');
  });

  // ── create_address ───────────────────────────────────────────────────────────
  it('create_address posts to address endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { id: 'ADDR1', address: 'bc1qtest123' } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_address', arguments: { accountId: 'ACC1', name: 'My deposit address' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.address).toBe('bc1qtest123');
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
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

  // ── get_sell_price ───────────────────────────────────────────────────────────
  it('get_sell_price returns sell price', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { amount: '64900.00', currency: 'USD' } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_sell_price', arguments: { currencyPair: 'BTC-USD' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.amount).toBe('64900.00');
    expect(mockFetch.mock.calls[0][0]).toContain('/prices/BTC-USD/sell');
  });

  // ── uses Bearer auth ─────────────────────────────────────────────────────────
  it('uses Bearer authorization header', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: {} }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_current_user', arguments: {} } },
      withAuth(),
    ));
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${API_KEY}`);
  });
});
