/**
 * Beehiiv MCP Worker
 * Implements MCP protocol over HTTP for Beehiiv newsletter operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   BEEHIIV_API_KEY → X-Mcp-Secret-BEEHIIV-API-KEY
 *
 * Auth format: Authorization: Bearer {apiKey}
 * Base URL: https://api.beehiiv.com/v2
 */

const BEEHIIV_API_BASE = 'https://api.beehiiv.com/v2';

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
  return request.headers.get('X-Mcp-Secret-BEEHIIV-API-KEY');
}

async function beehiivFetch(
  path: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${BEEHIIV_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
    throw new Error(`Beehiiv API error ${res.status}: ${text}`);
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Beehiiv credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_publications',
    description: 'List all Beehiiv publications for the authenticated account',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_publication',
    description: 'Get details of a specific Beehiiv publication',
    inputSchema: {
      type: 'object',
      properties: { publicationId: { type: 'string', description: 'Beehiiv publication ID' } },
      required: ['publicationId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_posts',
    description: 'List posts for a Beehiiv publication',
    inputSchema: {
      type: 'object',
      properties: {
        publicationId: { type: 'string', description: 'Beehiiv publication ID' },
        status: { type: 'string', description: 'Filter by status: confirmed, draft, archived (default: confirmed)' },
      },
      required: ['publicationId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_post',
    description: 'Get details of a specific Beehiiv post',
    inputSchema: {
      type: 'object',
      properties: {
        publicationId: { type: 'string', description: 'Beehiiv publication ID' },
        postId: { type: 'string', description: 'Beehiiv post ID' },
      },
      required: ['publicationId', 'postId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_subscriptions',
    description: 'List subscriptions for a Beehiiv publication',
    inputSchema: {
      type: 'object',
      properties: {
        publicationId: { type: 'string', description: 'Beehiiv publication ID' },
      },
      required: ['publicationId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_subscription',
    description: 'Get details of a specific subscription',
    inputSchema: {
      type: 'object',
      properties: {
        publicationId: { type: 'string', description: 'Beehiiv publication ID' },
        subscriptionId: { type: 'string', description: 'Subscription ID' },
      },
      required: ['publicationId', 'subscriptionId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_subscription',
    description: 'Create a new subscription to a Beehiiv publication',
    inputSchema: {
      type: 'object',
      properties: {
        publicationId: { type: 'string', description: 'Beehiiv publication ID' },
        email: { type: 'string', description: 'Subscriber email address' },
        reactivate_existing: { type: 'boolean', description: 'Reactivate if already unsubscribed' },
        send_welcome_email: { type: 'boolean', description: 'Send welcome email' },
        utm_source: { type: 'string', description: 'UTM source tracking' },
      },
      required: ['publicationId', 'email'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_subscription',
    description: 'Update an existing Beehiiv subscription',
    inputSchema: {
      type: 'object',
      properties: {
        publicationId: { type: 'string', description: 'Beehiiv publication ID' },
        subscriptionId: { type: 'string', description: 'Subscription ID' },
        status: { type: 'string', description: 'New status: active, inactive, pending' },
        tier: { type: 'string', description: 'Subscription tier' },
      },
      required: ['publicationId', 'subscriptionId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_subscription',
    description: 'Delete a Beehiiv subscription',
    inputSchema: {
      type: 'object',
      properties: {
        publicationId: { type: 'string', description: 'Beehiiv publication ID' },
        subscriptionId: { type: 'string', description: 'Subscription ID to delete' },
      },
      required: ['publicationId', 'subscriptionId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_segments',
    description: 'List audience segments for a Beehiiv publication',
    inputSchema: {
      type: 'object',
      properties: { publicationId: { type: 'string', description: 'Beehiiv publication ID' } },
      required: ['publicationId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_segment',
    description: 'Get details of a specific Beehiiv audience segment',
    inputSchema: {
      type: 'object',
      properties: {
        publicationId: { type: 'string', description: 'Beehiiv publication ID' },
        segmentId: { type: 'string', description: 'Segment ID' },
      },
      required: ['publicationId', 'segmentId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_stats',
    description: 'Get aggregate statistics for a Beehiiv publication',
    inputSchema: {
      type: 'object',
      properties: { publicationId: { type: 'string', description: 'Beehiiv publication ID' } },
      required: ['publicationId'],
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
      return toolOk(await beehiivFetch('/publications?limit=1&page=1', apiKey));

    case 'list_publications':
      return toolOk(await beehiivFetch('/publications?limit=10&page=1', apiKey));

    case 'get_publication': {
      validateRequired(args, ['publicationId']);
      return toolOk(await beehiivFetch(`/publications/${args.publicationId}`, apiKey));
    }

    case 'list_posts': {
      validateRequired(args, ['publicationId']);
      const status = args.status ?? 'confirmed';
      return toolOk(await beehiivFetch(
        `/publications/${args.publicationId}/posts?limit=25&page=1&status=${status}`,
        apiKey,
      ));
    }

    case 'get_post': {
      validateRequired(args, ['publicationId', 'postId']);
      return toolOk(await beehiivFetch(`/publications/${args.publicationId}/posts/${args.postId}`, apiKey));
    }

    case 'list_subscriptions': {
      validateRequired(args, ['publicationId']);
      return toolOk(await beehiivFetch(`/publications/${args.publicationId}/subscriptions?limit=25&page=1`, apiKey));
    }

    case 'get_subscription': {
      validateRequired(args, ['publicationId', 'subscriptionId']);
      return toolOk(await beehiivFetch(`/publications/${args.publicationId}/subscriptions/${args.subscriptionId}`, apiKey));
    }

    case 'create_subscription': {
      validateRequired(args, ['publicationId', 'email']);
      const body: Record<string, unknown> = { email: args.email };
      if (args.reactivate_existing !== undefined) body.reactivate_existing = args.reactivate_existing;
      if (args.send_welcome_email !== undefined) body.send_welcome_email = args.send_welcome_email;
      if (args.utm_source !== undefined) body.utm_source = args.utm_source;
      return toolOk(await beehiivFetch(`/publications/${args.publicationId}/subscriptions`, apiKey, {
        method: 'POST',
        body: JSON.stringify(body),
      }));
    }

    case 'update_subscription': {
      validateRequired(args, ['publicationId', 'subscriptionId']);
      const { publicationId, subscriptionId, ...rest } = args;
      return toolOk(await beehiivFetch(`/publications/${publicationId}/subscriptions/${subscriptionId}`, apiKey, {
        method: 'PATCH',
        body: JSON.stringify(rest),
      }));
    }

    case 'delete_subscription': {
      validateRequired(args, ['publicationId', 'subscriptionId']);
      return toolOk(await beehiivFetch(
        `/publications/${args.publicationId}/subscriptions/${args.subscriptionId}`,
        apiKey,
        { method: 'DELETE' },
      ));
    }

    case 'list_segments': {
      validateRequired(args, ['publicationId']);
      return toolOk(await beehiivFetch(`/publications/${args.publicationId}/segments?limit=100`, apiKey));
    }

    case 'get_segment': {
      validateRequired(args, ['publicationId', 'segmentId']);
      return toolOk(await beehiivFetch(`/publications/${args.publicationId}/segments/${args.segmentId}`, apiKey));
    }

    case 'get_stats': {
      validateRequired(args, ['publicationId']);
      return toolOk(await beehiivFetch(`/publications/${args.publicationId}/stats`, apiKey));
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
      serverInfo: { name: 'mcp-beehiiv', version: '1.0.0' },
    });
  }

  if (body.method === 'tools/list') {
    return rpcOk(id, { tools: TOOLS });
  }

  if (body.method === 'tools/call') {
    const apiKey = getApiKey(request);
    if (!apiKey) return rpcErr(id, -32001, 'Missing required secret: BEEHIIV_API_KEY');

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
      return new Response(JSON.stringify({ status: 'ok', service: 'mcp-beehiiv' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    return handleMcp(request);
  },
};
