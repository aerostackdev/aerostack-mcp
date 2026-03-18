# mcp-rss — RSS/Atom Feed Reader MCP Server

> Read and monitor any RSS or Atom feed. No API key required.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-rss`

## What You Can Do

- Read latest articles from any blog, news site, or podcast
- Monitor multiple feeds at once
- Get only new items since a specific date (polling)
- Auto-discover feed URLs from any website
- Feed metadata (title, description, language)

## Available Tools

| Tool | Description |
|------|-------------|
| `read_feed` | Fetch and parse an RSS/Atom feed |
| `read_multiple_feeds` | Read multiple feeds, sorted by date |
| `get_new_items` | Get items published after a date (for polling) |
| `get_feed_info` | Get feed metadata |
| `discover_feed` | Find RSS/Atom feeds on a website |

## Configuration

**No API key required.** This MCP reads public feeds — just provide the feed URL.

## Quick Start

1. Go to aerostack.dev → Add MCP
2. Search "RSS" and add to your workspace
3. Start reading feeds — no configuration needed

## Example: Auto-Share Blog Posts

Combine with a Social MCP to auto-share new blog posts:

1. Create an AI Endpoint with RSS + Ocoya/Typefully/Ayrshare MCPs
2. Set a schedule (e.g., every hour)
3. System prompt: "Use get_new_items to check for posts published in the last hour. For each new post, craft a social media message and schedule it."

## Example: Monitor Multiple Sources

```json
{
  "tool": "read_multiple_feeds",
  "arguments": {
    "urls": [
      "https://blog.cloudflare.com/rss",
      "https://openai.com/blog/rss",
      "https://engineering.fb.com/feed/"
    ],
    "limit": 10
  }
}
```
