# mcp-twilio — Twilio MCP Server

Twilio is a communications platform for SMS, voice, and messaging. This MCP server enables sending SMS and managing phone numbers via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| send_sms | Send an SMS message to a phone number |
| list_messages | List sent/received messages with optional filters |
| get_message | Get details of a specific message by SID |
| list_phone_numbers | List purchased phone numbers on the account |
| get_account_info | Get account balance and status |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| TWILIO_ACCOUNT_SID | X-Mcp-Secret-TWILIO-ACCOUNT-SID | Twilio account SID |
| TWILIO_AUTH_TOKEN | X-Mcp-Secret-TWILIO-AUTH-TOKEN | Twilio auth token |

## Usage

Health check:

```bash
curl https://mcp-twilio.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-twilio.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-twilio.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-twilio.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TWILIO-ACCOUNT-SID: <your-sid>' \
  -H 'X-Mcp-Secret-TWILIO-AUTH-TOKEN: <your-token>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_account_info","arguments":{}}}'
```

## Deploy

```bash
cd MCP/mcp-twilio
npm run deploy
```
