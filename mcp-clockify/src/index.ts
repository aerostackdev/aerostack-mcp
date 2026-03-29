/**
 * Clockify MCP Worker
 * Implements MCP protocol over HTTP for Clockify API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: CLOCKIFY_API_KEY → header: X-Mcp-Secret-CLOCKIFY-API-KEY
 */

const CLOCKIFY_API = 'https://api.clockify.me/api/v1';
const CLOCKIFY_REPORTS = 'https://reports.api.clockify.me/v1';

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
  return request.headers.get('X-Mcp-Secret-CLOCKIFY-API-KEY');
}

async function apiFetch(url: string, apiKey: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clockify API error ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const TOOLS = [
  {
    name: 'get_current_user',
    description: 'Get the current authenticated Clockify user',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_workspaces',
    description: 'List all workspaces for the current user',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_projects',
    description: 'List projects in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
      },
      required: ['workspace_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_project',
    description: 'Get a specific project by ID',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Project ID' },
      },
      required: ['workspace_id', 'project_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_project',
    description: 'Create a new project in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        name: { type: 'string', description: 'Project name' },
        client_id: { type: 'string', description: 'Client ID (optional)' },
        color: { type: 'string', description: 'Color hex code (optional)' },
        billable: { type: 'boolean', description: 'Whether project is billable (optional)' },
      },
      required: ['workspace_id', 'name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_clients',
    description: 'List clients in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
      },
      required: ['workspace_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_time_entries',
    description: 'List time entries for a user in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        user_id: { type: 'string', description: 'User ID' },
      },
      required: ['workspace_id', 'user_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_time_entry',
    description: 'Get a specific time entry by ID',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        time_entry_id: { type: 'string', description: 'Time entry ID' },
      },
      required: ['workspace_id', 'time_entry_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_time_entry',
    description: 'Create a new time entry',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        start: { type: 'string', description: 'Start time in ISO8601 format' },
        end: { type: 'string', description: 'End time in ISO8601 format (optional, omit for running timer)' },
        description: { type: 'string', description: 'Description (optional)' },
        project_id: { type: 'string', description: 'Project ID (optional)' },
        task_id: { type: 'string', description: 'Task ID (optional)' },
        billable: { type: 'boolean', description: 'Billable flag (optional)' },
      },
      required: ['workspace_id', 'start'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_time_entry',
    description: 'Update an existing time entry',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        time_entry_id: { type: 'string', description: 'Time entry ID' },
        start: { type: 'string', description: 'Start time in ISO8601 format' },
        end: { type: 'string', description: 'End time in ISO8601 format' },
        description: { type: 'string', description: 'Description (optional)' },
        project_id: { type: 'string', description: 'Project ID (optional)' },
        billable: { type: 'boolean', description: 'Billable flag (optional)' },
      },
      required: ['workspace_id', 'time_entry_id', 'start', 'end'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_time_entry',
    description: 'Delete a time entry',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        time_entry_id: { type: 'string', description: 'Time entry ID to delete' },
      },
      required: ['workspace_id', 'time_entry_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_tasks',
    description: 'List tasks for a project',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Project ID' },
      },
      required: ['workspace_id', 'project_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_task',
    description: 'Create a new task for a project',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        project_id: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'Task name' },
        status: { type: 'string', enum: ['ACTIVE', 'DONE'], description: 'Task status (optional)' },
        estimate: { type: 'string', description: 'Estimated duration in ISO8601 duration format (optional)' },
        assignee_ids: { type: 'array', items: { type: 'string' }, description: 'Assignee user IDs (optional)' },
      },
      required: ['workspace_id', 'project_id', 'name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_summary_report',
    description: 'Get a summary report for a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        date_range_start: { type: 'string', description: 'Start date in ISO8601 format' },
        date_range_end: { type: 'string', description: 'End date in ISO8601 format' },
      },
      required: ['workspace_id', 'date_range_start', 'date_range_end'],
    },
    annotations: { readOnlyHint: true },
  },
];

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
  switch (name) {
    case 'get_current_user':
      return apiFetch(`${CLOCKIFY_API}/user`, apiKey);

    case 'list_workspaces':
      return apiFetch(`${CLOCKIFY_API}/workspaces`, apiKey);

    case 'list_projects': {
      validateRequired(args, ['workspace_id']);
      return apiFetch(`${CLOCKIFY_API}/workspaces/${args.workspace_id}/projects?page=1&page-size=50`, apiKey);
    }

    case 'get_project': {
      validateRequired(args, ['workspace_id', 'project_id']);
      return apiFetch(`${CLOCKIFY_API}/workspaces/${args.workspace_id}/projects/${args.project_id}`, apiKey);
    }

    case 'create_project': {
      validateRequired(args, ['workspace_id', 'name']);
      const body: Record<string, unknown> = { name: args.name };
      if (args.client_id) body.clientId = args.client_id;
      if (args.color) body.color = args.color;
      if (args.billable !== undefined) body.billable = args.billable;
      return apiFetch(`${CLOCKIFY_API}/workspaces/${args.workspace_id}/projects`, apiKey, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    case 'list_clients': {
      validateRequired(args, ['workspace_id']);
      return apiFetch(`${CLOCKIFY_API}/workspaces/${args.workspace_id}/clients?page=1&page-size=50`, apiKey);
    }

    case 'list_time_entries': {
      validateRequired(args, ['workspace_id', 'user_id']);
      return apiFetch(
        `${CLOCKIFY_API}/workspaces/${args.workspace_id}/user/${args.user_id}/time-entries?page=1&page-size=50`,
        apiKey,
      );
    }

    case 'get_time_entry': {
      validateRequired(args, ['workspace_id', 'time_entry_id']);
      return apiFetch(`${CLOCKIFY_API}/workspaces/${args.workspace_id}/time-entries/${args.time_entry_id}`, apiKey);
    }

    case 'create_time_entry': {
      validateRequired(args, ['workspace_id', 'start']);
      const body: Record<string, unknown> = { start: args.start };
      if (args.end) body.end = args.end;
      if (args.description) body.description = args.description;
      if (args.project_id) body.projectId = args.project_id;
      if (args.task_id) body.taskId = args.task_id;
      if (args.billable !== undefined) body.billable = args.billable;
      return apiFetch(`${CLOCKIFY_API}/workspaces/${args.workspace_id}/time-entries`, apiKey, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    case 'update_time_entry': {
      validateRequired(args, ['workspace_id', 'time_entry_id', 'start', 'end']);
      const body: Record<string, unknown> = { start: args.start, end: args.end };
      if (args.description) body.description = args.description;
      if (args.project_id) body.projectId = args.project_id;
      if (args.billable !== undefined) body.billable = args.billable;
      return apiFetch(`${CLOCKIFY_API}/workspaces/${args.workspace_id}/time-entries/${args.time_entry_id}`, apiKey, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    }

    case 'delete_time_entry': {
      validateRequired(args, ['workspace_id', 'time_entry_id']);
      await apiFetch(`${CLOCKIFY_API}/workspaces/${args.workspace_id}/time-entries/${args.time_entry_id}`, apiKey, {
        method: 'DELETE',
      });
      return { deleted: true };
    }

    case 'list_tasks': {
      validateRequired(args, ['workspace_id', 'project_id']);
      return apiFetch(
        `${CLOCKIFY_API}/workspaces/${args.workspace_id}/projects/${args.project_id}/tasks?page=1&page-size=50`,
        apiKey,
      );
    }

    case 'create_task': {
      validateRequired(args, ['workspace_id', 'project_id', 'name']);
      const body: Record<string, unknown> = { name: args.name };
      if (args.status) body.status = args.status;
      if (args.estimate) body.estimate = args.estimate;
      if (args.assignee_ids) body.assigneeIds = args.assignee_ids;
      return apiFetch(`${CLOCKIFY_API}/workspaces/${args.workspace_id}/projects/${args.project_id}/tasks`, apiKey, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    case 'get_summary_report': {
      validateRequired(args, ['workspace_id', 'date_range_start', 'date_range_end']);
      return apiFetch(`${CLOCKIFY_REPORTS}/workspaces/${args.workspace_id}/reports/summary`, apiKey, {
        method: 'POST',
        body: JSON.stringify({
          dateRangeStart: args.date_range_start,
          dateRangeEnd: args.date_range_end,
          summaryFilter: { groups: ['PROJECT'] },
        }),
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-clockify', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-clockify', version: '1.0.0' },
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
