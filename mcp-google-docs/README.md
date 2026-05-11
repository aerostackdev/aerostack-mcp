# mcp-google-docs — Google Docs MCP Server

> Create, read, edit, and format Google Docs — paragraph styling, tables, images, comments, and real-time collaboration via Google Docs API.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-google-docs`

---

## What You Can Do

This MCP server gives AI agents access to Google Docs via 15 tools. Connect it to any Aerostack workspace and your agents can interact with Google Docs directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `create_document` | Create a new blank Google Doc with a title |
| `get_document` | Get a document with its full content structure (paragraphs, tables, lists) |
| `list_documents` | List Google Docs in Drive with title, last modified, and sharing info |
| `insert_text` | Insert text at a specific position in the document |
| `append_text` | Append text to the end of the document |
| `replace_text` | Find and replace text throughout the document |
| `delete_content` | Delete content in a range of character indices |
| `format_text` | Apply formatting (bold, italic, font size, color) to a text range |
| `set_paragraph_style` | Set paragraph heading level, alignment, or spacing |
| `insert_table` | Insert a table at a position in the document |
| `list_comments` | List all comments on a document with replies |
| `add_comment` | Add a comment to the document (anchored to quoted text) |
| `resolve_comment` | Resolve (close) a comment |
| `share_document` | Share a document with a user (viewer, commenter, or editor) |
| `get_document_permissions` | List who has access to a document and their roles |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_ACCESS_TOKEN` | Yes | Google OAuth 2.0 access token (requires docs.googleapis.com and drive.googleapis.com scopes) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Google Docs"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `GOOGLE_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Google Docs tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-google-docs \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: your-google-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_document","arguments":{}}}'
```

## License

MIT
