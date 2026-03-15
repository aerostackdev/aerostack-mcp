# mcp-chargebee — Chargebee MCP Server

> Manage subscriptions, customers, invoices, and plans from your AI agents.

Chargebee is the subscription billing platform that handles recurring revenue for SaaS and e-commerce businesses. This MCP server gives your AI agents direct access to your Chargebee instance — letting them look up customers, manage subscription lifecycles, pull invoice history, and list available plans without anyone logging into the Chargebee dashboard.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-chargebee`

---

## What You Can Do

- Look up customer records and subscription status instantly — useful for support agents handling billing questions
- Cancel or reactivate subscriptions programmatically in response to customer requests or churn signals
- Pull invoice history for a customer to answer billing disputes or generate reports
- Create new subscriptions and customers as part of onboarding automation workflows

## Available Tools

| Tool | Description |
|------|-------------|
| `list_customers` | List customers with optional email filter |
| `get_customer` | Get full details for a customer by ID |
| `create_customer` | Create a new customer |
| `list_subscriptions` | List subscriptions filtered by customer or status |
| `get_subscription` | Get full details for a subscription by ID |
| `create_subscription` | Create a new subscription for an existing customer |
| `cancel_subscription` | Cancel a subscription (end of term or immediately) |
| `reactivate_subscription` | Reactivate a cancelled subscription |
| `list_invoices` | List invoices filtered by customer or status |
| `list_plans` | List plans (active or archived) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `CHARGEBEE_SITE` | Yes | Your Chargebee site subdomain (e.g. `my-company`) | Found in your Chargebee URL: `{site}.chargebee.com` |
| `CHARGEBEE_API_KEY` | Yes | API key used for authentication | [app.chargebee.com](https://app.chargebee.com) → **Settings** → **Configure Chargebee** → **API Keys** → Create or copy a Full Access key |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Chargebee"** and click **Add to Workspace**
3. Add `CHARGEBEE_SITE` and `CHARGEBEE_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Chargebee tools automatically — no per-user setup needed.

### Example Prompts

```
"Look up the subscription for customer@example.com and tell me their current plan and next billing date"
"Cancel the subscription sub_abc123 at the end of the current term"
"Show me all overdue invoices for the last 90 days"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-chargebee \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CHARGEBEE-SITE: your-site' \
  -H 'X-Mcp-Secret-CHARGEBEE-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_plans","arguments":{}}}'
```

## License

MIT
