# mcp-google-drive — Google Drive MCP Server

> List, search, organize, share, and export files in Google Drive from your AI agents.

Google Drive is where teams store documents, spreadsheets, presentations, and more. This MCP server gives your AI agents the ability to search files, organize them into folders, share with specific people, and export Google Docs as PDFs — making it possible to automate file management workflows that would otherwise require manual drag-and-drop.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-google-drive`

---

## What You Can Do

- Search across all Drive files by name or content to find documents relevant to a task or query
- Organize files automatically by moving them into the right folders based on type, date, or metadata
- Share files with teammates or make them public as part of a publishing or handoff workflow
- Export Google Docs, Sheets, or Slides as PDFs for distribution without losing formatting

## Available Tools

| Tool | Description |
|------|-------------|
| `list_files` | List files in Google Drive, optionally filtered by folder or MIME type |
| `get_file_metadata` | Get metadata for a specific file (name, size, owner, modified date) |
| `search_files` | Search for files by name or full text content |
| `create_folder` | Create a new folder |
| `move_file` | Move a file to a different folder |
| `copy_file` | Copy a file |
| `delete_file` | Delete a file or folder |
| `share_file` | Share a file with a user or make it publicly accessible |
| `export_file_as_pdf` | Export a Google Docs/Sheets/Slides file as a PDF (base64 encoded) |
| `list_shared_drives` | List all shared drives (Team Drives) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `GOOGLE_ACCESS_TOKEN` | Yes | Google OAuth2 access token with Drive scope | [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials** → OAuth 2.0 → generate token with `https://www.googleapis.com/auth/drive` scope. Use OAuth Playground at [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground) for quick testing. |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Google Drive"** and click **Add to Workspace**
3. Add your `GOOGLE_ACCESS_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call Google Drive tools automatically — no per-user setup needed.

### Example Prompts

```
"Find all documents in my Drive that mention the Q4 budget and list them with their last modified date"
"Move all files in the Drafts folder to the Published folder and share them with the team@company.com group"
"Export the Product Roadmap Google Doc as a PDF"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-google-drive \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: your-oauth-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_files","arguments":{}}}'
```

## License

MIT
