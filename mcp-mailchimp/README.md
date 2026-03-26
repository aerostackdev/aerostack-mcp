# mcp-mailchimp — Mailchimp MCP Server

> Manage email marketing audiences, subscribers, campaigns, and tags through the Mailchimp Marketing API — fully automated by AI agents.

Mailchimp is one of the world's most popular email marketing platforms, used by millions of businesses to send billions of emails. This MCP server gives your agents complete access to the Mailchimp Marketing API v3: managing audiences and member subscriptions, creating and sending campaigns, applying tags for segmentation, and pulling audience statistics.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-mailchimp`

---

## What You Can Do

- Add and manage subscribers across Mailchimp audiences from any data source or trigger
- Create and send email campaigns programmatically — no manual Mailchimp UI required
- Apply tags to members for behavioral segmentation based on actions in your app
- Pull audience stats to monitor list health, growth, and engagement metrics

## Available Tools

| Tool | Description |
|------|-------------|
| list_audiences | List all Mailchimp audiences (lists) with IDs, names, and member counts |
| get_audience | Get full details of a specific audience |
| create_audience | Create a new audience with name, from email, and permission reminder |
| get_audience_stats | Get stats for an audience — member counts, open rate, click rate |
| list_members | List members of an audience with optional status filter |
| get_member | Get full details of a specific audience member by email |
| add_member | Add or update a member in an audience (subscribe/unsubscribe/pending) |
| update_member | Update member fields — merge tags, status, and custom properties |
| unsubscribe_member | Unsubscribe a member from an audience |
| list_campaigns | List campaigns with optional type and status filters |
| get_campaign | Get full details of a specific campaign |
| create_campaign | Create a new regular email campaign with subject, from name, and audience |
| send_campaign | Send a campaign immediately (must be ready-to-send) |
| list_tags | List all tags applied to members in an audience |
| add_tags_to_member | Apply one or more tags to a specific audience member |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| MAILCHIMP_API_KEY | Yes | Mailchimp API key (full key including the server prefix, e.g. `abc123-us6`) | [mailchimp.com](https://mailchimp.com) → Account → Extras → API keys |
| MAILCHIMP_SERVER_PREFIX | No | Server prefix (e.g. `us6`) — extracted automatically from key if omitted | Last segment of your API key after the dash |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Mailchimp"** and click **Add to Workspace**
3. Add your `MAILCHIMP_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can manage Mailchimp marketing automatically — no per-user setup needed.

### Example Prompts

```
"Subscribe the new user alice@example.com to our 'Product Updates' Mailchimp audience"
"Tag all members who completed onboarding with the 'Onboarded' tag"
"Create and send the 'June Newsletter' campaign to our main audience"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-mailchimp \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MAILCHIMP-API-KEY: your-key-us6' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"add_member","arguments":{"list_id":"abc123","email_address":"alice@example.com","status":"subscribed"}}}'
```

## License

MIT
