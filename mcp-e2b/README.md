# mcp-e2b — E2b MCP Server

> Secure cloud sandboxes for AI code execution via E2B — create sandboxes, run code, manage files in isolated environments.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-e2b`

---

## What You Can Do

This MCP server gives AI agents access to E2b via 5 tools. Connect it to any Aerostack workspace and your agents can interact with E2b directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_templates` | List available E2B sandbox templates |
| `create_sandbox` | Create a new E2B sandbox from a template |
| `list_sandboxes` | List running E2B sandboxes |
| `get_sandbox` | Get details of a specific E2B sandbox |
| `kill_sandbox` | Kill (terminate) a running E2B sandbox |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `E2B_API_KEY` | Yes | Your E2B API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"E2b"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `E2B_API_KEY`

Once added, every AI agent in your workspace can use E2b tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-e2b \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-E2B-API-KEY: your-e2b-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_templates","arguments":{}}}'
```

## License

MIT
