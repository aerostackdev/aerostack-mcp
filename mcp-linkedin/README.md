# mcp-linkedin — LinkedIn MCP Server

> Automate LinkedIn from any AI agent — manage profiles, publish posts, engage with company pages, search jobs, and send messages using the full LinkedIn REST API.

LinkedIn is the world's largest professional network with over 900 million members. This MCP server gives your AI agents complete access to the LinkedIn REST API: reading and updating profiles, publishing personal and company posts, searching jobs, managing conversations, liking and commenting on content, and tracking company followers.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-linkedin`

---

## What You Can Do

- **Automated content publishing** — Schedule and post thought leadership content on behalf of team members or company pages without touching the LinkedIn UI
- **Lead generation pipeline** — Search for companies by keyword, pull their follower demographics, find decision-makers via connections, and send personalized outreach messages
- **Competitor monitoring** — Track a competitor's company page posts and engagement metrics on a cron schedule, then summarize weekly findings
- **Job market intelligence** — Search job listings for specific roles and locations, extract salary and requirements data, and build a structured talent pipeline
- **Community engagement** — Automatically like and comment on relevant industry posts based on keyword monitoring to grow organic reach

## Available Tools

| Tool | Description |
|------|-------------|
| `get_my_profile` | Get the authenticated user's profile (name, headline, summary, location) |
| `get_profile_by_id` | Get a LinkedIn member profile by URN or ID |
| `get_connections` | Get first-degree connections list (up to 500) |
| `get_profile_views` | Get who viewed your profile in the last 90 days |
| `create_post` | Create a text post (PUBLIC or CONNECTIONS visibility) |
| `create_post_with_image` | Create a post with an image from a URL |
| `delete_post` | Delete a post by URN |
| `get_post` | Get a specific post by URN |
| `like_post` | Like a LinkedIn post |
| `comment_on_post` | Add a comment to a post |
| `get_company` | Get company details (name, description, followers, industry) |
| `get_company_posts` | Get recent posts from a company page |
| `create_company_post` | Post on behalf of a company page (requires page admin) |
| `get_company_followers` | Get follower count and demographic summary |
| `search_companies` | Search for companies by name or keyword |
| `search_jobs` | Search LinkedIn jobs by keywords, location, or company |
| `get_job` | Get full job details by job ID |
| `send_message` | Send a direct message to a first-degree connection |
| `get_conversations` | Get list of message conversations |
| `get_conversation_messages` | Get messages in a specific conversation |
| `_ping` | Verify credentials by calling /v2/me |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `LINKEDIN_ACCESS_TOKEN` | Yes | OAuth 2.0 User Access Token with appropriate scopes | [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps) → Your App → Auth → OAuth 2.0 Tools → Generate Token |

**Required OAuth scopes:**
- `r_liteprofile` — Read basic profile information
- `r_emailaddress` — Read email address
- `w_member_social` — Write posts, likes, and comments
- `rw_organization_admin` — Read/write company page content (required for company tools)

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"LinkedIn"** and click **Add to Workspace**
3. Add your `LINKEDIN_ACCESS_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can interact with LinkedIn professionally.

### Example Prompts

```
"Post a LinkedIn update saying we just launched our new AI product, visibility PUBLIC"
"Get the last 5 posts from company ID 1234567 and summarize the engagement themes"
"Search for backend engineer jobs in San Francisco and return the top 10 with company names"
"Get my LinkedIn profile and tell me how to improve my headline for AI developer roles"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-linkedin \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-LINKEDIN-ACCESS-TOKEN: your-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_my_profile","arguments":{}}}'
```

## License

MIT
