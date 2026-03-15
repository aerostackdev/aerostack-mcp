# HubSpot CRM MCP

> Official proxy MCP — Contacts, deals, companies, tickets, workflows via HubSpot's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-hubspot`

---

## Overview

HubSpot CRM is a proxy MCP server that forwards requests directly to the official HubSpot MCP endpoint at `https://mcp.hubspot.com`. All tools are maintained by HubSpot — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by HubSpot)
**Auth:** Bearer token via `HUBSPOT_ACCESS_TOKEN`

## Available Tools

- **get_contact** — Retrieve a HubSpot contact by ID with all CRM properties and association data
- **create_contact** — Create a new HubSpot contact with email, name, phone, and any custom CRM properties
- **list_deals** — List CRM deals in HubSpot with optional filtering by pipeline, stage, or owner
- **update_deal** — Update properties of an existing HubSpot deal such as amount, stage, or close date
- **search_contacts** — Search HubSpot contacts using filter criteria on any CRM property with sorting support

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `HUBSPOT_ACCESS_TOKEN` | Yes | HubSpot Private App Access Token | app.hubspot.com → Settings → Integrations → Private Apps → Create private app |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"HubSpot CRM"**
3. Enter your `HUBSPOT_ACCESS_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use HubSpot tools automatically.

## Usage

### Example Prompts

```
"List all my HubSpot items and summarize the most recent ones"
"Find anything related to [keyword] in HubSpot"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-hubspot \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-HUBSPOT-ACCESS-TOKEN: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_contact","arguments":{}}}'
```

## License

MIT
