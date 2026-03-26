# Cloudflare Platform MCP

> Official proxy MCP — Cloudflare Workers, KV, R2, D1, Pages, DNS via Cloudflare's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-cloudflare`

---

## Overview

Cloudflare Platform is a proxy MCP server that forwards requests directly to the official Cloudflare MCP endpoint at `https://mcp.cloudflare.com/mcp`. All tools are maintained by Cloudflare — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Cloudflare)
**Auth:** Bearer token via `CLOUDFLARE_API_TOKEN`

## Available Tools

- **list_zones** — List all DNS zones (domains) in the Cloudflare account with status and nameserver details
- **purge_cache** — Purge cached files from Cloudflare's edge for a specific zone by URLs or purge everything
- **get_analytics** — Retrieve traffic analytics for a Cloudflare zone including requests, bandwidth, and threats
- **list_workers** — List all Cloudflare Workers scripts deployed in the account with their metadata
- **update_dns_record** — Create or update a DNS record (A, CNAME, MX, TXT, etc.) for a Cloudflare zone

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `CLOUDFLARE_API_TOKEN` | Yes | Cloudflare API Token with required permissions | dash.cloudflare.com → My Profile → API Tokens → Create Token |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Your Cloudflare Account ID | dash.cloudflare.com → right sidebar when viewing any zone |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Cloudflare Platform"**
3. Enter your `CLOUDFLARE_API_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Cloudflare tools automatically.

## Usage

### Example Prompts

```
"List all my Cloudflare items and summarize the most recent ones"
"Find anything related to [keyword] in Cloudflare"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-cloudflare \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CLOUDFLARE-API-TOKEN: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_zones","arguments":{}}}'
```

## License

MIT
