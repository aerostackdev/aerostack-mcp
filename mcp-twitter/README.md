# mcp-twitter — Twitter/X MCP Server

> Automate Twitter/X from any AI agent — post tweets, search content, manage bookmarks, monitor engagement, and track followers using the full Twitter API v2.

Twitter/X is the world's leading real-time social network. This MCP server gives your AI agents complete access to the Twitter v2 API: searching and creating tweets, managing likes and retweets, fetching user profiles and follower lists, retrieving engagement metrics, and managing bookmarks — all via a single authenticated endpoint.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-twitter`

---

## What You Can Do

- **Monitor brand mentions** — Search tweets containing your product name, extract insights, and route alerts to Slack or email
- **Automate social publishing** — Post announcement tweets, schedule replies, and manage a content queue from your AI agent
- **Competitive intelligence** — Fetch a competitor's recent tweets and engagement metrics on a cron schedule
- **Grow audience** — Automatically like and retweet relevant content in your niche based on keyword searches
- **Engagement tracking** — Pull impression and engagement data for any tweet and log it to a dashboard

## Available Tools

| Tool | Description |
|------|-------------|
| `get_tweet` | Get a tweet by ID with full metrics and author info |
| `search_tweets` | Search recent tweets (last 7 days) using Twitter search operators |
| `create_tweet` | Post a new tweet, optionally as a reply |
| `delete_tweet` | Delete a tweet owned by the authenticated user |
| `like_tweet` | Like a tweet on behalf of the authenticated user |
| `retweet` | Retweet a tweet on behalf of the authenticated user |
| `get_user_by_username` | Get a user profile by @username (followers, tweets, bio) |
| `get_user_by_id` | Get a user profile by numeric user ID |
| `get_user_tweets` | Get recent tweets posted by a specific user |
| `get_user_followers` | Get list of followers for a user |
| `get_user_following` | Get list of accounts a user follows |
| `search_users` | Search for Twitter users by name or keyword |
| `get_trending_topics` | Get current trending topics for any location (WOEID) |
| `get_tweet_metrics` | Get engagement metrics: impressions, likes, retweets, replies, bookmarks |
| `get_mentions_timeline` | Get tweets that mention the authenticated user |
| `get_bookmarks` | Get the authenticated user's bookmarked tweets |
| `bookmark_tweet` | Bookmark a tweet |
| `remove_bookmark` | Remove a tweet from bookmarks |
| `_ping` | Verify credentials by calling /2/users/me |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `TWITTER_BEARER_TOKEN` | Yes (read ops) | App-only Bearer Token for read operations (search, get, metrics) | [Twitter Developer Portal](https://developer.twitter.com/en/portal/projects) → Your App → Keys and Tokens → Bearer Token |
| `TWITTER_ACCESS_TOKEN` | Yes (write ops) | OAuth 2.0 User Access Token for write operations (post, like, retweet, bookmarks) | [Twitter Developer Portal](https://developer.twitter.com/en/portal/projects) → OAuth 2.0 → Generate user token via PKCE flow |

**Note:** Read-only tools (search, get, metrics) work with just `TWITTER_BEARER_TOKEN`. Write tools (create, delete, like, retweet, bookmarks) require `TWITTER_ACCESS_TOKEN` with user context.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Twitter"** and click **Add to Workspace**
3. Add your `TWITTER_BEARER_TOKEN` under **Project → Secrets** for read access
4. Add `TWITTER_ACCESS_TOKEN` for write access (posting, liking, bookmarks)

Once added, every AI agent in your workspace can interact with Twitter automatically.

### Example Prompts

```
"Search for recent tweets about Cloudflare Workers and summarize the top 5 results"
"Post a tweet announcing our new product launch: 'Aerostack 2.0 is live — build AI backends on the edge in minutes'"
"Get the engagement metrics for tweet ID 1234567890123456789 and report the impressions"
"Find the top 10 accounts talking about AI developer tools and get their follower counts"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-twitter \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TWITTER-BEARER-TOKEN: your-bearer-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_tweets","arguments":{"query":"aerostack lang:en -is:retweet","max_results":10}}}'
```

## License

MIT
