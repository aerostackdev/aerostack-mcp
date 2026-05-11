# mcp-braintree — Braintree MCP Server

> Full Braintree integration — manage transactions, refunds, customers, and generate client tokens via the Braintree GraphQL API.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-braintree`

---

## What You Can Do

This MCP server gives AI agents access to Braintree via 10 tools. Connect it to any Aerostack workspace and your agents can interact with Braintree directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `search_transactions` | Search for settled transactions in Braintree |
| `get_transaction` | Get details of a specific Braintree transaction |
| `create_transaction` | Charge a payment method (create a transaction) |
| `refund_transaction` | Refund a settled Braintree transaction |
| `void_transaction` | Void (reverse) a Braintree transaction |
| `list_customers` | List customers in Braintree |
| `get_customer` | Get details of a specific Braintree customer |
| `create_customer` | Create a new customer in Braintree |
| `delete_customer` | Delete a Braintree customer |
| `generate_client_token` | Generate a client token for Braintree frontend integration |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `BRAINTREE_PUBLIC_KEY` | Yes | Your Braintree public key — found in the Braintree Control Panel under Settings → API Keys |
| `BRAINTREE_PRIVATE_KEY` | Yes | Your Braintree private key — found in the Braintree Control Panel under Settings → API Keys |
| `BRAINTREE_ENVIRONMENT` | Yes | Target environment: 'sandbox' (default) or 'production' |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Braintree"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `BRAINTREE_PUBLIC_KEY`
- `BRAINTREE_PRIVATE_KEY`
- `BRAINTREE_ENVIRONMENT`

Once added, every AI agent in your workspace can use Braintree tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-braintree \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-BRAINTREE-PUBLIC-KEY: your-braintree-public-key' \
  -H 'X-Mcp-Secret-BRAINTREE-PRIVATE-KEY: your-braintree-private-key' \
  -H 'X-Mcp-Secret-BRAINTREE-ENVIRONMENT: your-braintree-environment' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_transactions","arguments":{}}}'
```

## License

MIT
