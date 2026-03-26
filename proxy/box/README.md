# Box Content Management MCP

> Official proxy MCP — Files, folders, search, metadata, sharing, comments, collaborations via Box's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-box`

---

## Overview

Box Content Management is a proxy MCP server that forwards requests directly to the official Box MCP endpoint at `https://mcp.box.com/mcp`. All tools are maintained by Box — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Box)
**Auth:** Bearer token via `BOX_ACCESS_TOKEN`

## Available Tools

- **search_content** — Search for files, folders, and web links across all accessible Box content by keyword or type
- **list_folder_items** — List all files and subfolders within a Box folder with name, size, and permissions
- **get_file_info** — Retrieve detailed metadata for a file including versions, tags, and shared links
- **create_shared_link** — Create or update a shared link for a file or folder with access level and password
- **add_comment** — Add a comment to a Box file with optional @mentions

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `BOX_ACCESS_TOKEN` | Yes | Box OAuth2 Access Token or Developer Token | app.box.com/developers/console → My Apps → your app → Configuration → Developer Token → Generate |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Box Content Management"**
3. Enter your `BOX_ACCESS_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Box tools automatically.

## Usage

### Example Prompts

```
"Search my Box for all PDF files related to Q4 financial reports"
"List everything in the Marketing Assets folder"
"Create a shared link for the design-v2.fig file with company-only access"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-box \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-BOX-ACCESS-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_content","arguments":{"query":"quarterly report"}}}'
```

## License

MIT
