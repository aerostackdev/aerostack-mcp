# mcp-plaid — Plaid Financial Data MCP Server

> Access bank accounts, transactions, balances, institution search, and identity data via Plaid — AI-native financial data access.

Give your AI agents access to financial data through Plaid. Retrieve bank account balances, search transactions by date range, look up financial institutions, verify account ownership, and initiate bank connections — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-plaid`

---

## What You Can Do

- List linked bank accounts with balances and types
- Get real-time account balances (available, current, limit)
- Search transactions by date range with merchant and category info
- Search 11,000+ financial institutions by name
- Retrieve identity information (name, email, phone, address)
- Create Link tokens to initiate new bank connections

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify Plaid API connectivity |
| `get_accounts` | List linked accounts with type, balance, and mask |
| `get_balance` | Get real-time balances for linked accounts |
| `get_transactions` | Retrieve transactions with merchant, category, and date |
| `search_institutions` | Search banks by name with product support info |
| `get_institution` | Get institution details — URL, logo, products, colors |
| `get_identity` | Retrieve account holder identity information |
| `create_link_token` | Generate a token to start the bank connection flow |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `PLAID_CLIENT_ID` | Yes | Plaid client ID | dashboard.plaid.com → Team Settings → Keys → client_id |
| `PLAID_SECRET` | Yes | Plaid secret key (sandbox, development, or production) | dashboard.plaid.com → Team Settings → Keys → select environment → secret |
| `PLAID_ENV` | No | Environment: sandbox, development, or production (default: sandbox) | Use "sandbox" for testing, "production" for live data |

> **Sandbox mode:** Test with fake bank data using Plaid's sandbox credentials. No real bank connections needed.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Plaid"** and click **Add to Workspace**
3. Add `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV` under **Project → Secrets**

### Example Prompts

```
"List all my linked bank accounts and their balances"
"Show transactions from my checking account for the last 30 days"
"Search for Chase bank on Plaid and show me what products they support"
"What's my total available balance across all accounts?"
"Show me all pending transactions"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-plaid \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PLAID-CLIENT-ID: your-client-id' \
  -H 'X-Mcp-Secret-PLAID-SECRET: your-secret' \
  -H 'X-Mcp-Secret-PLAID-ENV: sandbox' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_institutions","arguments":{"query":"Chase"}}}'
```

## Security Notes

- Plaid credentials are injected at the Aerostack gateway layer — never stored in the worker
- Access tokens represent linked bank connections — treat them as sensitive secrets
- Use sandbox environment for development and testing
- Transaction data is limited to 500 items per request with pagination support
- Identity data access requires explicit user consent via Plaid Link

## License

MIT
