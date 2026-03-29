# mcp-miro — Miro MCP Server

> Create and manage Miro boards, add sticky notes, cards, shapes, frames, and connectors — visual collaboration for AI agents.

Miro is the leading visual collaboration platform used by product, design, and engineering teams worldwide. This MCP server gives AI agents the ability to create and manage boards, add all major item types (cards, sticky notes, text, shapes, frames, connectors), manage board members, and inspect org/team context.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-miro`

---

## What You Can Do

- Create a full Miro board from a specification in natural language — frames, cards, sticky notes, shapes, and connectors
- Populate retrospective boards with sticky notes automatically from structured input
- Build org chart or architecture diagrams using shapes and connectors
- List and search boards, manage member access, and retrieve token context
- Update or delete existing items to maintain boards programmatically

## Available Tools

| Tool | Description |
|------|-------------|
| list_boards | List boards with optional search query, teamId filter, limit (max 50), and cursor pagination |
| get_board | Get board details — name, description, team, viewLink, created/modified timestamps |
| create_board | Create a new board with name, description, teamId, and sharingPolicy |
| update_board | Update board name, description, or sharing policy |
| delete_board | Permanently delete a board |
| list_items | List items on a board with optional type filter and cursor pagination |
| create_card | Create a card with title, description, fill color, and position |
| create_sticky_note | Create a sticky note with content, fill color, shape (square/rectangle), and position |
| create_text | Create a text item with content, font size, alignment, color, and position |
| create_shape | Create a shape (rectangle, circle, triangle, etc.) with optional text content and styling |
| get_item | Get a specific item by ID |
| update_item | Update item content, style, or position — specify item_type for correct routing |
| create_frame | Create a frame container with title, fill color, position, and dimensions |
| list_frames | List all frames on a board |
| create_connector | Create a connector (arrow/line) between two items with optional stroke styling |
| delete_item | Delete an item from a board |
| list_board_members | List board members with roles — supports cursor pagination |
| get_board_member | Get details for a specific board member |
| invite_board_member | Invite users to a board by email with viewer/commenter/editor role |
| list_teams | List all accessible teams in the organisation |
| get_team | Get team details by ID |
| get_token_context | Get current token info — user ID, scopes, team context |
| _ping | Confirm auth by listing boards — returns board list to verify token |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| MIRO_ACCESS_TOKEN | Yes | Miro OAuth access token | Create an app at [developers.miro.com](https://developers.miro.com), add OAuth scopes, and authorize with your Miro account. Required scopes: `boards:read`, `boards:write`, `identity:read`. |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Miro"** and click **Add to Workspace**
3. Add your `MIRO_ACCESS_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can create and manage Miro boards automatically.

### Example Prompts

```
"Create a Miro board for our Q2 sprint planning and add a frame for each sprint week"
"Add a sticky note to board uXjVOaabbcc= saying 'Ship the feature by Friday'"
"Create a flow diagram with three shapes connected by arrows on my Architecture board"
"List all boards in the Engineering team"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-miro \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MIRO-ACCESS-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_sticky_note","arguments":{"board_id":"uXjVOaabbcc=","content":"Ship it!","style":{"fillColor":"#ffd700"},"shape":"square","position":{"x":0,"y":0}}}}'
```

## Notes

- **Rate limits:** The Miro API enforces 100,000 credits/minute. Most read calls cost ~100 credits; write calls cost 300–500 credits. A single board with 100 items costs roughly 500 credits to list.
- **Pagination:** List endpoints use cursor-based pagination. Pass the `cursor` value from a response to get the next page. `limit` is capped at 50 for boards and items.
- **`update_item` requires `item_type`** — the Miro API uses type-specific URLs (`/cards`, `/sticky_notes`, `/shapes`, etc.). Always pass the item type when updating.
- **Board IDs** look like `uXjVOaabbcc=` — use `list_boards` or `get_board` to discover them.
- **Connector styling** supports `strokeColor` (hex), `strokeWidth` (number), and `strokeStyle` (normal/dashed/dotted).

## License

MIT
