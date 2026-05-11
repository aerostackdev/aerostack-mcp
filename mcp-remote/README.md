# mcp-remote — Remote MCP Server

> Global employment and contractor management via Remote — manage employees, contractors, payroll, and compliance globally.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-remote`

---

## What You Can Do

This MCP server gives AI agents access to Remote via 6 tools. Connect it to any Aerostack workspace and your agents can interact with Remote directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_employments` | List all employments in your Remote organization with pagination. |
| `get_employment` | Get detailed information about a specific employment record. |
| `list_countries` | List all countries supported by Remote for employment. |
| `get_country` | Get employment requirements, compliance rules, and details for a specific country. |
| `list_time_offs` | List time off requests in your Remote organization. |
| `create_time_off` | Create a time off request for an employee in Remote. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `REMOTE_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Remote"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `REMOTE_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Remote tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-remote \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-REMOTE-ACCESS-TOKEN: your-remote-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_employments","arguments":{}}}'
```

## License

MIT
