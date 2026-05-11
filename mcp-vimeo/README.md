# mcp-vimeo — Vimeo MCP Server

> Video hosting and management via Vimeo — upload videos, manage albums, update metadata, and get analytics.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-vimeo`

---

## What You Can Do

This MCP server gives AI agents access to Vimeo via 8 tools. Connect it to any Aerostack workspace and your agents can interact with Vimeo directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_me` | Get the authenticated Vimeo user profile and account details |
| `list_videos` | List the authenticated user |
| `get_video` | Get details for a specific video by ID |
| `delete_video` | Delete a video from Vimeo permanently |
| `edit_video` | Update video metadata such as title, description, or privacy settings |
| `list_albums` | List the authenticated user |
| `add_video_to_album` | Add a video to an album/showcase |
| `create_upload_link` | Initiate a video upload using the tus protocol and get an upload link |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `VIMEO_ACCESS_TOKEN` | Yes | Personal access token or service token from the provider |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Vimeo"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `VIMEO_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Vimeo tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-vimeo \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-VIMEO-ACCESS-TOKEN: your-vimeo-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_me","arguments":{}}}'
```

## License

MIT
