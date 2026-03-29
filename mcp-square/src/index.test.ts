import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TOKEN = 'sq0atp-test_access_token_abc123';

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function withAuth(headers: Record<string, string> = {}) {
  return { 'X-Mcp-Secret-SQUARE-ACCESS-TOKEN': TOKEN, ...headers };
}

function mockJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => mockFetch.mockReset());

describe('mcp-square', () => {
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
    expect(json.result.serverInfo.name).toBe('mcp-square');
  });

  it('tools/list returns 14 tools', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    const json = await res.json() as { result: { tools: unknown[] } };
    expect(json.result.tools).toHaveLength(14);
  });

  it('returns -32001 when auth header missing', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_locations', arguments: {} } }));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32001);
  });

  it('returns -32601 for unknown method', async () => {
    const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'unknown/method', params: {} }));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32601);
  });

  it('returns -32603 for unknown tool', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nonexistent_tool', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32601);
  });

  // ── list_locations ───────────────────────────────────────────────────────────
  it('list_locations returns locations', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ locations: [{ id: 'L1', name: 'Main Store' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_locations', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.locations).toHaveLength(1);
    expect(data.locations[0].name).toBe('Main Store');
  });

  // ── get_location ─────────────────────────────────────────────────────────────
  it('get_location returns location details', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ location: { id: 'L1', name: 'Main Store', status: 'ACTIVE' } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_location', arguments: { locationId: 'L1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.location.id).toBe('L1');
  });

  it('get_location fails without locationId', async () => {
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_location', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { error: { code: number } };
    expect(json.error.code).toBe(-32603);
  });

  // ── list_catalog_items ────────────────────────────────────────────────────────
  it('list_catalog_items posts correct body', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ objects: [{ id: 'OBJ1', type: 'ITEM' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_catalog_items', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.objects[0].type).toBe('ITEM');
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  // ── list_customers ────────────────────────────────────────────────────────────
  it('list_customers returns customers', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ customers: [{ id: 'C1', email_address: 'a@b.com' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_customers', arguments: {} } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.customers[0].id).toBe('C1');
  });

  // ── create_customer ───────────────────────────────────────────────────────────
  it('create_customer sends correct data', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ customer: { id: 'C2', email_address: 'new@test.com' } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_customer', arguments: { given_name: 'John', email_address: 'new@test.com' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.customer.id).toBe('C2');
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  // ── list_orders ───────────────────────────────────────────────────────────────
  it('list_orders posts search request', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ orders: [{ id: 'O1', state: 'COMPLETED' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_orders', arguments: { locationId: 'L1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.orders[0].state).toBe('COMPLETED');
  });

  // ── list_payments ─────────────────────────────────────────────────────────────
  it('list_payments with time range', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ payments: [{ id: 'P1' }] }));
    const res = await worker.fetch(makeReq(
      {
        jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
          name: 'list_payments',
          arguments: { locationId: 'L1', beginTime: '2026-01-01T00:00:00Z', endTime: '2026-01-31T00:00:00Z' },
        },
      },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.payments[0].id).toBe('P1');
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('location_id=L1');
    expect(url).toContain('begin_time=');
  });

  // ── list_invoices ─────────────────────────────────────────────────────────────
  it('list_invoices fetches correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ invoices: [{ id: 'INV1' }] }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_invoices', arguments: { locationId: 'L1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.invoices[0].id).toBe('INV1');
  });

  // ── get_invoice ───────────────────────────────────────────────────────────────
  it('get_invoice returns invoice', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ invoice: { id: 'INV1', status: 'UNPAID' } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_invoice', arguments: { invoiceId: 'INV1' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.invoice.status).toBe('UNPAID');
  });

  // ── update_customer ───────────────────────────────────────────────────────────
  it('update_customer sends PUT request', async () => {
    mockFetch.mockResolvedValueOnce(mockJson({ customer: { id: 'C1', given_name: 'Updated' } }));
    const res = await worker.fetch(makeReq(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'update_customer', arguments: { customerId: 'C1', given_name: 'Updated' } } },
      withAuth(),
    ));
    const json = await res.json() as { result: { content: Array<{ text: string }> } };
    const data = JSON.parse(json.result.content[0].text);
    expect(data.customer.given_name).toBe('Updated');
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
