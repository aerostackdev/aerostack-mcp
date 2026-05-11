# mcp-coinbase — Coinbase MCP Server

> Full Coinbase integration — manage crypto accounts, transactions, addresses, send money, and get real-time prices and exchange rates.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-coinbase`

---

## What You Can Do

This MCP server gives AI agents access to Coinbase via 12 tools. Connect it to any Aerostack workspace and your agents can interact with Coinbase directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_current_user` | Get the current authenticated Coinbase user |
| `list_accounts` | List all Coinbase accounts (wallets) for the current user |
| `get_account` | Get details of a specific Coinbase account |
| `list_transactions` | List transactions for a Coinbase account |
| `get_transaction` | Get details of a specific transaction |
| `list_addresses` | List deposit addresses for a Coinbase account |
| `create_address` | Create a new deposit address for a Coinbase account |
| `send_money` | Send cryptocurrency from a Coinbase account |
| `get_spot_price` | Get the current spot price for a currency pair |
| `get_buy_price` | Get the current buy price for a currency pair |
| `get_sell_price` | Get the current sell price for a currency pair |
| `get_exchange_rates` | Get exchange rates for a currency |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `COINBASE_API_KEY` | Yes | Your Coinbase API key — create one in your Coinbase account under Settings → API |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Coinbase"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `COINBASE_API_KEY`

Once added, every AI agent in your workspace can use Coinbase tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-coinbase \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-COINBASE-API-KEY: your-coinbase-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_current_user","arguments":{}}}'
```

## License

MIT
