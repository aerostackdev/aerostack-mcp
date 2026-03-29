import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const PUBLIC_KEY = 'test_public_key';
const PRIVATE_KEY = 'test_private_key';

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function withAuth(headers: Record<string, string> = {}) {
  return {
    'X-Mcp-Secret-BRAINTREE-PUBLIC-KEY': PUBLIC_KEY,
    'X-Mcp-Secret-BRAINTREE-PRIVATE-KEY': PRIVATE_KEY,
    ...headers,
  };
}

function mockJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => mockFetch.mockReset());

describe('mcp-braintree', () => {
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
    expect(json.result.serverInfo.name).toBe('mcp-braintree');
  });

  it('tools/list returns 10 tools', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const json = await res.json() as { result: { tools: unknown[] } };
    expect(json.result.tools).toHaveLength(10);
  });

  it('returns -32001 when both secrets missing', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_transactions', arguments: {} } }));
    const json = await res.json() as { error: { code: number; message: string } };
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('BRAINTREE_PUBLIC_KEY');
    expect(json.error.message).toContain('BRAINTREE_PRIVATE_KEY');
  });

  it('returns -32001 when only public key missing', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_transactions', arguments: {} } },
      { 'X-Mcp-Secret-BRAINTREE-PRIVATE-KEY': PRIVATE_KEY },
    ));
    const json = await res.json() as { error: { code: number; message: string } };
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('BRAINTREE_PUBLIC_KEY');
  });

  it('returns -32001 when only private key missing', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_transactions', arguments: {} } },
      { 'X-Mcp-Secret-BRAINTREE-PUBLIC-KEY': PUBLIC_KEY },
    ));
    const json = await res.json() as { error: { code: number; message: string } };
    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain('BRAINTREE_PRIVATE_KEY');
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

  // ── Auth uses Basic auth ──────────────────────────────────────────────────────
  it('uses Basic auth header with correct encoding', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { search: { transactions: { edges: [] } } } }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_transactions', arguments: {} } },
      withAuth(),
    ));
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Basic ${btoa(`${PUBLIC_KEY}:${PRIVATE_KEY}`)}`);
    expect(headers['Braintree-Version']).toBe('2019-01-01');
  });

  // ── search_transactions ────────────────────────────────────────────────────
  it('search_transactions returns transaction list', async () => {
    const mockData = { data: { search: { transactions: { edges: [{ node: { id: 'TX1', status: 'SETTLED' } }] } } } };
    mockFetch.mockResolvedValueOnce(mockJson(mockData));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_transactions', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.search.transactions.edges[0].node.id).toBe('TX1');
  });

  // ── get_transaction ────────────────────────────────────────────────────────
  it('get_transaction sends correct variables', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { transaction: { id: 'TX1', status: 'SETTLED' } } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_transaction', arguments: { transactionId: 'TX1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.transaction.id).toBe('TX1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables.id).toBe('TX1');
  });

  it('get_transaction fails without transactionId', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_transaction', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32603);
  });

  // ── create_transaction ──────────────────────────────────────────────────────
  it('create_transaction sends mutation with required fields', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { chargePaymentMethod: { transaction: { id: 'TX2', status: 'SUBMITTED_FOR_SETTLEMENT' } } } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_transaction', arguments: { paymentMethodId: 'PM1', amount: '10.00' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.chargePaymentMethod.transaction.id).toBe('TX2');
  });

  // ── refund_transaction ──────────────────────────────────────────────────────
  it('refund_transaction sends refund mutation', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { refundTransaction: { refund: { id: 'REF1', status: 'SUBMITTED_FOR_SETTLEMENT' } } } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'refund_transaction', arguments: { transactionId: 'TX1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.refundTransaction.refund.id).toBe('REF1');
  });

  // ── create_customer ─────────────────────────────────────────────────────────
  it('create_customer sends mutation', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { createCustomer: { customer: { id: 'C1', email: 'test@test.com' } } } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_customer', arguments: { email: 'test@test.com' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.createCustomer.customer.email).toBe('test@test.com');
  });

  // ── generate_client_token ───────────────────────────────────────────────────
  it('generate_client_token returns token', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: { createClientToken: { clientToken: 'eyJhbGciOi...' } } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'generate_client_token', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.data.createClientToken.clientToken).toBe('eyJhbGciOi...');
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

  // ── all requests go to GraphQL endpoint ──────────────────────────────────────
  it('all requests go to GraphQL endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ data: {} }));
    await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_customers', arguments: {} } },
      withAuth(),
    ));
    expect(mockFetch.mock.calls[0][0]).toBe('https://payments.sandbox.braintree-api.com/graphql');
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });
});
