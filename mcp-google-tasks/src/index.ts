/**
 * Google Tasks MCP Worker
 * Implements MCP protocol over HTTP for Google Tasks API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: GOOGLE_TASKS_ACCESS_TOKEN → header: X-Mcp-Secret-GOOGLE-TASKS-ACCESS-TOKEN
 */

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';

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
  return request.headers.get('X-Mcp-Secret-GOOGLE-TASKS-ACCESS-TOKEN');
}

async function apiFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${TASKS_API}${path}`;
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
    throw new Error(`Google Tasks API error ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Google Tasks credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'list_task_lists',
    description: 'List all task lists for the authenticated user',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_task_list',
    description: 'Get a specific task list by ID',
    inputSchema: {
      type: 'object',
      properties: {
        task_list_id: { type: 'string', description: 'Task list ID' },
      },
      required: ['task_list_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_task_list',
    description: 'Create a new task list',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the new task list' },
      },
      required: ['title'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_task_list',
    description: 'Update a task list title',
    inputSchema: {
      type: 'object',
      properties: {
        task_list_id: { type: 'string', description: 'Task list ID' },
        title: { type: 'string', description: 'New title for the task list' },
      },
      required: ['task_list_id', 'title'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_task_list',
    description: 'Delete a task list',
    inputSchema: {
      type: 'object',
      properties: {
        task_list_id: { type: 'string', description: 'Task list ID to delete' },
      },
      required: ['task_list_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_tasks',
    description: 'List tasks in a task list',
    inputSchema: {
      type: 'object',
      properties: {
        task_list_id: { type: 'string', description: 'Task list ID' },
        show_completed: { type: 'boolean', description: 'Include completed tasks (default false)' },
      },
      required: ['task_list_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_task',
    description: 'Get a specific task',
    inputSchema: {
      type: 'object',
      properties: {
        task_list_id: { type: 'string', description: 'Task list ID' },
        task_id: { type: 'string', description: 'Task ID' },
      },
      required: ['task_list_id', 'task_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_task',
    description: 'Create a new task in a task list',
    inputSchema: {
      type: 'object',
      properties: {
        task_list_id: { type: 'string', description: 'Task list ID' },
        title: { type: 'string', description: 'Task title' },
        notes: { type: 'string', description: 'Task notes (optional)' },
        due: { type: 'string', description: 'Due date in RFC3339 format (optional)' },
        status: { type: 'string', enum: ['needsAction', 'completed'], description: 'Task status (optional)' },
      },
      required: ['task_list_id', 'title'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_task',
    description: 'Update an existing task',
    inputSchema: {
      type: 'object',
      properties: {
        task_list_id: { type: 'string', description: 'Task list ID' },
        task_id: { type: 'string', description: 'Task ID' },
        title: { type: 'string', description: 'New title (optional)' },
        notes: { type: 'string', description: 'New notes (optional)' },
        due: { type: 'string', description: 'New due date in RFC3339 format (optional)' },
        status: { type: 'string', enum: ['needsAction', 'completed'], description: 'New status (optional)' },
      },
      required: ['task_list_id', 'task_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as completed',
    inputSchema: {
      type: 'object',
      properties: {
        task_list_id: { type: 'string', description: 'Task list ID' },
        task_id: { type: 'string', description: 'Task ID to complete' },
      },
      required: ['task_list_id', 'task_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_task',
    description: 'Delete a task',
    inputSchema: {
      type: 'object',
      properties: {
        task_list_id: { type: 'string', description: 'Task list ID' },
        task_id: { type: 'string', description: 'Task ID to delete' },
      },
      required: ['task_list_id', 'task_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'clear_completed_tasks',
    description: 'Clear all completed tasks from a task list',
    inputSchema: {
      type: 'object',
      properties: {
        task_list_id: { type: 'string', description: 'Task list ID' },
      },
      required: ['task_list_id'],
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

    case 'list_task_lists':
      return apiFetch('/users/@me/lists?maxResults=100', token);

    case 'get_task_list': {
      validateRequired(args, ['task_list_id']);
      return apiFetch(`/users/@me/lists/${args.task_list_id}`, token);
    }

    case 'create_task_list': {
      validateRequired(args, ['title']);
      return apiFetch('/users/@me/lists', token, {
        method: 'POST',
        body: JSON.stringify({ title: args.title }),
      });
    }

    case 'update_task_list': {
      validateRequired(args, ['task_list_id', 'title']);
      return apiFetch(`/users/@me/lists/${args.task_list_id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ title: args.title }),
      });
    }

    case 'delete_task_list': {
      validateRequired(args, ['task_list_id']);
      await apiFetch(`/users/@me/lists/${args.task_list_id}`, token, { method: 'DELETE' });
      return { deleted: true };
    }

    case 'list_tasks': {
      validateRequired(args, ['task_list_id']);
      const showCompleted = args.show_completed === true ? 'true' : 'false';
      return apiFetch(`/lists/${args.task_list_id}/tasks?showCompleted=${showCompleted}&maxResults=100`, token);
    }

    case 'get_task': {
      validateRequired(args, ['task_list_id', 'task_id']);
      return apiFetch(`/lists/${args.task_list_id}/tasks/${args.task_id}`, token);
    }

    case 'create_task': {
      validateRequired(args, ['task_list_id', 'title']);
      const body: Record<string, unknown> = { title: args.title };
      if (args.notes) body.notes = args.notes;
      if (args.due) body.due = args.due;
      if (args.status) body.status = args.status;
      return apiFetch(`/lists/${args.task_list_id}/tasks`, token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    case 'update_task': {
      validateRequired(args, ['task_list_id', 'task_id']);
      const body: Record<string, unknown> = {};
      if (args.title) body.title = args.title;
      if (args.notes) body.notes = args.notes;
      if (args.due) body.due = args.due;
      if (args.status) body.status = args.status;
      return apiFetch(`/lists/${args.task_list_id}/tasks/${args.task_id}`, token, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    }

    case 'complete_task': {
      validateRequired(args, ['task_list_id', 'task_id']);
      return apiFetch(`/lists/${args.task_list_id}/tasks/${args.task_id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', completed: new Date().toISOString() }),
      });
    }

    case 'delete_task': {
      validateRequired(args, ['task_list_id', 'task_id']);
      await apiFetch(`/lists/${args.task_list_id}/tasks/${args.task_id}`, token, { method: 'DELETE' });
      return { deleted: true };
    }

    case 'clear_completed_tasks': {
      validateRequired(args, ['task_list_id']);
      await apiFetch(`/lists/${args.task_list_id}/clear`, token, { method: 'POST' });
      return { cleared: true };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-google-tasks', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-google-tasks', version: '1.0.0' },
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
