/**
 * Braintree MCP Worker
 * Implements MCP protocol over HTTP for Braintree payment operations via GraphQL.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   BRAINTREE_PUBLIC_KEY   → X-Mcp-Secret-BRAINTREE-PUBLIC-KEY
 *   BRAINTREE_PRIVATE_KEY  → X-Mcp-Secret-BRAINTREE-PRIVATE-KEY
 *   BRAINTREE_ENVIRONMENT  → X-Mcp-Secret-BRAINTREE-ENVIRONMENT (optional: 'sandbox' or 'production', default: 'sandbox')
 *
 * Auth format: Authorization: Basic {base64(publicKey:privateKey)} + Braintree-Version: 2019-01-01
 * Endpoint: https://payments.sandbox.braintree-api.com/graphql (sandbox) or https://payments.braintree-api.com/graphql (production)
 */

function getBraintreeEndpoint(environment: string | null): string {
  return environment === 'production'
    ? 'https://payments.braintree-api.com/graphql'
    : 'https://payments.sandbox.braintree-api.com/graphql';
}

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

function getSecrets(request: Request): { publicKey: string | null; privateKey: string | null; environment: string | null } {
  return {
    publicKey: request.headers.get('X-Mcp-Secret-BRAINTREE-PUBLIC-KEY'),
    privateKey: request.headers.get('X-Mcp-Secret-BRAINTREE-PRIVATE-KEY'),
    environment: request.headers.get('X-Mcp-Secret-BRAINTREE-ENVIRONMENT'),
  };
}

function buildBasicAuth(publicKey: string, privateKey: string): string {
  return `Basic ${btoa(`${publicKey}:${privateKey}`)}`;
}

async function graphqlRequest(
  query: string,
  variables: Record<string, unknown>,
  auth: string,
  environment: string | null = null,
): Promise<unknown> {
  const endpoint = getBraintreeEndpoint(environment);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Braintree-Version': '2019-01-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Braintree API error ${res.status}: ${text}`);
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Braintree credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'search_transactions',
    description: 'Search for settled transactions in Braintree',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_transaction',
    description: 'Get details of a specific Braintree transaction',
    inputSchema: {
      type: 'object',
      properties: { transactionId: { type: 'string', description: 'Braintree transaction ID' } },
      required: ['transactionId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_transaction',
    description: 'Charge a payment method (create a transaction)',
    inputSchema: {
      type: 'object',
      properties: {
        paymentMethodId: { type: 'string', description: 'Payment method token or nonce' },
        amount: { type: 'string', description: 'Amount as string e.g. "10.00"' },
        orderId: { type: 'string', description: 'Optional order ID' },
        purchaseOrderNumber: { type: 'string', description: 'Optional purchase order number' },
      },
      required: ['paymentMethodId', 'amount'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'refund_transaction',
    description: 'Refund a settled Braintree transaction',
    inputSchema: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Transaction ID to refund' },
        amount: { type: 'string', description: 'Amount to refund (optional, defaults to full amount)' },
      },
      required: ['transactionId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'void_transaction',
    description: 'Void (reverse) a Braintree transaction',
    inputSchema: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Transaction ID to void' },
      },
      required: ['transactionId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_customers',
    description: 'List customers in Braintree',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_customer',
    description: 'Get details of a specific Braintree customer',
    inputSchema: {
      type: 'object',
      properties: { customerId: { type: 'string', description: 'Braintree customer ID' } },
      required: ['customerId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_customer',
    description: 'Create a new customer in Braintree',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Customer email' },
        firstName: { type: 'string', description: 'First name' },
        lastName: { type: 'string', description: 'Last name' },
      },
      required: [],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_customer',
    description: 'Delete a Braintree customer',
    inputSchema: {
      type: 'object',
      properties: { customerId: { type: 'string', description: 'Customer ID to delete' } },
      required: ['customerId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'generate_client_token',
    description: 'Generate a client token for Braintree frontend integration',
    inputSchema: {
      type: 'object',
      properties: {
        merchantAccountId: { type: 'string', description: 'Optional merchant account ID' },
      },
      required: [],
    },
    annotations: { readOnlyHint: false },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleTool(
  name: string,
  args: Record<string, unknown>,
  auth: string,
  environment: string | null = null,
): Promise<unknown> {
  switch (name) {
    case '_ping': {
      // Call a lightweight read endpoint to verify credentials
      const pingQuery = `query { clientConfiguration { analyticsUrl } }`;
      await graphqlRequest(pingQuery, {}, auth, environment);
      return toolOk({ connected: true });
    }

    case 'search_transactions': {
      const query = `query { search { transactions(input: { status: { is: SETTLED } }) { edges { node { id amount { value currencyIsoCode } status createdAt } } } } }`;
      return toolOk(await graphqlRequest(query, {}, auth, environment));
    }

    case 'get_transaction': {
      validateRequired(args, ['transactionId']);
      const query = `query GetTransaction($id: ID!) { transaction(id: $id) { id amount { value currencyIsoCode } status createdAt customer { id email } } }`;
      return toolOk(await graphqlRequest(query, { id: args.transactionId }, auth, environment));
    }

    case 'create_transaction': {
      validateRequired(args, ['paymentMethodId', 'amount']);
      const input: Record<string, unknown> = {
        paymentMethodId: args.paymentMethodId,
        transaction: { amount: args.amount },
      };
      if (args.orderId) (input.transaction as Record<string, unknown>).orderId = args.orderId;
      if (args.purchaseOrderNumber) (input.transaction as Record<string, unknown>).purchaseOrderNumber = args.purchaseOrderNumber;
      const query = `mutation ChargePaymentMethod($input: ChargePaymentMethodInput!) { chargePaymentMethod(input: $input) { transaction { id status amount { value currencyIsoCode } } } }`;
      return toolOk(await graphqlRequest(query, { input }, auth, environment));
    }

    case 'refund_transaction': {
      validateRequired(args, ['transactionId']);
      const input: Record<string, unknown> = { transactionId: args.transactionId };
      if (args.amount) input.amount = args.amount;
      const query = `mutation RefundTransaction($input: RefundTransactionInput!) { refundTransaction(input: $input) { refund { id status amount { value currencyIsoCode } } } }`;
      return toolOk(await graphqlRequest(query, { input }, auth, environment));
    }

    case 'void_transaction': {
      validateRequired(args, ['transactionId']);
      const query = `mutation ReverseTransaction($input: ReverseTransactionInput!) { reverseTransaction(input: $input) { reversal { ... on Transaction { id status } } } }`;
      return toolOk(await graphqlRequest(query, { input: { transactionId: args.transactionId } }, auth, environment));
    }

    case 'list_customers': {
      const query = `query { search { customers { edges { node { id email createdAt } } } } }`;
      return toolOk(await graphqlRequest(query, {}, auth, environment));
    }

    case 'get_customer': {
      validateRequired(args, ['customerId']);
      const query = `query GetCustomer($id: ID!) { customer(id: $id) { id email paymentMethods { edges { node { id } } } } }`;
      return toolOk(await graphqlRequest(query, { id: args.customerId }, auth, environment));
    }

    case 'create_customer': {
      const customer: Record<string, unknown> = {};
      if (args.email) customer.email = args.email;
      if (args.firstName) customer.firstName = args.firstName;
      if (args.lastName) customer.lastName = args.lastName;
      const query = `mutation CreateCustomer($input: CreateCustomerInput!) { createCustomer(input: $input) { customer { id email } } }`;
      return toolOk(await graphqlRequest(query, { input: { customer } }, auth, environment));
    }

    case 'delete_customer': {
      validateRequired(args, ['customerId']);
      const query = `mutation DeleteCustomer($input: DeleteCustomerInput!) { deleteCustomer(input: $input) { clientMutationId } }`;
      return toolOk(await graphqlRequest(query, { input: { customerId: args.customerId } }, auth, environment));
    }

    case 'generate_client_token': {
      const clientToken: Record<string, unknown> = {};
      if (args.merchantAccountId) clientToken.merchantAccountId = args.merchantAccountId;
      const query = `mutation CreateClientToken($input: CreateClientTokenInput!) { createClientToken(input: $input) { clientToken } }`;
      return toolOk(await graphqlRequest(query, { input: { clientToken } }, auth, environment));
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
      serverInfo: { name: 'mcp-braintree', version: '1.0.0' },
    });
  }

  if (body.method === 'tools/list') {
    return rpcOk(id, { tools: TOOLS });
  }

  if (body.method === 'tools/call') {
    const { publicKey, privateKey, environment } = getSecrets(request);
    const missing: string[] = [];
    if (!publicKey) missing.push('BRAINTREE_PUBLIC_KEY');
    if (!privateKey) missing.push('BRAINTREE_PRIVATE_KEY');
    if (missing.length > 0) {
      return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
    }

    const auth = buildBasicAuth(publicKey!, privateKey!);
    const params = body.params ?? {};
    const toolName = params.name as string;
    const args = (params.arguments ?? {}) as Record<string, unknown>;

    try {
      const result = await handleTool(toolName, args, auth, environment);
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
      return new Response(JSON.stringify({ status: 'ok', service: 'mcp-braintree' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    return handleMcp(request);
  },
};
