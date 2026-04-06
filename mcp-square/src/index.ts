/**
 * Square MCP Worker
 * Implements MCP protocol over HTTP for Square payments, catalog, customers, and orders.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   SQUARE_ACCESS_TOKEN → X-Mcp-Secret-SQUARE-ACCESS-TOKEN
 *
 * Auth format: Authorization: Bearer {token} + Square-Version: 2024-01-18
 * Base URL: https://connect.squareup.com/v2
 */

const SQUARE_API_BASE = 'https://connect.squareup.com/v2';
const SQUARE_VERSION = '2024-01-18';

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpcOk(id: string | number | null, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function rpcErr(id: string | number | null, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function toolOk(data: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
  const missing = fields.filter(f => args[f] === undefined || args[f] === null || args[f] === '');
  if (missing.length > 0) throw new Error(`Missing required fields: ${missing.join(', ')}`);
}

function getApiKey(request: Request): string | null {
  return request.headers.get('X-Mcp-Secret-SQUARE-ACCESS-TOKEN');
}

async function squareFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${SQUARE_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': SQUARE_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    },
  });
  if (res.status === 204) return {};
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Square API error ${res.status}: ${text}`);
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Square credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'list_locations',
    description: 'List all Square locations for the merchant account',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_location',
    description: 'Get details of a specific Square location',
    inputSchema: {
      type: 'object',
      properties: { locationId: { type: 'string', description: 'Square location ID' } },
      required: ['locationId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_catalog_items',
    description: 'List catalog items from the Square catalog',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_catalog_item',
    description: 'Get a specific catalog object including related objects',
    inputSchema: {
      type: 'object',
      properties: { objectId: { type: 'string', description: 'Square catalog object ID' } },
      required: ['objectId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_customers',
    description: 'List customers in the Square account',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_customer',
    description: 'Get details of a specific Square customer',
    inputSchema: {
      type: 'object',
      properties: { customerId: { type: 'string', description: 'Square customer ID' } },
      required: ['customerId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_customer',
    description: 'Create a new customer in Square',
    inputSchema: {
      type: 'object',
      properties: {
        given_name: { type: 'string', description: 'First name' },
        family_name: { type: 'string', description: 'Last name' },
        email_address: { type: 'string', description: 'Email address' },
        phone_number: { type: 'string', description: 'Phone number' },
        note: { type: 'string', description: 'Internal note about the customer' },
      },
      required: [],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_customer',
    description: 'Update an existing Square customer',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Square customer ID' },
        given_name: { type: 'string', description: 'First name' },
        family_name: { type: 'string', description: 'Last name' },
        email_address: { type: 'string', description: 'Email address' },
        phone_number: { type: 'string', description: 'Phone number' },
        note: { type: 'string', description: 'Internal note' },
      },
      required: ['customerId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_orders',
    description: 'Search/list orders for a specific location',
    inputSchema: {
      type: 'object',
      properties: { locationId: { type: 'string', description: 'Square location ID' } },
      required: ['locationId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_order',
    description: 'Get details of a specific Square order',
    inputSchema: {
      type: 'object',
      properties: { orderId: { type: 'string', description: 'Square order ID' } },
      required: ['orderId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_payments',
    description: 'List payments for a location within a time range',
    inputSchema: {
      type: 'object',
      properties: {
        locationId: { type: 'string', description: 'Square location ID' },
        beginTime: { type: 'string', description: 'Start time in RFC 3339 format' },
        endTime: { type: 'string', description: 'End time in RFC 3339 format' },
      },
      required: ['locationId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_payment',
    description: 'Get details of a specific Square payment',
    inputSchema: {
      type: 'object',
      properties: { paymentId: { type: 'string', description: 'Square payment ID' } },
      required: ['paymentId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_invoices',
    description: 'List invoices for a location',
    inputSchema: {
      type: 'object',
      properties: { locationId: { type: 'string', description: 'Square location ID' } },
      required: ['locationId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_invoice',
    description: 'Get details of a specific Square invoice',
    inputSchema: {
      type: 'object',
      properties: { invoiceId: { type: 'string', description: 'Square invoice ID' } },
      required: ['invoiceId'],
    },
    annotations: { readOnlyHint: true },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleTool(
  name: string,
  args: Record<string, unknown>,
  token: string,
): Promise<unknown> {
  switch (name) {
    case '_ping':
      return toolOk(await squareFetch('/locations', token));

    case 'list_locations':
      return toolOk(await squareFetch('/locations', token));

    case 'get_location': {
      validateRequired(args, ['locationId']);
      return toolOk(await squareFetch(`/locations/${args.locationId}`, token));
    }

    case 'list_catalog_items':
      return toolOk(await squareFetch('/catalog/search', token, {
        method: 'POST',
        body: JSON.stringify({ object_types: ['ITEM'], limit: 100 }),
      }));

    case 'get_catalog_item': {
      validateRequired(args, ['objectId']);
      return toolOk(await squareFetch(
        `/catalog/object/${args.objectId}?include_related_objects=true`,
        token,
      ));
    }

    case 'list_customers':
      return toolOk(await squareFetch('/customers?limit=100&sort_field=DEFAULT', token));

    case 'get_customer': {
      validateRequired(args, ['customerId']);
      return toolOk(await squareFetch(`/customers/${args.customerId}`, token));
    }

    case 'create_customer': {
      const body: Record<string, unknown> = {};
      if (args.given_name) body.given_name = args.given_name;
      if (args.family_name) body.family_name = args.family_name;
      if (args.email_address) body.email_address = args.email_address;
      if (args.phone_number) body.phone_number = args.phone_number;
      if (args.note) body.note = args.note;
      return toolOk(await squareFetch('/customers', token, {
        method: 'POST',
        body: JSON.stringify(body),
      }));
    }

    case 'update_customer': {
      validateRequired(args, ['customerId']);
      const body: Record<string, unknown> = {};
      if (args.given_name !== undefined) body.given_name = args.given_name;
      if (args.family_name !== undefined) body.family_name = args.family_name;
      if (args.email_address !== undefined) body.email_address = args.email_address;
      if (args.phone_number !== undefined) body.phone_number = args.phone_number;
      if (args.note !== undefined) body.note = args.note;
      return toolOk(await squareFetch(`/customers/${args.customerId}`, token, {
        method: 'PUT',
        body: JSON.stringify(body),
      }));
    }

    case 'list_orders': {
      validateRequired(args, ['locationId']);
      return toolOk(await squareFetch('/orders/search', token, {
        method: 'POST',
        body: JSON.stringify({
          location_ids: [args.locationId],
          query: { filter: { state_filter: { states: ['COMPLETED', 'OPEN'] } } },
        }),
      }));
    }

    case 'get_order': {
      validateRequired(args, ['orderId']);
      return toolOk(await squareFetch(`/orders/${args.orderId}`, token));
    }

    case 'list_payments': {
      validateRequired(args, ['locationId']);
      let path = `/payments?location_id=${args.locationId}`;
      if (args.beginTime) path += `&begin_time=${encodeURIComponent(String(args.beginTime))}`;
      if (args.endTime) path += `&end_time=${encodeURIComponent(String(args.endTime))}`;
      return toolOk(await squareFetch(path, token));
    }

    case 'get_payment': {
      validateRequired(args, ['paymentId']);
      return toolOk(await squareFetch(`/payments/${args.paymentId}`, token));
    }

    case 'list_invoices': {
      validateRequired(args, ['locationId']);
      return toolOk(await squareFetch(`/invoices?location_id=${args.locationId}&limit=100`, token));
    }

    case 'get_invoice': {
      validateRequired(args, ['invoiceId']);
      return toolOk(await squareFetch(`/invoices/${args.invoiceId}`, token));
    }

    default:
      throw { code: -32601, message: `Method not found: ${name}` };
  }
}

// ── MCP request router ────────────────────────────────────────────────────────

async function handleMcp(request: Request): Promise<Response> {
  let body: { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
  try {
    body = await request.json() as typeof body;
  } catch {
    return rpcErr(null, -32700, 'Parse error');
  }

  const id = body.id ?? null;

  if (body.method === 'initialize') {
    return rpcOk(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'mcp-square', version: '1.0.0' },
    });
  }

  if (body.method === 'tools/list') {
    return rpcOk(id, { tools: TOOLS });
  }

  if (body.method === 'tools/call') {
    const token = getApiKey(request);
    if (!token) return rpcErr(id, -32001, 'Missing required secret: SQUARE_ACCESS_TOKEN');

    const params = body.params ?? {};
    const toolName = params.name as string;
    const args = (params.arguments ?? {}) as Record<string, unknown>;

    try {
      const result = await handleTool(toolName, args, token);
      return rpcOk(id, result);
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err) {
        const e = err as { code: number; message: string };
        return rpcErr(id, e.code, e.message);
      }
      return rpcErr(id, -32603, err instanceof Error ? err.message : 'Internal error');
    }
  }

  return rpcErr(id, -32601, `Method not found: ${body.method}`);
}

// ── Worker entry ──────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'mcp-square' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    return handleMcp(request);
  },
};
