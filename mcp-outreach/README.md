# mcp-outreach — Outreach MCP Server

> Outreach sales engagement platform — manage prospects, accounts, sequences, and sequence states for enterprise sales automation.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-outreach`

---

## What You Can Do

This MCP server gives AI agents access to Outreach via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Outreach directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_prospects` | List prospects in Outreach. Returns emails, name, title, and sequence membership. |
| `get_prospect` | Get full prospect details by ID including emails, name, title, and relationships. |
| `create_prospect` | Create a new prospect in Outreach. Email is required. |
| `update_prospect` | Update an existing prospect. Provide only the fields to change. |
| `list_sequences` | List all sequences (cadences) in Outreach. |
| `list_accounts` | List all accounts in Outreach. |
| `create_account` | Create a new account in Outreach. Account name is required. |
| `list_sequence_states` | List prospect-sequence states, optionally filtered by state. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `OUTREACH_ACCESS_TOKEN` | Yes | Your Outreach OAuth2 access token — obtained via Outreach OAuth flow |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Outreach"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `OUTREACH_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Outreach tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-outreach \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-OUTREACH-ACCESS-TOKEN: your-outreach-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_prospects","arguments":{}}}'
```

## License

MIT
