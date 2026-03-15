# mcp-segment

MCP server for [Segment](https://segment.com) — track events, identify users, group calls, page views, screen views, aliasing, and batch ingestion via the Segment HTTP Tracking API.

## Tools (7)

| Tool | Description |
|------|-------------|
| `track_event` | Track a user action or event (e.g. "Button Clicked", "Order Completed") |
| `identify_user` | Identify a user and associate traits (email, name, plan, etc.) |
| `group_user` | Associate a user with a group/account and set group traits |
| `page_view` | Record a page view (web analytics) |
| `screen_view` | Record a mobile screen view |
| `alias_user` | Alias two user identities (merge anonymous → identified) |
| `batch_track` | Send up to 500 events in a single request |

## Secret

| Secret | Header | Description |
|--------|--------|-------------|
| `SEGMENT_WRITE_KEY` | `X-Mcp-Secret-SEGMENT-WRITE-KEY` | Your Segment source write key |

## Auth

Segment uses HTTP Basic Auth with an empty username and the write key as the password:
```
Authorization: Basic base64(':' + writeKey)
```

## Deploy

```bash
cd MCP/mcp-segment
npm install
npx wrangler deploy
```

Or via Aerostack:
```bash
aerostack deploy mcp --slug segment
```
