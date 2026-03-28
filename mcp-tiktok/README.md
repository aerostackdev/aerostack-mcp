# mcp-tiktok — TikTok MCP Server

> Browse videos, pull analytics, discover trending content, and manage your TikTok creator account from any AI agent.

TikTok is the world's fastest-growing short-video platform with over 1.5 billion monthly active users. This MCP server gives your agents access to the TikTok for Developers API: listing and querying your videos, pulling engagement analytics, searching for content and users, discovering trending videos and hashtags, and managing follower lists.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-tiktok`

---

## What You Can Do

- Pull your creator account analytics — video views, follower growth, profile views, likes — for any date range and generate performance reports automatically
- Monitor your video performance: get detailed per-video stats including avg watch time, full watch rate, reach, and impressions
- Discover trending videos and hashtags by region to identify content opportunities before they peak
- Search TikTok for videos by keyword to track competitor content, find UGC, or research trending topics

---

## Available Tools

| Tool | Description |
|------|-------------|
| list_videos | List videos for the authenticated creator with view/like/share counts |
| get_video | Get detailed metadata for a specific video including embed link |
| query_videos | Query videos with date range and status filters |
| get_video_comments | Get comments on a specific video |
| like_video | Like a video on behalf of the authenticated user |
| get_user_info | Get the authenticated user's profile and follower/like counts |
| search_user | Search for a TikTok user by username |
| get_user_videos | Get public videos from a specific user |
| get_user_followers | Get follower list for the authenticated user |
| get_video_analytics | Get detailed analytics for a video over a date range |
| get_creator_analytics | Get creator-level stats: follower growth, video views, profile views |
| get_trending_videos | Get trending videos globally or by region |
| search_videos | Search for videos by keyword |
| get_trending_hashtags | Get trending hashtags with video and view counts |
| _ping | Verify credentials — fetches open_id via POST /user/info/ |

---

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| TIKTOK_ACCESS_TOKEN | Yes | TikTok OAuth 2.0 Access Token with `user.info.basic`, `video.list`, `research.video.query` scopes | [TikTok for Developers](https://developers.tiktok.com/doc/oauth-user-access-token-management) → OAuth flow |

> **Note:** TikTok access tokens expire. You must refresh them using your refresh token before expiry. The Research API tools (`search_videos`, `get_trending_videos`, `get_trending_hashtags`) require separate Research API access approval from TikTok.

---

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"TikTok"** and click **Add to Workspace**
3. Add your `TIKTOK_ACCESS_TOKEN` under **Project → Secrets**

### Example Prompts

```
"Show me the analytics for my top 5 TikTok videos this month"
"What are the trending hashtags on TikTok in the US right now?"
"Search TikTok for videos about 'sustainable fashion' and summarize the top results"
"How many new followers did I get on TikTok this week?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-tiktok \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TIKTOK-ACCESS-TOKEN: your-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_user_info","arguments":{}}}'
```

---

## License

MIT
