/**
 * Toggl Track MCP Worker
 * Implements MCP protocol over HTTP for Toggl Track API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: TOGGL_API_TOKEN → header: X-Mcp-Secret-TOGGL-API-TOKEN
 */

const TOGGL_API = 'https://api.track.toggl.com/api/v9';
const TOGGL_REPORTS = 'https://api.track.toggl.com/reports/api/v3';

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
  return request.headers.get('X-Mcp-Secret-TOGGL-API-TOKEN');
}

function makeBasicAuth(apiToken: string): string {
  return `Basic ${btoa(apiToken + ':api_token')}`;
}

async function apiFetch(url: string, token: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': makeBasicAuth(token),
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Toggl API error ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Toggl credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'get_current_user',
    description: 'Get the current authenticated Toggl user',
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
    description: 'List active projects in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'number', description: 'Workspace ID' },
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
        workspace_id: { type: 'number', description: 'Workspace ID' },
        project_id: { type: 'number', description: 'Project ID' },
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
        workspace_id: { type: 'number', description: 'Workspace ID' },
        name: { type: 'string', description: 'Project name' },
        active: { type: 'boolean', description: 'Whether project is active (optional)' },
        color: { type: 'string', description: 'Project color hex (optional)' },
        client_id: { type: 'number', description: 'Client ID (optional)' },
      },
      required: ['workspace_id', 'name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_clients',
    description: 'List all clients in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'number', description: 'Workspace ID' },
      },
      required: ['workspace_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_time_entries',
    description: 'List time entries within a date range',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date in ISO8601 format (e.g. 2024-01-01T00:00:00Z)' },
        end_date: { type: 'string', description: 'End date in ISO8601 format (e.g. 2024-01-31T23:59:59Z)' },
      },
      required: ['start_date', 'end_date'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_current_timer',
    description: 'Get the currently running timer, if any',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_time_entry',
    description: 'Create a new time entry',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'number', description: 'Workspace ID' },
        start: { type: 'string', description: 'Start time in ISO8601 format' },
        duration: { type: 'number', description: 'Duration in seconds (-1 for running timer)' },
        description: { type: 'string', description: 'Time entry description (optional)' },
        project_id: { type: 'number', description: 'Project ID (optional)' },
      },
      required: ['workspace_id', 'start', 'duration'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'stop_timer',
    description: 'Stop a running time entry',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'number', description: 'Workspace ID' },
        time_entry_id: { type: 'number', description: 'Time entry ID to stop' },
      },
      required: ['workspace_id', 'time_entry_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_time_entry',
    description: 'Update an existing time entry',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'number', description: 'Workspace ID' },
        time_entry_id: { type: 'number', description: 'Time entry ID' },
        description: { type: 'string', description: 'New description (optional)' },
        project_id: { type: 'number', description: 'New project ID (optional)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags (optional)' },
        billable: { type: 'boolean', description: 'Billable flag (optional)' },
      },
      required: ['workspace_id', 'time_entry_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_time_entry',
    description: 'Delete a time entry',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'number', description: 'Workspace ID' },
        time_entry_id: { type: 'number', description: 'Time entry ID to delete' },
      },
      required: ['workspace_id', 'time_entry_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_summary_report',
    description: 'Get a summary report for a workspace over a date range',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'number', description: 'Workspace ID' },
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['workspace_id', 'start_date', 'end_date'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_tags',
    description: 'List all tags in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'number', description: 'Workspace ID' },
      },
      required: ['workspace_id'],
    },
    annotations: { readOnlyHint: true },
  },
];

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
  switch (name) {
    case '_ping': {
      // Call a lightweight read endpoint to verify credentials
      await apiFetch(`${TOGGL_API}/me`, token);
      return toolOk({ connected: true });
    }

    case 'get_current_user':
      return apiFetch(`${TOGGL_API}/me`, token);

    case 'list_workspaces':
      return apiFetch(`${TOGGL_API}/workspaces`, token);

    case 'list_projects': {
      validateRequired(args, ['workspace_id']);
      return apiFetch(`${TOGGL_API}/workspaces/${args.workspace_id}/projects?active=true`, token);
    }

    case 'get_project': {
      validateRequired(args, ['workspace_id', 'project_id']);
      return apiFetch(`${TOGGL_API}/workspaces/${args.workspace_id}/projects/${args.project_id}`, token);
    }

    case 'create_project': {
      validateRequired(args, ['workspace_id', 'name']);
      const body: Record<string, unknown> = { name: args.name };
      if (args.active !== undefined) body.active = args.active;
      if (args.color) body.color = args.color;
      if (args.client_id) body.client_id = args.client_id;
      return apiFetch(`${TOGGL_API}/workspaces/${args.workspace_id}/projects`, token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    case 'list_clients': {
      validateRequired(args, ['workspace_id']);
      return apiFetch(`${TOGGL_API}/workspaces/${args.workspace_id}/clients`, token);
    }

    case 'list_time_entries': {
      validateRequired(args, ['start_date', 'end_date']);
      return apiFetch(`${TOGGL_API}/me/time_entries?start_date=${args.start_date}&end_date=${args.end_date}`, token);
    }

    case 'get_current_timer':
      return apiFetch(`${TOGGL_API}/me/time_entries/current`, token);

    case 'create_time_entry': {
      validateRequired(args, ['workspace_id', 'start', 'duration']);
      const body: Record<string, unknown> = {
        start: args.start,
        duration: args.duration,
        workspace_id: args.workspace_id,
        created_with: 'MCP',
      };
      if (args.description) body.description = args.description;
      if (args.project_id) body.project_id = args.project_id;
      return apiFetch(`${TOGGL_API}/workspaces/${args.workspace_id}/time_entries`, token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }

    case 'stop_timer': {
      validateRequired(args, ['workspace_id', 'time_entry_id']);
      return apiFetch(`${TOGGL_API}/workspaces/${args.workspace_id}/time_entries/${args.time_entry_id}/stop`, token, {
        method: 'PATCH',
      });
    }

    case 'update_time_entry': {
      validateRequired(args, ['workspace_id', 'time_entry_id']);
      const body: Record<string, unknown> = {};
      if (args.description) body.description = args.description;
      if (args.project_id) body.project_id = args.project_id;
      if (args.tags) body.tags = args.tags;
      if (args.billable !== undefined) body.billable = args.billable;
      return apiFetch(`${TOGGL_API}/workspaces/${args.workspace_id}/time_entries/${args.time_entry_id}`, token, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    }

    case 'delete_time_entry': {
      validateRequired(args, ['workspace_id', 'time_entry_id']);
      await apiFetch(`${TOGGL_API}/workspaces/${args.workspace_id}/time_entries/${args.time_entry_id}`, token, {
        method: 'DELETE',
      });
      return { deleted: true };
    }

    case 'get_summary_report': {
      validateRequired(args, ['workspace_id', 'start_date', 'end_date']);
      return apiFetch(`${TOGGL_REPORTS}/workspace/${args.workspace_id}/summary/time_entries`, token, {
        method: 'POST',
        body: JSON.stringify({ start_date: args.start_date, end_date: args.end_date }),
      });
    }

    case 'list_tags': {
      validateRequired(args, ['workspace_id']);
      return apiFetch(`${TOGGL_API}/workspaces/${args.workspace_id}/tags`, token);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-toggl', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-toggl', version: '1.0.0' },
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
