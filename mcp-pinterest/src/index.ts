/**
 * Pinterest MCP Worker
 * Implements MCP protocol over HTTP for Pinterest boards, pins, and analytics.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   PINTEREST_ACCESS_TOKEN → X-Mcp-Secret-PINTEREST-ACCESS-TOKEN
 *
 * Auth format: Authorization: Bearer {token}
 * Base URL: https://api.pinterest.com/v5
 */

const PINTEREST_API_BASE = 'https://api.pinterest.com/v5';

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
  return request.headers.get('X-Mcp-Secret-PINTEREST-ACCESS-TOKEN');
}

async function pinterestFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${PINTEREST_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
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
    throw new Error(`Pinterest API error ${res.status}: ${text}`);
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_current_user',
    description: 'Get the current authenticated Pinterest user account',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_boards',
    description: 'List boards for the current Pinterest user',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_board',
    description: 'Get details of a specific Pinterest board',
    inputSchema: {
      type: 'object',
      properties: { boardId: { type: 'string', description: 'Pinterest board ID' } },
      required: ['boardId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_board',
    description: 'Create a new Pinterest board',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Board name' },
        description: { type: 'string', description: 'Board description (optional)' },
        privacy: { type: 'string', description: 'Privacy setting: PUBLIC or SECRET (default: PUBLIC)' },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_board',
    description: 'Update a Pinterest board',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Pinterest board ID' },
        name: { type: 'string', description: 'Updated board name' },
        description: { type: 'string', description: 'Updated description' },
        privacy: { type: 'string', description: 'Updated privacy setting' },
      },
      required: ['boardId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_board',
    description: 'Delete a Pinterest board',
    inputSchema: {
      type: 'object',
      properties: { boardId: { type: 'string', description: 'Pinterest board ID to delete' } },
      required: ['boardId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_pins',
    description: 'List pins on a Pinterest board',
    inputSchema: {
      type: 'object',
      properties: { boardId: { type: 'string', description: 'Pinterest board ID' } },
      required: ['boardId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_pin',
    description: 'Get details of a specific Pinterest pin',
    inputSchema: {
      type: 'object',
      properties: { pinId: { type: 'string', description: 'Pinterest pin ID' } },
      required: ['pinId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_pin',
    description: 'Create a new Pinterest pin',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: { type: 'string', description: 'Board ID to pin to' },
        title: { type: 'string', description: 'Pin title (optional)' },
        description: { type: 'string', description: 'Pin description (optional)' },
        link: { type: 'string', description: 'Destination link (optional)' },
        image_url: { type: 'string', description: 'Image URL for the pin' },
      },
      required: ['board_id', 'image_url'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_pin',
    description: 'Update a Pinterest pin',
    inputSchema: {
      type: 'object',
      properties: {
        pinId: { type: 'string', description: 'Pinterest pin ID' },
        title: { type: 'string', description: 'Updated title' },
        description: { type: 'string', description: 'Updated description' },
        link: { type: 'string', description: 'Updated destination link' },
      },
      required: ['pinId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_pin',
    description: 'Delete a Pinterest pin',
    inputSchema: {
      type: 'object',
      properties: { pinId: { type: 'string', description: 'Pinterest pin ID to delete' } },
      required: ['pinId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_analytics',
    description: 'Get analytics for the current Pinterest user account',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        endDate: { type: 'string', description: 'End date in YYYY-MM-DD format' },
      },
      required: ['startDate', 'endDate'],
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
    case 'get_current_user':
      return toolOk(await pinterestFetch('/user_account', token));

    case 'list_boards':
      return toolOk(await pinterestFetch('/boards?page_size=25&privacy=PUBLIC', token));

    case 'get_board': {
      validateRequired(args, ['boardId']);
      return toolOk(await pinterestFetch(`/boards/${args.boardId}`, token));
    }

    case 'create_board': {
      validateRequired(args, ['name']);
      const body: Record<string, unknown> = { name: args.name };
      if (args.description !== undefined) body.description = args.description;
      if (args.privacy !== undefined) body.privacy = args.privacy;
      return toolOk(await pinterestFetch('/boards', token, {
        method: 'POST',
        body: JSON.stringify(body),
      }));
    }

    case 'update_board': {
      validateRequired(args, ['boardId']);
      const { boardId, ...rest } = args;
      return toolOk(await pinterestFetch(`/boards/${boardId}`, token, {
        method: 'PATCH',
        body: JSON.stringify(rest),
      }));
    }

    case 'delete_board': {
      validateRequired(args, ['boardId']);
      return toolOk(await pinterestFetch(`/boards/${args.boardId}`, token, { method: 'DELETE' }));
    }

    case 'list_pins': {
      validateRequired(args, ['boardId']);
      return toolOk(await pinterestFetch(`/boards/${args.boardId}/pins?page_size=25`, token));
    }

    case 'get_pin': {
      validateRequired(args, ['pinId']);
      return toolOk(await pinterestFetch(`/pins/${args.pinId}`, token));
    }

    case 'create_pin': {
      validateRequired(args, ['board_id', 'image_url']);
      const body: Record<string, unknown> = {
        board_id: args.board_id,
        media_source: { source_type: 'image_url', url: args.image_url },
      };
      if (args.title !== undefined) body.title = args.title;
      if (args.description !== undefined) body.description = args.description;
      if (args.link !== undefined) body.link = args.link;
      return toolOk(await pinterestFetch('/pins', token, {
        method: 'POST',
        body: JSON.stringify(body),
      }));
    }

    case 'update_pin': {
      validateRequired(args, ['pinId']);
      const { pinId, ...rest } = args;
      return toolOk(await pinterestFetch(`/pins/${pinId}`, token, {
        method: 'PATCH',
        body: JSON.stringify(rest),
      }));
    }

    case 'delete_pin': {
      validateRequired(args, ['pinId']);
      return toolOk(await pinterestFetch(`/pins/${args.pinId}`, token, { method: 'DELETE' }));
    }

    case 'get_analytics': {
      validateRequired(args, ['startDate', 'endDate']);
      const path = `/user_account/analytics?start_date=${args.startDate}&end_date=${args.endDate}&metric_types=IMPRESSION,ENGAGEMENTS`;
      return toolOk(await pinterestFetch(path, token));
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
      serverInfo: { name: 'mcp-pinterest', version: '1.0.0' },
    });
  }

  if (body.method === 'tools/list') {
    return rpcOk(id, { tools: TOOLS });
  }

  if (body.method === 'tools/call') {
    const token = getApiKey(request);
    if (!token) return rpcErr(id, -32001, 'Missing required secret: PINTEREST_ACCESS_TOKEN');

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
      return new Response(JSON.stringify({ status: 'ok', service: 'mcp-pinterest' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    return handleMcp(request);
  },
};
