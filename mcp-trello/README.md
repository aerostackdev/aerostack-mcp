# mcp-trello — Trello MCP Server

> Automate your entire Trello workflow — manage boards, lists, cards, and checklists from any AI agent.

Trello is a visual project management tool used by millions of teams worldwide. This MCP server gives your agents complete access to the Trello REST API: browsing and creating boards, managing lists and cards, archiving and moving cards between lists, and managing checklists and checklist items to track granular task progress.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-trello`

---

## What You Can Do

- Automatically create boards, lists, and cards from external triggers — form submissions, webhooks, or pipeline events
- Move cards across lists as work progresses through your workflow stages
- Add checklists and mark items complete based on automated task tracking
- Archive or delete cards once work is done, keeping boards clean without manual effort

## Available Tools

| Tool | Description |
|------|-------------|
| _ping | Verify credentials by fetching the authenticated member profile |
| get_board | Get board details by ID — name, description, URL, lists, labels |
| list_boards | List all boards for the authenticated member |
| create_board | Create a new board with optional description and default lists |
| update_board | Update board name, description, or archive/unarchive it |
| get_board_members | Get all members of a board with their roles |
| get_lists | Get all lists on a board (filter: all, open, closed) |
| create_list | Create a new list on a board with position control |
| update_list | Rename a list or archive/unarchive it |
| move_list | Move a list to a different board |
| get_card | Get full card details — name, description, due date, labels, members, checklists |
| list_cards | List cards in a list (filter: all, open, closed) |
| create_card | Create a card in a list with name, description, due date, labels, members |
| update_card | Update card name, description, due date, position, or archive status |
| move_card | Move a card to a different list with position control |
| archive_card | Archive a card (hidden from board, not deleted) |
| delete_card | Permanently delete a card (irreversible) |
| get_card_checklists | Get all checklists on a card including item completion status |
| create_checklist | Create a checklist on a card |
| create_checklist_item | Add an item to a checklist |
| update_checklist_item | Mark a checklist item complete or incomplete |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| TRELLO_API_KEY | Yes | Your Trello Power-Up / developer API key | Go to [https://trello.com/power-ups/admin](https://trello.com/power-ups/admin) → create or select a Power-Up → API Key tab |
| TRELLO_TOKEN | Yes | Your Trello OAuth user token granting access to boards and cards | From the same Power-Up admin page → click "Token" link next to your API key → authorize access |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Trello"** and click **Add to Workspace**
3. Add your `TRELLO_API_KEY` and `TRELLO_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can manage Trello boards and cards automatically — no per-user setup needed.

### Example Prompts

```
"Create a new card in the 'To Do' list on my sprint board for the login bug fix"
"Move card abc123 to the 'Done' list"
"Add a checklist called 'Acceptance Criteria' to card xyz789 and mark the first item complete"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-trello \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TRELLO-API-KEY: your-api-key' \
  -H 'X-Mcp-Secret-TRELLO-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_boards","arguments":{}}}'
```

## License

MIT
