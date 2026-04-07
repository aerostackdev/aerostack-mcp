/**
 * Google Chat MCP Worker
 * Implements MCP protocol over HTTP for Google Chat API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: GOOGLE_ACCESS_TOKEN → header: X-Mcp-Secret-GOOGLE-ACCESS-TOKEN
 */

const CHAT_API = 'https://chat.googleapis.com/v1';

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
  return request.headers.get('X-Mcp-Secret-GOOGLE-ACCESS-TOKEN');
}

async function apiFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${CHAT_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Chat API error ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Google Chat credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'list_spaces',
    description: 'List Google Chat spaces the user is a member of',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_space',
    description: 'Get details of a specific space',
    inputSchema: {
      type: 'object',
      properties: {
        space_name: { type: 'string', description: 'Space resource name (e.g. spaces/XXXXX)' },
      },
      required: ['space_name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_messages',
    description: 'List messages in a space',
    inputSchema: {
      type: 'object',
      properties: {
        space_name: { type: 'string', description: 'Space resource name' },
        page_size: { type: 'number', description: 'Number of messages to return (default 25)' },
      },
      required: ['space_name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_message',
    description: 'Get a specific message',
    inputSchema: {
      type: 'object',
      properties: {
        space_name: { type: 'string', description: 'Space resource name' },
        message_id: { type: 'string', description: 'Message ID' },
      },
      required: ['space_name', 'message_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'send_message',
    description: 'Send a message to a space',
    inputSchema: {
      type: 'object',
      properties: {
        space_name: { type: 'string', description: 'Space resource name' },
        text: { type: 'string', description: 'Plain text message (optional)' },
      },
      required: ['space_name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_message',
    description: 'Update the text of a message',
    inputSchema: {
      type: 'object',
      properties: {
        space_name: { type: 'string', description: 'Space resource name' },
        message_id: { type: 'string', description: 'Message ID' },
        text: { type: 'string', description: 'New text content' },
      },
      required: ['space_name', 'message_id', 'text'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_message',
    description: 'Delete a message from a space',
    inputSchema: {
      type: 'object',
      properties: {
        space_name: { type: 'string', description: 'Space resource name' },
        message_id: { type: 'string', description: 'Message ID to delete' },
      },
      required: ['space_name', 'message_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_members',
    description: 'List members of a space',
    inputSchema: {
      type: 'object',
      properties: {
        space_name: { type: 'string', description: 'Space resource name' },
      },
      required: ['space_name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_member',
    description: 'Get a specific member of a space',
    inputSchema: {
      type: 'object',
      properties: {
        space_name: { type: 'string', description: 'Space resource name' },
        member_name: { type: 'string', description: 'Member resource name' },
      },
      required: ['space_name', 'member_name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_reaction',
    description: 'Add an emoji reaction to a message',
    inputSchema: {
      type: 'object',
      properties: {
        space_name: { type: 'string', description: 'Space resource name' },
        message_id: { type: 'string', description: 'Message ID' },
        emoji_unicode: { type: 'string', description: 'Unicode emoji codepoint (e.g. "1f44d" for thumbs up)' },
      },
      required: ['space_name', 'message_id', 'emoji_unicode'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_reactions',
    description: 'List reactions on a message',
    inputSchema: {
      type: 'object',
      properties: {
        space_name: { type: 'string', description: 'Space resource name' },
        message_id: { type: 'string', description: 'Message ID' },
      },
      required: ['space_name', 'message_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'delete_reaction',
    description: 'Delete a reaction from a message',
    inputSchema: {
      type: 'object',
      properties: {
        space_name: { type: 'string', description: 'Space resource name' },
        message_id: { type: 'string', description: 'Message ID' },
        reaction_name: { type: 'string', description: 'Reaction resource name' },
      },
      required: ['space_name', 'message_id', 'reaction_name'],
    },
    annotations: { readOnlyHint: false },
  },
];

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
  switch (name) {
    case '_ping': {
      // Call a lightweight read endpoint to verify credentials
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
      const data = await res.json() as { email?: string };
      return { connected: true, email: data.email ?? 'unknown' };
    }

    case 'list_spaces':
      return apiFetch('/spaces?pageSize=100', token);

    case 'get_space': {
      validateRequired(args, ['space_name']);
      return apiFetch(`/${args.space_name}`, token);
    }

    case 'list_messages': {
      validateRequired(args, ['space_name']);
      const pageSize = (args.page_size as number) ?? 25;
      return apiFetch(`/${args.space_name}/messages?pageSize=${pageSize}&orderBy=createTime desc`, token);
    }

    case 'get_message': {
      validateRequired(args, ['space_name', 'message_id']);
      return apiFetch(`/${args.space_name}/messages/${args.message_id}`, token);
    }

    case 'send_message': {
      validateRequired(args, ['space_name']);
      const body: Record<string, unknown> = {};
      if (args.text) body.text = args.text;
      return apiFetch(`/${args.space_name}/messages`, token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    case 'update_message': {
      validateRequired(args, ['space_name', 'message_id', 'text']);
      return apiFetch(`/${args.space_name}/messages/${args.message_id}?updateMask=text`, token, {
        method: 'PATCH',
        body: JSON.stringify({ text: args.text }),
      });
    }

    case 'delete_message': {
      validateRequired(args, ['space_name', 'message_id']);
      await apiFetch(`/${args.space_name}/messages/${args.message_id}`, token, { method: 'DELETE' });
      return { deleted: true };
    }

    case 'list_members': {
      validateRequired(args, ['space_name']);
      return apiFetch(`/${args.space_name}/members?pageSize=100`, token);
    }

    case 'get_member': {
      validateRequired(args, ['space_name', 'member_name']);
      return apiFetch(`/${args.space_name}/members/${args.member_name}`, token);
    }

    case 'create_reaction': {
      validateRequired(args, ['space_name', 'message_id', 'emoji_unicode']);
      return apiFetch(`/${args.space_name}/messages/${args.message_id}/reactions`, token, {
        method: 'POST',
        body: JSON.stringify({ emoji: { unicode: args.emoji_unicode } }),
      });
    }

    case 'list_reactions': {
      validateRequired(args, ['space_name', 'message_id']);
      return apiFetch(`/${args.space_name}/messages/${args.message_id}/reactions?pageSize=100`, token);
    }

    case 'delete_reaction': {
      validateRequired(args, ['space_name', 'message_id', 'reaction_name']);
      await apiFetch(`/${args.space_name}/messages/${args.message_id}/reactions/${args.reaction_name}`, token, {
        method: 'DELETE',
      });
      return { deleted: true };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-google-chat', version: '1.0.0' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    let body: {
      jsonrpc?: string;
      id?: string | number | null;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    try {
      body = await request.json();
    } catch {
      return rpcErr(null, -32700, 'Parse error');
    }

    const { id = null, method, params } = body;

    if (method === 'initialize') {
      return rpcOk(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mcp-google-chat', version: '1.0.0' },
      });
    }

    if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });

    if (method === 'tools/call') {
      const apiKey = getApiKey(request);
      if (!apiKey) return rpcErr(id, -32001, 'Missing API key');
      try {
        const result = await callTool(
          params?.name ?? '',
          (params?.arguments ?? {}) as Record<string, unknown>,
          apiKey,
        );
        return rpcOk(id, toolOk(result));
      } catch (err) {
        return rpcErr(id, -32603, err instanceof Error ? err.message : 'Internal error');
      }
    }

    return rpcErr(id, -32601, 'Method not found');
  },
};
