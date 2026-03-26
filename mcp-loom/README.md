# mcp-loom — Loom Video MCP Server

> List, search, and manage Loom video recordings — get transcripts, embed URLs, and video analytics from any AI agent.

Loom is an async video messaging platform for screen recordings and team communication. This MCP server gives your AI agents access to your Loom workspace: listing videos, searching by keyword, fetching full transcripts, retrieving engagement analytics, and browsing folders — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-loom`

---

## What You Can Do

- List all your Loom videos with optional folder filtering
- Search videos by keyword across titles and transcripts
- Get full video details including embed URL, share link, and thumbnail
- Retrieve complete text transcripts with timestamps
- View engagement analytics — views, watch time, reactions
- Browse and filter by folders

## Available Tools

| Tool | Description |
|------|-------------|
| `list_videos` | List video recordings with folder filter and pagination |
| `get_video` | Get full video details — title, duration, embed URL, transcript, share link |
| `search_videos` | Search videos by keyword across titles and transcripts |
| `get_video_transcript` | Get the full text transcript with timestamps |
| `get_video_insights` | Get analytics — views, unique viewers, avg watch %, reactions |
| `list_folders` | List all folders in the workspace |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `LOOM_ACCESS_TOKEN` | Yes | Loom Developer API access token | [developer.loom.com](https://developer.loom.com) → **Create an App** → generate an **API Access Token** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Loom"** and click **Add to Workspace**
3. Add `LOOM_ACCESS_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can access your Loom videos automatically.

### Example Prompts

```
"List my 10 most recent Loom recordings"
"Search for videos about the Q4 product roadmap"
"Get the full transcript of video abc123"
"How many views does my onboarding video have?"
"Show me all videos in the Engineering folder"
"Get the embed URL for the latest demo recording"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-loom \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LOOM-ACCESS-TOKEN: your-loom-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_videos","arguments":{"per_page":5}}}'
```

## Security Notes

- `LOOM_ACCESS_TOKEN` is injected at the Aerostack gateway layer — never stored in this worker's code
- All API calls use Bearer token authentication over HTTPS
- This server is read-only — no tools create, modify, or delete videos
- Video transcripts may contain sensitive content; access is scoped to the token's permissions

## License

MIT
