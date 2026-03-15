# mcp-google-drive

MCP server for Google Drive — list, search, copy, move, share files and export Google Docs as PDF.

Deployed as a Cloudflare Worker. Secrets injected via `X-Mcp-Secret-*` headers from the Aerostack gateway.

## Secret

| Header | Maps To |
|--------|---------|
| `X-Mcp-Secret-GOOGLE-ACCESS-TOKEN` | Google OAuth2 access token (`Authorization: Bearer {token}`) |

## Tools (10)

| Tool | Description |
|------|-------------|
| `list_files` | List files in Google Drive, optionally filtered by folder or MIME type |
| `get_file_metadata` | Get metadata for a specific file |
| `search_files` | Search for files by name or full text content |
| `create_folder` | Create a new folder |
| `move_file` | Move a file to a different folder |
| `copy_file` | Copy a file |
| `delete_file` | Delete a file or folder |
| `share_file` | Share a file with a user or make it public |
| `export_file_as_pdf` | Export a Google Docs/Sheets/Slides file as a PDF (base64 encoded) |
| `list_shared_drives` | List all shared drives (Team Drives) |

## Deploy

```bash
npx wrangler deploy
```

## Test

```bash
npm test
```
