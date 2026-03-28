# mcp-youtube — YouTube MCP Server

> Search videos, manage playlists, subscribe to channels, post comments, and pull analytics from YouTube Data API v3 — all from any AI agent.

YouTube is the world's largest video platform. This MCP server gives your agents complete access to the YouTube Data API v3 and YouTube Analytics API: searching and browsing videos and channels, managing playlists, reading comments, rating content, and pulling detailed performance analytics for creators.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-youtube`

---

## What You Can Do

- Search YouTube for any video or channel and pull full metadata including view count and duration
- Create, update, and delete playlists on behalf of authenticated users
- List and reply to comments on any video
- Pull per-video and channel-level analytics: views, watch time, subscriber changes, and revenue estimates
- Subscribe to channels and rate videos using OAuth credentials

## Available Tools

| Tool | Description |
|------|-------------|
| `search_videos` | Search YouTube videos by keyword with order and duration filters |
| `get_video` | Get full video details: title, duration, viewCount, likeCount, publishedAt |
| `list_channel_videos` | List videos uploaded by a specific channel |
| `get_video_categories` | Get available YouTube video categories for a region |
| `rate_video` | Like, dislike, or remove rating from a video (OAuth) |
| `get_video_captions` | List available caption/subtitle tracks for a video |
| `get_channel` | Get channel details: title, subscriberCount, videoCount, viewCount |
| `search_channels` | Search for channels by keyword |
| `get_my_channel` | Get authenticated user's channel stats (OAuth) |
| `get_channel_sections` | Get featured sections on a channel page |
| `subscribe_to_channel` | Subscribe authenticated user to a channel (OAuth) |
| `list_playlists` | List playlists for a channel or authenticated user |
| `get_playlist` | Get playlist details: title, description, itemCount, privacy |
| `create_playlist` | Create a new playlist with title and privacy setting (OAuth) |
| `update_playlist` | Update playlist title, description, or privacy status (OAuth) |
| `delete_playlist` | Delete a playlist by ID (OAuth) |
| `list_comments` | Get top-level comments for a video sorted by time or relevance |
| `reply_to_comment` | Post a reply to an existing comment (OAuth) |
| `get_video_analytics` | Get per-video analytics: views, watchTime, likes by date range (OAuth) |
| `get_channel_analytics` | Get channel analytics: views, subscribers, watchTime, revenue (OAuth) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `YOUTUBE_API_KEY` | For read ops | YouTube Data API v3 key | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create API Key → restrict to YouTube Data API v3 |
| `YOUTUBE_ACCESS_TOKEN` | For write/analytics | OAuth 2.0 access token with `youtube` and `yt-analytics.readonly` scopes | [OAuth Playground](https://developers.google.com/oauthplayground/) or use [Google OAuth 2.0 flow](https://developers.google.com/identity/protocols/oauth2) |

**Minimum scopes for full access:**
- `https://www.googleapis.com/auth/youtube` — read/write YouTube account
- `https://www.googleapis.com/auth/yt-analytics.readonly` — read analytics

Read-only tools (search, get video, list channels) work with just an API key. Write tools and analytics require an OAuth access token.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"YouTube"** and click **Add to Workspace**
3. Add your `YOUTUBE_API_KEY` and/or `YOUTUBE_ACCESS_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can search YouTube, manage content, and analyze performance automatically.

### Example Prompts

```
"Search YouTube for the top 5 most viewed cooking videos this month"
"Get the subscriber count and total views for channel UCuAXFkgsw1L7xaCfnd5JJOw"
"Create a new private playlist called 'AI Research Talks' on my YouTube channel"
"Show me analytics for my video dQw4w9WgXcQ for the last 30 days"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-youtube \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-YOUTUBE-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_videos","arguments":{"query":"machine learning tutorial","maxResults":5,"order":"viewCount"}}}'
```

## License

MIT
