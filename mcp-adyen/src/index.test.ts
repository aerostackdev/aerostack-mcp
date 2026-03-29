import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test_adyen_api_key_abc123';

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function withAuth(headers: Record<string, string> = {}) {
  return { 'X-Mcp-Secret-ADYEN-API-KEY': API_KEY, ...headers };
}

function mockJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => mockFetch.mockReset());

describe('mcp-adyen', () => {
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
    const res = await worker.fetch(new Request('http://localhost/', {
      method: 'POST',
      body: 'not-json',
    }));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32700);
  });

  it('initialize returns server info', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const json = await res.json() as { result: { serverInfo: { name: string } } };
    expect(json.result.serverInfo.name).toBe('mcp-adyen');
  });

  it('tools/list returns 12 tools', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const json = await res.json() as { result: { tools: unknown[] } };
    expect(json.result.tools).toHaveLength(12);
  });

  it('returns -32001 when auth header missing', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_merchants', arguments: {} } }));
    const json = await res.json() as { error: { code: number; message: string } };
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('ADYEN_API_KEY');
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

  // ── list_merchants ───────────────────────────────────────────────────────────
  it('list_merchants calls management API', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'M1', companyId: 'C1' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_merchants', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data[0].id).toBe('M1');
    expect(mockFetch.mock.calls[0][0]).toContain('management-test.adyen.com');
  });

  // ── get_merchant ─────────────────────────────────────────────────────────────
  it('get_merchant returns merchant details', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ id: 'M1', status: 'Active' }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_merchant', arguments: { merchantId: 'M1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.status).toBe('Active');
  });

  it('get_merchant fails without merchantId', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_merchant', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32603);
  });

  // ── list_stores ───────────────────────────────────────────────────────────────
  it('list_stores calls correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'S1', merchantId: 'M1' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_stores', arguments: { merchantId: 'M1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data[0].id).toBe('S1');
    expect(mockFetch.mock.calls[0][0]).toContain('/merchants/M1/stores');
  });

  // ── create_payment_link ───────────────────────────────────────────────────────
  it('create_payment_link posts to checkout API', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ id: 'PL1', url: 'https://pay.adyen.com/pl/PL1', status: 'active' }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'create_payment_link',
          arguments: {
            merchantAccount: 'TestMerchant',
            amount: { currency: 'EUR', value: 1000 },
            reference: 'REF001',
            returnUrl: 'https://example.com/return',
          },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.status).toBe('active');
    expect(mockFetch.mock.calls[0][0]).toContain('checkout-test.adyen.com');
  });

  it('create_payment_link fails without required fields', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_payment_link', arguments: { merchantAccount: 'M1' } } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32603);
  });

  // ── list_payment_methods ──────────────────────────────────────────────────────
  it('list_payment_methods posts to checkout API', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ paymentMethods: [{ type: 'scheme', name: 'Credit Card' }] }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'list_payment_methods',
          arguments: { merchantAccount: 'TestMerchant', amount: { currency: 'USD', value: 500 } },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.paymentMethods[0].type).toBe('scheme');
  });

  // ── create_order ──────────────────────────────────────────────────────────────
  it('create_order posts correct body', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ orderData: 'order-data-token', pspReference: 'PSP1', remainingAmount: { currency: 'EUR', value: 1000 } }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'create_order',
          arguments: { amount: { currency: 'EUR', value: 1000 }, merchantAccount: 'M1', reference: 'ORD001' },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.pspReference).toBe('PSP1');
  });

  // ── list_webhooks ─────────────────────────────────────────────────────────────
  it('list_webhooks returns webhook list', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [{ id: 'WH1', type: 'standard' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_webhooks', arguments: { merchantId: 'M1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data[0].id).toBe('WH1');
  });

  // ── X-API-Key header used (not Bearer) ────────────────────────────────────────
  it('uses X-API-Key header not Authorization', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: [] }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_merchants', arguments: {} } },
      withAuth(),
    ));
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe(API_KEY);
    expect(headers['Authorization']).toBeUndefined();
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

  // ── update_payment_link ───────────────────────────────────────────────────────
  it('update_payment_link sends PATCH', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ id: 'PL1', status: 'expired' }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'update_payment_link', arguments: { linkId: 'PL1', status: 'expired' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.status).toBe('expired');
    expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
  });
});
