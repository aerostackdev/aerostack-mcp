# Monday.com Work Management MCP

> Official proxy MCP — Boards, items, columns, groups, updates, subitems, workspaces via Monday.com's official MCP

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-monday`

---

## Overview

Monday.com Work Management is a proxy MCP server that forwards requests directly to the official Monday.com MCP endpoint at `https://mcp.monday.com/mcp`. All tools are maintained by Monday.com — new tools are available immediately without any Aerostack update.

**Type:** Proxy (hosted by Monday.com)
**Auth:** Bearer token via `MONDAY_ACCESS_TOKEN`

> **Prerequisite:** A Monday.com workspace admin must install the Monday MCP app from the Monday marketplace before tokens can be used.

## Available Tools

- **list_boards** — List all accessible boards with name, columns, groups, and board metadata
- **get_board_items** — Retrieve all items (rows) from a board with column values, subitems, and updates
- **create_item** — Create a new item on a board with column values and optional group assignment
- **update_item** — Update column values of an existing item
- **create_update** — Post an update (comment) on an item with rich text body

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `MONDAY_ACCESS_TOKEN` | Yes | Monday.com API Token (personal or OAuth2) | monday.com → Avatar (bottom-left) → Developers → My access tokens → Show |

## Setup

### Add to Aerostack Workspace

1. Go to [app.aerostack.dev/workspaces](https://app.aerostack.dev/workspaces) → **Create Workspace**
2. Inside your workspace → **Add Server** → search **"Monday.com Work Management"**
3. Enter your `MONDAY_ACCESS_TOKEN` when prompted — stored encrypted, injected automatically

Once added, every AI agent in your workspace can use Monday.com tools automatically.

## Usage

### Example Prompts

```
"List all boards in my workspace and summarize their status"
"Create a new item on the Sprint Board: Fix login timeout bug, assign to me, due Friday"
"Get all items from the Roadmap board that are in the 'In Progress' group"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-monday \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MONDAY-ACCESS-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_boards","arguments":{}}}'
```

## License

MIT
