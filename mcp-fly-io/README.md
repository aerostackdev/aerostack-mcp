# mcp-fly-io — Fly Io MCP Server

> Deploy and manage Fly.io apps and machines — create, start, stop, restart containers at the edge.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-fly-io`

---

## What You Can Do

This MCP server gives AI agents access to Fly Io via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Fly Io directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_apps` | List all Fly.io apps for an organization |
| `get_app` | Get details of a specific Fly.io app |
| `create_app` | Create a new Fly.io app |
| `delete_app` | Delete a Fly.io app |
| `list_machines` | List all machines for a Fly.io app |
| `get_machine` | Get details of a specific machine |
| `create_machine` | Create a new machine for a Fly.io app |
| `start_machine` | Start a stopped Fly.io machine |
| `stop_machine` | Stop a running Fly.io machine |
| `restart_machine` | Restart a Fly.io machine |
| `delete_machine` | Delete a Fly.io machine |
| `get_machine_events` | Get events for a specific Fly.io machine |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `FLY_API_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Fly Io"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `FLY_API_TOKEN`

Once added, every AI agent in your workspace can use Fly Io tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-fly-io \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FLY-API-TOKEN: your-fly-api-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_apps","arguments":{}}}'
```

## License

MIT
