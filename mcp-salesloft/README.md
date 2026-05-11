# mcp-salesloft — Salesloft MCP Server

> Salesloft sales engagement platform — manage people, cadences, accounts, and call/email activities.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-salesloft`

---

## What You Can Do

This MCP server gives AI agents access to Salesloft via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Salesloft directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_people` | List people/contacts in Salesloft with their email, name, title, and account. |
| `get_person` | Get full person details by ID including email, name, title, cadences, and account. |
| `create_person` | Create a new person (contact) in Salesloft. Email is required. |
| `list_cadences` | List all sales cadences in Salesloft. |
| `list_accounts` | List all accounts in Salesloft. |
| `list_calls` | List call activities in Salesloft. |
| `list_emails` | List email activities in Salesloft. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SALESLOFT_API_KEY` | Yes | Your Salesloft API key — found in Salesloft Settings → API → API Keys |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Salesloft"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `SALESLOFT_API_KEY`

Once added, every AI agent in your workspace can use Salesloft tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-salesloft \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SALESLOFT-API-KEY: your-salesloft-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_people","arguments":{}}}'
```

## License

MIT
