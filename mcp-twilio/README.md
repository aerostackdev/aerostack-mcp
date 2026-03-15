# mcp-twilio — Twilio MCP Server

> Send SMS messages and manage phone numbers from your AI agents.

Twilio is the communications platform that powers SMS, voice, and messaging for tens of thousands of businesses. This MCP server lets your AI agents send text messages, look up message delivery history, and inspect the phone numbers on your account — making it easy to add SMS notifications or two-way messaging to any agent-driven workflow.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-twilio`

---

## What You Can Do

- Send SMS messages from any Twilio number to any recipient as part of automated notification or alert workflows
- Check message delivery status and history to verify that critical notifications were received
- List all phone numbers on the account to understand what numbers are available before building routing logic
- Pull account balance and status to monitor spend or check if the account is active

## Available Tools

| Tool | Description |
|------|-------------|
| `send_sms` | Send an SMS message to a phone number |
| `list_messages` | List sent and received messages with optional filters |
| `get_message` | Get details of a specific message by SID |
| `list_phone_numbers` | List purchased phone numbers on the account |
| `get_account_info` | Get account balance and status |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID (starts with `AC`) | [console.twilio.com](https://console.twilio.com) → **Dashboard** → copy **Account SID** |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token | Same page → copy **Auth Token** (click to reveal) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Twilio"** and click **Add to Workspace**
3. Add `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can call Twilio tools automatically — no per-user setup needed.

### Example Prompts

```
"Send an SMS to +15551234567 saying: Your order has shipped and will arrive by Thursday"
"List the last 20 messages sent from our +18005551000 number in the last 24 hours"
"What's the current balance and status on our Twilio account?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-twilio \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TWILIO-ACCOUNT-SID: ACyour-account-sid' \
  -H 'X-Mcp-Secret-TWILIO-AUTH-TOKEN: your-auth-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_sms","arguments":{"to":"+15551234567","from":"+18005551000","body":"Hello from Aerostack!"}}}'
```

## License

MIT
