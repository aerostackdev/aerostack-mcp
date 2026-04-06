/**
 * DigitalOcean MCP Worker
 * Implements MCP protocol over HTTP for DigitalOcean API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: DIGITALOCEAN_TOKEN → header: X-Mcp-Secret-DIGITALOCEAN-TOKEN
 */

const API_BASE = 'https://api.digitalocean.com/v2';

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
  return request.headers.get('X-Mcp-Secret-DIGITALOCEAN-TOKEN');
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
    name: '_ping',
    description: 'Verify DigitalOcean credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_droplets',
    description: 'List all Droplets in your DigitalOcean account',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (default: 1)' },
        per_page: { type: 'number', description: 'Items per page (default: 20)' },
      },
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_droplet',
    description: 'Get details of a specific Droplet',
    inputSchema: {
      type: 'object',
      properties: {
        droplet_id: { type: 'number', description: 'Droplet ID' },
      },
      required: ['droplet_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_droplet',
    description: 'Create a new DigitalOcean Droplet',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Droplet name' },
        region: { type: 'string', description: 'Region slug (e.g. nyc3, sfo3)' },
        size: { type: 'string', description: 'Size slug (e.g. s-1vcpu-1gb)' },
        image: { type: 'string', description: 'Image slug or ID (e.g. ubuntu-22-04-x64)' },
        ssh_keys: { type: 'array', items: { type: 'string' }, description: 'SSH key IDs or fingerprints' },
        backups: { type: 'boolean', description: 'Enable backups' },
        ipv6: { type: 'boolean', description: 'Enable IPv6' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to apply' },
      },
      required: ['name', 'region', 'size', 'image'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_droplet',
    description: 'Delete a Droplet',
    inputSchema: {
      type: 'object',
      properties: {
        droplet_id: { type: 'number', description: 'Droplet ID to delete' },
      },
      required: ['droplet_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_domains',
    description: 'List all domains in your DigitalOcean account',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_domain',
    description: 'Create a new domain',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Domain name (e.g. example.com)' },
        ip_address: { type: 'string', description: 'IP address for the domain A record' },
      },
      required: ['name', 'ip_address'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_domain_records',
    description: 'List DNS records for a domain',
    inputSchema: {
      type: 'object',
      properties: {
        domain_name: { type: 'string', description: 'Domain name' },
      },
      required: ['domain_name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_domain_record',
    description: 'Create a new DNS record for a domain',
    inputSchema: {
      type: 'object',
      properties: {
        domain_name: { type: 'string', description: 'Domain name' },
        type: { type: 'string', description: 'Record type: A, AAAA, CNAME, MX, TXT, SRV, NS' },
        name: { type: 'string', description: 'Record name (@ for apex)' },
        data: { type: 'string', description: 'Record data/value' },
        ttl: { type: 'number', description: 'TTL in seconds (default: 1800)' },
      },
      required: ['domain_name', 'type', 'name', 'data'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_databases',
    description: 'List all managed database clusters',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_database',
    description: 'Get details of a specific managed database cluster',
    inputSchema: {
      type: 'object',
      properties: {
        database_cluster_uuid: { type: 'string', description: 'Database cluster UUID' },
      },
      required: ['database_cluster_uuid'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_kubernetes_clusters',
    description: 'List all Kubernetes clusters',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_kubernetes_cluster',
    description: 'Get details of a specific Kubernetes cluster',
    inputSchema: {
      type: 'object',
      properties: {
        cluster_id: { type: 'string', description: 'Kubernetes cluster ID' },
      },
      required: ['cluster_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_volumes',
    description: 'List all block storage volumes',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_load_balancers',
    description: 'List all load balancers',
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
    case '_ping': {
      return apiGet('/account', apiKey);
    }
    case 'list_droplets': {
      const params: Record<string, string> = {
        page: String(args.page ?? 1),
        per_page: String(args.per_page ?? 20),
      };
      return apiGet('/droplets', apiKey, params);
    }
    case 'get_droplet': {
      validateRequired(args, ['droplet_id']);
      return apiGet(`/droplets/${args.droplet_id}`, apiKey);
    }
    case 'create_droplet': {
      validateRequired(args, ['name', 'region', 'size', 'image']);
      const body: Record<string, unknown> = {
        name: args.name,
        region: args.region,
        size: args.size,
        image: args.image,
      };
      if (args.ssh_keys) body.ssh_keys = args.ssh_keys;
      if (args.backups !== undefined) body.backups = args.backups;
      if (args.ipv6 !== undefined) body.ipv6 = args.ipv6;
      if (args.tags) body.tags = args.tags;
      return apiPost('/droplets', apiKey, body);
    }
    case 'delete_droplet': {
      validateRequired(args, ['droplet_id']);
      return apiDelete(`/droplets/${args.droplet_id}`, apiKey);
    }
    case 'list_domains': {
      return apiGet('/domains', apiKey);
    }
    case 'create_domain': {
      validateRequired(args, ['name', 'ip_address']);
      return apiPost('/domains', apiKey, { name: args.name, ip_address: args.ip_address });
    }
    case 'list_domain_records': {
      validateRequired(args, ['domain_name']);
      return apiGet(`/domains/${args.domain_name}/records`, apiKey);
    }
    case 'create_domain_record': {
      validateRequired(args, ['domain_name', 'type', 'name', 'data']);
      const body: Record<string, unknown> = {
        type: args.type,
        name: args.name,
        data: args.data,
      };
      if (args.ttl) body.ttl = args.ttl;
      return apiPost(`/domains/${args.domain_name}/records`, apiKey, body);
    }
    case 'list_databases': {
      return apiGet('/databases', apiKey);
    }
    case 'get_database': {
      validateRequired(args, ['database_cluster_uuid']);
      return apiGet(`/databases/${args.database_cluster_uuid}`, apiKey);
    }
    case 'list_kubernetes_clusters': {
      return apiGet('/kubernetes/clusters', apiKey);
    }
    case 'get_kubernetes_cluster': {
      validateRequired(args, ['cluster_id']);
      return apiGet(`/kubernetes/clusters/${args.cluster_id}`, apiKey);
    }
    case 'list_volumes': {
      return apiGet('/volumes', apiKey);
    }
    case 'list_load_balancers': {
      return apiGet('/load_balancers', apiKey);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-digitalocean', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-digitalocean', version: '1.0.0' },
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
