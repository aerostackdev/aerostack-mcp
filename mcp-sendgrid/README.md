# mcp-sendgrid — SendGrid MCP Server

> Send transactional and marketing emails at scale — let AI agents trigger emails, manage templates, maintain contact lists, and monitor deliverability via SendGrid.

SendGrid powers email delivery for over 80,000 companies, sending billions of emails every month. This MCP server gives your agents the full SendGrid v3 API: sending single and bulk emails with dynamic templates, managing marketing contacts and lists, pulling delivery and engagement stats, monitoring bounces, and managing verified sender identities.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-sendgrid`

---

## What You Can Do

- Send transactional emails from any trigger — signups, payments, errors, or alerts — with dynamic template data
- Send personalized bulk emails to thousands of recipients with per-recipient template variables
- Monitor email deliverability with global stats, bounce lists, and per-template analytics
- Maintain marketing contact lists and sync subscribers from your application automatically

## Available Tools

| Tool | Description |
|------|-------------|
| send_email | Send a transactional email with HTML/text content, CC, BCC, and dynamic template support |
| send_bulk_email | Send to multiple recipients with per-recipient dynamic template data (up to 1000) |
| send_template_email | Simplified tool to send a dynamic template email with substitution data |
| schedule_email | Schedule an email to send at a specific Unix timestamp (up to 72 hours ahead) |
| list_templates | List all dynamic transactional email templates |
| get_template | Get full details of a template including all versions |
| create_template | Create a new dynamic transactional email template |
| get_template_version | Get a specific template version with HTML content and subject |
| search_contacts | Search marketing contacts using SGQL query language |
| get_contact | Get full details of a marketing contact by ID |
| upsert_contacts | Create or update one or more marketing contacts by email |
| list_contact_lists | List all marketing contact lists |
| add_contacts_to_list | Add contacts to a specific marketing list by contact ID |
| get_global_stats | Get global email stats (sends, opens, clicks, bounces) for a date range |
| get_email_stats | Get stats filtered by category for a date range |
| get_template_stats | Get delivery and engagement stats for a specific template version |
| get_bounce_list | Get bounced email addresses with reason and timestamp |
| list_senders | List all verified sender identities |
| create_sender | Create a new sender identity (requires email verification) |
| verify_sender_domain | Validate DNS records (DKIM, SPF) for an authenticated domain |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| SENDGRID_API_KEY | Yes | SendGrid API key with Mail Send and Marketing permissions | [app.sendgrid.com](https://app.sendgrid.com) → Settings → API Keys → Create API Key |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"SendGrid"** and click **Add to Workspace**
3. Add your `SENDGRID_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can send and manage emails via SendGrid automatically — no per-user setup needed.

### Example Prompts

```
"Send a welcome email to new user alice@example.com using template d-abc123 with her first name 'Alice'"
"Show me the email open rate and click rate for the past 7 days"
"Sync the new customer list and add all emails to the 'Active Customers' marketing list"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-sendgrid \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SENDGRID-API-KEY: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_email","arguments":{"to":"alice@example.com","from":"hello@yourapp.com","subject":"Welcome!","content":[{"type":"text/plain","value":"Thanks for signing up!"}]}}}'
```

## License

MIT
