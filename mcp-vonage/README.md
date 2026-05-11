# mcp-vonage — Vonage MCP Server

> Vonage (Nexmo) communication MCP — send SMS, verify phone numbers, manage account via the Vonage REST API

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-vonage`

---

## What You Can Do

This MCP server gives AI agents access to Vonage via 7 tools. Connect it to any Aerostack workspace and your agents can interact with Vonage directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `send_sms` | Send an SMS message |
| `get_balance` | Get the account balance |
| `list_numbers` | List owned phone numbers |
| `send_verify` | Send a verification code to a phone number |
| `check_verify` | Check a verification code |
| `cancel_verify` | Cancel a pending verification request |
| `get_sms_pricing` | Get SMS outbound pricing for a specific country |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `VONAGE_API_KEY` | Yes | Your VONAGE API KEY from the service's developer settings |
| `VONAGE_API_SECRET` | Yes | Secret key from the provider's developer console |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Vonage"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `VONAGE_API_KEY`
- `VONAGE_API_SECRET`

Once added, every AI agent in your workspace can use Vonage tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-vonage \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-VONAGE-API-KEY: your-vonage-api-key' \
  -H 'X-Mcp-Secret-VONAGE-API-SECRET: your-vonage-api-secret' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_sms","arguments":{}}}'
```

## License

MIT
