# mcp-ocoya — Social Media Scheduling MCP Server

> Schedule and manage social media posts across all platforms from your AI agents.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-ocoya`

## What You Can Do

- Schedule posts to Facebook, Instagram, X, LinkedIn, TikTok, Pinterest, YouTube, Google Business
- Create drafts for review before publishing
- List and manage scheduled/published posts
- View connected social profiles
- Monitor Ocoya automations

## Available Tools

| Tool | Description |
|------|-------------|
| `list_workspaces` | List your Ocoya workspaces (get workspace ID) |
| `list_social_profiles` | List connected social accounts in a workspace |
| `create_post` | Create and schedule a post (or save as draft) |
| `list_posts` | List posts filtered by status (draft/scheduled/posted) |
| `update_post` | Reschedule a post |
| `delete_post` | Delete a post and cancel its schedules |
| `list_automations` | List Ocoya automation workflows |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `OCOYA_API_KEY` | Yes | Ocoya API key — generate from your Ocoya dashboard (Settings → API) |

## Quick Start

1. Go to aerostack.dev → Add MCP
2. Search "Ocoya" and add to your workspace
3. Add your `OCOYA_API_KEY` in the secrets panel
4. Start scheduling posts from any AI agent or bot

## Example: Schedule a Post

```json
{
  "tool": "create_post",
  "arguments": {
    "workspace_id": "ws_abc123",
    "caption": "Excited to announce our new feature! Check it out at example.com",
    "social_profile_ids": ["prof_twitter", "prof_linkedin"],
    "scheduled_at": "2026-03-20T09:00:00Z"
  }
}
```

## Example: Notion → Social Media Flow

Combine with the Notion MCP to automate social publishing:

1. Create an AI Endpoint with Notion + Ocoya MCPs attached
2. Set a schedule (e.g., every 30 minutes)
3. System prompt: "Query Notion DB for approved posts → schedule them via Ocoya"
4. Approve posts in Notion, they auto-publish to your socials

## Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-ocoya \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-OCOYA-API-KEY: your-ocoya-api-key' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_post",
      "arguments": {
        "workspace_id": "your-workspace-id",
        "caption": "Hello world!",
        "social_profile_ids": ["profile-id-1"]
      }
    }
  }'
```
