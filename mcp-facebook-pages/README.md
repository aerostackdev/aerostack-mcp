# mcp-facebook-pages — Facebook Pages MCP Server

> Automate your Facebook Page — manage posts, comments, conversations, media, and page insights from any AI agent.

Facebook Pages is Meta's platform for businesses, creators, and public figures to connect with their audiences at scale. This MCP server gives your agents full access to the Facebook Graph API v21.0: creating and scheduling posts, replying to comments and inbox messages, pulling engagement insights, and managing photos and videos.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-facebook-pages`

---

## What You Can Do

- Automatically publish posts, photo posts, and promotional content on your Facebook Page
- Monitor and respond to comments and inbox conversations without leaving your workflow
- Pull page-level and post-level insights to track reach, engagement, and follower growth
- List and inspect photos and videos on the page with media insights

## Available Tools

| Tool | Description |
|------|-------------|
| get_page | Get page details: id, name, about, category, fan_count, website, phone, emails, link |
| get_page_insights | Get page-level metrics (impressions, engaged users, fans, views) with period and date range |
| get_follower_count | Get current follower/fan count via the page_fans insights metric |
| update_page_info | Update page about text, description, or website URL |
| list_posts | List page posts with engagement summaries (likes, comments, shares) |
| get_post | Get full post details by ID including story, likes, comments, and shares |
| create_post | Create a text post with optional link attachment; supports draft (published=false) |
| create_photo_post | Create a photo post by URL with an optional caption |
| delete_post | Permanently delete a post by ID |
| get_post_insights | Get engagement metrics for a post: impressions, engaged users, clicks |
| list_comments | List comments on a post with filter (toplevel/stream) and pagination |
| reply_to_comment | Reply to a comment with a message |
| delete_comment | Permanently delete a comment by ID |
| hide_comment | Hide or unhide a comment from public view |
| list_conversations | List page inbox conversations (inbox/other folder) |
| get_conversation | Get a conversation with all its messages |
| reply_to_conversation | Send a reply in an existing inbox conversation |
| list_photos | List photos published on the page with image URLs and metadata |
| list_videos | List videos on the page with title, description, duration, and creation time |
| get_media_insights | Get insights metrics for a photo or video (impressions, engaged users, clicks) |
| _ping | Validate credentials by fetching basic page identity (id + name) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| FACEBOOK_PAGE_ACCESS_TOKEN | Yes | Page Access Token for the target Facebook Page | [Meta Developer Docs — Page Access Token](https://developers.facebook.com/docs/pages/access-tokens) — Generate via Facebook Login OAuth flow or the Graph API Explorer at [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer) |
| FACEBOOK_PAGE_ID | Yes | Numeric ID of the Facebook Page to manage (e.g. `123456789012345`) | Found in your Page settings → About, or via `GET /me/accounts` with a User Access Token |

### Required Permissions

Your Page Access Token must include the following permissions:
- `pages_read_engagement` — read posts, comments, insights
- `pages_manage_posts` — create and delete posts
- `pages_manage_engagement` — reply to and hide comments
- `pages_messaging` — read and reply to inbox conversations
- `pages_show_list` — list managed pages

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Facebook Pages"** and click **Add to Workspace**
3. Add your `FACEBOOK_PAGE_ACCESS_TOKEN` and `FACEBOOK_PAGE_ID` under **Project → Secrets**

Once added, every AI agent in your workspace can post to and monitor your Facebook Page automatically.

### Example Prompts

```
"Post an announcement to our Facebook Page: 'Excited to announce our new product launch!'"
"List the last 10 posts on our page and show me the engagement for each"
"Reply to all unanswered comments on our latest post with a thank-you message"
"Show me our page impressions and follower count for the past week"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-facebook-pages \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FACEBOOK-PAGE-ACCESS-TOKEN: your-page-access-token' \
  -H 'X-Mcp-Secret-FACEBOOK-PAGE-ID: 123456789012345' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_post","arguments":{"message":"Hello from Aerostack! Our AI agents can now post to Facebook Pages automatically."}}}'
```

## License

MIT
