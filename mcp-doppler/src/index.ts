/**
 * Doppler MCP Worker
 * Implements MCP protocol over HTTP for Doppler secrets management.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: DOPPLER_SERVICE_TOKEN → header: X-Mcp-Secret-DOPPLER-SERVICE-TOKEN
 */

const API_BASE = 'https://api.doppler.com/v3';

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
  return request.headers.get('X-Mcp-Secret-DOPPLER-SERVICE-TOKEN');
}

async function apiGet(path: string, apiKey: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (res.status === 401) throw new Error('Invalid DOPPLER_SERVICE_TOKEN — check your token has the right permissions');
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('Invalid DOPPLER_SERVICE_TOKEN — check your token has the right permissions');
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiDelete(path: string, apiKey: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error('Invalid DOPPLER_SERVICE_TOKEN — check your token has the right permissions');
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  // Some DELETE endpoints return empty 200
  const text = await res.text();
  if (!text) return { deleted: true };
  try {
    return JSON.parse(text);
  } catch {
    return { deleted: true };
  }
}

const TOOLS = [
  // --- Auth / Workplace ---
  {
    name: '_ping',
    description: 'Verify Doppler credentials with a lightweight auth check. Returns the workplace name. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_workplace',
    description: 'Get Doppler workplace details including name, billing email, and security policies.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  // --- Projects ---
  {
    name: 'list_projects',
    description: 'List all projects in the Doppler workplace.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_project',
    description: 'Get details of a specific Doppler project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug (e.g. "my-backend")' },
      },
      required: ['project'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_project',
    description: 'Create a new Doppler project.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name / slug' },
        description: { type: 'string', description: 'Optional project description' },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_project',
    description: 'Delete a Doppler project. This is irreversible and removes all configs and secrets inside.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug to delete' },
      },
      required: ['project'],
    },
    annotations: { readOnlyHint: false },
  },
  // --- Environments ---
  {
    name: 'list_environments',
    description: 'List all environments for a Doppler project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
      },
      required: ['project'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_environment',
    description: 'Get details of a specific environment within a Doppler project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
        id: { type: 'string', description: 'Environment slug (e.g. "production", "staging", "dev")' },
      },
      required: ['project', 'id'],
    },
    annotations: { readOnlyHint: true },
  },
  // --- Configs ---
  {
    name: 'list_configs',
    description: 'List all configs (branches/environments) in a Doppler project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
      },
      required: ['project'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_config',
    description: 'Get details of a specific config in a Doppler project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
        config: { type: 'string', description: 'Config name (e.g. "prd", "stg", "dev")' },
      },
      required: ['project', 'config'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'clone_config',
    description: 'Clone an existing Doppler config into a new config with a different name.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
        config: { type: 'string', description: 'Source config name to clone from' },
        name: { type: 'string', description: 'Name for the new cloned config' },
      },
      required: ['project', 'config', 'name'],
    },
    annotations: { readOnlyHint: false },
  },
  // --- Secrets ---
  {
    name: 'list_secrets',
    description: 'List all secret names and their values in a Doppler config.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
        config: { type: 'string', description: 'Config name (e.g. "prd")' },
      },
      required: ['project', 'config'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_secret',
    description: 'Get a single secret by name from a Doppler config, including its raw and computed value.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
        config: { type: 'string', description: 'Config name' },
        name: { type: 'string', description: 'Secret name (e.g. "DATABASE_URL")' },
      },
      required: ['project', 'config', 'name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'set_secret',
    description: 'Set one or more secrets in a Doppler config. Pass secrets as a key-value object.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
        config: { type: 'string', description: 'Config name' },
        secrets: {
          type: 'object',
          description: 'Key-value pairs to set (e.g. {"DATABASE_URL": "postgres://..."})',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['project', 'config', 'secrets'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_secret',
    description: 'Delete a single secret by name from a Doppler config.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
        config: { type: 'string', description: 'Config name' },
        name: { type: 'string', description: 'Secret name to delete' },
      },
      required: ['project', 'config', 'name'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'download_secrets',
    description: 'Download all secrets from a Doppler config as a JSON object — useful for bulk export or comparison.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
        config: { type: 'string', description: 'Config name' },
      },
      required: ['project', 'config'],
    },
    annotations: { readOnlyHint: true },
  },
  // --- Service Tokens ---
  {
    name: 'list_service_tokens',
    description: 'List all service tokens for a Doppler config.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
        config: { type: 'string', description: 'Config name' },
      },
      required: ['project', 'config'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_service_token',
    description: 'Create a new service token for a Doppler config with read or read/write access.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
        config: { type: 'string', description: 'Config name' },
        name: { type: 'string', description: 'Token name / label' },
        access: {
          type: 'string',
          enum: ['read', 'read/write'],
          description: 'Token access level: "read" or "read/write"',
        },
      },
      required: ['project', 'config', 'name', 'access'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'revoke_service_token',
    description: 'Revoke (delete) a service token from a Doppler config by its slug.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
        config: { type: 'string', description: 'Config name' },
        slug: { type: 'string', description: 'Service token slug to revoke' },
      },
      required: ['project', 'config', 'slug'],
    },
    annotations: { readOnlyHint: false },
  },
  // --- Activity Logs ---
  {
    name: 'get_activity_logs',
    description: 'Get recent activity logs for a Doppler project and config (last 20 events).',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project slug' },
        config: { type: 'string', description: 'Config name' },
      },
      required: ['project', 'config'],
    },
    annotations: { readOnlyHint: true },
  },
];

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
  switch (name) {
    case '_ping': {
      const data = await apiGet('/workplace', apiKey) as { workplace?: { name?: string } };
      return { ok: true, workplace: data?.workplace?.name ?? 'unknown' };
    }

    case 'get_workplace': {
      return apiGet('/workplace', apiKey);
    }

    case 'list_projects': {
      return apiGet('/projects', apiKey);
    }

    case 'get_project': {
      validateRequired(args, ['project']);
      return apiGet(`/projects/${String(args.project)}`, apiKey);
    }

    case 'create_project': {
      validateRequired(args, ['name']);
      const body: Record<string, unknown> = { name: args.name };
      if (args.description) body.description = args.description;
      return apiPost('/projects', apiKey, body);
    }

    case 'delete_project': {
      validateRequired(args, ['project']);
      return apiDelete(`/projects/${String(args.project)}`, apiKey);
    }

    case 'list_environments': {
      validateRequired(args, ['project']);
      return apiGet('/environments', apiKey, { project: String(args.project) });
    }

    case 'get_environment': {
      validateRequired(args, ['project', 'id']);
      return apiGet('/environments/environment', apiKey, {
        project: String(args.project),
        id: String(args.id),
      });
    }

    case 'list_configs': {
      validateRequired(args, ['project']);
      return apiGet('/configs', apiKey, { project: String(args.project) });
    }

    case 'get_config': {
      validateRequired(args, ['project', 'config']);
      return apiGet('/configs/config', apiKey, {
        project: String(args.project),
        config: String(args.config),
      });
    }

    case 'clone_config': {
      validateRequired(args, ['project', 'config', 'name']);
      return apiPost('/configs/config/clone', apiKey, {
        project: args.project,
        config: args.config,
        name: args.name,
      });
    }

    case 'list_secrets': {
      validateRequired(args, ['project', 'config']);
      return apiGet('/configs/config/secrets', apiKey, {
        project: String(args.project),
        config: String(args.config),
      });
    }

    case 'get_secret': {
      validateRequired(args, ['project', 'config', 'name']);
      return apiGet('/configs/config/secret', apiKey, {
        project: String(args.project),
        config: String(args.config),
        name: String(args.name),
      });
    }

    case 'set_secret': {
      validateRequired(args, ['project', 'config', 'secrets']);
      return apiPost('/configs/config/secrets', apiKey, {
        project: args.project,
        config: args.config,
        secrets: args.secrets,
      });
    }

    case 'delete_secret': {
      validateRequired(args, ['project', 'config', 'name']);
      return apiDelete('/configs/config/secret', apiKey, {
        project: args.project,
        config: args.config,
        name: args.name,
      });
    }

    case 'download_secrets': {
      validateRequired(args, ['project', 'config']);
      return apiGet('/configs/config/secrets/download', apiKey, {
        project: String(args.project),
        config: String(args.config),
        format: 'json',
      });
    }

    case 'list_service_tokens': {
      validateRequired(args, ['project', 'config']);
      return apiGet('/configs/config/tokens', apiKey, {
        project: String(args.project),
        config: String(args.config),
      });
    }

    case 'create_service_token': {
      validateRequired(args, ['project', 'config', 'name', 'access']);
      return apiPost('/configs/config/tokens', apiKey, {
        project: args.project,
        config: args.config,
        name: args.name,
        access: args.access,
      });
    }

    case 'revoke_service_token': {
      validateRequired(args, ['project', 'config', 'slug']);
      return apiDelete('/configs/config/token', apiKey, {
        project: args.project,
        config: args.config,
        slug: args.slug,
      });
    }

    case 'get_activity_logs': {
      validateRequired(args, ['project', 'config']);
      return apiGet('/logs', apiKey, {
        project: String(args.project),
        config: String(args.config),
        per_page: '20',
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-doppler', version: '1.0.0' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
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
        serverInfo: { name: 'mcp-doppler', version: '1.0.0' },
      });
    }
    if (method === 'tools/list') {
      return rpcOk(id, { tools: TOOLS });
    }
    if (method === 'tools/call') {
      const apiKey = getApiKey(request);
      if (!apiKey) return rpcErr(id, -32001, 'Missing API key: DOPPLER_SERVICE_TOKEN not found in request headers');
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
