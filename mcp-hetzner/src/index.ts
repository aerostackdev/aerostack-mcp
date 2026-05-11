/**
 * Hetzner Cloud MCP Worker
 * Implements MCP protocol over HTTP for Hetzner Cloud API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: HETZNER_API_TOKEN → header: X-Mcp-Secret-HETZNER-API-TOKEN
 */

const API_BASE = 'https://api.hetzner.cloud/v1';

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
  return request.headers.get('X-Mcp-Secret-HETZNER-API-TOKEN');
}

async function apiGet(path: string, apiKey: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (res.status === 404) throw new Error('Resource not found — check the ID');
  if (res.status === 422) {
    const body = await res.json() as { error?: { message?: string; details?: unknown } };
    throw new Error(`Validation error: ${body?.error?.message ?? JSON.stringify(body)}`);
  }
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 404) throw new Error('Resource not found — check the ID');
  if (res.status === 422) {
    const respBody = await res.json() as { error?: { message?: string; details?: unknown } };
    throw new Error(`Validation error: ${respBody?.error?.message ?? JSON.stringify(respBody)}`);
  }
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiDelete(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (res.status === 404) throw new Error('Resource not found — check the ID');
  if (res.status === 422) {
    const body = await res.json() as { error?: { message?: string; details?: unknown } };
    throw new Error(`Validation error: ${body?.error?.message ?? JSON.stringify(body)}`);
  }
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  // 204 No Content is success for deletes
  return { deleted: true };
}

const TOOLS = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    name: '_ping',
    description: 'Verify Hetzner Cloud credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },

  // ── Servers ───────────────────────────────────────────────────────────────
  {
    name: 'list_servers',
    description: 'List all Hetzner Cloud servers with their status, IP addresses, and server type',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_server',
    description: 'Get full details of a specific Hetzner Cloud server by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Server ID (integer)' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_server',
    description: 'Create a new Hetzner Cloud server. server_type and image are strings (e.g. "cx21", "ubuntu-22.04"). location is a string (e.g. "nbg1", "fsn1", "hel1").',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Server name (must be unique within project)' },
        server_type: { type: 'string', description: 'Server type slug, e.g. "cx21", "cx31", "cpx11". Use list_server_types to see options.' },
        image: { type: 'string', description: 'OS image name, e.g. "ubuntu-22.04", "debian-12", "centos-9". Use an image name or ID.' },
        location: { type: 'string', description: 'Datacenter location, e.g. "nbg1" (Nuremberg), "fsn1" (Falkenstein), "hel1" (Helsinki). Optional.' },
        ssh_keys: { type: 'array', items: { type: 'number' }, description: 'Array of SSH key IDs to inject into the server. Optional.' },
        user_data: { type: 'string', description: 'Cloud-init user data script. Optional.' },
        networks: { type: 'array', items: { type: 'number' }, description: 'Array of private network IDs to attach. Optional.' },
      },
      required: ['name', 'server_type', 'image'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_server',
    description: 'Delete a Hetzner Cloud server. This is irreversible.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Server ID to delete' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'reboot_server',
    description: 'Reboot a Hetzner Cloud server. Returns an action object with status.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Server ID' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'power_on_server',
    description: 'Power on a stopped Hetzner Cloud server. Returns an action object with status.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Server ID' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'power_off_server',
    description: 'Power off a running Hetzner Cloud server (hard shutdown). Returns an action object with status.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Server ID' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'rebuild_server',
    description: 'Rebuild a server with a different OS image. All data on the server will be erased. Returns an action object.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Server ID' },
        image: { type: 'string', description: 'OS image name or ID to rebuild with, e.g. "ubuntu-22.04"' },
      },
      required: ['id', 'image'],
    },
    annotations: { readOnlyHint: false },
  },

  // ── Networks ──────────────────────────────────────────────────────────────
  {
    name: 'list_networks',
    description: 'List all private networks in the Hetzner Cloud project',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_network',
    description: 'Create a new private network in Hetzner Cloud',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Network name' },
        ip_range: { type: 'string', description: 'IP range in CIDR notation, e.g. "10.0.0.0/16"' },
      },
      required: ['name', 'ip_range'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_network',
    description: 'Delete a private network. The network must have no attached servers.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Network ID to delete' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },

  // ── Volumes ───────────────────────────────────────────────────────────────
  {
    name: 'list_volumes',
    description: 'List all block storage volumes in the Hetzner Cloud project',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_volume',
    description: 'Create a new block storage volume. Volumes can be attached to servers.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Volume name' },
        size: { type: 'number', description: 'Volume size in GB (minimum 10)' },
        server: { type: 'number', description: 'Server ID to attach the volume to immediately. Optional.' },
        location: { type: 'string', description: 'Datacenter location, e.g. "nbg1". Required if server is not set.' },
      },
      required: ['name', 'size'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'attach_volume',
    description: 'Attach an existing volume to a server. Returns an action object.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Volume ID' },
        server: { type: 'number', description: 'Server ID to attach the volume to' },
      },
      required: ['id', 'server'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'detach_volume',
    description: 'Detach a volume from its currently attached server. Returns an action object.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Volume ID to detach' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_volume',
    description: 'Delete a block storage volume. The volume must be detached first.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Volume ID to delete' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },

  // ── Firewalls ─────────────────────────────────────────────────────────────
  {
    name: 'list_firewalls',
    description: 'List all firewalls in the Hetzner Cloud project',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_firewall',
    description: 'Create a new firewall with inbound/outbound rules',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Firewall name' },
        rules: {
          type: 'array',
          description: 'Array of firewall rules',
          items: {
            type: 'object',
            properties: {
              direction: { type: 'string', description: '"in" or "out"' },
              protocol: { type: 'string', description: '"tcp", "udp", "icmp", or "esp"' },
              port: { type: 'string', description: 'Port or port range, e.g. "22", "80-443". Not required for icmp/esp.' },
              source_ips: { type: 'array', items: { type: 'string' }, description: 'Source IP CIDR ranges for inbound rules, e.g. ["0.0.0.0/0", "::/0"]' },
              destination_ips: { type: 'array', items: { type: 'string' }, description: 'Destination IP CIDR ranges for outbound rules' },
            },
            required: ['direction', 'protocol'],
          },
        },
      },
      required: ['name', 'rules'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'apply_firewall_to_server',
    description: 'Apply a firewall to one or more servers. Returns an array of action objects.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Firewall ID' },
        server_id: { type: 'number', description: 'Server ID to apply the firewall to' },
      },
      required: ['id', 'server_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_firewall',
    description: 'Delete a firewall. The firewall must not be applied to any servers.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Firewall ID to delete' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },

  // ── SSH Keys ──────────────────────────────────────────────────────────────
  {
    name: 'list_ssh_keys',
    description: 'List all SSH keys in the Hetzner Cloud project',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_ssh_key',
    description: 'Add a new SSH public key to the Hetzner Cloud project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the SSH key' },
        public_key: { type: 'string', description: 'The SSH public key string, e.g. "ssh-ed25519 AAAA..."' },
      },
      required: ['name', 'public_key'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_ssh_key',
    description: 'Delete an SSH key from the Hetzner Cloud project',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'SSH key ID to delete' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false },
  },

  // ── Locations & Types ─────────────────────────────────────────────────────
  {
    name: 'list_locations',
    description: 'List all available Hetzner Cloud datacenter locations with their country and city',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_server_types',
    description: 'List all available Hetzner Cloud server types with their CPU count, RAM, disk, and pricing',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
];

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
  switch (name) {
    // ── Auth ────────────────────────────────────────────────────────────────
    case '_ping': {
      return apiGet('/datacenters', apiKey, { per_page: '1' });
    }

    // ── Servers ─────────────────────────────────────────────────────────────
    case 'list_servers': {
      return apiGet('/servers', apiKey, { per_page: '50' });
    }
    case 'get_server': {
      validateRequired(args, ['id']);
      return apiGet(`/servers/${args.id}`, apiKey);
    }
    case 'create_server': {
      validateRequired(args, ['name', 'server_type', 'image']);
      const body: Record<string, unknown> = {
        name: args.name,
        server_type: args.server_type,
        image: args.image,
      };
      if (args.location) body.location = args.location;
      if (args.ssh_keys) body.ssh_keys = args.ssh_keys;
      if (args.user_data) body.user_data = args.user_data;
      if (args.networks) body.networks = args.networks;
      return apiPost('/servers', apiKey, body);
    }
    case 'delete_server': {
      validateRequired(args, ['id']);
      return apiDelete(`/servers/${args.id}`, apiKey);
    }
    case 'reboot_server': {
      validateRequired(args, ['id']);
      return apiPost(`/servers/${args.id}/actions/reboot`, apiKey, {});
    }
    case 'power_on_server': {
      validateRequired(args, ['id']);
      return apiPost(`/servers/${args.id}/actions/poweron`, apiKey, {});
    }
    case 'power_off_server': {
      validateRequired(args, ['id']);
      return apiPost(`/servers/${args.id}/actions/poweroff`, apiKey, {});
    }
    case 'rebuild_server': {
      validateRequired(args, ['id', 'image']);
      return apiPost(`/servers/${args.id}/actions/rebuild`, apiKey, { image: args.image });
    }

    // ── Networks ─────────────────────────────────────────────────────────────
    case 'list_networks': {
      return apiGet('/networks', apiKey, { per_page: '50' });
    }
    case 'create_network': {
      validateRequired(args, ['name', 'ip_range']);
      return apiPost('/networks', apiKey, { name: args.name, ip_range: args.ip_range });
    }
    case 'delete_network': {
      validateRequired(args, ['id']);
      return apiDelete(`/networks/${args.id}`, apiKey);
    }

    // ── Volumes ──────────────────────────────────────────────────────────────
    case 'list_volumes': {
      return apiGet('/volumes', apiKey, { per_page: '50' });
    }
    case 'create_volume': {
      validateRequired(args, ['name', 'size']);
      const body: Record<string, unknown> = {
        name: args.name,
        size: args.size,
      };
      if (args.server) body.server = args.server;
      if (args.location) body.location = args.location;
      return apiPost('/volumes', apiKey, body);
    }
    case 'attach_volume': {
      validateRequired(args, ['id', 'server']);
      return apiPost(`/volumes/${args.id}/actions/attach`, apiKey, { server: args.server });
    }
    case 'detach_volume': {
      validateRequired(args, ['id']);
      return apiPost(`/volumes/${args.id}/actions/detach`, apiKey, {});
    }
    case 'delete_volume': {
      validateRequired(args, ['id']);
      return apiDelete(`/volumes/${args.id}`, apiKey);
    }

    // ── Firewalls ────────────────────────────────────────────────────────────
    case 'list_firewalls': {
      return apiGet('/firewalls', apiKey, { per_page: '50' });
    }
    case 'create_firewall': {
      validateRequired(args, ['name', 'rules']);
      return apiPost('/firewalls', apiKey, { name: args.name, rules: args.rules });
    }
    case 'apply_firewall_to_server': {
      validateRequired(args, ['id', 'server_id']);
      return apiPost(`/firewalls/${args.id}/actions/apply_to_resources`, apiKey, {
        apply_to: [{ type: 'server', server: { id: args.server_id } }],
      });
    }
    case 'delete_firewall': {
      validateRequired(args, ['id']);
      return apiDelete(`/firewalls/${args.id}`, apiKey);
    }

    // ── SSH Keys ─────────────────────────────────────────────────────────────
    case 'list_ssh_keys': {
      return apiGet('/ssh_keys', apiKey, { per_page: '50' });
    }
    case 'create_ssh_key': {
      validateRequired(args, ['name', 'public_key']);
      return apiPost('/ssh_keys', apiKey, { name: args.name, public_key: args.public_key });
    }
    case 'delete_ssh_key': {
      validateRequired(args, ['id']);
      return apiDelete(`/ssh_keys/${args.id}`, apiKey);
    }

    // ── Locations & Types ────────────────────────────────────────────────────
    case 'list_locations': {
      return apiGet('/locations', apiKey, { per_page: '50' });
    }
    case 'list_server_types': {
      return apiGet('/server_types', apiKey, { per_page: '50' });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ name: 'mcp-hetzner', version: '1.0.0' }), {
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
        serverInfo: { name: 'mcp-hetzner', version: '1.0.0' },
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
