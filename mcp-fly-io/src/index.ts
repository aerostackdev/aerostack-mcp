/**
 * Fly.io MCP Worker
 * Implements MCP protocol over HTTP for Fly.io Machines API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: FLY_API_TOKEN → header: X-Mcp-Secret-FLY-API-TOKEN
 */

const API_BASE = 'https://api.machines.dev/v1';

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
  return request.headers.get('X-Mcp-Secret-FLY-API-TOKEN');
}

async function apiGet(path: string, apiKey: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiDelete(path: string, apiKey: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return { deleted: true };
}

const TOOLS = [
  {
    name: '_ping',
    description: 'Verify Fly.io credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_apps',
    description: 'List all Fly.io apps for an organization',
    inputSchema: {
      type: 'object',
      properties: {
        org_slug: { type: 'string', description: 'Organization slug' },
      },
      required: ['org_slug'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_app',
    description: 'Get details of a specific Fly.io app',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App name' },
      },
      required: ['app_name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_app',
    description: 'Create a new Fly.io app',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App name' },
        org_slug: { type: 'string', description: 'Organization slug' },
        network: { type: 'string', description: 'Network name for the app' },
      },
      required: ['app_name', 'org_slug'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_app',
    description: 'Delete a Fly.io app',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App name to delete' },
      },
      required: ['app_name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_machines',
    description: 'List all machines for a Fly.io app',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App name' },
      },
      required: ['app_name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_machine',
    description: 'Get details of a specific machine',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App name' },
        machine_id: { type: 'string', description: 'Machine ID' },
      },
      required: ['app_name', 'machine_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_machine',
    description: 'Create a new machine for a Fly.io app',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App name' },
        image: { type: 'string', description: 'Docker image to run' },
        name: { type: 'string', description: 'Machine name' },
        region: { type: 'string', description: 'Region to deploy in (e.g. iad, lhr)' },
        env: { type: 'object', description: 'Environment variables as key-value pairs' },
      },
      required: ['app_name', 'image'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'start_machine',
    description: 'Start a stopped Fly.io machine',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App name' },
        machine_id: { type: 'string', description: 'Machine ID' },
      },
      required: ['app_name', 'machine_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'stop_machine',
    description: 'Stop a running Fly.io machine',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App name' },
        machine_id: { type: 'string', description: 'Machine ID' },
        signal: { type: 'string', description: 'Signal to send (default: SIGTERM)' },
        timeout: { type: 'number', description: 'Timeout in seconds before force kill' },
      },
      required: ['app_name', 'machine_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'restart_machine',
    description: 'Restart a Fly.io machine',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App name' },
        machine_id: { type: 'string', description: 'Machine ID' },
      },
      required: ['app_name', 'machine_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_machine',
    description: 'Delete a Fly.io machine',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App name' },
        machine_id: { type: 'string', description: 'Machine ID' },
        force: { type: 'boolean', description: 'Force delete even if running (default: true)' },
      },
      required: ['app_name', 'machine_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_machine_events',
    description: 'Get events for a specific Fly.io machine',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App name' },
        machine_id: { type: 'string', description: 'Machine ID' },
      },
      required: ['app_name', 'machine_id'],
    },
    annotations: { readOnlyHint: true },
  },
];

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
  switch (name) {
    case '_ping': {
      return apiGet('/apps', apiKey, { org_slug: '' });
    }
    case 'list_apps': {
      validateRequired(args, ['org_slug']);
      return apiGet('/apps', apiKey, { org_slug: String(args.org_slug) });
    }
    case 'get_app': {
      validateRequired(args, ['app_name']);
      return apiGet(`/apps/${args.app_name}`, apiKey);
    }
    case 'create_app': {
      validateRequired(args, ['app_name', 'org_slug']);
      const body: Record<string, unknown> = {
        app_name: args.app_name,
        org_slug: args.org_slug,
      };
      if (args.network) body.network = args.network;
      return apiPost('/apps', apiKey, body);
    }
    case 'delete_app': {
      validateRequired(args, ['app_name']);
      return apiDelete(`/apps/${args.app_name}`, apiKey);
    }
    case 'list_machines': {
      validateRequired(args, ['app_name']);
      return apiGet(`/apps/${args.app_name}/machines`, apiKey);
    }
    case 'get_machine': {
      validateRequired(args, ['app_name', 'machine_id']);
      return apiGet(`/apps/${args.app_name}/machines/${args.machine_id}`, apiKey);
    }
    case 'create_machine': {
      validateRequired(args, ['app_name', 'image']);
      const config: Record<string, unknown> = { image: args.image };
      if (args.env) config.env = args.env;
      const body: Record<string, unknown> = { config };
      if (args.name) body.name = args.name;
      if (args.region) body.region = args.region;
      return apiPost(`/apps/${args.app_name}/machines`, apiKey, body);
    }
    case 'start_machine': {
      validateRequired(args, ['app_name', 'machine_id']);
      return apiPost(`/apps/${args.app_name}/machines/${args.machine_id}/start`, apiKey, {});
    }
    case 'stop_machine': {
      validateRequired(args, ['app_name', 'machine_id']);
      const body: Record<string, unknown> = {};
      if (args.signal) body.signal = args.signal;
      if (args.timeout) body.timeout = args.timeout;
      return apiPost(`/apps/${args.app_name}/machines/${args.machine_id}/stop`, apiKey, body);
    }
    case 'restart_machine': {
      validateRequired(args, ['app_name', 'machine_id']);
      return apiPost(`/apps/${args.app_name}/machines/${args.machine_id}/restart`, apiKey, {});
    }
    case 'delete_machine': {
      validateRequired(args, ['app_name', 'machine_id']);
      return apiDelete(`/apps/${args.app_name}/machines/${args.machine_id}`, apiKey, { force: 'true' });
    }
    case 'get_machine_events': {
      validateRequired(args, ['app_name', 'machine_id']);
      return apiGet(`/apps/${args.app_name}/machines/${args.machine_id}/events`, apiKey);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-fly-io', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-fly-io', version: '1.0.0' },
      });
    }
    if (method === 'tools/list') {
      return rpcOk(id, { tools: TOOLS });
    }
    if (method === 'tools/call') {
      const apiKey = getApiKey(request);
      if (!apiKey) return rpcErr(id, -32001, 'Missing API key');
      try {
        const result = await callTool(params?.name ?? '', (params?.arguments ?? {}) as Record<string, unknown>, apiKey);
        return rpcOk(id, toolOk(result));
      } catch (err) {
        return rpcErr(id, -32603, err instanceof Error ? err.message : 'Internal error');
      }
    }
    return rpcErr(id, -32601, 'Method not found');
  },
};
