# mcp-slack — Slack MCP Server

Slack is a team messaging and collaboration platform. This MCP server enables sending messages, searching channels, and managing users via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| list_channels | List public channels in the workspace |
| post_message | Post a message to a channel or thread |
| get_channel_history | Get recent messages from a channel |
| search_messages | Search messages across the workspace |
| get_user_info | Get profile info for a user |
| list_users | List all users in the workspace |
| add_reaction | Add an emoji reaction to a message |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| SLACK_BOT_TOKEN | X-Mcp-Secret-SLACK-BOT-TOKEN | Slack bot token (xoxb-...) |

## Usage

Health check:

```bash
curl https://mcp-slack.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-slack.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-slack.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-slack.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SLACK-BOT-TOKEN: <your-token>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_channels","arguments":{}}}'
```

## Deploy

```bash
cd MCP/mcp-slack
npm run deploy
```
