# Figma Design MCP

> Official proxy MCP — Files, frames, components, comments, variables via Figma's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-figma`

---

## Overview

Figma Design is a proxy MCP server that forwards requests directly to the official Figma MCP endpoint at `https://mcp.figma.com/mcp`. All tools are maintained by Figma — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Figma)
**Auth:** Bearer token via `FIGMA_ACCESS_TOKEN`

## Available Tools

- **get_file** — Retrieve a Figma file's full document tree including all pages, frames, and layers
- **list_projects** — List all projects in a Figma team, including project IDs and names
- **get_components** — Retrieve all published components from a Figma file including their descriptions and thumbnails
- **export_node** — Export one or more Figma nodes as PNG, JPG, SVG, or PDF at a specified scale
- **get_comments** — Retrieve all comments on a Figma file, including resolved comments and replies

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `FIGMA_ACCESS_TOKEN` | Yes | Figma Personal Access Token | figma.com → Settings → Account → Personal access tokens → Generate new token |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Figma Design"**
3. Enter your `FIGMA_ACCESS_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Figma tools automatically.

## Usage

### Example Prompts

```
"List all my Figma items and summarize the most recent ones"
"Find anything related to [keyword] in Figma"
"Create a new entry with the following details: ..."
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-figma \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FIGMA-ACCESS-TOKEN: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_file","arguments":{}}}'
```

## License

MIT
