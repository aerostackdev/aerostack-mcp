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
  // ── Core ──────────────────────────────────────────────────────────────────
  {
    name: '_ping',
    description: 'Verify DigitalOcean credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },

  // ── Droplets ──────────────────────────────────────────────────────────────
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

  // ── Domains / DNS ─────────────────────────────────────────────────────────
  {
    name: 'list_domains',
    description: 'List all domains in your DigitalOcean account',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_domain',
    description: 'Get details of a specific domain',
    inputSchema: {
      type: 'object',
      properties: {
        domain_name: { type: 'string', description: 'Domain name (e.g. example.com)' },
      },
      required: ['domain_name'],
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
      required: ['name'],
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
        priority: { type: 'number', description: 'Priority for MX or SRV records' },
        port: { type: 'number', description: 'Port for SRV records' },
        ttl: { type: 'number', description: 'TTL in seconds (default: 1800)' },
        weight: { type: 'number', description: 'Weight for SRV records' },
      },
      required: ['domain_name', 'type', 'name', 'data'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_domain_record',
    description: 'Delete a DNS record from a domain',
    inputSchema: {
      type: 'object',
      properties: {
        domain_name: { type: 'string', description: 'Domain name' },
        record_id: { type: 'number', description: 'DNS record ID' },
      },
      required: ['domain_name', 'record_id'],
    },
    annotations: { readOnlyHint: false },
  },

  // ── Databases ─────────────────────────────────────────────────────────────
  {
    name: 'list_databases',
    description: 'List all managed database clusters',
    inputSchema: { type: 'object', properties: {}, required: [] },
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

  // ── Kubernetes ────────────────────────────────────────────────────────────
  {
    name: 'list_kubernetes_clusters',
    description: 'List all Kubernetes clusters',
    inputSchema: { type: 'object', properties: {}, required: [] },
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

  // ── Volumes & Load Balancers ───────────────────────────────────────────────
  {
    name: 'list_volumes',
    description: 'List all block storage volumes',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_load_balancers',
    description: 'List all load balancers',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },

  // ── App Platform ──────────────────────────────────────────────────────────
  {
    name: 'list_apps',
    description: 'List all App Platform apps',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_app',
    description: 'Get full details of an App Platform app including spec and active deployment',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: { type: 'string', description: 'App ID' },
      },
      required: ['app_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_app',
    description: 'Create a new App Platform app',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'App name' },
        region: { type: 'string', description: 'Region slug (e.g. nyc, ams, sgp)' },
        services: {
          type: 'array',
          description: 'List of service components',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Service name' },
              github: {
                type: 'object',
                description: 'GitHub source',
                properties: {
                  repo: { type: 'string', description: 'GitHub repo (owner/repo)' },
                  branch: { type: 'string', description: 'Git branch' },
                },
              },
              image: {
                type: 'object',
                description: 'Container image source',
                properties: {
                  registry_type: { type: 'string', description: 'Registry type: DOCR or DOCKER_HUB' },
                  registry: { type: 'string', description: 'Registry name' },
                  repository: { type: 'string', description: 'Repository name' },
                  tag: { type: 'string', description: 'Image tag' },
                },
              },
            },
            required: ['name'],
          },
        },
      },
      required: ['name', 'region', 'services'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_app_deployments',
    description: 'List recent deployments for an App Platform app',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: { type: 'string', description: 'App ID' },
      },
      required: ['app_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_deployment',
    description: 'Trigger a new deployment for an App Platform app',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: { type: 'string', description: 'App ID' },
      },
      required: ['app_id'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_app_logs',
    description: 'Get recent runtime logs for an App Platform app',
    inputSchema: {
      type: 'object',
      properties: {
        app_id: { type: 'string', description: 'App ID' },
      },
      required: ['app_id'],
    },
    annotations: { readOnlyHint: true },
  },

  // ── Spaces ────────────────────────────────────────────────────────────────
  {
    name: 'list_spaces',
    description: 'List all Spaces (S3-compatible object storage buckets) in your account',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },

  // ── Firewalls ─────────────────────────────────────────────────────────────
  {
    name: 'list_firewalls',
    description: 'List all Cloud Firewalls in your account',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_firewall',
    description: 'Get details of a specific Cloud Firewall',
    inputSchema: {
      type: 'object',
      properties: {
        firewall_id: { type: 'string', description: 'Firewall ID' },
      },
      required: ['firewall_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_firewall',
    description: 'Create a new Cloud Firewall',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Firewall name' },
        inbound_rules: {
          type: 'array',
          description: 'Inbound traffic rules',
          items: {
            type: 'object',
            properties: {
              protocol: { type: 'string', description: 'Protocol: tcp, udp, icmp' },
              ports: { type: 'string', description: 'Port or range (e.g. "80", "8000-9000", "0" for all)' },
              sources: {
                type: 'object',
                description: 'Traffic sources',
                properties: {
                  addresses: { type: 'array', items: { type: 'string' }, description: 'IP addresses or CIDRs' },
                  droplet_ids: { type: 'array', items: { type: 'number' }, description: 'Droplet IDs' },
                  tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
                },
              },
            },
            required: ['protocol', 'ports', 'sources'],
          },
        },
        outbound_rules: {
          type: 'array',
          description: 'Outbound traffic rules',
          items: {
            type: 'object',
            properties: {
              protocol: { type: 'string', description: 'Protocol: tcp, udp, icmp' },
              ports: { type: 'string', description: 'Port or range' },
              destinations: {
                type: 'object',
                description: 'Traffic destinations',
                properties: {
                  addresses: { type: 'array', items: { type: 'string' }, description: 'IP addresses or CIDRs' },
                  droplet_ids: { type: 'array', items: { type: 'number' }, description: 'Droplet IDs' },
                  tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
                },
              },
            },
            required: ['protocol', 'ports', 'destinations'],
          },
        },
        droplet_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Droplet IDs to attach the firewall to immediately',
        },
      },
      required: ['name', 'inbound_rules', 'outbound_rules'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'add_droplets_to_firewall',
    description: 'Add one or more Droplets to an existing Cloud Firewall',
    inputSchema: {
      type: 'object',
      properties: {
        firewall_id: { type: 'string', description: 'Firewall ID' },
        droplet_ids: { type: 'array', items: { type: 'number' }, description: 'Droplet IDs to add' },
      },
      required: ['firewall_id', 'droplet_ids'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'delete_firewall',
    description: 'Delete a Cloud Firewall',
    inputSchema: {
      type: 'object',
      properties: {
        firewall_id: { type: 'string', description: 'Firewall ID to delete' },
      },
      required: ['firewall_id'],
    },
    annotations: { readOnlyHint: false },
  },

  // ── VPCs ──────────────────────────────────────────────────────────────────
  {
    name: 'list_vpcs',
    description: 'List all VPCs in your account',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_vpc',
    description: 'Get details of a specific VPC',
    inputSchema: {
      type: 'object',
      properties: {
        vpc_id: { type: 'string', description: 'VPC ID' },
      },
      required: ['vpc_id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_vpc',
    description: 'Create a new VPC',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'VPC name' },
        region: { type: 'string', description: 'Region slug (e.g. nyc3, sfo3)' },
        ip_range: { type: 'string', description: 'IP range in CIDR notation (e.g. 10.10.10.0/24)' },
      },
      required: ['name', 'region'],
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_vpc_members',
    description: 'List all resources (Droplets, etc.) that are members of a VPC',
    inputSchema: {
      type: 'object',
      properties: {
        vpc_id: { type: 'string', description: 'VPC ID' },
      },
      required: ['vpc_id'],
    },
    annotations: { readOnlyHint: true },
  },

  // ── Container Registry ────────────────────────────────────────────────────
  {
    name: 'get_registry',
    description: "Get your account's DigitalOcean Container Registry details",
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_registry_repositories',
    description: 'List all repositories in the Container Registry',
    inputSchema: {
      type: 'object',
      properties: {
        registry_name: { type: 'string', description: 'Registry name (from get_registry)' },
      },
      required: ['registry_name'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_registry_tags',
    description: 'List all image digests/tags in a Container Registry repository',
    inputSchema: {
      type: 'object',
      properties: {
        registry_name: { type: 'string', description: 'Registry name' },
        repository_name: { type: 'string', description: 'Repository name (URL-encoded if it contains slashes)' },
      },
      required: ['registry_name', 'repository_name'],
    },
    annotations: { readOnlyHint: true },
  },

  // ── Account / Billing ─────────────────────────────────────────────────────
  {
    name: 'get_account',
    description: 'Get account info including Droplet limits and account status',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_balance',
    description: 'Get current account balance and month-to-date usage',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_invoices',
    description: 'List recent invoices for the account',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
];

async function callTool(name: string, args: Record<string, unknown>, apiKey: string): Promise<unknown> {
  switch (name) {
    // ── Core ──────────────────────────────────────────────────────────────
    case '_ping': {
      return apiGet('/account', apiKey);
    }

    // ── Droplets ──────────────────────────────────────────────────────────
    case 'list_droplets': {
      return apiGet('/droplets', apiKey, {
        page: String(args.page ?? 1),
        per_page: String(args.per_page ?? 20),
      });
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

    // ── Domains / DNS ──────────────────────────────────────────────────────
    case 'list_domains': {
      return apiGet('/domains', apiKey);
    }
    case 'get_domain': {
      validateRequired(args, ['domain_name']);
      return apiGet(`/domains/${args.domain_name}`, apiKey);
    }
    case 'create_domain': {
      validateRequired(args, ['name']);
      const body: Record<string, unknown> = { name: args.name };
      if (args.ip_address) body.ip_address = args.ip_address;
      return apiPost('/domains', apiKey, body);
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
      if (args.priority !== undefined) body.priority = args.priority;
      if (args.port !== undefined) body.port = args.port;
      if (args.ttl !== undefined) body.ttl = args.ttl;
      if (args.weight !== undefined) body.weight = args.weight;
      return apiPost(`/domains/${args.domain_name}/records`, apiKey, body);
    }
    case 'delete_domain_record': {
      validateRequired(args, ['domain_name', 'record_id']);
      return apiDelete(`/domains/${args.domain_name}/records/${args.record_id}`, apiKey);
    }

    // ── Databases ──────────────────────────────────────────────────────────
    case 'list_databases': {
      return apiGet('/databases', apiKey);
    }
    case 'get_database': {
      validateRequired(args, ['database_cluster_uuid']);
      return apiGet(`/databases/${args.database_cluster_uuid}`, apiKey);
    }

    // ── Kubernetes ─────────────────────────────────────────────────────────
    case 'list_kubernetes_clusters': {
      return apiGet('/kubernetes/clusters', apiKey);
    }
    case 'get_kubernetes_cluster': {
      validateRequired(args, ['cluster_id']);
      return apiGet(`/kubernetes/clusters/${args.cluster_id}`, apiKey);
    }

    // ── Volumes & Load Balancers ────────────────────────────────────────────
    case 'list_volumes': {
      return apiGet('/volumes', apiKey);
    }
    case 'list_load_balancers': {
      return apiGet('/load_balancers', apiKey);
    }

    // ── App Platform ───────────────────────────────────────────────────────
    case 'list_apps': {
      return apiGet('/apps', apiKey);
    }
    case 'get_app': {
      validateRequired(args, ['app_id']);
      return apiGet(`/apps/${args.app_id}`, apiKey);
    }
    case 'create_app': {
      validateRequired(args, ['name', 'region', 'services']);
      return apiPost('/apps', apiKey, {
        spec: {
          name: args.name,
          region: args.region,
          services: args.services,
        },
      });
    }
    case 'get_app_deployments': {
      validateRequired(args, ['app_id']);
      return apiGet(`/apps/${args.app_id}/deployments`, apiKey, { per_page: '5' });
    }
    case 'create_deployment': {
      validateRequired(args, ['app_id']);
      return apiPost(`/apps/${args.app_id}/deployments`, apiKey, {});
    }
    case 'get_app_logs': {
      validateRequired(args, ['app_id']);
      return apiGet(`/apps/${args.app_id}/logs`, apiKey, { type: 'RUN' });
    }

    // ── Spaces ─────────────────────────────────────────────────────────────
    case 'list_spaces': {
      return apiGet('/spaces', apiKey);
    }

    // ── Firewalls ──────────────────────────────────────────────────────────
    case 'list_firewalls': {
      return apiGet('/firewalls', apiKey);
    }
    case 'get_firewall': {
      validateRequired(args, ['firewall_id']);
      return apiGet(`/firewalls/${args.firewall_id}`, apiKey);
    }
    case 'create_firewall': {
      validateRequired(args, ['name', 'inbound_rules', 'outbound_rules']);
      const body: Record<string, unknown> = {
        name: args.name,
        inbound_rules: args.inbound_rules,
        outbound_rules: args.outbound_rules,
      };
      if (args.droplet_ids) body.droplet_ids = args.droplet_ids;
      return apiPost('/firewalls', apiKey, body);
    }
    case 'add_droplets_to_firewall': {
      validateRequired(args, ['firewall_id', 'droplet_ids']);
      return apiPost(`/firewalls/${args.firewall_id}/droplets`, apiKey, {
        droplet_ids: args.droplet_ids,
      });
    }
    case 'delete_firewall': {
      validateRequired(args, ['firewall_id']);
      return apiDelete(`/firewalls/${args.firewall_id}`, apiKey);
    }

    // ── VPCs ───────────────────────────────────────────────────────────────
    case 'list_vpcs': {
      return apiGet('/vpcs', apiKey);
    }
    case 'get_vpc': {
      validateRequired(args, ['vpc_id']);
      return apiGet(`/vpcs/${args.vpc_id}`, apiKey);
    }
    case 'create_vpc': {
      validateRequired(args, ['name', 'region']);
      const body: Record<string, unknown> = { name: args.name, region: args.region };
      if (args.ip_range) body.ip_range = args.ip_range;
      return apiPost('/vpcs', apiKey, body);
    }
    case 'list_vpc_members': {
      validateRequired(args, ['vpc_id']);
      return apiGet(`/vpcs/${args.vpc_id}/members`, apiKey);
    }

    // ── Container Registry ─────────────────────────────────────────────────
    case 'get_registry': {
      return apiGet('/registry', apiKey);
    }
    case 'list_registry_repositories': {
      validateRequired(args, ['registry_name']);
      return apiGet(`/registry/${args.registry_name}/repositoriesV2`, apiKey);
    }
    case 'list_registry_tags': {
      validateRequired(args, ['registry_name', 'repository_name']);
      return apiGet(
        `/registry/${args.registry_name}/repositories/${args.repository_name}/digests`,
        apiKey,
      );
    }

    // ── Account / Billing ──────────────────────────────────────────────────
    case 'get_account': {
      return apiGet('/account', apiKey);
    }
    case 'get_balance': {
      return apiGet('/customers/my/balance', apiKey);
    }
    case 'list_invoices': {
      return apiGet('/customers/my/invoices', apiKey, { per_page: '5' });
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
