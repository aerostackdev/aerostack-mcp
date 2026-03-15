# mcp-chargebee

MCP server for [Chargebee](https://www.chargebee.com) — manage subscriptions, customers, invoices, and plans.

Deployed as a Cloudflare Worker, receiving secrets from the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools (10)

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

## Secrets

| Secret | Header | Description |
|--------|--------|-------------|
| `CHARGEBEE_SITE` | `X-Mcp-Secret-CHARGEBEE-SITE` | Chargebee site subdomain (e.g. `my-company`) |
| `CHARGEBEE_API_KEY` | `X-Mcp-Secret-CHARGEBEE-API-KEY` | API key (used as Basic auth username with empty password) |

## Auth

Chargebee uses HTTP Basic auth with the API key as the username and an empty password:

```
Authorization: Basic {base64(apiKey + ':')}
```

## Deploy

```bash
cd MCP/mcp-chargebee
npm install
wrangler deploy
```
