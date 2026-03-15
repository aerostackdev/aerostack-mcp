# mcp-segment — Segment MCP Server

> Track events, identify users, and send data to all your downstream tools via Segment.

Segment is the customer data platform that sits between your product and every analytics, marketing, and data warehouse tool you use. Every event sent through this MCP flows to all your connected Segment destinations — Amplitude, Mixpanel, Salesforce, BigQuery, and more — making it the highest-leverage place to send behavioral data from agent workflows.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-segment`

---

## What You Can Do

- Send backend events into Segment from server-side automation workflows, reaching all downstream destinations simultaneously
- Identify users and set traits (email, plan, company) that sync to your CRM, email platform, and analytics tools
- Associate users with accounts or organizations using group calls for B2B analytics and segmentation
- Use batch_track to send up to 500 events in a single request for high-throughput import scenarios

## Available Tools

| Tool | Description |
|------|-------------|
| `track_event` | Track a user action or event (e.g. "Button Clicked", "Order Completed") |
| `identify_user` | Identify a user and associate traits (email, name, plan, etc.) |
| `group_user` | Associate a user with a group or account and set group traits |
| `page_view` | Record a page view for web analytics |
| `screen_view` | Record a mobile screen view |
| `alias_user` | Alias two user identities (merge anonymous to identified) |
| `batch_track` | Send up to 500 events in a single request |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `SEGMENT_WRITE_KEY` | Yes | Source write key for event ingestion | [app.segment.com](https://app.segment.com) → **Connections** → **Sources** → your source → **Settings** → copy **Write Key** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Segment"** and click **Add to Workspace**
3. Add your `SEGMENT_WRITE_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Segment tools automatically — no per-user setup needed.

### Example Prompts

```
"Track a subscription_started event for user u_12345 with properties plan: pro and amount: 99"
"Identify user john@example.com with traits name: John Smith and company: Acme Corp"
"Send a group call associating user u_12345 with account org_678 with trait plan: enterprise"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-segment \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SEGMENT-WRITE-KEY: your-write-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"track_event","arguments":{"userId":"u_12345","event":"Order Completed","properties":{"revenue":49.99}}}}'
```

## License

MIT
