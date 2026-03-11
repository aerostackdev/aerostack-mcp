# mcp-shopify — Shopify MCP Server

Shopify is an e-commerce platform for building and running online stores. This MCP server enables managing products, orders, customers, and inventory via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| get_shop_info | Get store information and settings |
| list_products | List products with optional limit |
| get_product | Get a product by ID with variants |
| list_orders | List orders with optional status filter |
| get_order | Get full order details including line items |
| list_customers | List customers with optional email search |
| get_inventory | Get inventory levels for a product |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| SHOPIFY_ACCESS_TOKEN | X-Mcp-Secret-SHOPIFY-ACCESS-TOKEN | Shopify Admin API access token |
| SHOPIFY_SHOP_DOMAIN | X-Mcp-Secret-SHOPIFY-SHOP-DOMAIN | Your shop domain (e.g. mystore.myshopify.com) |

## Usage

Health check:

```bash
curl https://mcp-shopify.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-shopify.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-shopify.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-shopify.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SHOPIFY-ACCESS-TOKEN: <your-token>' \
  -H 'X-Mcp-Secret-SHOPIFY-SHOP-DOMAIN: <your-shop-domain>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_shop_info","arguments":{}}}'
```

## Deploy

```bash
cd MCP/mcp-shopify
npm run deploy
```
