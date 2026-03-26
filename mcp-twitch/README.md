# mcp-twitch — Twitch MCP Server

> Search channels, streams, games, clips, and videos on Twitch — AI-native live streaming platform access.

Twitch is the leading live streaming platform for gaming, esports, creative content, and community interaction. This MCP server exposes 9 tools covering the Twitch Helix API — letting your AI agents search channels, discover live streams, browse top games, find clips, and check stream schedules, all using OAuth2 client credentials for server-to-server access.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-twitch`

---

## What You Can Do

- Search for Twitch channels and check if a streamer is currently live
- Get top games and trending categories to monitor what's popular on the platform
- Find the best clips from a broadcaster within a specific date range for content curation
- Check a streamer's schedule to know when they go live next
- Browse live streams filtered by game, language, or specific broadcaster

## Available Tools

| Tool | Description |
|------|-------------|
| `search_channels` | Search for Twitch channels by name or keyword, with optional live-only filter |
| `get_channel_info` | Get detailed channel info: title, game, language, tags |
| `get_streams` | Get currently live streams with filters for game, language, or user |
| `search_categories` | Search for games/categories by name |
| `get_top_games` | Get the most popular games on Twitch right now |
| `get_clips` | Get clips for a broadcaster, optionally filtered by date range |
| `get_videos` | Get VODs, highlights, and uploads for a channel |
| `get_stream_schedule` | Get a broadcaster's upcoming stream schedule |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `TWITCH_CLIENT_ID` | Yes | Twitch application client ID | [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → Register or select your app → copy **Client ID** |
| `TWITCH_CLIENT_SECRET` | Yes | Twitch application client secret | Same app page → **New Secret** → copy the generated secret. This uses the OAuth2 client credentials flow (no user login required). |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Twitch"** and click **Add to Workspace**
3. Add your `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` under **Project → Secrets**

Once added, every AI agent in your workspace can call Twitch tools automatically — no per-user setup needed.

### Example Prompts

```
"Is shroud streaming right now? If so, what game?"
"What are the top 10 most popular games on Twitch right now?"
"Find the best clips from xQc in the last week"
"Search for channels streaming Valorant in English"
"What's pokimane's stream schedule for this week?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-twitch \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TWITCH-CLIENT-ID: your-client-id' \
  -H 'X-Mcp-Secret-TWITCH-CLIENT-SECRET: your-client-secret' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_top_games","arguments":{}}}'
```

## License

MIT
