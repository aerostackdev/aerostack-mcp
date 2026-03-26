# mcp-ayrshare — Universal Social Media API MCP Server

> Post, schedule, and analyze across 13 social platforms from a single MCP.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-ayrshare`

## What You Can Do

- Post and schedule to 13 platforms simultaneously
- Get engagement analytics (likes, shares, impressions)
- Manage comments and replies
- Auto-generate trending hashtags
- Shorten links
- View full post history

## Supported Platforms

Facebook, Instagram, X/Twitter, LinkedIn, TikTok, Bluesky, Threads, Reddit, Pinterest, YouTube, Telegram, Snapchat, Google Business Profile

## Available Tools

| Tool | Description |
|------|-------------|
| `create_post` | Create and publish or schedule a post across platforms |
| `get_post` | Get post details and status |
| `delete_post` | Delete a post from social platforms |
| `delete_all_scheduled` | Delete all pending scheduled posts |
| `get_history` | Get post history with status and results |
| `get_analytics` | Get engagement metrics for a post |
| `get_comments` | Get comments on a post |
| `post_comment` | Reply to a post on supported platforms |
| `auto_hashtags` | Generate trending hashtags for text |
| `shorten_link` | Shorten a URL |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `AYRSHARE_API_KEY` | Yes | Ayrshare API key — get from ayrshare.com dashboard |

## Quick Start

1. Go to aerostack.dev → Add MCP
2. Search "Ayrshare" and add to your workspace
3. Add your `AYRSHARE_API_KEY` in the secrets panel
4. Start posting across all your social platforms

## Example: Schedule a Multi-Platform Post

```json
{
  "tool": "create_post",
  "arguments": {
    "post": "Excited to announce our new feature! Check it out at example.com",
    "platforms": ["twitter", "linkedin", "facebook", "instagram", "threads"],
    "media_urls": ["https://example.com/announcement.jpg"],
    "schedule_date": "2026-03-20T09:00:00Z",
    "auto_hashtag": true
  }
}
```

## Pricing Note

Ayrshare offers a free tier (20 posts/month). For higher volume, see [ayrshare.com/pricing](https://www.ayrshare.com/pricing/).

**X/Twitter note:** After March 31, 2026, X/Twitter operations require your own OAuth 1.0a credentials linked via the Ayrshare dashboard.
