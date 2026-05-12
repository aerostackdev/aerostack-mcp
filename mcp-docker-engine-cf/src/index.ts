/**
 * mcp-docker-engine-cf — Cloudflare Worker MCP for Docker Engine
 *
 * Calls docker-relay servers running behind Cloudflare Tunnel on each environment.
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 *
 * Required secrets:
 *   DOCKER_RELAY_SECRET  — shared Bearer token (set same value on each relay)
 *   DOCKER_DEV_URL       — relay URL for dev  (e.g. https://docker-dev.yourdomain.com)
 *   DOCKER_STG_URL       — relay URL for stg
 *   DOCKER_PROD_URL      — relay URL for prod
 */

interface Env {
  DOCKER_RELAY_SECRET: string;
  DOCKER_DEV_URL?: string;
  DOCKER_STG_URL?: string;
  DOCKER_PROD_URL?: string;
  [key: string]: string | undefined;
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const ENV_PARAM = {
  environment: {
    type: 'string',
    description: 'Target environment: dev, stg, prod (default: dev)',
  },
};

const TOOLS = [
  {
    name: 'list_environments',
    description: 'List all configured Docker environments (dev, stg, prod) and their relay URLs',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'list_containers',
    description: 'List all containers with status, image, ports, and names',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        all: { type: 'boolean', description: 'Include stopped containers (default: true)' },
        filter: { type: 'string', description: 'Filter (e.g. "name=nginx", "status=running")' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_container_logs',
    description: 'Get logs from a container with optional tail and time filtering',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        container: { type: 'string', description: 'Container name or ID' },
        tail: { type: 'number', description: 'Lines from end (default: 100)' },
        since: { type: 'string', description: 'Since timestamp or relative (e.g. "10m", "2h")' },
        timestamps: { type: 'boolean', description: 'Show timestamps (default: true)' },
      },
      required: ['container'],
    },
  },
  {
    name: 'inspect_container',
    description: 'Full container details: config, env vars, mounts, network, health status',
    inputSchema: {
      type: 'object' as const,
      properties: { ...ENV_PARAM, container: { type: 'string', description: 'Container name or ID' } },
      required: ['container'],
    },
  },
  {
    name: 'get_container_stats',
    description: 'Real-time CPU, memory, network, and block I/O stats snapshot',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        container: { type: 'string', description: 'Container name or ID (omit for all)' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'start_container',
    description: 'Start a stopped container',
    inputSchema: {
      type: 'object' as const,
      properties: { ...ENV_PARAM, container: { type: 'string', description: 'Container name or ID' } },
      required: ['container'],
    },
  },
  {
    name: 'stop_container',
    description: 'Stop a running container gracefully',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        container: { type: 'string', description: 'Container name or ID' },
        timeout: { type: 'number', description: 'Seconds before SIGKILL (default: 10)' },
      },
      required: ['container'],
    },
  },
  {
    name: 'restart_container',
    description: 'Restart a container',
    inputSchema: {
      type: 'object' as const,
      properties: { ...ENV_PARAM, container: { type: 'string', description: 'Container name or ID' } },
      required: ['container'],
    },
  },
  {
    name: 'remove_container',
    description: 'Remove a stopped container',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        container: { type: 'string', description: 'Container name or ID' },
        force: { type: 'boolean', description: 'Force remove running container (default: false)' },
      },
      required: ['container'],
    },
  },
  {
    name: 'exec_in_container',
    description: 'Run a command inside a running container and return output',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        container: { type: 'string', description: 'Container name or ID' },
        command: { type: 'string', description: 'Command to run (e.g. "ls /app", "env", "ps aux")' },
      },
      required: ['container', 'command'],
    },
  },
  {
    name: 'list_images',
    description: 'List Docker images with repository, tag, size, and creation date',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        filter: { type: 'string', description: 'Filter (e.g. "dangling=true", "reference=nginx*")' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'pull_image',
    description: 'Pull a Docker image from a registry',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        image: { type: 'string', description: 'Image name with optional tag (e.g. "nginx:latest")' },
      },
      required: ['image'],
    },
  },
  {
    name: 'remove_image',
    description: 'Remove a local Docker image',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        image: { type: 'string', description: 'Image name or ID' },
        force: { type: 'boolean', description: 'Force removal (default: false)' },
      },
      required: ['image'],
    },
  },
  {
    name: 'list_networks',
    description: 'List all Docker networks with driver, scope, and subnet info',
    inputSchema: {
      type: 'object' as const,
      properties: { ...ENV_PARAM },
      required: [] as string[],
    },
  },
  {
    name: 'inspect_network',
    description: 'Get Docker network details including connected containers',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        network: { type: 'string', description: 'Network name or ID' },
      },
      required: ['network'],
    },
  },
  {
    name: 'list_volumes',
    description: 'List all Docker volumes with driver and mount point',
    inputSchema: {
      type: 'object' as const,
      properties: { ...ENV_PARAM },
      required: [] as string[],
    },
  },
  {
    name: 'inspect_volume',
    description: 'Get details about a Docker volume including its mount path',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        volume: { type: 'string', description: 'Volume name' },
      },
      required: ['volume'],
    },
  },
  {
    name: 'system_info',
    description: 'Docker daemon info: version, OS, kernel, CPU/memory, container and image counts',
    inputSchema: {
      type: 'object' as const,
      properties: { ...ENV_PARAM },
      required: [] as string[],
    },
  },
  {
    name: 'disk_usage',
    description: 'Docker disk usage breakdown: images, containers, volumes, build cache',
    inputSchema: {
      type: 'object' as const,
      properties: { ...ENV_PARAM },
      required: [] as string[],
    },
  },
  {
    name: 'list_compose_services',
    description: 'List Docker Compose services and their status',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        project_dir: { type: 'string', description: 'Absolute path to directory with docker-compose.yml' },
        project_name: { type: 'string', description: 'Compose project name (alternative to project_dir)' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'compose_logs',
    description: 'Get logs from a Docker Compose service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        project_dir: { type: 'string', description: 'Absolute path to directory with docker-compose.yml' },
        service: { type: 'string', description: 'Service name (omit for all services)' },
        tail: { type: 'number', description: 'Number of lines (default: 100)' },
        since: { type: 'string', description: 'Show logs since (e.g. "10m", "2h")' },
      },
      required: ['project_dir'],
    },
  },
  {
    name: 'compose_restart',
    description: 'Restart one or all services in a Docker Compose project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ...ENV_PARAM,
        project_dir: { type: 'string', description: 'Absolute path to directory with docker-compose.yml' },
        service: { type: 'string', description: 'Service name (omit to restart all services)' },
      },
      required: ['project_dir'],
    },
  },
];

// ── Relay call ────────────────────────────────────────────────────────────────

async function callRelay(relayUrl: string, secret: string, args: string): Promise<string> {
  const res = await fetch(`${relayUrl}/docker`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ args }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json() as { output?: string; error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `Relay HTTP ${res.status}`);
  return data.output ?? '';
}

function getRelayUrl(env: Env, name: string): string {
  const key = `DOCKER_${name.toUpperCase()}_URL`;
  const url = env[key];
  if (!url) throw new Error(`No relay URL configured for environment "${name}". Set ${key} secret.`);
  return url.replace(/\/$/, '');
}

function getEnvNames(env: Env): string[] {
  return ['dev', 'stg', 'prod'].filter((n) => env[`DOCKER_${n.toUpperCase()}_URL`]);
}

// ── Tool handler ──────────────────────────────────────────────────────────────

async function handleTool(name: string, args: Record<string, unknown>, env: Env): Promise<string> {
  const envName = (args.environment as string | undefined) ?? getEnvNames(env)[0] ?? 'dev';
  const relay = getRelayUrl(env, envName);
  const secret = env.DOCKER_RELAY_SECRET;

  switch (name) {
    case 'list_environments': {
      const envs = getEnvNames(env);
      if (!envs.length) return 'No environments configured. Add DOCKER_DEV_URL, DOCKER_STG_URL, or DOCKER_PROD_URL secrets.';
      return envs.map((n) => `${n}: ${env[`DOCKER_${n.toUpperCase()}_URL`]}`).join('\n');
    }
    case 'list_containers': {
      const filter = args.filter ? ` --filter "${args.filter}"` : '';
      const all = args.all === false ? '' : ' -a';
      return callRelay(relay, secret, `ps${all} --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}"${filter}`);
    }
    case 'get_container_logs': {
      const tail = args.tail ?? 100;
      const since = args.since ? ` --since ${args.since}` : '';
      const ts = args.timestamps === false ? '' : ' -t';
      return callRelay(relay, secret, `logs --tail ${tail}${since}${ts} ${args.container}`);
    }
    case 'inspect_container':
      return callRelay(relay, secret, `inspect ${args.container}`);
    case 'get_container_stats': {
      const target = args.container ? String(args.container) : '';
      return callRelay(relay, secret, `stats --no-stream --format "table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.NetIO}}\\t{{.BlockIO}}" ${target}`);
    }
    case 'start_container':
      return callRelay(relay, secret, `start ${args.container}`);
    case 'stop_container': {
      const timeout = args.timeout ? ` -t ${args.timeout}` : '';
      return callRelay(relay, secret, `stop${timeout} ${args.container}`);
    }
    case 'restart_container':
      return callRelay(relay, secret, `restart ${args.container}`);
    case 'remove_container': {
      const force = args.force ? ' -f' : '';
      return callRelay(relay, secret, `rm${force} ${args.container}`);
    }
    case 'exec_in_container':
      return callRelay(relay, secret, `exec ${args.container} ${args.command}`);
    case 'list_images': {
      const filter = args.filter ? ` --filter "${args.filter}"` : '';
      return callRelay(relay, secret, `images --format "table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}\\t{{.CreatedSince}}"${filter}`);
    }
    case 'pull_image':
      return callRelay(relay, secret, `pull ${args.image}`);
    case 'remove_image': {
      const force = args.force ? ' -f' : '';
      return callRelay(relay, secret, `rmi${force} ${args.image}`);
    }
    case 'list_networks':
      return callRelay(relay, secret, 'network ls --format "table {{.Name}}\\t{{.Driver}}\\t{{.Scope}}"');
    case 'inspect_network':
      return callRelay(relay, secret, `network inspect ${args.network}`);
    case 'list_volumes':
      return callRelay(relay, secret, 'volume ls --format "table {{.Name}}\\t{{.Driver}}\\t{{.Mountpoint}}"');
    case 'inspect_volume':
      return callRelay(relay, secret, `volume inspect ${args.volume}`);
    case 'system_info':
      return callRelay(relay, secret, 'system info');
    case 'disk_usage':
      return callRelay(relay, secret, 'system df -v');
    case 'list_compose_services': {
      const proj = args.project_dir ? `-f ${args.project_dir}/docker-compose.yml` : args.project_name ? `-p ${args.project_name}` : '';
      return callRelay(relay, secret, `compose ${proj} ps`);
    }
    case 'compose_logs': {
      const proj = `-f ${args.project_dir}/docker-compose.yml`;
      const svc = args.service ? ` ${args.service}` : '';
      const tail = args.tail ?? 100;
      const since = args.since ? ` --since ${args.since}` : '';
      return callRelay(relay, secret, `compose ${proj} logs --tail ${tail}${since}${svc}`);
    }
    case 'compose_restart': {
      const proj = `-f ${args.project_dir}/docker-compose.yml`;
      const svc = args.service ? ` ${args.service}` : '';
      return callRelay(relay, secret, `compose ${proj} restart${svc}`);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP protocol handler ──────────────────────────────────────────────────────

function ok(id: unknown, result: unknown) {
  return Response.json({ jsonrpc: '2.0', id, result });
}
function err(id: unknown, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    let body: { jsonrpc: string; id: unknown; method: string; params?: unknown };
    try {
      body = await request.json();
    } catch {
      return err(null, -32700, 'Parse error');
    }

    const { id, method, params } = body;

    if (method === 'tools/list') {
      return ok(id, { tools: TOOLS });
    }

    if (method === 'tools/call') {
      const p = params as { name: string; arguments?: Record<string, unknown> };
      try {
        const output = await handleTool(p.name, p.arguments ?? {}, env);
        return ok(id, { content: [{ type: 'text', text: output }] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return ok(id, { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true });
      }
    }

    if (method === 'initialize') {
      return ok(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mcp-docker-engine-cf', version: '1.0.0' },
      });
    }

    return err(id, -32601, `Method not found: ${method}`);
  },
};
