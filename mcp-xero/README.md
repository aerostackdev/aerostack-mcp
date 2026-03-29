# mcp-xero — Xero Accounting MCP Server

> Automate your entire Xero accounting workflow — manage invoices, contacts, chart of accounts, financial reports, payments, and bank transactions from any AI agent.

Xero is the world's leading cloud accounting platform for small and medium businesses. This MCP server gives your agents complete access to the Xero API: creating and managing invoices, contacts, accounts, generating financial reports (P&L, Balance Sheet, Cash Flow), processing payments, and querying bank transactions.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-xero`

---

## What You Can Do

- Automatically create, authorise, and email invoices from any business trigger — new orders, completed milestones, or contract signatures
- Manage customer and supplier contacts without touching the Xero UI
- Pull live financial reports (Profit & Loss, Balance Sheet, Cash Flow, Aged Receivables) on demand
- Reconcile payments against invoices and query bank transactions programmatically

## Available Tools

| Tool | Description |
|------|-------------|
| _ping | Verify Xero credentials — returns organisation name and base currency |
| list_invoices | List invoices with optional filters (Status, Contact, Date range, pagination) |
| get_invoice | Get full invoice details including line items, tax, and payment history |
| create_invoice | Create a new ACCREC or ACCPAY invoice with line items |
| update_invoice | Update invoice status, line items, due date, or reference |
| email_invoice | Send an invoice to the contact by email |
| void_invoice | Void an invoice (sets status to VOIDED) |
| list_contacts | List contacts filtered by status, name, or email |
| get_contact | Get full contact details by ContactID |
| create_contact | Create a new customer or supplier contact |
| update_contact | Update contact fields |
| archive_contact | Archive a contact (sets ContactStatus to ARCHIVED) |
| get_organisation | Get organisation name, currency, timezone, and financial year |
| list_accounts | List chart of accounts filtered by Type, Status, or Class |
| get_account | Get a specific account by AccountID |
| get_trial_balance | Get trial balance report as of a given date |
| get_profit_loss | Get Profit and Loss report with optional period comparison |
| get_balance_sheet | Get Balance Sheet with optional period comparison |
| get_cashflow | Get Cash Flow Statement for a date range |
| get_aged_receivables | Get Aged Receivables Outstanding report |
| list_payments | List payments filtered by type, status, and date range |
| create_payment | Create a payment against an invoice from a bank account |
| get_bank_transactions | List bank transactions for a specific account |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| XERO_ACCESS_TOKEN | Yes | OAuth 2.0 access token for the Xero API | [Xero Developer Portal](https://developer.xero.com/app/manage) — create an OAuth 2.0 app, use PKCE flow or token from xero-node SDK |
| XERO_TENANT_ID | Yes | Xero organisation tenant ID (UUID) | Call `GET https://api.xero.com/connections` with your access token — use `tenantId` from the response |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Xero"** and click **Add to Workspace**
3. Add your `XERO_ACCESS_TOKEN` and `XERO_TENANT_ID` under **Project → Secrets**

Once added, every AI agent in your workspace can automate Xero accounting — no per-user setup needed.

### Example Prompts

```
"Create an invoice for Acme Corp for 10 hours of consulting at $150/hour, due in 30 days"
"Pull the Profit and Loss report for Q1 2026 and summarise the top expense categories"
"List all overdue invoices and send email reminders to each contact"
"Show me the aged receivables as of today and flag anyone over 60 days outstanding"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-xero \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-XERO-ACCESS-TOKEN: your-access-token' \
  -H 'X-Mcp-Secret-XERO-TENANT-ID: your-tenant-id' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_invoices","arguments":{"Status":"AUTHORISED","page":1}}}'
```

## License

MIT
