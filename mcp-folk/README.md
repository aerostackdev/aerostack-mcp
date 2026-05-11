# mcp-folk — Folk MCP Server

> Manage people, groups, companies, notes, and pipelines in Folk CRM for modern relationship management.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-folk`

---

## What You Can Do

This MCP server gives AI agents access to Folk via 16 tools. Connect it to any Aerostack workspace and your agents can interact with Folk directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_people` | List people in Folk CRM |
| `create_person` | Create a new person in Folk CRM |
| `get_person` | Get a specific person by ID |
| `update_person` | Update a person in Folk CRM |
| `delete_person` | Delete a person from Folk CRM |
| `list_groups` | List groups in Folk CRM |
| `create_group` | Create a new group in Folk CRM |
| `add_to_group` | Add people to a Folk CRM group |
| `remove_from_group` | Remove people from a Folk CRM group |
| `list_companies` | List companies in Folk CRM |
| `create_company` | Create a new company in Folk CRM |
| `get_company` | Get a specific company by ID |
| `list_notes` | List notes for a person |
| `create_note` | Create a note for a person |
| `list_pipelines` | List pipelines in Folk CRM |
| `add_pipeline_item` | Add a person to a pipeline stage |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `FOLK_API_KEY` | Yes | Your FOLK API KEY from the service's developer settings |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Folk"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `FOLK_API_KEY`

Once added, every AI agent in your workspace can use Folk tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-folk \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FOLK-API-KEY: your-folk-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_people","arguments":{}}}'
```

## License

MIT
