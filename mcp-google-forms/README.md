# mcp-google-forms — Google Forms MCP Server

> Create and manage Google Forms — add questions, collect responses, and update form settings via the Google Forms API.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-google-forms`

---

## What You Can Do

This MCP server gives AI agents access to Google Forms via 10 tools. Connect it to any Aerostack workspace and your agents can interact with Google Forms directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_form` | Get a Google Form by ID including all questions and settings |
| `create_form` | Create a new Google Form |
| `update_form` | Update form title or description |
| `list_responses` | List responses to a form |
| `get_response` | Get a specific form response |
| `batch_update_form` | Execute a batch update on a form (pass-through for advanced operations) |
| `add_question` | Add a question to a form |
| `delete_item` | Delete a question or item from a form by index |
| `list_forms_via_drive` | List Google Forms visible in Drive |
| `get_form_schema` | Get a simplified schema overview of a form (items/questions only) |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Google Forms"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `GOOGLE_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Google Forms tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-google-forms \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: your-google-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_form","arguments":{}}}'
```

## License

MIT
