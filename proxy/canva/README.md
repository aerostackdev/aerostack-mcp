# Canva Design Platform MCP

> Official proxy MCP — Design creation, AI generation, editing, export, assets, brand kits, folders via Canva's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-canva`

---

## Overview

Canva Design Platform is a proxy MCP server that forwards requests directly to the official Canva MCP endpoint at `https://mcp.canva.com/mcp`. All tools are maintained by Canva — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Canva)
**Auth:** Bearer token via `CANVA_ACCESS_TOKEN`

## Available Tools

- **generate_design** — Generate a new design using AI from a text prompt with optional size and style preferences
- **search_designs** — Search your Canva designs by name, type, or keyword
- **export_design** — Export a design to PNG, JPG, PDF, SVG, MP4, or GIF with quality options
- **list_brand_kits** — List your brand kits with logos, colors, fonts, and brand guidelines
- **get_design** — Retrieve design details including thumbnail, page count, owner, and edit URL

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `CANVA_ACCESS_TOKEN` | Yes | Canva Connect API OAuth2 Access Token | canva.dev/console → Create integration → Configure OAuth scopes → Authenticate → Copy token. See: canva.dev/docs/connect/mcp-server |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Canva Design Platform"**
3. Enter your `CANVA_ACCESS_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Canva tools automatically.

## Usage

### Example Prompts

```
"Generate a modern Instagram post design for a product launch"
"Export my pitch deck as a PDF"
"Search for all designs tagged with 'Q4 campaign'"
"Show me my brand kit colors and fonts"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-canva \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CANVA-ACCESS-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"generate_design","arguments":{"prompt":"A minimalist tech conference poster"}}}'
```

## License

MIT
