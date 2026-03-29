/**
 * Pulumi MCP Worker
 * Implements MCP protocol over HTTP for Pulumi Cloud API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: PULUMI_ACCESS_TOKEN → header: X-Mcp-Secret-PULUMI-ACCESS-TOKEN
 */

const API_BASE = 'https://api.pulumi.com/api';

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
  return request.headers.get('X-Mcp-Secret-PULUMI-ACCESS-TOKEN');
}

async function apiGet(path: string, apiKey: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `token ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `token ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiDelete(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { 'Authorization': `token ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return { deleted: true };
}

const TOOLS = [
  {
    name: 'list_organizations',
    description: 'List organizations for the current Pulumi user',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_stacks',
    description: 'List stacks for a user, optionally filtered by organization and project',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization name filter' },
        project: { type: 'string', description: 'Project name filter' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_stack',
    description: 'Get details of a specific Pulumi stack',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization name' },
        project: { type: 'string', description: 'Project name' },
        stack: { type: 'string', description: 'Stack name' },
      },
      required: ['organization', 'project', 'stack'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_stack',
    description: 'Create a new Pulumi stack',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization name' },
        project: { type: 'string', description: 'Project name' },
        stackName: { type: 'string', description: 'Stack name to create' },
      },
      required: ['organization', 'project', 'stackName'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_stack',
    description: 'Delete a Pulumi stack',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization name' },
        project: { type: 'string', description: 'Project name' },
        stack: { type: 'string', description: 'Stack name to delete' },
      },
      required: ['organization', 'project', 'stack'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_stack_resources',
    description: 'List resources in a Pulumi stack deployment',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization name' },
        project: { type: 'string', description: 'Project name' },
        stack: { type: 'string', description: 'Stack name' },
      },
      required: ['organization', 'project', 'stack'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_stack_updates',
    description: 'Get update history for a Pulumi stack',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization name' },
        project: { type: 'string', description: 'Project name' },
        stack: { type: 'string', description: 'Stack name' },
        pageSize: { type: 'number', description: 'Number of updates to return (default: 10)' },
      },
      required: ['organization', 'project', 'stack'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_webhooks',
    description: 'List webhooks for an organization',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization name' },
      },
      required: ['organization'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_webhook',
    description: 'Create a webhook for an organization',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization name' },
        displayName: { type: 'string', description: 'Webhook display name' },
        payloadUrl: { type: 'string', description: 'Webhook payload URL' },
        secret: { type: 'string', description: 'Webhook signing secret' },
        active: { type: 'boolean', description: 'Whether the webhook is active' },
        filters: { type: 'array', items: { type: 'string' }, description: 'Event filters' },
      },
      required: ['organization', 'displayName', 'payloadUrl', 'active'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_webhook',
    description: 'Delete a webhook from an organization',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization name' },
        webhookName: { type: 'string', description: 'Webhook name to delete' },
      },
      required: ['organization', 'webhookName'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_policy_packs',
    description: 'Get policy packs for an organization',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Organization name' },
      },
      required: ['organization'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_access_tokens',
    description: 'List access tokens for the current user',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
];

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
  switch (name) {
    case 'list_organizations': {
      return apiGet('/user/organizations', apiKey);
    }
    case 'list_stacks': {
      const params: Record<string, string> = {};
      if (args.organization) params.organization = String(args.organization);
      if (args.project) params.project = String(args.project);
      return apiGet('/user/stacks', apiKey, params);
    }
    case 'get_stack': {
      validateRequired(args, ['organization', 'project', 'stack']);
      return apiGet(`/stacks/${args.organization}/${args.project}/${args.stack}`, apiKey);
    }
    case 'create_stack': {
      validateRequired(args, ['organization', 'project', 'stackName']);
      return apiPost(`/stacks/${args.organization}/${args.project}`, apiKey, { stackName: args.stackName });
    }
    case 'delete_stack': {
      validateRequired(args, ['organization', 'project', 'stack']);
      return apiDelete(`/stacks/${args.organization}/${args.project}/${args.stack}`, apiKey);
    }
    case 'list_stack_resources': {
      validateRequired(args, ['organization', 'project', 'stack']);
      const data = await apiGet(`/stacks/${args.organization}/${args.project}/${args.stack}/export`, apiKey) as Record<string, unknown>;
      const deployment = data.deployment as Record<string, unknown> | undefined;
      return { resources: deployment?.resources ?? [] };
    }
    case 'get_stack_updates': {
      validateRequired(args, ['organization', 'project', 'stack']);
      return apiGet(`/stacks/${args.organization}/${args.project}/${args.stack}/updates`, apiKey, {
        pageSize: String(args.pageSize ?? 10),
      });
    }
    case 'list_webhooks': {
      validateRequired(args, ['organization']);
      return apiGet(`/orgs/${args.organization}/webhooks`, apiKey);
    }
    case 'create_webhook': {
      validateRequired(args, ['organization', 'displayName', 'payloadUrl', 'active']);
      const body: Record<string, unknown> = {
        displayName: args.displayName,
        payloadUrl: args.payloadUrl,
        active: args.active,
      };
      if (args.secret) body.secret = args.secret;
      if (args.filters) body.filters = args.filters;
      return apiPost(`/orgs/${args.organization}/webhooks`, apiKey, body);
    }
    case 'delete_webhook': {
      validateRequired(args, ['organization', 'webhookName']);
      return apiDelete(`/orgs/${args.organization}/webhooks/${args.webhookName}`, apiKey);
    }
    case 'get_policy_packs': {
      validateRequired(args, ['organization']);
      return apiGet(`/orgs/${args.organization}/policypacks`, apiKey);
    }
    case 'list_access_tokens': {
      return apiGet('/user/tokens', apiKey);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-pulumi', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-pulumi', version: '1.0.0' },
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
