# mcp-stripe — Stripe MCP Server

Stripe is a payment processing and subscription management platform. This MCP server enables managing customers, subscriptions, invoices, and payments via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| list_customers | List customers with optional email filter |
| get_customer | Get a customer by ID with payment methods |
| list_subscriptions | List subscriptions with optional status filter |
| list_invoices | List invoices for a customer |
| get_balance | Get the current account balance |
| list_payment_intents | List recent payment intents |
| list_products | List all products in the catalog |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| STRIPE_SECRET_KEY | X-Mcp-Secret-STRIPE-SECRET-KEY | Stripe secret key (sk_live_... or sk_test_...) |

## Usage

Health check:

```bash
curl https://mcp-stripe.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-stripe.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-stripe.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-stripe.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-STRIPE-SECRET-KEY: <your-token>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_balance","arguments":{}}}'
```

## Deploy

```bash
cd MCP/mcp-stripe
npm run deploy
```
