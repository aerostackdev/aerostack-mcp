/**
 * LaunchDarkly MCP Worker
 * Implements MCP protocol over HTTP for LaunchDarkly API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: LAUNCHDARKLY_API_KEY → header: X-Mcp-Secret-LAUNCHDARKLY-API-KEY
 */

const API_BASE = 'https://app.launchdarkly.com/api/v2';

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
  return request.headers.get('X-Mcp-Secret-LAUNCHDARKLY-API-KEY');
}

async function apiGet(path: string, apiKey: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPatch(path: string, apiKey: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiDelete(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return { deleted: true };
}

const TOOLS = [
  {
    name: 'list_projects',
    description: 'List all LaunchDarkly projects',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_project',
    description: 'Get details of a specific LaunchDarkly project',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key' },
      },
      required: ['projectKey'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_feature_flags',
    description: 'List feature flags in a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key' },
        environmentKey: { type: 'string', description: 'Environment key to include status' },
      },
      required: ['projectKey'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_feature_flag',
    description: 'Get details of a specific feature flag',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key' },
        featureFlagKey: { type: 'string', description: 'Feature flag key' },
      },
      required: ['projectKey', 'featureFlagKey'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_feature_flag',
    description: 'Create a new feature flag',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key' },
        name: { type: 'string', description: 'Flag display name' },
        key: { type: 'string', description: 'Flag key (unique identifier)' },
        variations: { type: 'array', description: 'Flag variations array', items: { type: 'object' } },
        temporary: { type: 'boolean', description: 'Whether the flag is temporary' },
      },
      required: ['projectKey', 'name', 'key'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_feature_flag',
    description: 'Update a feature flag using JSON Patch operations',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key' },
        featureFlagKey: { type: 'string', description: 'Feature flag key' },
        patch: { type: 'array', description: 'JSON Patch operations array', items: { type: 'object' } },
      },
      required: ['projectKey', 'featureFlagKey', 'patch'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'toggle_feature_flag',
    description: 'Turn a feature flag on or off in a specific environment',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key' },
        featureFlagKey: { type: 'string', description: 'Feature flag key' },
        environmentKey: { type: 'string', description: 'Environment key' },
        enabled: { type: 'boolean', description: 'true to turn on, false to turn off' },
      },
      required: ['projectKey', 'featureFlagKey', 'environmentKey', 'enabled'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_feature_flag',
    description: 'Delete a feature flag',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key' },
        featureFlagKey: { type: 'string', description: 'Feature flag key to delete' },
      },
      required: ['projectKey', 'featureFlagKey'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_environments',
    description: 'List environments in a LaunchDarkly project',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key' },
      },
      required: ['projectKey'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_environment',
    description: 'Get details of a specific environment',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key' },
        environmentKey: { type: 'string', description: 'Environment key' },
      },
      required: ['projectKey', 'environmentKey'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_segments',
    description: 'List user segments in a project environment',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Project key' },
        environmentKey: { type: 'string', description: 'Environment key' },
      },
      required: ['projectKey', 'environmentKey'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_audit_log',
    description: 'Get the LaunchDarkly audit log',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of entries to return (default: 20)' },
        spec: { type: 'string', description: 'Filter specification' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_members',
    description: 'List all members in the LaunchDarkly account',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_member',
    description: 'Get details of a specific member',
    inputSchema: {
      type: 'object',
      properties: {
        memberId: { type: 'string', description: 'Member ID' },
      },
      required: ['memberId'],
    },
    annotations: { readOnlyHint: true },
  },
];

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
  switch (name) {
    case 'list_projects': {
      return apiGet('/projects', apiKey);
    }
    case 'get_project': {
      validateRequired(args, ['projectKey']);
      return apiGet(`/projects/${args.projectKey}`, apiKey);
    }
    case 'list_feature_flags': {
      validateRequired(args, ['projectKey']);
      const params: Record<string, string> = { summary: 'true' };
      if (args.environmentKey) params.env = String(args.environmentKey);
      return apiGet(`/flags/${args.projectKey}`, apiKey, params);
    }
    case 'get_feature_flag': {
      validateRequired(args, ['projectKey', 'featureFlagKey']);
      return apiGet(`/flags/${args.projectKey}/${args.featureFlagKey}`, apiKey);
    }
    case 'create_feature_flag': {
      validateRequired(args, ['projectKey', 'name', 'key']);
      const body: Record<string, unknown> = {
        name: args.name,
        key: args.key,
      };
      if (args.variations) body.variations = args.variations;
      if (args.temporary !== undefined) body.temporary = args.temporary;
      return apiPost(`/flags/${args.projectKey}`, apiKey, body);
    }
    case 'update_feature_flag': {
      validateRequired(args, ['projectKey', 'featureFlagKey', 'patch']);
      return apiPatch(`/flags/${args.projectKey}/${args.featureFlagKey}`, apiKey, args.patch);
    }
    case 'toggle_feature_flag': {
      validateRequired(args, ['projectKey', 'featureFlagKey', 'environmentKey', 'enabled']);
      const instruction = args.enabled ? [{ kind: 'turnFlagOn' }] : [{ kind: 'turnFlagOff' }];
      return apiPatch(`/flags/${args.projectKey}/${args.featureFlagKey}/environments/${args.environmentKey}`, apiKey, instruction);
    }
    case 'delete_feature_flag': {
      validateRequired(args, ['projectKey', 'featureFlagKey']);
      return apiDelete(`/flags/${args.projectKey}/${args.featureFlagKey}`, apiKey);
    }
    case 'list_environments': {
      validateRequired(args, ['projectKey']);
      return apiGet(`/projects/${args.projectKey}/environments`, apiKey);
    }
    case 'get_environment': {
      validateRequired(args, ['projectKey', 'environmentKey']);
      return apiGet(`/projects/${args.projectKey}/environments/${args.environmentKey}`, apiKey);
    }
    case 'list_segments': {
      validateRequired(args, ['projectKey', 'environmentKey']);
      return apiGet(`/segments/${args.projectKey}/${args.environmentKey}`, apiKey);
    }
    case 'get_audit_log': {
      const params: Record<string, string> = { limit: String(args.limit ?? 20) };
      if (args.spec) params.spec = String(args.spec);
      return apiGet('/auditlog', apiKey, params);
    }
    case 'list_members': {
      return apiGet('/members', apiKey);
    }
    case 'get_member': {
      validateRequired(args, ['memberId']);
      return apiGet(`/members/${args.memberId}`, apiKey);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-launchdarkly', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-launchdarkly', version: '1.0.0' },
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
