# mcp-instagram — Instagram MCP Server

> Publish posts, manage comments, pull analytics, and discover trending content on Instagram — all from any AI agent.

Instagram is the world's leading visual social platform with over 2 billion monthly active users. This MCP server gives your agents full access to the Instagram Graph API for Business Accounts: publishing photos, videos, reels, and carousels; managing comments and replies; retrieving detailed engagement metrics; fetching account-level insights; and exploring hashtag trends.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-instagram`

---

## What You Can Do

- Automatically publish content from your brand calendar — photos, reels, carousels — by passing a public image/video URL and caption
- Monitor engagement in real time: pull impressions, reach, likes, saves, and comments per post and automatically reply to top comments
- Build reporting dashboards from account-level insights — follower growth, profile views, reach over any date range
- Discover trending hashtags and get top/recent media for any tag to inform your content strategy

---

## Available Tools

| Tool | Description |
|------|-------------|
| get_media | Get details of a media object (image, video, reel) by ID |
| list_media | List media for the business account with pagination |
| create_photo_post | Publish a photo from a public URL with caption |
| create_video_post | Publish a video or reel from a public URL |
| create_carousel_post | Publish a carousel post with 2-10 images |
| delete_media | Delete a media object (post) |
| get_comments | Get comments on a media object |
| reply_to_comment | Reply to a comment |
| delete_comment | Delete a comment |
| get_media_insights | Get engagement metrics for a post (impressions, reach, likes, comments, saves) |
| get_account_insights | Get account-level insights for a date range |
| get_followers_demographics | Get follower demographics (age, gender, city, country) |
| get_stories | Get current active stories for the account |
| get_story_insights | Get insights for a specific story |
| search_hashtag | Search for a hashtag and get top or recent media |
| get_hashtag_insights | Get post count and recent media for a hashtag ID |
| _ping | Verify credentials — calls GET /{account_id}?fields=id,name |

---

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| INSTAGRAM_ACCESS_TOKEN | Yes | Meta User Access Token with `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights` permissions | [Meta for Developers](https://developers.facebook.com/tools/explorer/) → Graph API Explorer → Generate Token |
| INSTAGRAM_BUSINESS_ACCOUNT_ID | Yes | Numeric Instagram Business Account ID | Call `GET /me/accounts` then `GET /{page-id}?fields=instagram_business_account` via the [Graph API Explorer](https://developers.facebook.com/tools/explorer/) |

> **Note:** Your Instagram account must be a **Business** or **Creator** account connected to a Facebook Page. Personal accounts are not supported by the Instagram Graph API.

---

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Instagram"** and click **Add to Workspace**
3. Add your `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_BUSINESS_ACCOUNT_ID` under **Project → Secrets**

Once added, every AI agent in your workspace can publish and manage Instagram content automatically.

### Example Prompts

```
"Post this product image to Instagram with the caption 'New arrival! #fashion #style'"
"Get the engagement metrics for our last 5 Instagram posts and summarize the best performing one"
"Reply to all unanswered comments on our latest Instagram post with a thank-you message"
"What are the top posts for the hashtag #productivity right now?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-instagram \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-INSTAGRAM-ACCESS-TOKEN: your-access-token' \
  -H 'X-Mcp-Secret-INSTAGRAM-BUSINESS-ACCOUNT-ID: your-account-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_media","arguments":{"limit":5}}}'
```

---

## License

MIT
