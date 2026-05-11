# mcp-heygen — Heygen MCP Server

> HeyGen AI video generation — create avatar videos, check generation status, manage voices, and track quota.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-heygen`

---

## What You Can Do

This MCP server gives AI agents access to Heygen via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Heygen directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_avatars` | List all available avatars in HeyGen. |
| `list_voices` | List all available voices for video generation. |
| `create_video` | Generate an AI video with an avatar speaking the provided text. |
| `get_video_status` | Check the generation status and get the video URL when complete. |
| `list_videos` | List previously generated videos. |
| `delete_video` | Delete a generated video. This action cannot be undone. |
| `get_remaining_quota` | Get the remaining video generation quota for your account. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `HEYGEN_API_KEY` | Yes | Your HeyGen API key — found in HeyGen Dashboard → Account → API Token |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Heygen"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `HEYGEN_API_KEY`

Once added, every AI agent in your workspace can use Heygen tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-heygen \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-HEYGEN-API-KEY: your-heygen-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_avatars","arguments":{}}}'
```

## License

MIT
