# Zapier Automation MCP

> Official proxy MCP — 8,000+ app integrations, trigger Zaps, run actions across Gmail, Slack, Sheets, HubSpot via Zapier's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-zapier`

---

## Overview

Zapier Automation is a proxy MCP server that forwards requests directly to the official Zapier MCP endpoint at `https://mcp.zapier.com/mcp`. All tools are maintained by Zapier — new integrations and actions are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Zapier)
**Auth:** Bearer token via `ZAPIER_MCP_API_KEY`

> **Note:** Each `run_action` call counts as 2 Zapier tasks against your plan quota.

## Available Tools

- **list_available_actions** — List all available actions across your connected Zapier apps
- **run_action** — Execute an action in a connected app (send emails, create rows, post messages, etc.)
- **get_action_details** — Get full details about a specific action including required parameters
- **list_zaps** — List your Zaps (automated workflows) with status and last run time
- **toggle_zap** — Turn a Zap on or off to enable or disable an automated workflow

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `ZAPIER_MCP_API_KEY` | Yes | Zapier MCP API Key | zapier.com/mcp → Sign in → Connect apps → Copy the API key from setup page |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Zapier Automation"**
3. Enter your `ZAPIER_MCP_API_KEY` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can trigger Zapier actions automatically.

## Usage

### Example Prompts

```
"List all actions I can run in Zapier"
"Send an email via Gmail to john@example.com with subject 'Meeting Notes'"
"Add a row to my Google Sheet with today's sales numbers"
"Turn off the Slack notification Zap temporarily"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-zapier \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ZAPIER-MCP-API-KEY: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_available_actions","arguments":{}}}'
```

## License

MIT
