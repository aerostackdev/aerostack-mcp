# mcp-klaviyo — Klaviyo MCP Server

> Power your email and SMS marketing with AI — manage profiles, lists, campaigns, flows, and custom events through Klaviyo's full API.

Klaviyo is the leading e-commerce marketing platform, trusted by 130,000+ brands for email and SMS automation. This MCP server gives your agents full access to Klaviyo's API: managing customer profiles, subscribing contacts to lists, tracking custom events that trigger flows, monitoring campaigns, and inspecting automation flows — enabling AI-driven marketing operations without manual platform access.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-klaviyo`

---

## What You Can Do

- Sync customer data from any source into Klaviyo profiles with custom properties in real time
- Subscribe new customers to marketing lists and trigger welcome flows automatically on signup
- Track custom events (purchases, signups, trial starts) that feed into behavioral email flows
- Monitor campaign performance and flow status to surface marketing insights to stakeholders

## Available Tools

| Tool | Description |
|------|-------------|
| get_profiles | List profiles with optional Klaviyo filter syntax (e.g. by email or name) |
| get_profile | Get full details of a specific Klaviyo profile by ID |
| create_profile | Create a new profile with email, name, phone, and custom properties |
| update_profile | Update an existing profile — merge new attributes into the existing record |
| subscribe_profiles | Subscribe one or more email addresses to marketing in a specific list |
| get_lists | List all Klaviyo lists with IDs and names |
| get_list | Get details of a specific list |
| create_list | Create a new Klaviyo list |
| add_profiles_to_list | Add existing profiles by ID to a list |
| get_events | List events (analytics data) — purchases, opens, clicks, and custom metrics |
| create_event | Track a custom event for a profile to trigger flows (e.g. Placed Order, Signed Up) |
| get_metrics | List all metrics (event types) with names and integration sources |
| get_campaigns | List email campaigns with IDs, names, status, and send times |
| get_campaign | Get full details of a specific campaign |
| get_campaign_recipient_estimation | Get estimated recipient count before sending a campaign |
| get_flows | List all automation flows with status (draft/live/manual) and trigger type |
| get_flow | Get details of a specific automation flow |
| get_templates | List email templates with name, type, and timestamps |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| KLAVIYO_API_KEY | Yes | Klaviyo Private API key | [klaviyo.com](https://www.klaviyo.com) → Account → Settings → API Keys → Create Private API Key |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Klaviyo"** and click **Add to Workspace**
3. Add your `KLAVIYO_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can manage Klaviyo marketing data automatically — no per-user setup needed.

### Example Prompts

```
"Subscribe new trial signups to the 'Onboarding' list in Klaviyo"
"Track a 'Placed Order' event for customer alice@example.com with order value $149.99"
"Show me the estimated recipient count for campaign ID abc123 before we send it"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-klaviyo \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-KLAVIYO-API-KEY: your-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_event","arguments":{"email":"alice@example.com","metric_name":"Placed Order","value":149.99}}}'
```

## License

MIT
