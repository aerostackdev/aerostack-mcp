/**
 * Trello MCP Worker
 * Implements MCP protocol over HTTP for Trello API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   TRELLO_API_KEY → header: X-Mcp-Secret-TRELLO-API-KEY
 *   TRELLO_TOKEN   → header: X-Mcp-Secret-TRELLO-TOKEN
 */

const API_BASE = 'https://api.trello.com/1';

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

interface TrelloSecrets {
  apiKey: string;
  token: string;
}

function getSecrets(request: Request): TrelloSecrets | null {
  const apiKey = request.headers.get('X-Mcp-Secret-TRELLO-API-KEY');
  const token = request.headers.get('X-Mcp-Secret-TRELLO-TOKEN');
  if (!apiKey || !token) return null;
  return { apiKey, token };
}

function buildUrl(path: string, secrets: TrelloSecrets, params?: Record<string, string>): string {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('key', secrets.apiKey);
  url.searchParams.set('token', secrets.token);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function apiGet(path: string, secrets: TrelloSecrets, params?: Record<string, string>): Promise<unknown> {
  const res = await fetch(buildUrl(path, secrets, params), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path: string, secrets: TrelloSecrets, bodyParams?: Record<string, unknown>): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('key', secrets.apiKey);
  url.searchParams.set('token', secrets.token);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyParams ?? {}),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPut(path: string, secrets: TrelloSecrets, bodyParams?: Record<string, unknown>): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('key', secrets.apiKey);
  url.searchParams.set('token', secrets.token);
  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyParams ?? {}),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiDelete(path: string, secrets: TrelloSecrets): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('key', secrets.apiKey);
  url.searchParams.set('token', secrets.token);
  const res = await fetch(url.toString(), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return { deleted: true };
}

const TOOLS = [
  {
    name: 'list_boards',
    description: 'List all boards for the authenticated Trello member',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_board',
    description: 'Get all details of a specific Trello board',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Board ID' },
      },
      required: ['boardId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_board',
    description: 'Create a new Trello board',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Board name' },
        desc: { type: 'string', description: 'Board description' },
        defaultLists: { type: 'boolean', description: 'Create default lists (To Do, Doing, Done)' },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_lists',
    description: 'List open lists on a Trello board',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Board ID' },
      },
      required: ['boardId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_list',
    description: 'Create a new list on a Trello board',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'List name' },
        idBoard: { type: 'string', description: 'Board ID to add the list to' },
        pos: { type: 'string', description: 'Position: top, bottom, or a positive number' },
      },
      required: ['name', 'idBoard'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'archive_list',
    description: 'Archive a Trello list',
    inputSchema: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'List ID to archive' },
      },
      required: ['listId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_cards',
    description: 'List cards in a Trello list',
    inputSchema: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'List ID' },
      },
      required: ['listId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_card',
    description: 'Get all details of a specific Trello card',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'Card ID' },
      },
      required: ['cardId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_card',
    description: 'Create a new card in a Trello list',
    inputSchema: {
      type: 'object',
      properties: {
        idList: { type: 'string', description: 'List ID to add the card to' },
        name: { type: 'string', description: 'Card name' },
        desc: { type: 'string', description: 'Card description' },
        due: { type: 'string', description: 'Due date (ISO 8601 format)' },
        pos: { type: 'string', description: 'Position: top, bottom, or a positive number' },
      },
      required: ['idList', 'name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_card',
    description: 'Update a Trello card',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'Card ID' },
        name: { type: 'string', description: 'New card name' },
        desc: { type: 'string', description: 'New card description' },
        due: { type: 'string', description: 'New due date (ISO 8601)' },
        closed: { type: 'boolean', description: 'Archive the card' },
        idList: { type: 'string', description: 'Move to a different list' },
      },
      required: ['cardId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_card',
    description: 'Delete a Trello card',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'Card ID to delete' },
      },
      required: ['cardId'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'add_card_comment',
    description: 'Add a comment to a Trello card',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'Card ID' },
        text: { type: 'string', description: 'Comment text' },
      },
      required: ['cardId', 'text'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_board_members',
    description: 'List members of a Trello board',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'Board ID' },
      },
      required: ['boardId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_card_attachments',
    description: 'List attachments on a Trello card',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'Card ID' },
      },
      required: ['cardId'],
    },
    annotations: { readOnlyHint: true },
  },
];

async function callTool(name: string, args: Record<string, unknown>, secrets: TrelloSecrets): Promise<unknown> {
  switch (name) {
    case 'list_boards': {
      return apiGet('/members/me/boards', secrets, { fields: 'id,name,desc,closed,url' });
    }
    case 'get_board': {
      validateRequired(args, ['boardId']);
      return apiGet(`/boards/${args.boardId}`, secrets, { fields: 'all' });
    }
    case 'create_board': {
      validateRequired(args, ['name']);
      const body: Record<string, unknown> = { name: args.name };
      if (args.desc) body.desc = args.desc;
      if (args.defaultLists !== undefined) body.defaultLists = args.defaultLists;
      return apiPost('/boards/', secrets, body);
    }
    case 'list_lists': {
      validateRequired(args, ['boardId']);
      return apiGet(`/boards/${args.boardId}/lists`, secrets, { filter: 'open' });
    }
    case 'create_list': {
      validateRequired(args, ['name', 'idBoard']);
      const body: Record<string, unknown> = { name: args.name, idBoard: args.idBoard };
      if (args.pos) body.pos = args.pos;
      return apiPost('/lists', secrets, body);
    }
    case 'archive_list': {
      validateRequired(args, ['listId']);
      return apiPut(`/lists/${args.listId}/closed`, secrets, { value: true });
    }
    case 'list_cards': {
      validateRequired(args, ['listId']);
      return apiGet(`/lists/${args.listId}/cards`, secrets, { fields: 'id,name,desc,due,labels,url' });
    }
    case 'get_card': {
      validateRequired(args, ['cardId']);
      return apiGet(`/cards/${args.cardId}`, secrets, { fields: 'all' });
    }
    case 'create_card': {
      validateRequired(args, ['idList', 'name']);
      const body: Record<string, unknown> = { idList: args.idList, name: args.name };
      if (args.desc) body.desc = args.desc;
      if (args.due) body.due = args.due;
      if (args.pos) body.pos = args.pos;
      return apiPost('/cards', secrets, body);
    }
    case 'update_card': {
      validateRequired(args, ['cardId']);
      const body: Record<string, unknown> = {};
      if (args.name) body.name = args.name;
      if (args.desc) body.desc = args.desc;
      if (args.due) body.due = args.due;
      if (args.closed !== undefined) body.closed = args.closed;
      if (args.idList) body.idList = args.idList;
      return apiPut(`/cards/${args.cardId}`, secrets, body);
    }
    case 'delete_card': {
      validateRequired(args, ['cardId']);
      return apiDelete(`/cards/${args.cardId}`, secrets);
    }
    case 'add_card_comment': {
      validateRequired(args, ['cardId', 'text']);
      return apiPost(`/cards/${args.cardId}/actions/comments`, secrets, { text: args.text });
    }
    case 'list_board_members': {
      validateRequired(args, ['boardId']);
      return apiGet(`/boards/${args.boardId}/members`, secrets);
    }
    case 'list_card_attachments': {
      validateRequired(args, ['cardId']);
      return apiGet(`/cards/${args.cardId}/attachments`, secrets);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-trello', version: '1.0.0' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    let body: { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
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
        serverInfo: { name: 'mcp-trello', version: '1.0.0' },
      });
    }
    if (method === 'tools/list') {
      return rpcOk(id, { tools: TOOLS });
    }
    if (method === 'tools/call') {
      const secrets = getSecrets(request);
      if (!secrets) return rpcErr(id, -32001, 'Missing API key: TRELLO_API_KEY and TRELLO_TOKEN are required');
      try {
        const result = await callTool(params?.name ?? '', (params?.arguments ?? {}) as Record<string, unknown>, secrets);
        return rpcOk(id, toolOk(result));
      } catch (err) {
        return rpcErr(id, -32603, err instanceof Error ? err.message : 'Internal error');
      }
    }
    return rpcErr(id, -32601, 'Method not found');
  },
};
