# mcp-pusher

MCP server for [Pusher Channels](https://pusher.com/channels) — trigger real-time events, manage channels, presence channels, and generate authentication tokens for private/presence channels.

## Tools (8)

| Tool | Description |
|------|-------------|
| `trigger_event` | Trigger a real-time event on a channel |
| `trigger_batch_events` | Trigger up to 10 events in a single request |
| `get_channel_info` | Get info about a specific channel (occupied, user_count) |
| `list_channels` | List all occupied channels with optional prefix filter |
| `get_channel_users` | Get users subscribed to a presence channel |
| `get_app_info` | Get basic app configuration (app_id, key, cluster) |
| `authenticate_private_channel` | Generate auth token for a private channel subscription |
| `authenticate_presence_channel` | Generate auth token for a presence channel with user data |

## Secrets

| Secret | Header | Description |
|--------|--------|-------------|
| `PUSHER_APP_ID` | `X-Mcp-Secret-PUSHER-APP-ID` | Your Pusher app ID |
| `PUSHER_KEY` | `X-Mcp-Secret-PUSHER-KEY` | Your Pusher app key |
| `PUSHER_SECRET` | `X-Mcp-Secret-PUSHER-SECRET` | Your Pusher app secret |
| `PUSHER_CLUSTER` | `X-Mcp-Secret-PUSHER-CLUSTER` | Your Pusher cluster (e.g. `mt1`, `eu`, `ap1`) |

## Auth / Signing

Pusher REST API uses HMAC-SHA256 request signing. The worker implements the full signing flow:
1. Builds sorted query string of all params
2. Creates string to sign: `{METHOD}\n{path}\n{sorted_query_string}`
3. Signs with HMAC-SHA256 using the app secret via Web Crypto API
4. Appends `auth_key`, `auth_timestamp`, `auth_version`, and `auth_signature` to the URL

## Deploy

```bash
cd MCP/mcp-pusher
npm install
npx wrangler deploy
```

Or via Aerostack:
```bash
aerostack deploy mcp --slug pusher
```
