# mcp-make — Make MCP Server

> No-code automation via Make (Integromat) — list scenarios, execute runs, manage connections and data stores.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-make`

---

## What You Can Do

This MCP server gives AI agents access to Make via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Make directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_scenarios` | List automation scenarios for the configured team |
| `get_scenario` | Get details of a specific Make scenario by ID |
| `run_scenario` | Trigger an immediate run of a Make scenario |
| `activate_scenario` | Enable (activate) a Make scenario so it runs on schedule |
| `deactivate_scenario` | Disable (deactivate) a Make scenario |
| `list_executions` | List execution logs for a Make scenario |
| `list_teams` | List teams in a Make organization |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MAKE_API_KEY` | Yes | Your MAKE API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Make"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `MAKE_API_KEY`

Once added, every AI agent in your workspace can use Make tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-make \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MAKE-API-KEY: your-make-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_scenarios","arguments":{}}}'
```

## License

MIT
