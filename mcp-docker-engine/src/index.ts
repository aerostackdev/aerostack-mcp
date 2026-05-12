#!/usr/bin/env node
/**
 * mcp-docker-engine — Local MCP Server for Docker Engine
 *
 * Runs as a local stdio MCP server. Add to Claude Code via:
 *   ~/.claude/mcp.json  (or Settings → MCP Servers)
 *
 * Supports multiple environments via SSH or local Docker socket.
 * Configure in env vars — see README.md.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// ── Environment configuration ─────────────────────────────────────────────────
// Set these in your shell profile or in the MCP server config.
//
// For local Docker:        DOCKER_LOCAL=true  (default if no hosts configured)
// For remote via SSH:      DOCKER_DEV_HOST=user@dev.internal
//                          DOCKER_STG_HOST=user@stg.internal
//                          DOCKER_PROD_HOST=user@prod.internal
// Optional SSH key:        DOCKER_SSH_KEY=/path/to/id_rsa
// Optional SSH port:       DOCKER_SSH_PORT=22

interface Environment {
  name: string;
  type: 'local' | 'ssh';
  sshHost?: string;
  sshKey?: string;
  sshPort?: string;
}

function buildEnvs(): Record<string, Environment> {
  const envs: Record<string, Environment> = {};
  const sshKey = process.env.DOCKER_SSH_KEY;
  const sshPort = process.env.DOCKER_SSH_PORT ?? '22';

  // Always include local if DOCKER_LOCAL=true or no SSH hosts defined
  const hasRemote = process.env.DOCKER_DEV_HOST || process.env.DOCKER_STG_HOST || process.env.DOCKER_PROD_HOST;
  if (!hasRemote || process.env.DOCKER_LOCAL === 'true') {
    envs['local'] = { name: 'local', type: 'local' };
  }
  if (process.env.DOCKER_DEV_HOST) {
    envs['dev'] = { name: 'dev', type: 'ssh', sshHost: process.env.DOCKER_DEV_HOST, sshKey, sshPort };
  }
  if (process.env.DOCKER_STG_HOST) {
    envs['stg'] = { name: 'stg', type: 'ssh', sshHost: process.env.DOCKER_STG_HOST, sshKey, sshPort };
  }
  if (process.env.DOCKER_PROD_HOST) {
    envs['prod'] = { name: 'prod', type: 'ssh', sshHost: process.env.DOCKER_PROD_HOST, sshKey, sshPort };
  }
  // Support arbitrary extra envs: DOCKER_ENV_MYNAME_HOST=user@host
  for (const [key, val] of Object.entries(process.env)) {
    const m = key.match(/^DOCKER_ENV_([A-Z0-9]+)_HOST$/);
    if (m && val) {
      const name = m[1].toLowerCase();
      envs[name] = { name, type: 'ssh', sshHost: val, sshKey, sshPort };
    }
  }
  return envs;
}

const ENVS = buildEnvs();
const ENV_NAMES = Object.keys(ENVS);

// ── Docker command runner ─────────────────────────────────────────────────────

async function runDocker(env: Environment, args: string): Promise<string> {
  let cmd: string;
  if (env.type === 'local') {
    cmd = `docker ${args}`;
  } else {
    const keyPart = env.sshKey ? `-i ${env.sshKey} ` : '';
    const portPart = env.sshPort && env.sshPort !== '22' ? `-p ${env.sshPort} ` : '';
    cmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${keyPart}${portPart}${env.sshHost} "docker ${args}"`;
  }
  const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 });
  return (stdout + stderr).trim();
}

function getEnv(name?: string): Environment {
  const key = name ?? ENV_NAMES[0];
  const env = ENVS[key];
  if (!env) throw new Error(`Unknown environment "${key}". Available: ${ENV_NAMES.join(', ')}`);
  return env;
}

function envParam(required = false) {
  return {
    environment: {
      type: 'string',
      description: `Target environment: ${ENV_NAMES.join(', ')}${required ? '' : ' (default: ' + ENV_NAMES[0] + ')'}`,
      ...(required ? {} : {}),
    },
  };
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_environments',
    description: 'List all configured Docker environments (local, dev, stg, prod)',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_containers',
    description: 'List all containers (running and stopped) with status, image, ports, and names',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        all: { type: 'boolean', description: 'Include stopped containers (default: true)' },
        filter: { type: 'string', description: 'Filter by name, status, or label (e.g. "name=nginx", "status=running")' },
      },
      required: [],
    },
  },
  {
    name: 'get_container_logs',
    description: 'Get logs from a container with optional tail and time filtering',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        container: { type: 'string', description: 'Container name or ID' },
        tail: { type: 'number', description: 'Number of lines from end (default: 100)' },
        since: { type: 'string', description: 'Show logs since timestamp or relative (e.g. "10m", "2h", "2026-05-01T00:00:00")' },
        timestamps: { type: 'boolean', description: 'Show timestamps on each line (default: true)' },
      },
      required: ['container'],
    },
  },
  {
    name: 'inspect_container',
    description: 'Get full details of a container: config, network settings, mounts, environment variables, health status',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        container: { type: 'string', description: 'Container name or ID' },
      },
      required: ['container'],
    },
  },
  {
    name: 'get_container_stats',
    description: 'Get real-time resource usage snapshot: CPU %, memory usage, network I/O, block I/O',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        container: { type: 'string', description: 'Container name or ID (omit for all containers)' },
      },
      required: [],
    },
  },
  {
    name: 'start_container',
    description: 'Start a stopped container',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        container: { type: 'string', description: 'Container name or ID' },
      },
      required: ['container'],
    },
  },
  {
    name: 'stop_container',
    description: 'Stop a running container gracefully (SIGTERM, then SIGKILL after timeout)',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        container: { type: 'string', description: 'Container name or ID' },
        timeout: { type: 'number', description: 'Seconds to wait before killing (default: 10)' },
      },
      required: ['container'],
    },
  },
  {
    name: 'restart_container',
    description: 'Restart a container (stop + start)',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        container: { type: 'string', description: 'Container name or ID' },
        timeout: { type: 'number', description: 'Seconds to wait before kill during stop (default: 10)' },
      },
      required: ['container'],
    },
  },
  {
    name: 'remove_container',
    description: 'Remove a stopped container',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        container: { type: 'string', description: 'Container name or ID' },
        force: { type: 'boolean', description: 'Force removal of running container (default: false)' },
      },
      required: ['container'],
    },
  },
  {
    name: 'exec_in_container',
    description: 'Run a command inside a running container and return output. Use for diagnostics only (non-destructive commands recommended).',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        container: { type: 'string', description: 'Container name or ID' },
        command: { type: 'string', description: 'Command to run inside the container (e.g. "ls /app", "cat /etc/hosts", "env", "ps aux")' },
      },
      required: ['container', 'command'],
    },
  },
  {
    name: 'list_images',
    description: 'List all Docker images with repository, tag, size, and creation date',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        filter: { type: 'string', description: 'Filter images (e.g. "dangling=true", "reference=nginx*")' },
      },
      required: [],
    },
  },
  {
    name: 'pull_image',
    description: 'Pull a Docker image from a registry',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        image: { type: 'string', description: 'Image name with optional tag (e.g. "nginx:latest", "myapp:v1.2.3")' },
      },
      required: ['image'],
    },
  },
  {
    name: 'remove_image',
    description: 'Remove a Docker image',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        image: { type: 'string', description: 'Image name or ID' },
        force: { type: 'boolean', description: 'Force removal even if image is used by stopped containers (default: false)' },
      },
      required: ['image'],
    },
  },
  {
    name: 'list_networks',
    description: 'List all Docker networks with driver, scope, and subnet info',
    inputSchema: {
      type: 'object',
      properties: { ...envParam() },
      required: [],
    },
  },
  {
    name: 'inspect_network',
    description: 'Get detailed info about a Docker network including connected containers',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        network: { type: 'string', description: 'Network name or ID' },
      },
      required: ['network'],
    },
  },
  {
    name: 'list_volumes',
    description: 'List all Docker volumes with driver and mount point',
    inputSchema: {
      type: 'object',
      properties: { ...envParam() },
      required: [],
    },
  },
  {
    name: 'inspect_volume',
    description: 'Get details about a Docker volume including its mount path',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        volume: { type: 'string', description: 'Volume name' },
      },
      required: ['volume'],
    },
  },
  {
    name: 'system_info',
    description: 'Get Docker system info: server version, OS, kernel, CPU/memory, number of containers and images',
    inputSchema: {
      type: 'object',
      properties: { ...envParam() },
      required: [],
    },
  },
  {
    name: 'disk_usage',
    description: 'Show Docker disk usage: images, containers, volumes, build cache with reclaimable sizes',
    inputSchema: {
      type: 'object',
      properties: { ...envParam() },
      required: [],
    },
  },
  {
    name: 'list_compose_services',
    description: 'List Docker Compose services and their status in a given project directory',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
        project_dir: { type: 'string', description: 'Absolute path to the directory containing docker-compose.yml' },
        project_name: { type: 'string', description: 'Compose project name (alternative to project_dir)' },
      },
      required: [],
    },
  },
  {
    name: 'compose_logs',
    description: 'Get logs from a Docker Compose service',
    inputSchema: {
      type: 'object',
      properties: {
        ...envParam(),
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
      type: 'object',
      properties: {
        ...envParam(),
        project_dir: { type: 'string', description: 'Absolute path to directory with docker-compose.yml' },
        service: { type: 'string', description: 'Service name (omit to restart all)' },
      },
      required: ['project_dir'],
    },
  },
];

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'mcp-docker-engine', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const a = args as Record<string, unknown>;

  try {
    let result: string;

    switch (name) {
      case 'list_environments': {
        const list = Object.values(ENVS).map(e =>
          e.type === 'local'
            ? `• local — Docker socket on this machine`
            : `• ${e.name} — SSH → ${e.sshHost}`
        );
        result = `Configured environments:\n${list.join('\n')}`;
        break;
      }

      case 'list_containers': {
        const env = getEnv(a.environment as string);
        const allFlag = a.all !== false ? ' -a' : '';
        const filterFlag = a.filter ? ` --filter "${a.filter}"` : '';
        result = await runDocker(env, `ps${allFlag}${filterFlag} --format "table {{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}\t{{.ID}}"`);
        break;
      }

      case 'get_container_logs': {
        const env = getEnv(a.environment as string);
        const tail = a.tail ?? 100;
        const ts = a.timestamps !== false ? ' -t' : '';
        const since = a.since ? ` --since "${a.since}"` : '';
        result = await runDocker(env, `logs --tail ${tail}${ts}${since} ${a.container}`);
        break;
      }

      case 'inspect_container': {
        const env = getEnv(a.environment as string);
        result = await runDocker(env, `inspect ${a.container}`);
        break;
      }

      case 'get_container_stats': {
        const env = getEnv(a.environment as string);
        const target = a.container ? ` ${a.container}` : '';
        result = await runDocker(env, `stats --no-stream${target} --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"`);
        break;
      }

      case 'start_container': {
        const env = getEnv(a.environment as string);
        result = await runDocker(env, `start ${a.container}`);
        break;
      }

      case 'stop_container': {
        const env = getEnv(a.environment as string);
        const timeout = a.timeout ?? 10;
        result = await runDocker(env, `stop --time ${timeout} ${a.container}`);
        break;
      }

      case 'restart_container': {
        const env = getEnv(a.environment as string);
        const timeout = a.timeout ?? 10;
        result = await runDocker(env, `restart --time ${timeout} ${a.container}`);
        break;
      }

      case 'remove_container': {
        const env = getEnv(a.environment as string);
        const force = a.force ? ' -f' : '';
        result = await runDocker(env, `rm${force} ${a.container}`);
        break;
      }

      case 'exec_in_container': {
        const env = getEnv(a.environment as string);
        result = await runDocker(env, `exec ${a.container} sh -c "${(a.command as string).replace(/"/g, '\\"')}"`);
        break;
      }

      case 'list_images': {
        const env = getEnv(a.environment as string);
        const filterFlag = a.filter ? ` --filter "${a.filter}"` : '';
        result = await runDocker(env, `images${filterFlag} --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}\t{{.ID}}"`);
        break;
      }

      case 'pull_image': {
        const env = getEnv(a.environment as string);
        result = await runDocker(env, `pull ${a.image}`);
        break;
      }

      case 'remove_image': {
        const env = getEnv(a.environment as string);
        const force = a.force ? ' -f' : '';
        result = await runDocker(env, `rmi${force} ${a.image}`);
        break;
      }

      case 'list_networks': {
        const env = getEnv(a.environment as string);
        result = await runDocker(env, `network ls --format "table {{.Name}}\t{{.Driver}}\t{{.Scope}}\t{{.ID}}"`);
        break;
      }

      case 'inspect_network': {
        const env = getEnv(a.environment as string);
        result = await runDocker(env, `network inspect ${a.network}`);
        break;
      }

      case 'list_volumes': {
        const env = getEnv(a.environment as string);
        result = await runDocker(env, `volume ls --format "table {{.Name}}\t{{.Driver}}\t{{.Mountpoint}}"`);
        break;
      }

      case 'inspect_volume': {
        const env = getEnv(a.environment as string);
        result = await runDocker(env, `volume inspect ${a.volume}`);
        break;
      }

      case 'system_info': {
        const env = getEnv(a.environment as string);
        result = await runDocker(env, `info`);
        break;
      }

      case 'disk_usage': {
        const env = getEnv(a.environment as string);
        result = await runDocker(env, `system df -v`);
        break;
      }

      case 'list_compose_services': {
        const env = getEnv(a.environment as string);
        const projectFlag = a.project_dir
          ? ` -f "${a.project_dir}/docker-compose.yml"`
          : a.project_name ? ` -p ${a.project_name}` : '';
        result = await runDocker(env, `compose${projectFlag} ps`);
        break;
      }

      case 'compose_logs': {
        const env = getEnv(a.environment as string);
        const tail = a.tail ?? 100;
        const since = a.since ? ` --since "${a.since}"` : '';
        const service = a.service ? ` ${a.service}` : '';
        result = await runDocker(env, `compose -f "${a.project_dir}/docker-compose.yml" logs --tail ${tail}${since}${service}`);
        break;
      }

      case 'compose_restart': {
        const env = getEnv(a.environment as string);
        const service = a.service ? ` ${a.service}` : '';
        result = await runDocker(env, `compose -f "${a.project_dir}/docker-compose.yml" restart${service}`);
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: result || '(no output)' }],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
