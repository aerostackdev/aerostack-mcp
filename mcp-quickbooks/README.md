# mcp-quickbooks — QuickBooks Online MCP Server

> Automate your entire QuickBooks accounting workflow — manage invoices, customers, expenses, payments, and financial reports from any AI agent.

QuickBooks Online is the leading cloud accounting platform for small and mid-sized businesses. This MCP server gives your agents complete access to the QuickBooks Online Accounting API: creating and sending invoices, managing customers, recording expenses, applying payments, running Profit & Loss and Balance Sheet reports, and executing custom QQL queries.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-quickbooks`

---

## What You Can Do

- Create and email invoices to customers automatically from external triggers (signed contracts, CRM updates, project completions)
- Apply payments against open invoices and update account balances in real time
- Record expenses and purchases from any channel — expense reports, receipts, card transactions
- Pull Profit & Loss and Balance Sheet reports on demand for financial analysis and forecasting
- Run custom QQL queries to extract any accounting data for reporting or audit

## Available Tools

| Tool | Description |
|------|-------------|
| `list_invoices` | List invoices with optional filters for customer, date range, and count |
| `get_invoice` | Get full invoice details including line items, balance, and due date |
| `create_invoice` | Create an invoice with line items, due date, and billing email |
| `update_invoice` | Update invoice fields — line items, due date, memo — using sparse update |
| `send_invoice` | Email an invoice to the customer's billing email or a specified address |
| `void_invoice` | Void an invoice (sets balance to $0, retains record) |
| `list_customers` | List customers with active/inactive filter and pagination |
| `get_customer` | Get full customer details including balance and contact info |
| `create_customer` | Create a customer with name, email, phone, and billing address |
| `update_customer` | Update customer fields using sparse update |
| `get_customer_balance` | Get outstanding balance for a specific customer |
| `list_expenses` | List expense (Purchase) transactions with date and account filters |
| `create_expense` | Create an expense with account, payment type, and line items |
| `list_payments` | List payments received with customer and date filters |
| `create_payment` | Create a payment and apply it to a specific invoice |
| `get_profit_loss` | Get Profit & Loss report for a date range, optionally by Month/Quarter/Year |
| `list_items` | List products and services with optional type filter |
| `create_item` | Create a product or service item with price and income account |
| `list_accounts` | List chart of accounts with optional AccountType filter |
| `get_balance_sheet` | Get Balance Sheet report as of a specific date |
| `run_query` | Execute a custom QuickBooks Query Language (QQL) query |
| `get_company_info` | Get company name, address, fiscal year, and currency settings |
| `_ping` | Verify credentials by calling the company info endpoint |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `QUICKBOOKS_ACCESS_TOKEN` | Yes | QuickBooks Online OAuth 2.0 access token | [QuickBooks Developer Portal](https://developer.intuit.com/) → Create App → OAuth 2.0 Playground |
| `QUICKBOOKS_REALM_ID` | Yes | Your QuickBooks company/realm ID | Visible in the URL when logged in: `https://app.qbo.intuit.com/app/homepage?realmId=YOUR_REALM_ID` |

### Getting an Access Token

1. Go to [developer.intuit.com](https://developer.intuit.com/) and create an app
2. Under **Keys & OAuth**, use the **OAuth 2.0 Playground** to generate tokens
3. Select scopes: `com.intuit.quickbooks.accounting`
4. Complete the OAuth flow — copy the **Access Token** and **Realm ID**

> Access tokens expire after 1 hour. Use a refresh token flow in production or use the Intuit OAuth 2.0 playground for testing.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"QuickBooks"** and click **Add to Workspace**
3. Add your `QUICKBOOKS_ACCESS_TOKEN` and `QUICKBOOKS_REALM_ID` under **Project → Secrets**

Once added, every AI agent in your workspace can manage QuickBooks accounting automatically.

### Example Prompts

```
"Create an invoice for Acme Corp for $2,500 for consulting services, due April 30"
"Apply a $1,500 payment from customer 58 against invoice 145"
"Get the Profit & Loss report for Q1 2026 summarized by month"
"List all overdue invoices with a balance greater than zero"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-quickbooks \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-QUICKBOOKS-ACCESS-TOKEN: your-access-token' \
  -H 'X-Mcp-Secret-QUICKBOOKS-REALM-ID: your-realm-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_company_info","arguments":{}}}'
```

## License

MIT
