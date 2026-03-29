# mcp-brevo — Brevo MCP Server

> Send transactional emails and SMS, manage contacts, campaigns, and lists via Brevo (formerly Sendinblue) — the complete marketing platform for your AI agents.

Brevo is a leading all-in-one marketing platform used by 500,000+ businesses to send transactional emails, SMS, and run contact-based campaigns. This MCP server gives your agents full access: create and segment contacts, send transactional emails and SMS, build and schedule campaigns, track events for automation, and configure webhooks for real-time delivery data.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-brevo`

---

## What You Can Do

- Send transactional emails (receipts, OTPs, password resets) and SMS instantly via your agent
- Create or update contacts and add them to segmented lists with a single call
- Build, schedule, and send email campaigns to any list segment
- Track custom events on contacts to power Brevo automation workflows
- Monitor delivery statistics for both transactional and campaign emails

## Available Tools

| Tool | Description |
|------|-------------|
| **Contacts** | |
| list_contacts | List contacts with optional pagination and date filter |
| get_contact | Get a contact by email address or numeric ID |
| create_contact | Create or upsert a contact with attributes and list assignments |
| update_contact | Update contact attributes and list memberships |
| delete_contact | Permanently delete a contact |
| **Email Campaigns** | |
| list_campaigns | List email campaigns filtered by type and status |
| get_campaign | Get full campaign details including statistics |
| create_campaign | Create an email campaign from HTML or a template |
| send_test_email | Send a test version of a campaign to specified addresses |
| get_campaign_stats | Get delivery and engagement statistics for a campaign |
| **Transactional** | |
| send_email | Send a transactional email immediately |
| send_sms | Send a transactional SMS to a phone number |
| get_smtp_stats | Get aggregated transactional email stats for a date range |
| list_email_templates | List transactional email templates |
| **Lists** | |
| list_lists | List all contact lists in the account |
| create_list | Create a new contact list |
| add_contacts_to_list | Add contacts to a list by email address |
| remove_contacts_from_list | Remove contacts from a list by email address |
| **Events & Webhooks** | |
| create_event | Track a custom behavioral event for a contact |
| list_webhooks | List all configured webhooks |
| create_webhook | Create a webhook for real-time email event notifications |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| BREVO_API_KEY | Yes | Brevo API key for authentication | [Brevo Dashboard → Settings → API Keys](https://app.brevo.com/settings/keys/api) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Brevo"** and click **Add to Workspace**
3. Add your `BREVO_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can send emails, manage contacts, and run campaigns automatically.

### Example Prompts

```
"Send a transactional email to alice@example.com with subject 'Your order is confirmed' and include order #12345 details"
"Create a contact for john@acme.com and add them to list ID 3"
"Get the open rate and click rate for campaign ID 42"
"Track a 'subscription_started' event for user@example.com with plan=pro"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-brevo \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-BREVO-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_email","arguments":{"sender":{"name":"Acme","email":"hello@acme.com"},"to":[{"email":"user@example.com","name":"User"}],"subject":"Welcome!","htmlContent":"<p>Welcome to Acme!</p>"}}}'
```

### MCP Initialize

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-brevo \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

## Authentication Details

Brevo uses a lowercase `api-key` header (not `Authorization: Bearer`). The Aerostack gateway injects your `BREVO_API_KEY` secret automatically via the `X-Mcp-Secret-BREVO-API-KEY` header — no additional setup required.

## Notes

- `create_contact` with `updateEnabled: true` performs an upsert — safe to call repeatedly without duplicate errors
- Campaign `scheduledAt` must be a future UTC timestamp in ISO 8601 format; omit it to save as draft
- `create_event` hits the Brevo Events API (`/v3/events`) — ensure your Brevo plan supports Marketing Automation
- Webhook events: `sent`, `delivered`, `opened`, `clicked`, `softBounce`, `hardBounce`, `unsubscribed`, `spam`, `invalid`, `deferred`

## License

MIT
