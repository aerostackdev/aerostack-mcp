# mcp-typefully — Social Media Drafts & Scheduling MCP Server

> Write, schedule, and manage social media drafts across X/Twitter, LinkedIn, Threads, Bluesky, and Mastodon.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-typefully`

## What You Can Do

- Create drafts and threads (multi-tweet) for X/Twitter
- Schedule posts to LinkedIn, Threads, Bluesky, Mastodon
- Manage a posting queue with automatic time slots
- View post analytics and engagement metrics
- Organize content with tags

## Available Tools

| Tool | Description |
|------|-------------|
| `get_me` | Get authenticated user details |
| `list_social_sets` | List connected account groups |
| `get_social_set` | Get social set details + connected platforms |
| `create_draft` | Create a draft — save, schedule, or add to queue |
| `list_drafts` | List drafts filtered by status |
| `get_draft` | Get full draft details |
| `update_draft` | Update content, schedule, or platforms |
| `delete_draft` | Delete a draft |
| `get_queue` | View upcoming queue slots + scheduled drafts |
| `get_queue_schedule` | View queue schedule rules (days/times) |
| `list_tags` | List content organization tags |
| `get_analytics` | Get post performance metrics by platform |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `TYPEFULLY_API_KEY` | Yes | Typefully API key — generate from Settings in your Typefully account |

## Quick Start

1. Go to aerostack.dev → Add MCP
2. Search "Typefully" and add to your workspace
3. Add your `TYPEFULLY_API_KEY` in the secrets panel
4. Start creating and scheduling posts from any AI agent or bot

## Example: Schedule a Thread

```json
{
  "tool": "create_draft",
  "arguments": {
    "social_set_id": "ss_abc123",
    "content": "Thread about AI automation:\n\n---\n\nFirst, let me explain why AI agents are changing how we work.\n\n---\n\nSecond, here are 3 tools every developer should know about.\n\n---\n\nFinally, the future: agents that schedule your social media for you.",
    "platforms": ["twitter", "linkedin"],
    "schedule_date": "2026-03-20T09:00:00Z"
  }
}
```

## Platforms Supported

| Platform | Features |
|----------|----------|
| X/Twitter | Posts, threads, queue, analytics |
| LinkedIn | Posts, scheduling, analytics |
| Threads | Posts, scheduling |
| Bluesky | Posts, scheduling |
| Mastodon | Posts, scheduling |
