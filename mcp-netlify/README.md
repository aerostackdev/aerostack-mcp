# mcp-netlify — Netlify MCP Server

> Deploy and manage Netlify sites, triggers deploys, manages forms and environment variables.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-netlify`

---

## What You Can Do

This MCP server gives AI agents access to Netlify via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Netlify directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_sites` | List all Netlify sites in your account |
| `get_site` | Get details of a specific Netlify site |
| `create_site` | Create a new Netlify site |
| `update_site` | Update a Netlify site |
| `delete_site` | Delete a Netlify site |
| `list_deploys` | List deploys for a Netlify site |
| `get_deploy` | Get details of a specific deploy |
| `trigger_deploy` | Trigger a new build/deploy for a site |
| `list_forms` | List forms for a Netlify site |
| `list_form_submissions` | List submissions for a specific form |
| `list_env_vars` | List environment variables for a site |
| `set_env_var` | Set an environment variable for a site |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `NETLIFY_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Netlify"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `NETLIFY_TOKEN`

Once added, every AI agent in your workspace can use Netlify tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-netlify \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-NETLIFY-TOKEN: your-netlify-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_sites","arguments":{}}}'
```

## License

MIT
