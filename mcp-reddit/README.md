# mcp-reddit — Reddit MCP Server

> Search, post, comment, vote, and explore Reddit communities from any AI agent.

Reddit is the internet's largest community platform with over 100,000 active subreddits and 1.5 billion monthly users. This MCP server gives your agents full access to the Reddit OAuth API: searching for posts across communities or within specific subreddits, creating text and link posts, managing comments, voting, browsing subreddit rules and metadata, and looking up user profiles.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-reddit`

---

## What You Can Do

- Monitor brand mentions, competitor activity, or topic trends by searching Reddit posts in real time across specific subreddits or the entire site
- Automatically post updates, announcements, or content to relevant subreddits with full Markdown support
- Participate in community discussions by replying to comments, editing responses, and managing your posting history
- Research subreddits before engaging — check subscriber counts, rules, active user counts, and community descriptions to find the right audience

---

## Available Tools

| Tool | Description |
|------|-------------|
| get_post | Get a Reddit post by ID with title, body, score, and comment count |
| search_posts | Search posts across Reddit or within a subreddit with sort and time filters |
| get_subreddit_posts | Get hot/new/top/rising posts from a specific subreddit |
| create_post | Create a text (self) post in a subreddit |
| create_link_post | Create a link post in a subreddit |
| delete_post | Delete a post owned by the authenticated user |
| get_post_comments | Get the comment tree for a post with configurable depth |
| create_comment | Comment on a post or reply to a comment |
| edit_comment | Edit a comment's body text |
| delete_comment | Delete a comment owned by the authenticated user |
| get_subreddit | Get subreddit metadata: subscribers, description, active users |
| search_subreddits | Search for subreddits by name or topic |
| get_subreddit_rules | Get the rules for a subreddit |
| get_user_profile | Get a user's public profile and recent activity |
| vote | Upvote (1), downvote (-1), or clear (0) a post or comment |
| get_my_profile | Get the authenticated user's karma and account details |
| _ping | Verify credentials — calls GET /api/v1/me |

---

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| REDDIT_CLIENT_ID | Yes | Reddit application Client ID | [Create a Reddit app](https://www.reddit.com/prefs/apps) → select "script" for personal use or "web app" for server use |
| REDDIT_CLIENT_SECRET | Yes | Reddit application Client Secret | Found next to Client ID in your [Reddit app settings](https://www.reddit.com/prefs/apps) |
| REDDIT_ACCESS_TOKEN | Yes | User OAuth 2.0 Access Token with `identity`, `read`, `submit`, `vote`, `edit` scopes | Follow [Reddit OAuth2 flow](https://github.com/reddit-archive/reddit/wiki/OAuth2) — exchange code for token |

> **Note:** Reddit access tokens expire after 1 hour. Use the refresh token to obtain a new access token. For read-only operations, a long-lived token obtained via the `client_credentials` grant is sufficient. Write operations (post, comment, vote) require a user token.

---

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Reddit"** and click **Add to Workspace**
3. Add your `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and `REDDIT_ACCESS_TOKEN` under **Project → Secrets**

### Example Prompts

```
"Search Reddit for posts about 'Cloudflare Workers' in the last week and summarize the top 5"
"What are the rules for posting in r/MachineLearning?"
"Get the top 10 posts from r/typescript today and list the ones with over 100 comments"
"Post to r/webdev: 'Just launched our new open-source MCP library for Cloudflare Workers'"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-reddit \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-REDDIT-CLIENT-ID: your-client-id' \
  -H 'X-Mcp-Secret-REDDIT-CLIENT-SECRET: your-client-secret' \
  -H 'X-Mcp-Secret-REDDIT-ACCESS-TOKEN: your-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_posts","arguments":{"query":"MCP servers","subreddit":"programming","sort":"top","time_filter":"week","limit":10}}}'
```

---

## License

MIT
