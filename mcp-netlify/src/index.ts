/**
 * Netlify MCP Worker
 * Implements MCP protocol over HTTP for Netlify API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: NETLIFY_TOKEN → header: X-Mcp-Secret-NETLIFY-TOKEN
 */

const API_BASE = 'https://api.netlify.com/api/v1';

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
  return request.headers.get('X-Mcp-Secret-NETLIFY-TOKEN');
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

async function apiPatch(path: string, apiKey: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiDelete(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return { deleted: true };
}

const TOOLS = [
  {
    name: 'list_sites',
    description: 'List all Netlify sites in your account',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filter: all, owner, guest (default: all)' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_site',
    description: 'Get details of a specific Netlify site',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', description: 'Site ID' },
      },
      required: ['site_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_site',
    description: 'Create a new Netlify site',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Site name (subdomain)' },
        custom_domain: { type: 'string', description: 'Custom domain for the site' },
      },
      required: [],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'update_site',
    description: 'Update a Netlify site',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', description: 'Site ID' },
        name: { type: 'string', description: 'New site name' },
        custom_domain: { type: 'string', description: 'New custom domain' },
      },
      required: ['site_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_site',
    description: 'Delete a Netlify site',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', description: 'Site ID to delete' },
      },
      required: ['site_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_deploys',
    description: 'List deploys for a Netlify site',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', description: 'Site ID' },
      },
      required: ['site_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_deploy',
    description: 'Get details of a specific deploy',
    inputSchema: {
      type: 'object',
      properties: {
        deploy_id: { type: 'string', description: 'Deploy ID' },
      },
      required: ['deploy_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'trigger_deploy',
    description: 'Trigger a new build/deploy for a site',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', description: 'Site ID' },
        clear_cache: { type: 'boolean', description: 'Clear cache before building' },
      },
      required: ['site_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_forms',
    description: 'List forms for a Netlify site',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', description: 'Site ID' },
      },
      required: ['site_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_form_submissions',
    description: 'List submissions for a specific form',
    inputSchema: {
      type: 'object',
      properties: {
        form_id: { type: 'string', description: 'Form ID' },
      },
      required: ['form_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_env_vars',
    description: 'List environment variables for a site',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account ID' },
        site_id: { type: 'string', description: 'Site ID' },
      },
      required: ['account_id', 'site_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'set_env_var',
    description: 'Set an environment variable for a site',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account ID' },
        key: { type: 'string', description: 'Environment variable key' },
        value: { type: 'string', description: 'Environment variable value' },
        context: { type: 'string', description: 'Deploy context: all, production, deploy-preview, branch-deploy' },
      },
      required: ['account_id', 'key', 'value'],
    },
    annotations: { readOnlyHint: false },
  },
];

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
  switch (name) {
    case 'list_sites': {
      const filter = args.filter ? String(args.filter) : 'all';
      return apiGet('/sites', apiKey, { filter });
    }
    case 'get_site': {
      validateRequired(args, ['site_id']);
      return apiGet(`/sites/${args.site_id}`, apiKey);
    }
    case 'create_site': {
      const body: Record<string, unknown> = {};
      if (args.name) body.name = args.name;
      if (args.custom_domain) body.custom_domain = args.custom_domain;
      return apiPost('/sites', apiKey, body);
    }
    case 'update_site': {
      validateRequired(args, ['site_id']);
      const body: Record<string, unknown> = {};
      if (args.name) body.name = args.name;
      if (args.custom_domain) body.custom_domain = args.custom_domain;
      return apiPatch(`/sites/${args.site_id}`, apiKey, body);
    }
    case 'delete_site': {
      validateRequired(args, ['site_id']);
      return apiDelete(`/sites/${args.site_id}`, apiKey);
    }
    case 'list_deploys': {
      validateRequired(args, ['site_id']);
      return apiGet(`/sites/${args.site_id}/deploys`, apiKey);
    }
    case 'get_deploy': {
      validateRequired(args, ['deploy_id']);
      return apiGet(`/deploys/${args.deploy_id}`, apiKey);
    }
    case 'trigger_deploy': {
      validateRequired(args, ['site_id']);
      const body: Record<string, unknown> = {};
      if (args.clear_cache !== undefined) body.clear_cache = args.clear_cache;
      return apiPost(`/sites/${args.site_id}/builds`, apiKey, body);
    }
    case 'list_forms': {
      validateRequired(args, ['site_id']);
      return apiGet(`/sites/${args.site_id}/forms`, apiKey);
    }
    case 'list_form_submissions': {
      validateRequired(args, ['form_id']);
      return apiGet(`/forms/${args.form_id}/submissions`, apiKey);
    }
    case 'list_env_vars': {
      validateRequired(args, ['account_id', 'site_id']);
      return apiGet(`/accounts/${args.account_id}/env`, apiKey, { site_id: String(args.site_id) });
    }
    case 'set_env_var': {
      validateRequired(args, ['account_id', 'key', 'value']);
      const context = args.context ? String(args.context) : 'all';
      return apiPost(`/accounts/${args.account_id}/env`, apiKey, {
        key: args.key,
        values: [{ value: args.value, context }],
      });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-netlify', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-netlify', version: '1.0.0' },
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
