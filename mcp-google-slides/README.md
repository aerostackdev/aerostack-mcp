# mcp-google-slides — Google Slides MCP Server

> Create and edit Google Slides presentations — add slides, text boxes, images, and run batch updates programmatically.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-google-slides`

---

## What You Can Do

This MCP server gives AI agents access to Google Slides via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Google Slides directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_presentations` | List all Google Slides presentations in Drive |
| `get_presentation` | Get a presentation by ID with all slides and content |
| `create_presentation` | Create a new Google Slides presentation |
| `get_slide` | Get a specific slide from a presentation by index |
| `add_slide` | Add a new slide to a presentation |
| `delete_slide` | Delete a slide from a presentation by object ID |
| `duplicate_slide` | Duplicate a slide in a presentation |
| `add_text_box` | Add a text box to a slide |
| `update_text` | Update text content of a shape on a slide |
| `add_image` | Add an image to a slide from a URL |
| `get_page_thumbnail` | Get a thumbnail image URL for a specific slide |
| `batch_update` | Execute a batch update on a presentation (pass-through for advanced operations) |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Google Slides"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `GOOGLE_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Google Slides tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-google-slides \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: your-google-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_presentations","arguments":{}}}'
```

## License

MIT
