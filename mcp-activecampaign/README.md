# mcp-activecampaign — ActiveCampaign MCP Server

> Automate your entire email marketing and CRM pipeline — manage contacts, lists, tags, campaigns, automations, and deals from any AI agent.

ActiveCampaign is a leading email marketing and CRM platform used by thousands of businesses for marketing automation and customer relationship management. This MCP server gives your agents complete access to the ActiveCampaign API v3: creating and managing contacts, subscribing them to lists, triggering automations, analyzing campaigns, and running your CRM deal pipeline.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-activecampaign`

---

## What You Can Do

- Sync contacts from external sources directly into ActiveCampaign with custom fields
- Subscribe and unsubscribe contacts from lists based on external events
- Trigger automations for contacts when they take an action in another system
- Manage your CRM pipeline — create, update, and track deals through stages
- Pull campaign performance metrics and automation engagement data

## Available Tools

| Tool | Description |
|------|-------------|
| `list_contacts` | List contacts with filters: email, tag, list, status |
| `get_contact` | Get full contact profile including tags, lists, custom fields, deals |
| `create_contact` | Create a new contact with custom fields |
| `update_contact` | Update contact fields including custom field values |
| `delete_contact` | Permanently delete a contact |
| `search_contacts` | Search contacts by email, name, or phone |
| `add_tag_to_contact` | Add a tag to a contact by tag ID |
| `list_lists` | List all email lists with subscriber counts |
| `create_list` | Create a new email list |
| `subscribe_contact_to_list` | Subscribe or unsubscribe a contact from a list |
| `list_tags` | List all tags, optionally filtered by name |
| `list_campaigns` | List campaigns filtered by type or status |
| `get_campaign` | Get campaign details including open rate, click rate, sent count |
| `list_automations` | List all automations (active or inactive) |
| `get_automation` | Get automation details including contact counts and steps |
| `add_contact_to_automation` | Trigger an automation for a specific contact |
| `list_deals` | List CRM deals filtered by status, owner, or stage |
| `get_deal` | Get full deal details |
| `create_deal` | Create a new deal in a pipeline |
| `update_deal` | Update deal stage, value, status, or owner |
| `list_pipelines` | List all CRM pipelines with their stages |
| `create_deal_note` | Add a note to a deal |
| `_ping` | Verify credentials by calling a lightweight read endpoint |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `ACTIVECAMPAIGN_API_URL` | Yes | Your ActiveCampaign account API URL (e.g. `https://youraccount.api-us1.com`) | [ActiveCampaign Settings](https://www.activecampaign.com/login) → Settings → Developer → API Access URL |
| `ACTIVECAMPAIGN_API_KEY` | Yes | Your ActiveCampaign API key | Settings → Developer → API Access Key |

### Auth Format

ActiveCampaign uses a custom `Api-Token` header:

```
Api-Token: {API_KEY}
```

The base URL for all API calls is: `{ACTIVECAMPAIGN_API_URL}/api/3`

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"ActiveCampaign"** and click **Add to Workspace**
3. Add your `ACTIVECAMPAIGN_API_URL` and `ACTIVECAMPAIGN_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can automate your email marketing and CRM workflows — no per-user setup needed.

### Example Prompts

```
"Create a contact for john@example.com and subscribe them to list ID 10"
"Add tag ID 5 (customer) to contact 101 and trigger the Welcome Series automation"
"Create a new deal for contact 101 worth $5,000 in the Sales Pipeline"
"Show me all open deals assigned to owner ID 2"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-activecampaign \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-ACTIVECAMPAIGN-API-URL: https://youraccount.api-us1.com' \
  -H 'X-Mcp-Secret-ACTIVECAMPAIGN-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_contacts","arguments":{"limit":10}}}'
```

## Deal Values

ActiveCampaign deal values are stored in **cents** (integer). For example, a $1,500 deal has `value: 150000`. When creating or updating deals, pass the value in cents.

## License

MIT
