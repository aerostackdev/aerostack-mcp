# mcp-docker-engine-cf — Docker Engine MCP (Cloudflare Worker)

> Manage containers, images, volumes, and networks across dev/stg/prod environments — from any Aerostack agent via Cloudflare Tunnel.

A **Cloudflare Worker MCP** that calls `docker-relay` servers running on your infrastructure behind Cloudflare Tunnel. No Docker ports need to be exposed publicly — all traffic flows through signed HTTPS requests over the tunnel.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-docker-engine-cf`

---

## What You Can Do

- List and inspect containers with real-time CPU/memory stats
- Tail logs from any container with time and line filters
- Start, stop, restart, and remove containers
- Exec commands inside running containers for diagnostics
- Manage Docker images: list, pull, remove
- Inspect networks and volumes
- View Docker system info and disk usage
- Manage Docker Compose services: list, logs, restart

---

## Architecture

```
Aerostack Agent
      │
      ▼
mcp-docker-engine-cf  (this Worker — on Cloudflare edge)
      │  HTTPS + Bearer token
      ▼
Cloudflare Tunnel endpoint  (e.g. docker-dev.yourdomain.com)
      │
      ▼
docker-relay  (127.0.0.1:4242 on your server)
      │
      ▼
Docker Engine (local socket)
```

See `docker-relay/README.md` for per-server setup instructions.

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DOCKER_RELAY_SECRET` | Yes | Shared Bearer token — set same value in each `docker-relay` process and here |
| `DOCKER_DEV_URL` | No | Relay HTTPS URL for dev environment (e.g. `https://docker-dev.yourdomain.com`) |
| `DOCKER_STG_URL` | No | Relay HTTPS URL for staging environment |
| `DOCKER_PROD_URL` | No | Relay HTTPS URL for production environment |

At least one of `DOCKER_DEV_URL`, `DOCKER_STG_URL`, or `DOCKER_PROD_URL` must be set.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Docker Engine"** and click **Add to Workspace**
3. Add your credentials under **Project → Secrets**

### Example Prompts

```
"List all running containers on prod"
"Show me the last 200 log lines from the api container on stg"
"What's CPU/memory usage across all containers on dev?"
"Restart the nginx service in the web compose project on prod"
"What images are on dev and when were they pulled?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-docker-engine-cf \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DOCKER-RELAY-SECRET: your-relay-secret' \
  -H 'X-Mcp-Secret-DOCKER-DEV-URL: https://docker-dev.yourdomain.com' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_containers","arguments":{"environment":"dev"}}}'
```

---

## Available Tools

| Tool | Description |
|------|-------------|
| `list_environments` | List configured environments and their relay URLs |
| `list_containers` | List containers with status, image, ports (all or filtered) |
| `get_container_logs` | Tail logs with line count, since filter, and timestamps |
| `inspect_container` | Full container details: config, env vars, mounts, health |
| `get_container_stats` | Live CPU, memory, and network stats |
| `start_container` | Start a stopped container |
| `stop_container` | Stop a running container |
| `restart_container` | Restart a container |
| `remove_container` | Remove a container (force option for running containers) |
| `exec_in_container` | Run a command inside a running container |
| `list_images` | List Docker images with size and age |
| `pull_image` | Pull an image from a registry |
| `remove_image` | Remove a local image |
| `list_networks` | List Docker networks |
| `inspect_network` | Get network details including connected containers |
| `list_volumes` | List Docker volumes |
| `inspect_volume` | Get volume details and mount point |
| `system_info` | Docker daemon info: version, resources, runtime |
| `disk_usage` | Docker disk usage breakdown (images, containers, volumes) |
| `list_compose_services` | List services in a Docker Compose project |
| `compose_logs` | Get logs from a Compose service |
| `compose_restart` | Restart one or all Compose services |

## License

MIT
