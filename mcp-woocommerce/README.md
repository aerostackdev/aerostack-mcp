# mcp-woocommerce — WooCommerce MCP Server

> Automate your WooCommerce store — manage products, orders, customers, and coupons from any AI agent.

WooCommerce powers over 40% of all online stores worldwide. This MCP server gives your agents complete access to the WooCommerce REST API v3: listing and creating products, managing orders through their full lifecycle, creating and updating customers, applying coupon codes, and pulling sales reports — all without touching the WordPress admin panel.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-woocommerce`

---

## What You Can Do

- Automatically create and update products when catalog data changes in an upstream system
- Monitor and fulfill orders — change statuses, add customer notes, create refunds
- Sync customers and billing/shipping addresses from your CRM or helpdesk
- Generate coupon codes for marketing campaigns and set usage limits or expiry dates
- Pull sales reports to feed dashboards or trigger alerts when revenue crosses thresholds

## Available Tools

| Tool | Description |
|------|-------------|
| `list_products` | List products with filters: status, type, category, search. Pagination via `page` + `per_page`. |
| `get_product` | Get full details of a product by ID |
| `create_product` | Create a product — name, price, images, categories, SKU, stock |
| `update_product` | Update product fields (price, stock, status, description) |
| `delete_product` | Delete a product — trash or permanent |
| `list_product_categories` | List product categories, filter by parent or search term |
| `list_orders` | List orders filtered by status, date range, or customer |
| `get_order` | Get full order details including line items, billing, and shipping |
| `create_order` | Create an order with line items, addresses, and payment method |
| `update_order` | Update order status or add a customer note |
| `delete_order` | Delete an order — trash or permanent |
| `create_refund` | Create a refund for an order with amount, reason, and line items |
| `list_customers` | List customers — search, filter by email or role |
| `get_customer` | Get full customer details including order history totals |
| `create_customer` | Create a customer with billing and shipping addresses |
| `update_customer` | Update customer name or addresses |
| `list_coupons` | List coupons, search by code |
| `create_coupon` | Create a coupon — percent, fixed cart, or fixed product discount |
| `get_store_settings` | Get store general settings: currency, address, price format |
| `list_shipping_zones` | List shipping zones with their configured methods |
| `get_sales_report` | Get sales totals report for a period or date range |
| `list_order_statuses` | Get all order statuses (including custom plugin statuses) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `WOOCOMMERCE_CONSUMER_KEY` | Yes | WooCommerce REST API Consumer Key | WooCommerce → Settings → Advanced → REST API → Add Key |
| `WOOCOMMERCE_CONSUMER_SECRET` | Yes | WooCommerce REST API Consumer Secret | Shown once when the key is generated |
| `WOOCOMMERCE_STORE_URL` | Yes | Your WooCommerce store URL (must be HTTPS) | The root URL of your WordPress + WooCommerce site |

### Generating API Keys

1. In your WordPress admin, go to **WooCommerce → Settings → Advanced → REST API**
2. Click **Add Key**
3. Set **Description** (e.g. "Aerostack Agent"), **User** (admin), and **Permissions** (Read/Write)
4. Click **Generate API Key** — copy both the Consumer Key and Consumer Secret immediately (the secret is only shown once)
5. Add both to Aerostack under **Project → Secrets**

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"WooCommerce"** and click **Add to Workspace**
3. Add your `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET`, and `WOOCOMMERCE_STORE_URL` under **Project → Secrets**

Once added, every AI agent in your workspace can manage your WooCommerce store automatically.

### Example Prompts

```
"List all orders with status 'processing' from the last 7 days"
"Create a 20% off coupon called SPRING20 that expires on 2026-05-31"
"Update product ID 42 to set the sale price to $19.99"
"Get the sales report for last month"
"Find all customers who signed up with @gmail.com and list their order counts"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-woocommerce \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-WOOCOMMERCE-CONSUMER-KEY: ck_your_key' \
  -H 'X-Mcp-Secret-WOOCOMMERCE-CONSUMER-SECRET: cs_your_secret' \
  -H 'X-Mcp-Secret-WOOCOMMERCE-STORE-URL: https://mystore.com' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_orders","arguments":{"status":"processing","per_page":10}}}'
```

## Security

- All secrets are passed via `X-Mcp-Secret-*` headers — never stored in environment variables at rest
- **SSRF protection**: `WOOCOMMERCE_STORE_URL` is validated before every request. HTTP URLs are rejected; private/local IP ranges (localhost, 127.x, 10.x, 172.16–31.x, 192.168.x) are blocked
- Authentication uses HTTP Basic with `base64(consumerKey:consumerSecret)` — WooCommerce's official auth method for HTTPS endpoints

## License

MIT
