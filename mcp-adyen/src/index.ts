/**
 * Adyen MCP Worker
 * Implements MCP protocol over HTTP for Adyen payment operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   ADYEN_API_KEY → X-Mcp-Secret-ADYEN-API-KEY
 *
 * Auth format: X-API-Key: {apiKey} header on all requests
 * Management API base: https://management-test.adyen.com/v3
 * Checkout API base: https://checkout-test.adyen.com/v71
 */

const MGMT_BASE = 'https://management-test.adyen.com/v3';
const CHECKOUT_BASE = 'https://checkout-test.adyen.com/v71';

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
  return request.headers.get('X-Mcp-Secret-ADYEN-API-KEY');
}

async function adyenFetch(
  url: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<unknown> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    },
  });
  if (res.status === 204) return {};
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Adyen API error ${res.status}: ${text}`);
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_merchants',
    description: 'List all merchant accounts in the Adyen management API',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_merchant',
    description: 'Get details of a specific Adyen merchant account',
    inputSchema: {
      type: 'object',
      properties: { merchantId: { type: 'string', description: 'Adyen merchant account ID' } },
      required: ['merchantId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_stores',
    description: 'List stores for a specific Adyen merchant',
    inputSchema: {
      type: 'object',
      properties: { merchantId: { type: 'string', description: 'Adyen merchant account ID' } },
      required: ['merchantId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_balance_accounts',
    description: 'Get payment method settings for a merchant account',
    inputSchema: {
      type: 'object',
      properties: { merchantId: { type: 'string', description: 'Adyen merchant account ID' } },
      required: ['merchantId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_payment_link',
    description: 'Create a payment link in Adyen Checkout',
    inputSchema: {
      type: 'object',
      properties: {
        merchantAccount: { type: 'string', description: 'Merchant account name' },
        amount: { type: 'object', description: 'Payment amount object with currency and value', properties: { currency: { type: 'string' }, value: { type: 'number' } }, required: ['currency', 'value'] },
        reference: { type: 'string', description: 'Unique reference for this payment' },
        returnUrl: { type: 'string', description: 'URL to redirect after payment' },
        expiresAt: { type: 'string', description: 'Expiry datetime in ISO 8601 format (optional)' },
      },
      required: ['merchantAccount', 'amount', 'reference', 'returnUrl'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_payment_link',
    description: 'Get details of an Adyen payment link',
    inputSchema: {
      type: 'object',
      properties: { linkId: { type: 'string', description: 'Payment link ID' } },
      required: ['linkId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'update_payment_link',
    description: 'Update the status of an Adyen payment link',
    inputSchema: {
      type: 'object',
      properties: {
        linkId: { type: 'string', description: 'Payment link ID' },
        status: { type: 'string', description: 'New status (e.g. expired)' },
      },
      required: ['linkId', 'status'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_payment_methods',
    description: 'Get available payment methods for a merchant account',
    inputSchema: {
      type: 'object',
      properties: {
        merchantAccount: { type: 'string', description: 'Merchant account name' },
        amount: { type: 'object', description: 'Amount object with currency and value', properties: { currency: { type: 'string' }, value: { type: 'number' } }, required: ['currency', 'value'] },
        countryCode: { type: 'string', description: 'ISO country code (optional)' },
      },
      required: ['merchantAccount', 'amount'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_order',
    description: 'Create a new Adyen order',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'object', description: 'Order amount', properties: { currency: { type: 'string' }, value: { type: 'number' } }, required: ['currency', 'value'] },
        merchantAccount: { type: 'string', description: 'Merchant account name' },
        reference: { type: 'string', description: 'Unique order reference' },
      },
      required: ['amount', 'merchantAccount', 'reference'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_order',
    description: 'Get the status of an Adyen order',
    inputSchema: {
      type: 'object',
      properties: {
        merchantAccount: { type: 'string', description: 'Merchant account name' },
        orderData: { type: 'string', description: 'Order data token' },
        pspReference: { type: 'string', description: 'PSP reference' },
      },
      required: ['merchantAccount', 'orderData', 'pspReference'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'cancel_order',
    description: 'Cancel an Adyen order',
    inputSchema: {
      type: 'object',
      properties: {
        merchantAccount: { type: 'string', description: 'Merchant account name' },
        orderData: { type: 'string', description: 'Order data token' },
        pspReference: { type: 'string', description: 'PSP reference' },
      },
      required: ['merchantAccount', 'orderData', 'pspReference'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_webhooks',
    description: 'List webhooks configured for an Adyen merchant',
    inputSchema: {
      type: 'object',
      properties: { merchantId: { type: 'string', description: 'Adyen merchant account ID' } },
      required: ['merchantId'],
    },
    annotations: { readOnlyHint: true },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleTool(
  name: string,
  args: Record<string, unknown>,
  apiKey: string,
): Promise<unknown> {
  switch (name) {
    case 'list_merchants':
      return toolOk(await adyenFetch(`${MGMT_BASE}/merchants?pageSize=50`, apiKey));

    case 'get_merchant': {
      validateRequired(args, ['merchantId']);
      return toolOk(await adyenFetch(`${MGMT_BASE}/merchants/${args.merchantId}`, apiKey));
    }

    case 'list_stores': {
      validateRequired(args, ['merchantId']);
      return toolOk(await adyenFetch(`${MGMT_BASE}/merchants/${args.merchantId}/stores?pageSize=50`, apiKey));
    }

    case 'get_balance_accounts': {
      validateRequired(args, ['merchantId']);
      return toolOk(await adyenFetch(`${MGMT_BASE}/merchants/${args.merchantId}/paymentMethodSettings`, apiKey));
    }

    case 'create_payment_link': {
      validateRequired(args, ['merchantAccount', 'amount', 'reference', 'returnUrl']);
      const body: Record<string, unknown> = {
        merchantAccount: args.merchantAccount,
        amount: args.amount,
        reference: args.reference,
        returnUrl: args.returnUrl,
      };
      if (args.expiresAt) body.expiresAt = args.expiresAt;
      return toolOk(await adyenFetch(`${CHECKOUT_BASE}/paymentLinks`, apiKey, {
        method: 'POST',
        body: JSON.stringify(body),
      }));
    }

    case 'get_payment_link': {
      validateRequired(args, ['linkId']);
      return toolOk(await adyenFetch(`${CHECKOUT_BASE}/paymentLinks/${args.linkId}`, apiKey));
    }

    case 'update_payment_link': {
      validateRequired(args, ['linkId', 'status']);
      return toolOk(await adyenFetch(`${CHECKOUT_BASE}/paymentLinks/${args.linkId}`, apiKey, {
        method: 'PATCH',
        body: JSON.stringify({ status: args.status }),
      }));
    }

    case 'list_payment_methods': {
      validateRequired(args, ['merchantAccount', 'amount']);
      const body: Record<string, unknown> = {
        merchantAccount: args.merchantAccount,
        amount: args.amount,
      };
      if (args.countryCode) body.countryCode = args.countryCode;
      return toolOk(await adyenFetch(`${CHECKOUT_BASE}/paymentMethods`, apiKey, {
        method: 'POST',
        body: JSON.stringify(body),
      }));
    }

    case 'create_order': {
      validateRequired(args, ['amount', 'merchantAccount', 'reference']);
      return toolOk(await adyenFetch(`${CHECKOUT_BASE}/orders`, apiKey, {
        method: 'POST',
        body: JSON.stringify({
          amount: args.amount,
          merchantAccount: args.merchantAccount,
          reference: args.reference,
        }),
      }));
    }

    case 'get_order': {
      validateRequired(args, ['merchantAccount', 'orderData', 'pspReference']);
      return toolOk(await adyenFetch(`${CHECKOUT_BASE}/orders/status`, apiKey, {
        method: 'POST',
        body: JSON.stringify({
          merchantAccount: args.merchantAccount,
          orderData: args.orderData,
          pspReference: args.pspReference,
        }),
      }));
    }

    case 'cancel_order': {
      validateRequired(args, ['merchantAccount', 'orderData', 'pspReference']);
      return toolOk(await adyenFetch(`${CHECKOUT_BASE}/orders/cancel`, apiKey, {
        method: 'POST',
        body: JSON.stringify({
          merchantAccount: args.merchantAccount,
          order: { orderData: args.orderData, pspReference: args.pspReference },
        }),
      }));
    }

    case 'list_webhooks': {
      validateRequired(args, ['merchantId']);
      return toolOk(await adyenFetch(`${MGMT_BASE}/merchants/${args.merchantId}/webhooks?pageSize=50`, apiKey));
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
      serverInfo: { name: 'mcp-adyen', version: '1.0.0' },
    });
  }

  if (body.method === 'tools/list') {
    return rpcOk(id, { tools: TOOLS });
  }

  if (body.method === 'tools/call') {
    const apiKey = getApiKey(request);
    if (!apiKey) return rpcErr(id, -32001, 'Missing required secret: ADYEN_API_KEY');

    const params = body.params ?? {};
    const toolName = params.name as string;
    const args = (params.arguments ?? {}) as Record<string, unknown>;

    try {
      const result = await handleTool(toolName, args, apiKey);
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
      return new Response(JSON.stringify({ status: 'ok', service: 'mcp-adyen' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    return handleMcp(request);
  },
};
