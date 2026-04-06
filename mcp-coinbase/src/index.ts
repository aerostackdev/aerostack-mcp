/**
 * Coinbase MCP Worker
 * Implements MCP protocol over HTTP for Coinbase account, wallet, and price operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   COINBASE_API_KEY → X-Mcp-Secret-COINBASE-API-KEY
 *
 * Auth format: Authorization: Bearer {apiKey}
 * Base URL: https://api.coinbase.com/v2
 */

const COINBASE_API_BASE = 'https://api.coinbase.com/v2';

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
  return request.headers.get('X-Mcp-Secret-COINBASE-API-KEY');
}

async function coinbaseFetch(
  path: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${COINBASE_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    },
  });
  if (res.status === 204) return {};
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Coinbase API error ${res.status}: ${text}`);
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Coinbase credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_current_user',
    description: 'Get the current authenticated Coinbase user',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_accounts',
    description: 'List all Coinbase accounts (wallets) for the current user',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_account',
    description: 'Get details of a specific Coinbase account',
    inputSchema: {
      type: 'object',
      properties: { accountId: { type: 'string', description: 'Coinbase account ID' } },
      required: ['accountId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_transactions',
    description: 'List transactions for a Coinbase account',
    inputSchema: {
      type: 'object',
      properties: { accountId: { type: 'string', description: 'Coinbase account ID' } },
      required: ['accountId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_transaction',
    description: 'Get details of a specific transaction',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Coinbase account ID' },
        transactionId: { type: 'string', description: 'Transaction ID' },
      },
      required: ['accountId', 'transactionId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_addresses',
    description: 'List deposit addresses for a Coinbase account',
    inputSchema: {
      type: 'object',
      properties: { accountId: { type: 'string', description: 'Coinbase account ID' } },
      required: ['accountId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_address',
    description: 'Create a new deposit address for a Coinbase account',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Coinbase account ID' },
        name: { type: 'string', description: 'Optional label for the address' },
      },
      required: ['accountId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'send_money',
    description: 'Send cryptocurrency from a Coinbase account',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Coinbase account ID to send from' },
        to: { type: 'string', description: 'Recipient address or email' },
        amount: { type: 'string', description: 'Amount to send' },
        currency: { type: 'string', description: 'Currency code (e.g. BTC)' },
        description: { type: 'string', description: 'Optional note about the transaction' },
      },
      required: ['accountId', 'to', 'amount', 'currency'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_spot_price',
    description: 'Get the current spot price for a currency pair',
    inputSchema: {
      type: 'object',
      properties: { currencyPair: { type: 'string', description: 'Currency pair e.g. BTC-USD' } },
      required: ['currencyPair'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_buy_price',
    description: 'Get the current buy price for a currency pair',
    inputSchema: {
      type: 'object',
      properties: { currencyPair: { type: 'string', description: 'Currency pair e.g. BTC-USD' } },
      required: ['currencyPair'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_sell_price',
    description: 'Get the current sell price for a currency pair',
    inputSchema: {
      type: 'object',
      properties: { currencyPair: { type: 'string', description: 'Currency pair e.g. BTC-USD' } },
      required: ['currencyPair'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_exchange_rates',
    description: 'Get exchange rates for a currency',
    inputSchema: {
      type: 'object',
      properties: { currency: { type: 'string', description: 'Currency code e.g. USD' } },
      required: ['currency'],
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
    case '_ping':
      return toolOk(await coinbaseFetch('/user', apiKey));

    case 'get_current_user':
      return toolOk(await coinbaseFetch('/user', apiKey));

    case 'list_accounts':
      return toolOk(await coinbaseFetch('/accounts?limit=100', apiKey));

    case 'get_account': {
      validateRequired(args, ['accountId']);
      return toolOk(await coinbaseFetch(`/accounts/${args.accountId}`, apiKey));
    }

    case 'list_transactions': {
      validateRequired(args, ['accountId']);
      return toolOk(await coinbaseFetch(`/accounts/${args.accountId}/transactions?limit=25`, apiKey));
    }

    case 'get_transaction': {
      validateRequired(args, ['accountId', 'transactionId']);
      return toolOk(await coinbaseFetch(`/accounts/${args.accountId}/transactions/${args.transactionId}`, apiKey));
    }

    case 'list_addresses': {
      validateRequired(args, ['accountId']);
      return toolOk(await coinbaseFetch(`/accounts/${args.accountId}/addresses?limit=25`, apiKey));
    }

    case 'create_address': {
      validateRequired(args, ['accountId']);
      const body: Record<string, unknown> = {};
      if (args.name) body.name = args.name;
      return toolOk(await coinbaseFetch(`/accounts/${args.accountId}/addresses`, apiKey, {
        method: 'POST',
        body: JSON.stringify(body),
      }));
    }

    case 'send_money': {
      validateRequired(args, ['accountId', 'to', 'amount', 'currency']);
      const body: Record<string, unknown> = {
        type: 'send',
        to: args.to,
        amount: args.amount,
        currency: args.currency,
      };
      if (args.description) body.description = args.description;
      return toolOk(await coinbaseFetch(`/accounts/${args.accountId}/transactions`, apiKey, {
        method: 'POST',
        body: JSON.stringify(body),
      }));
    }

    case 'get_spot_price': {
      validateRequired(args, ['currencyPair']);
      return toolOk(await coinbaseFetch(`/prices/${args.currencyPair}/spot`, apiKey));
    }

    case 'get_buy_price': {
      validateRequired(args, ['currencyPair']);
      return toolOk(await coinbaseFetch(`/prices/${args.currencyPair}/buy`, apiKey));
    }

    case 'get_sell_price': {
      validateRequired(args, ['currencyPair']);
      return toolOk(await coinbaseFetch(`/prices/${args.currencyPair}/sell`, apiKey));
    }

    case 'get_exchange_rates': {
      validateRequired(args, ['currency']);
      return toolOk(await coinbaseFetch(`/exchange-rates?currency=${args.currency}`, apiKey));
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
      serverInfo: { name: 'mcp-coinbase', version: '1.0.0' },
    });
  }

  if (body.method === 'tools/list') {
    return rpcOk(id, { tools: TOOLS });
  }

  if (body.method === 'tools/call') {
    const apiKey = getApiKey(request);
    if (!apiKey) return rpcErr(id, -32001, 'Missing required secret: COINBASE_API_KEY');

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
      return new Response(JSON.stringify({ status: 'ok', service: 'mcp-coinbase' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    return handleMcp(request);
  },
};
