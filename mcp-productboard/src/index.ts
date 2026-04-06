/**
 * Productboard MCP Worker
 * Implements MCP protocol over HTTP for Productboard product management operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   PRODUCTBOARD_ACCESS_TOKEN → X-Mcp-Secret-PRODUCTBOARD-ACCESS-TOKEN
 *
 * Auth format: Authorization: Bearer {token} + X-Version: 1
 * Base URL: https://api.productboard.com
 */

const PRODUCTBOARD_API_BASE = 'https://api.productboard.com';

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
  return request.headers.get('X-Mcp-Secret-PRODUCTBOARD-ACCESS-TOKEN');
}

async function pbFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${PRODUCTBOARD_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Version': '1',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    },
  });
  if (res.status === 204) return { deleted: true };
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Productboard API error ${res.status}: ${text}`);
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Productboard credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'list_features',
    description: 'List features from Productboard with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        statusId: { type: 'string', description: 'Filter by status ID (optional)' },
        componentId: { type: 'string', description: 'Filter by component ID (optional)' },
        productId: { type: 'string', description: 'Filter by product ID (optional)' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_feature',
    description: 'Get details of a specific Productboard feature',
    inputSchema: {
      type: 'object',
      properties: { featureId: { type: 'string', description: 'Productboard feature ID' } },
      required: ['featureId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_feature',
    description: 'Create a new feature in Productboard',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Feature name' },
        description: { type: 'string', description: 'Feature description (optional)' },
        statusId: { type: 'string', description: 'Status ID for the feature' },
      },
      required: ['name', 'statusId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_feature',
    description: 'Update an existing Productboard feature',
    inputSchema: {
      type: 'object',
      properties: {
        featureId: { type: 'string', description: 'Productboard feature ID' },
        name: { type: 'string', description: 'Updated feature name' },
        description: { type: 'string', description: 'Updated description' },
        statusId: { type: 'string', description: 'Updated status ID' },
      },
      required: ['featureId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_feature',
    description: 'Delete a Productboard feature',
    inputSchema: {
      type: 'object',
      properties: { featureId: { type: 'string', description: 'Productboard feature ID to delete' } },
      required: ['featureId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_components',
    description: 'List all components in Productboard',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_component',
    description: 'Get details of a specific Productboard component',
    inputSchema: {
      type: 'object',
      properties: { componentId: { type: 'string', description: 'Productboard component ID' } },
      required: ['componentId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_products',
    description: 'List all products in Productboard',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_product',
    description: 'Get details of a specific Productboard product',
    inputSchema: {
      type: 'object',
      properties: { productId: { type: 'string', description: 'Productboard product ID' } },
      required: ['productId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_notes',
    description: 'List notes associated with a feature in Productboard',
    inputSchema: {
      type: 'object',
      properties: { featureId: { type: 'string', description: 'Feature ID to list notes for' } },
      required: ['featureId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_note',
    description: 'Create a new note/customer feedback in Productboard',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title' },
        content: { type: 'string', description: 'Note content/body' },
        customerEmail: { type: 'string', description: 'Customer email to associate the note with (optional)' },
        featureId: { type: 'string', description: 'Feature ID to link this note to (optional)' },
      },
      required: ['title', 'content'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_releases',
    description: 'List all releases in Productboard',
    inputSchema: { type: 'object', properties: {}, required: [] },
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
      return toolOk(await pbFetch('/me', token));

    case 'list_features': {
      const params = new URLSearchParams();
      if (args.statusId) params.set('status.id', String(args.statusId));
      if (args.componentId) params.set('component.id', String(args.componentId));
      if (args.productId) params.set('product.id', String(args.productId));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return toolOk(await pbFetch(`/features${qs}`, token));
    }

    case 'get_feature': {
      validateRequired(args, ['featureId']);
      return toolOk(await pbFetch(`/features/${args.featureId}`, token));
    }

    case 'create_feature': {
      validateRequired(args, ['name', 'statusId']);
      const attributes: Record<string, unknown> = {
        name: args.name,
        status: { id: args.statusId },
      };
      if (args.description !== undefined) attributes.description = args.description;
      return toolOk(await pbFetch('/features', token, {
        method: 'POST',
        body: JSON.stringify({ data: { type: 'feature', attributes } }),
      }));
    }

    case 'update_feature': {
      validateRequired(args, ['featureId']);
      const attributes: Record<string, unknown> = {};
      if (args.name !== undefined) attributes.name = args.name;
      if (args.description !== undefined) attributes.description = args.description;
      if (args.statusId !== undefined) attributes.status = { id: args.statusId };
      return toolOk(await pbFetch(`/features/${args.featureId}`, token, {
        method: 'PUT',
        body: JSON.stringify({ data: { type: 'feature', attributes } }),
      }));
    }

    case 'delete_feature': {
      validateRequired(args, ['featureId']);
      return toolOk(await pbFetch(`/features/${args.featureId}`, token, { method: 'DELETE' }));
    }

    case 'list_components':
      return toolOk(await pbFetch('/components', token));

    case 'get_component': {
      validateRequired(args, ['componentId']);
      return toolOk(await pbFetch(`/components/${args.componentId}`, token));
    }

    case 'list_products':
      return toolOk(await pbFetch('/products', token));

    case 'get_product': {
      validateRequired(args, ['productId']);
      return toolOk(await pbFetch(`/products/${args.productId}`, token));
    }

    case 'list_notes': {
      validateRequired(args, ['featureId']);
      return toolOk(await pbFetch(`/notes?feature.id=${args.featureId}`, token));
    }

    case 'create_note': {
      validateRequired(args, ['title', 'content']);
      const attributes: Record<string, unknown> = {
        title: args.title,
        content: args.content,
      };
      if (args.featureId !== undefined) attributes.feature_id = args.featureId;
      const data: Record<string, unknown> = { type: 'note', attributes };
      if (args.customerEmail !== undefined) {
        (data.attributes as Record<string, unknown>).customer = { email: args.customerEmail };
      }
      return toolOk(await pbFetch('/notes', token, {
        method: 'POST',
        body: JSON.stringify({ data }),
      }));
    }

    case 'list_releases':
      return toolOk(await pbFetch('/releases', token));

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
      serverInfo: { name: 'mcp-productboard', version: '1.0.0' },
    });
  }

  if (body.method === 'tools/list') {
    return rpcOk(id, { tools: TOOLS });
  }

  if (body.method === 'tools/call') {
    const token = getApiKey(request);
    if (!token) return rpcErr(id, -32001, 'Missing required secret: PRODUCTBOARD_ACCESS_TOKEN');

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
      return new Response(JSON.stringify({ status: 'ok', service: 'mcp-productboard' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    return handleMcp(request);
  },
};
