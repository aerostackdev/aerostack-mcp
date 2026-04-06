/**
 * Wrike MCP Worker
 * Implements MCP protocol over HTTP for Wrike API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: WRIKE_ACCESS_TOKEN → header: X-Mcp-Secret-WRIKE-ACCESS-TOKEN
 */

const WRIKE_API = 'https://www.wrike.com/api/v4';

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
  return request.headers.get('X-Mcp-Secret-WRIKE-ACCESS-TOKEN');
}

async function apiFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${WRIKE_API}${path}`;
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
    throw new Error(`Wrike API error ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Wrike credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'get_current_user',
    description: 'Get the current authenticated Wrike user',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_folders',
    description: 'List all folders and projects in the account',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_folder',
    description: 'Get a specific folder by ID',
    inputSchema: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', description: 'Folder ID' },
      },
      required: ['folder_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_folder',
    description: 'Create a new folder inside a parent folder',
    inputSchema: {
      type: 'object',
      properties: {
        parent_folder_id: { type: 'string', description: 'Parent folder ID' },
        title: { type: 'string', description: 'Folder title' },
        description: { type: 'string', description: 'Folder description (optional)' },
      },
      required: ['parent_folder_id', 'title'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_tasks',
    description: 'List tasks in a folder',
    inputSchema: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', description: 'Folder ID' },
        status: { type: 'string', description: 'Filter by status (Active, Completed, Deferred, Cancelled) (optional)' },
      },
      required: ['folder_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_task',
    description: 'Get a specific task by ID',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
      },
      required: ['task_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_task',
    description: 'Create a new task in a folder',
    inputSchema: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', description: 'Folder ID to create task in' },
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description (optional)' },
        status: { type: 'string', enum: ['Active', 'Completed', 'Deferred', 'Cancelled'], description: 'Task status (optional)' },
        importance: { type: 'string', enum: ['High', 'Normal', 'Low'], description: 'Task importance (optional)' },
      },
      required: ['folder_id', 'title'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_task',
    description: 'Update an existing task',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
        title: { type: 'string', description: 'New title (optional)' },
        status: { type: 'string', enum: ['Active', 'Completed', 'Deferred', 'Cancelled'], description: 'New status (optional)' },
        importance: { type: 'string', enum: ['High', 'Normal', 'Low'], description: 'New importance (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
      },
      required: ['task_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_task',
    description: 'Delete a task',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to delete' },
      },
      required: ['task_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_contacts',
    description: 'List all contacts in the account',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_contact',
    description: 'Get a specific contact by ID',
    inputSchema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string', description: 'Contact ID' },
      },
      required: ['contact_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_comments',
    description: 'List comments on a task',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
      },
      required: ['task_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_comment',
    description: 'Add a comment to a task',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
        text: { type: 'string', description: 'Comment text' },
      },
      required: ['task_id', 'text'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_timelogs',
    description: 'List time logs for a task',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
      },
      required: ['task_id'],
    },
    annotations: { readOnlyHint: true },
  },
];

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
  switch (name) {
    case '_ping': {
      await apiFetch('/contacts?me=true', token);
      return { content: [{ type: 'text', text: 'Connected to Wrike' }] };
    }

    case 'get_current_user':
      return apiFetch('/contacts?me=true', token);

    case 'list_folders':
      return apiFetch('/folders', token);

    case 'get_folder': {
      validateRequired(args, ['folder_id']);
      return apiFetch(`/folders/${args.folder_id}`, token);
    }

    case 'create_folder': {
      validateRequired(args, ['parent_folder_id', 'title']);
      const body: Record<string, unknown> = { title: args.title };
      if (args.description) body.description = args.description;
      return apiFetch(`/folders/${args.parent_folder_id}/folders`, token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    case 'list_tasks': {
      validateRequired(args, ['folder_id']);
      let path = `/folders/${args.folder_id}/tasks?fields=[description,briefDescription]`;
      if (args.status) path += `&status=${args.status}`;
      return apiFetch(path, token);
    }

    case 'get_task': {
      validateRequired(args, ['task_id']);
      return apiFetch(`/tasks/${args.task_id}`, token);
    }

    case 'create_task': {
      validateRequired(args, ['folder_id', 'title']);
      const body: Record<string, unknown> = { title: args.title };
      if (args.description) body.description = args.description;
      if (args.status) body.status = args.status;
      if (args.importance) body.importance = args.importance;
      return apiFetch(`/folders/${args.folder_id}/tasks`, token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    case 'update_task': {
      validateRequired(args, ['task_id']);
      const body: Record<string, unknown> = {};
      if (args.title) body.title = args.title;
      if (args.status) body.status = args.status;
      if (args.importance) body.importance = args.importance;
      if (args.description) body.description = args.description;
      return apiFetch(`/tasks/${args.task_id}`, token, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    }

    case 'delete_task': {
      validateRequired(args, ['task_id']);
      await apiFetch(`/tasks/${args.task_id}`, token, { method: 'DELETE' });
      return { deleted: true };
    }

    case 'list_contacts':
      return apiFetch('/contacts?limit=100', token);

    case 'get_contact': {
      validateRequired(args, ['contact_id']);
      return apiFetch(`/contacts/${args.contact_id}`, token);
    }

    case 'list_comments': {
      validateRequired(args, ['task_id']);
      return apiFetch(`/tasks/${args.task_id}/comments`, token);
    }

    case 'create_comment': {
      validateRequired(args, ['task_id', 'text']);
      return apiFetch(`/tasks/${args.task_id}/comments`, token, {
        method: 'POST',
        body: JSON.stringify({ text: args.text }),
      });
    }

    case 'list_timelogs': {
      validateRequired(args, ['task_id']);
      return apiFetch(`/tasks/${args.task_id}/timelogs`, token);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-wrike', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-wrike', version: '1.0.0' },
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
