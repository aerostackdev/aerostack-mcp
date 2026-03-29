# mcp-customer-io — Customer.io MCP Server

> Track customer events, manage profiles, trigger campaigns and broadcasts via Customer.io — behavioral messaging automation for your AI agents.

Customer.io is a behavior-based messaging platform that lets you send targeted emails, push notifications, and SMS based on what people actually do. This MCP server gives your agents complete access: identify and update customer profiles, track events that trigger automations, manage segments, inspect campaigns, send transactional broadcasts, and retrieve delivery metrics.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-customer-io`

---

## What You Can Do

- Identify and upsert customer profiles instantly from any inbound event or pipeline
- Track named events (purchases, signups, cancellations) that trigger Customer.io automations
- Batch multiple identify + track operations in a single call for bulk processing
- Manage manual segments — add or remove customers programmatically
- Trigger transactional broadcasts (password resets, one-time notifications) to specific customers
- Pull campaign metrics and customer activity history for reporting and audits

## Available Tools

| Tool | Description |
|------|-------------|
| **Customers** | |
| identify_customer | Create or update a customer profile (upsert by ID) |
| get_customer | Get a customer profile by ID from the App API |
| update_customer | Update attributes on an existing customer |
| delete_customer | Permanently delete a customer and all their data |
| list_customers | Search for customers using filter parameters |
| **Events** | |
| track_event | Track a named event for a specific customer |
| track_anonymous_event | Track an event for an anonymous visitor |
| batch_track | Send multiple identify/track operations in one request |
| get_customer_activities | Get activity history for a customer |
| **Segments** | |
| list_segments | List all segments in the workspace |
| get_segment | Get segment details including customer count |
| add_to_segment | Add customers to a manual segment |
| remove_from_segment | Remove customers from a manual segment |
| **Campaigns** | |
| list_campaigns | List all campaigns in the workspace |
| get_campaign | Get full campaign details including actions |
| list_broadcasts | List all transactional broadcasts |
| trigger_broadcast | Trigger a transactional broadcast to a customer |
| **Messages** | |
| get_campaign_metrics | Get delivery and engagement metrics for a campaign |
| list_messages | List messages sent to a specific customer |
| list_webhooks | List all reporting webhooks |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| CUSTOMER_IO_SITE_ID | Yes | Your Customer.io Site ID (used for Track API basic auth) | [Settings → API Credentials](https://fly.customer.io/settings/api_credentials) |
| CUSTOMER_IO_API_KEY | Yes | Your Customer.io API Key (used for both Track and App APIs) | [Settings → API Credentials](https://fly.customer.io/settings/api_credentials) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Customer.io"** and click **Add to Workspace**
3. Add `CUSTOMER_IO_SITE_ID` and `CUSTOMER_IO_API_KEY` under **Project → Secrets**

Once configured, every AI agent in your workspace can track events, manage customer data, and trigger campaigns automatically.

### Example Prompts

```
"Identify user 'user-12345' in Customer.io with email alice@example.com and plan=pro"
"Track a 'subscription_cancelled' event for customer user-12345 with reason='price'"
"Add customers user-001, user-002, user-003 to manual segment ID 5"
"Trigger broadcast ID 20 to send a password reset to alice@example.com"
"Get campaign metrics for campaign 10 grouped by weeks"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-customer-io \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CUSTOMER-IO-SITE-ID: your-site-id' \
  -H 'X-Mcp-Secret-CUSTOMER-IO-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"track_event","arguments":{"customer_id":"user-001","name":"purchased","data":{"plan":"pro","amount":49}}}}'
```

### MCP Initialize

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-customer-io \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

## Authentication Details

Customer.io uses two separate APIs with different auth schemes:

| API | Base URL | Auth Method |
|-----|----------|-------------|
| Track API | `https://track.customer.io/api/v1` | Basic auth: `base64(SITE_ID:API_KEY)` |
| App API | `https://api.customer.io/v1` | Bearer token: `Authorization: Bearer API_KEY` |

Write operations (identify, track events, delete) use the Track API. Read operations (list customers, segments, campaigns, metrics) use the App API. The worker handles this routing automatically — you only need to provide both secrets once.

## Notes

- `identify_customer` is an upsert — calling it repeatedly with the same `id` updates the profile without creating duplicates
- `batch_track` uses the v2 batch endpoint (`/api/v2/batch`) which supports up to 1,000 operations per call
- `trigger_broadcast` accepts either `to.id` (customer ID) or `to.email` — use whichever identifier you have
- Segment membership via `add_to_segment` / `remove_from_segment` only works on **manual** segments; dynamic segments are computed automatically
- `get_customer_activities` is paginated — use the `next` cursor from the response to fetch more
