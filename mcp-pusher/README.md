# mcp-pusher — Pusher MCP Server

> Trigger real-time events, inspect channel state, and generate auth tokens for private channels.

Pusher Channels is the hosted WebSocket service that powers real-time features in thousands of web and mobile apps — live feeds, notifications, collaborative editing, presence indicators, and more. This MCP server lets your AI agents push events directly into any Pusher channel, inspect which channels are occupied, and generate authentication tokens for private and presence channels.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-pusher`

---

## What You Can Do

- Trigger real-time events on any channel to push updates to connected clients — useful for live dashboards, notification systems, and agent-driven UI updates
- Send up to 10 events in a single batch request to minimize latency in high-volume workflows
- Check which channels are currently occupied and how many users are present before deciding whether to broadcast
- Generate authentication tokens for private and presence channels to support secure subscription flows

## Available Tools

| Tool | Description |
|------|-------------|
| `trigger_event` | Trigger a real-time event on a Pusher channel |
| `trigger_batch_events` | Trigger up to 10 events in a single request |
| `get_channel_info` | Get info about a specific channel (occupied status, user count) |
| `list_channels` | List all occupied channels with optional prefix filter |
| `get_channel_users` | Get users currently subscribed to a presence channel |
| `get_app_info` | Get basic app configuration (app_id, key, cluster) |
| `authenticate_private_channel` | Generate auth token for a private channel subscription |
| `authenticate_presence_channel` | Generate auth token for a presence channel with user data |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `PUSHER_APP_ID` | Yes | Your Pusher app ID | [dashboard.pusher.com](https://dashboard.pusher.com) → Your App → **App Keys** → copy **app_id** |
| `PUSHER_KEY` | Yes | Your Pusher app key | Same page → copy **key** |
| `PUSHER_SECRET` | Yes | Your Pusher app secret | Same page → copy **secret** |
| `PUSHER_CLUSTER` | Yes | Your Pusher cluster (e.g. `mt1`, `eu`, `ap1`) | Same page → copy **cluster** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Pusher"** and click **Add to Workspace**
3. Add all four secrets under **Project → Secrets**

Once added, every AI agent in your workspace can call Pusher tools automatically — no per-user setup needed.

### Example Prompts

```
"Trigger a new-order event on the orders channel with the payload from this webhook"
"List all currently occupied Pusher channels that start with presence-"
"How many users are currently subscribed to the presence-support-room channel?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-pusher \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PUSHER-APP-ID: your-app-id' \
  -H 'X-Mcp-Secret-PUSHER-KEY: your-app-key' \
  -H 'X-Mcp-Secret-PUSHER-SECRET: your-app-secret' \
  -H 'X-Mcp-Secret-PUSHER-CLUSTER: mt1' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"trigger_event","arguments":{"channel":"notifications","event":"alert","data":{"message":"Deploy complete"}}}}'
```

## License

MIT
