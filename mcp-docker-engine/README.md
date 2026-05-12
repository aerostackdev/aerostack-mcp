# mcp-docker-engine — Local Docker MCP Server

> Inspect containers, stream logs, run exec, and manage Docker across dev/stg/prod environments — all from Claude Code via SSH or local socket.

A **local stdio MCP server** that runs on your machine and gives Claude Code direct access to Docker Engine. Supports multiple environments (local, dev, stg, prod) with SSH-based access to remote Docker daemons — no need to expose Docker ports publicly.

---

## What You Can Do

- List all containers across any environment with status, image, ports, and uptime
- Tail logs from any container with time filters, line limits, and timestamps
- Exec commands inside running containers (`bash`, `sh`, diagnostic tools)
- Inspect container config, environment variables, mounts, network settings, and health
- Get real-time CPU/memory/network stats for running containers
- Start, stop, restart, or remove containers
- List and pull images; remove unused images
- Inspect Docker networks and volumes
- Run `docker system info`, `docker system df` for disk usage
- List Docker Compose services and stream their logs
- Restart individual Compose services

---

## Installation

```bash
cd /path/to/mcp-docker-engine
npm install
npm run build
```

---

## Add to Claude Code

Edit `~/.claude/mcp.json` (create it if it doesn't exist):

```json
{
  "mcpServers": {
    "docker-engine": {
      "command": "node",
      "args": ["/path/to/mcp-docker-engine/dist/index.js"],
      "env": {
        "DOCKER_LOCAL": "true",
        "DOCKER_DEV_HOST": "ubuntu@dev.yourdomain.com",
        "DOCKER_STG_HOST": "ubuntu@stg.yourdomain.com",
        "DOCKER_PROD_HOST": "ubuntu@prod.yourdomain.com",
        "DOCKER_SSH_KEY": "/Users/you/.ssh/id_rsa"
      }
    }
  }
}
```

Then restart Claude Code. The server will appear under **Settings → MCP Servers**.

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DOCKER_LOCAL` | No | Set to `true` to enable local Docker socket access |
| `DOCKER_DEV_HOST` | No | SSH target for dev environment (`user@host`) |
| `DOCKER_STG_HOST` | No | SSH target for staging environment (`user@host`) |
| `DOCKER_PROD_HOST` | No | SSH target for production environment (`user@host`) |
| `DOCKER_SSH_KEY` | No | Path to SSH private key (uses default SSH key if omitted) |
| `DOCKER_SSH_PORT` | No | SSH port (default: 22) |
| `DOCKER_ENV_<NAME>_HOST` | No | Add extra environments dynamically (e.g. `DOCKER_ENV_EU_HOST=ubuntu@eu.host.com` → environment `eu`) |

If no SSH hosts are configured, local mode is enabled automatically.

---

## SSH Setup

The MCP connects to remote Docker daemons over SSH using `docker` CLI commands piped through the SSH connection. Your SSH user needs `docker` in their PATH and must be in the `docker` group (or have sudo access).

```bash
# On the remote server — add your user to the docker group
sudo usermod -aG docker ubuntu

# Test SSH access works
ssh ubuntu@your-server.com "docker ps"
```

No Docker ports need to be open. The SSH connection is the only channel used.

---

## Example Prompts

```
"List all running containers on prod"
"Show me the last 200 lines of logs from the api container on stg"
"What's using the most CPU across all containers on dev?"
"Restart the nginx container on prod"
"Exec into the api container on dev and check the node version"
"What images are available on stg and when were they pulled?"
"Show me disk usage on the prod Docker daemon"
```

---

## Available Tools

| Tool | Description |
|------|-------------|
| `list_environments` | List all configured Docker environments |
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
| `compose_restart` | Restart a Compose service |

---

## Development

```bash
npm run dev    # Run with tsx (no build step, for development)
npm run build  # Compile TypeScript to dist/
npm start      # Run compiled dist/index.js
```

To test the server manually:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```

---

## Security Notes

- Docker access via SSH uses your existing SSH keys — no new credentials to manage
- The MCP process runs locally with the same permissions as your shell
- Remote commands are limited to `docker <args>` — no arbitrary shell execution on the remote host
- For production environments, consider a dedicated read-only SSH key with restricted commands via `authorized_keys` `command=` restriction

## License

MIT
