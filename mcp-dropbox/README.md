# mcp-dropbox — Dropbox MCP Server

> List, upload, download, search, move, and manage files and folders in Dropbox — AI-native cloud storage for any agent.

Give your AI agents full access to Dropbox. Browse folders, search files, upload and download content, create shared links, and organize your file tree — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-dropbox`

---

## What You Can Do

- Browse files and folders with pagination and recursive listing
- Download text files inline or get temporary links for binary files
- Upload text, JSON, CSV, and other content to any path
- Search across your entire Dropbox by name or content
- Create, move, rename, and delete files and folders
- Generate shared links for any file or folder
- Inspect file metadata (size, modified date, content hash)

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify Dropbox connectivity by fetching account info |
| `list_folder` | List files and folders at a path with pagination |
| `get_file_metadata` | Get metadata for a file or folder (size, modified, hash) |
| `download_file` | Download text inline or get a temporary link for binary files |
| `upload_file` | Upload text content to a file (create or overwrite) |
| `search` | Search files and folders by name or content |
| `create_folder` | Create a new folder at a given path |
| `delete` | Delete a file or folder and all its contents |
| `move` | Move or rename a file or folder |
| `get_shared_link` | Get or create a shared link for a file or folder |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `DROPBOX_ACCESS_TOKEN` | Yes | Dropbox OAuth2 access token with files and sharing scopes | dropbox.com/developers → Create App → Generate access token (or use OAuth flow for long-lived tokens) |

> **Recommended scopes:** `files.metadata.read`, `files.metadata.write`, `files.content.read`, `files.content.write`, `sharing.read`, `sharing.write`

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Dropbox"** and click **Add to Workspace**
3. Add `DROPBOX_ACCESS_TOKEN` under **Project → Secrets**

### Example Prompts

```
"List all files in my Documents folder"
"Search for any PDF files containing 'quarterly report'"
"Upload this meeting notes text to /Notes/2026-03-24.md"
"Download the config.json from /Projects/my-app/"
"Create a shared link for /Reports/Q1-2026.pdf"
"Move /Drafts/proposal.docx to /Final/proposal-v2.docx"
"Create a new folder at /Projects/new-client"
"Delete the old backups folder at /Archive/2024"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-dropbox \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DROPBOX-ACCESS-TOKEN: sl.B...' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_folder","arguments":{"path":""}}}'
```

## Security Notes

- Dropbox access token is injected at the Aerostack gateway layer — never stored in the worker
- Temporary download links from `download_file` expire after 4 hours
- Text files under 1MB are returned inline; larger or binary files return a temporary download URL
- Consider using scoped access tokens restricted to specific folders for production use

## License

MIT
