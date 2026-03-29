# Aerostack MCP Catalog

**200+ MCP servers on Cloudflare's edge** — one endpoint, every tool, no local processes.

Connect any combination to Claude, Cursor, Windsurf, or your own AI agent. Your API keys stay encrypted in Aerostack's vault. Tools appear automatically namespaced: `discord__send_message`, `stripe__create_invoice`, `hubspot__search_contacts`.

**200+ hosted Workers + 50 proxy entries. All edge-deployed, sub-50ms globally.**

---

## Quick Start — AI Agent Discovery

Any AI agent can discover and use all 200+ servers through the **Aerostack Registry MCP**. No browsing, no manual config — your agent searches and calls tools directly.

### Connect the Registry

Add this to your MCP client config (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "aerostack-registry": {
      "url": "https://mcp.aerostack.dev",
      "transport": "streamable-http"
    }
  }
}
```

No API key needed for discovery. Your agent now has access to 3 meta-tools:

| Tool | What It Does |
|------|-------------|
| `search_registry` | Semantic search across all MCPs, functions, skills, and agents. Ask "send Slack message" or "process payments" and get ranked matches. |
| `get_tool_schema` | Get full parameter documentation for any tool — input schema, descriptions, examples. |
| `call_function` | Execute any published community function directly (requires Bearer token). |

### Example: Agent Discovers Tools On Its Own

```
Agent: "I need to send a Slack message and create a Stripe invoice"
  ↓
search_registry("send slack message") → mcp-slack (post_message, 3 params)
search_registry("create stripe invoice") → mcp-stripe (create_invoice, 4 params)
  ↓
get_tool_schema("mcp-slack") → full parameter docs
get_tool_schema("mcp-stripe") → full parameter docs
  ↓
Agent now knows exactly how to call both tools
```

### Connect a Full Workspace

To actually call the tools (not just discover them), create a workspace at [aerostack.dev](https://aerostack.dev) and connect:

```json
{
  "mcpServers": {
    "my-workspace": {
      "url": "https://mcp.aerostack.dev/s/YOUR_USERNAME/YOUR_WORKSPACE",
      "headers": {
        "Authorization": "Bearer mwt_YOUR_WORKSPACE_TOKEN"
      }
    }
  }
}
```

All tools from all your servers appear automatically. Claude sees `discord__send_message`, `stripe__create_invoice`, `hubspot__search_contacts` — and chains them together.

---

## Security & Access Control

The registry is **discovery-only** — searching and browsing is open, but executing tools requires explicit authorization from the workspace owner.

### How It Works

```
Discovery (open)          Execution (gated)
─────────────────         ─────────────────
search_registry ✅         tools/call ❌ without token
get_tool_schema ✅         tools/call ✅ with workspace token
```

### Per-Tool Access Control

Every tool in your workspace has a toggle. Enable what's safe, disable what's destructive.

Without Aerostack, an AI agent with a Database MCP can `DROP TABLE users`. With a GitHub MCP, it can delete repos and force-push to main. With Slack, it can delete channels and export private conversations.

**With Aerostack, you choose exactly which tools the agent can call.**

```
Workspace: "production-bot"
┌─────────────────────────────────────────────────────────┐
│  mcp-slack                                              │
│  ┌──────────────────────────┬────────────┬────────────┐ │
│  │ Tool                     │ Type       │ Access     │ │
│  ├──────────────────────────┼────────────┼────────────┤ │
│  │ list_channels            │ read-only  │ ✅ enabled │ │
│  │ post_message             │ write      │ ✅ enabled │ │
│  │ search_messages          │ read-only  │ ✅ enabled │ │
│  │ get_channel_history      │ read-only  │ ✅ enabled │ │
│  │ delete_message           │ destructive│ ❌ disabled│ │
│  │ kick_user                │ destructive│ ❌ disabled│ │
│  └──────────────────────────┴────────────┴────────────┘ │
│                                                         │
│  mcp-stripe                                             │
│  ┌──────────────────────────┬────────────┬────────────┐ │
│  │ list_customers           │ read-only  │ ✅ enabled │ │
│  │ get_invoice              │ read-only  │ ✅ enabled │ │
│  │ create_payment_link      │ write      │ ✅ enabled │ │
│  │ delete_customer          │ destructive│ ❌ disabled│ │
│  │ issue_refund             │ destructive│ ❌ disabled│ │
│  └──────────────────────────┴────────────┴────────────┘ │
└─────────────────────────────────────────────────────────┘

AI agent sees: 6 tools (only the enabled ones)
AI agent cannot: call delete_message, kick_user, delete_customer, issue_refund
```

See the full breakdown with real examples: **[Agent Security →](https://aerostack.dev/agent-security)**

### Full Control Summary

| Control | How |
|---------|-----|
| **Which MCPs are exposed** | Add/remove servers from your workspace — only added servers are callable |
| **Which tools are visible** | Per-tool toggles — expose `list_channels` but hide `delete_channel` |
| **Who can call** | Workspace tokens (`mwt_`) — generate, revoke, rotate anytime |
| **What secrets are shared** | Per-workspace encrypted secrets — your Stripe key is never shared with the Slack MCP |
| **Rate limits** | Per-token rate limiting — prevent abuse from any single consumer |
| **Access tiers** | Public (open), Key-required (token gated), or Paid (subscription) |

### Secrets Are Never Exposed

- API keys are encrypted at rest in Aerostack's vault
- Injected as `X-Mcp-Secret-*` headers at runtime — never in the request body, never in logs
- Each MCP server only receives the secrets it needs — Slack gets `SLACK_BOT_TOKEN`, never your Stripe key
- Workspace owners can rotate secrets without reconfiguring clients

### For AI Agents Calling Your Workspace

An agent connecting to your workspace can only:
- See tools you've explicitly enabled
- Call tools with the permissions you've granted
- Use secrets you've configured for that workspace

They **cannot**: access other workspaces, see your secret values, bypass tool allowlists, or call MCPs you haven't added.

---

## Folder Structure

| Folder | Type | Maintained by |
|--------|------|--------------|
| `proxy/` | Official hosted MCPs — proxy config + README only, no code | 3rd party |
| `mcp-{service}/` | CF Workers we build and maintain | Aerostack team |

---

## What You Can Build

These aren't just API wrappers. When you connect multiple MCPs, an LLM can orchestrate them together — and that's where the real products emerge.

---

### The AI Customer Support Bot

**Stack:** `mcp-whatsapp` + `mcp-zendesk` + `mcp-hubspot` + `mcp-stripe`

Customer messages you on WhatsApp. Your bot:
1. Looks up who they are in HubSpot by phone number
2. Checks their Stripe subscription status and open invoices
3. Finds their Zendesk tickets
4. Answers with full context — name, plan, history, balance

If the issue is complex: creates a Zendesk ticket, notifies your Slack, tells the customer a human will follow up in 1 hour.

**Zero code. Five secrets.**

---

### The Discord Community Bot

**Stack:** `mcp-discord` + `mcp-notion` + `mcp-github` + `mcp-linear`

Drops into your dev community server and:
- Answers questions by searching your Notion knowledge base
- Turns `#report-a-bug` messages into Linear/GitHub issues automatically
- Posts weekly changelogs pulled from GitHub releases
- Welcomes new members with role-based onboarding based on what they say they do

Members feel heard. Your team stops manually triaging Discord.

---

### The Telegram Sales Assistant

**Stack:** `mcp-telegram` + `mcp-pipedrive` + `mcp-calendly` + `mcp-resend`

Your sales team runs on Telegram. The bot:
- Qualifies inbound leads with 3 questions
- Creates or updates the deal in Pipedrive automatically
- Books a discovery call via Calendly, sends confirmation via Resend
- Posts a summary to the team when a high-value lead books

Your SDRs focus on calls, not data entry.

---

### The E-Commerce Order Assistant

**Stack:** `mcp-whatsapp` + `mcp-shopify` + `mcp-stripe` + `mcp-mailchimp`

Customer asks "where's my order?" on WhatsApp:
- Shopify: finds the order, gets tracking link
- Stripe: confirms payment cleared
- Answers with order status, tracking, and ETA

If their card failed: sends a Stripe payment retry link via WhatsApp buttons. Adds them to a Mailchimp "at-risk" segment for follow-up.

---

### The Developer Ops Bot

**Stack:** `mcp-slack` + `mcp-github` + `mcp-sentry` + `mcp-railway` + `mcp-linear`

Sentry fires an error. Your Slack bot:
1. Gets the full Sentry event with stacktrace
2. Searches GitHub for the file and recent commits
3. Creates a Linear issue with full context pre-filled
4. Checks Railway deployment logs for that time window
5. Posts a summary in `#incidents` with links to everything

From alert to triage: under 10 seconds.

---

### The Appointment Booking Bot

**Stack:** `mcp-telegram` (or `mcp-whatsapp`) + `mcp-calendly` (or `mcp-cal-com`) + `mcp-google-calendar` + `mcp-sendgrid`

Patient/client messages to book, reschedule, or cancel:
- Checks availability in real time
- Books the slot, adds to Google Calendar
- Sends confirmation email via SendGrid
- Sends reminder 24h before via Telegram/WhatsApp

Works for clinics, consultants, coaches, salons — any appointment-based business.

---

### The Outbound Sales Machine

**Stack:** `mcp-salesforce` + `mcp-sendgrid` + `mcp-gmail` + `mcp-calendly`

Pull a list of leads from Salesforce. For each:
- Draft a personalized email using their account context
- Send via SendGrid or Gmail
- Track opens; when they click "Book a call" → Calendly link
- Update Salesforce opportunity stage automatically

Personalized outreach at scale. No marketing automation tool needed.

---

### The Payment Recovery Bot

**Stack:** `mcp-stripe` + `mcp-whatsapp` (or `mcp-telegram`) + `mcp-hubspot`

Every morning, check Stripe for failed payments. For each:
- Look up customer in HubSpot for their preferred channel
- Send a WhatsApp/Telegram message with a one-click retry link
- If no response in 48h: escalate to email, create HubSpot task for sales

Churns recovered automatically before they even cancel.

---

## Available Servers

### Messaging — The Bot Layer

These are the inbound channels. Every product above starts here.

| Server | Tools | Key Capability | Secrets |
|--------|-------|----------------|---------|
| [Discord](./mcp-discord/) | 23 | Send messages, manage channels, roles, members, threads | `DISCORD_BOT_TOKEN` |
| [Telegram](./mcp-telegram/) | 28 | Send/receive messages, inline keyboards, polls, moderation | `TELEGRAM_BOT_TOKEN` |
| [WhatsApp Business](./mcp-whatsapp/) | 24 | Session messages, templates, interactive buttons/lists, media | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` |
| [Slack](./mcp-slack/) | 12 | Post to channels, search, manage users and reactions | `SLACK_BOT_TOKEN` |
| [Twilio](./mcp-twilio/) | 6 | SMS send/receive, voice, phone number lookup | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |

**Discord use cases:**
- Community Q&A bot backed by your Notion/Airtable knowledge base
- Bug report collector → auto-creates GitHub/Linear issues
- Paid member verification → Stripe webhook → Discord role grant
- Dev team standup bot — pulls GitHub PRs and Linear issues every morning

**Telegram use cases:**
- Customer support for markets where WhatsApp isn't dominant (Russia, Iran, parts of Asia)
- Internal team alerts with inline approve/reject buttons
- Inline bot mode: users type `@yourbot` anywhere to search your product catalog (Shopify)
- Payment invoices sent and confirmed directly in chat (Stripe payment links)

**WhatsApp use cases:**
- E-commerce post-purchase flow: order confirmation → shipping update → review request
- Appointment reminders for clinics, salons, coaches (2B users can't be ignored)
- Payment collection in markets where WhatsApp is the primary communication layer
- Rich interactive menus for food ordering, product browsing

---

### CRM & Identity — Who Is This Person?

Before your bot responds, it should know who it's talking to.

| Server | Tools | Key Capability | Secrets |
|--------|-------|----------------|---------|
| [HubSpot](./mcp-hubspot/) | 12 | Contacts, deals, companies, notes, activities | `HUBSPOT_ACCESS_TOKEN` |
| [Salesforce](./mcp-salesforce/) | 25 | Leads, contacts, accounts, opportunities, tasks, SOQL | `SALESFORCE_ACCESS_TOKEN`, `SALESFORCE_INSTANCE_URL` |
| [Pipedrive](./mcp-pipedrive/) | 20 | Persons, deals, organizations, activities, pipelines | `PIPEDRIVE_API_TOKEN` |
| [Intercom](./mcp-intercom/) | 22 | Contacts, conversations, messages, tags, companies | `INTERCOM_ACCESS_TOKEN` |

**When a message arrives:**
```
Phone: +44 7911 123456
  ↓
HubSpot: search_contacts(phone) → Sarah Chen, Enterprise plan
  ↓
Intercom: list_conversations(contact_id) → 2 open threads
  ↓
Stripe: get_customer(email) → $299/mo, renews April 5
  ↓
Claude now knows who Sarah is before saying hello
```

---

### Support — Close the Loop

| Server | Tools | Key Capability | Secrets |
|--------|-------|----------------|---------|
| [Zendesk](./mcp-zendesk/) | 28 | Tickets, users, orgs, knowledge base, views, macros, CSAT | `ZENDESK_SUBDOMAIN`, `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN` |

**Zendesk use cases:**
- Auto-create tickets from any messaging channel with full context pre-filled
- AI triage: read the knowledge base first, try to self-serve before escalating
- CSAT follow-up: closed ticket → send WhatsApp satisfaction survey 1 hour later
- Escalation path: detect anger/legal keywords → urgent ticket + Slack alert + human handoff

---

### Scheduling — Book It Automatically

| Server | Tools | Key Capability | Secrets |
|--------|-------|----------------|---------|
| [Calendly](./mcp-calendly/) | 15 | Event types, availability, scheduled events, invitees, webhooks | `CALENDLY_API_TOKEN` |
| [Cal.com](./mcp-cal-com/) | 15 | Bookings, availability, event types, schedules (open-source) | `CAL_COM_API_KEY` |
| [Google Calendar](./mcp-google-calendar/) | 10 | Calendars, events, CRUD, free/busy, quick add | `GOOGLE_ACCESS_TOKEN` |

**The scheduling flow:**
```
"Can we talk tomorrow afternoon?"
  ↓
Calendly: get_event_type_availability(tomorrow, 12pm-5pm)
  ↓
"I have 2pm, 3pm, or 4:30pm free. Which works?"
  ↓
User picks 3pm
  ↓
Calendly: book the slot → confirmation sent automatically
HubSpot: update deal → next_step = "Discovery call Mar 15 3pm"
```

---

### Email — Every Channel Covered

| Server | Tools | Key Capability | Secrets |
|--------|-------|----------------|---------|
| [Resend](./mcp-resend/) | 8 | Transactional email, domains, API keys | `RESEND_API_KEY` |
| [SendGrid](./mcp-sendgrid/) | 20 | Send, templates, contacts, lists, analytics, senders | `SENDGRID_API_KEY` |
| [Gmail](./mcp-gmail/) | 20 | Read, send, reply, forward, labels, drafts, threads | `GMAIL_ACCESS_TOKEN` |
| [Mailchimp](./mcp-mailchimp/) | 15 | Audiences, members, campaigns, tags | `MAILCHIMP_API_KEY` |

**Use Resend** for simple transactional (receipts, OTPs, welcome emails).
**Use SendGrid** at scale with templates, personalization, and delivery analytics.
**Use Gmail** when you need to read customer replies and act on them.
**Use Mailchimp** for newsletters, drip campaigns, and audience segmentation.

**Email + Bot combo:** Customer asks a question on WhatsApp → resolved in chat → follow-up summary email sent via SendGrid 5 minutes later. Professional touch, zero effort.

---

### Payments — Collect Money

| Server | Tools | Key Capability | Secrets |
|--------|-------|----------------|---------|
| [Stripe](./mcp-stripe/) | 14 | Customers, invoices, subscriptions, payment links | `STRIPE_SECRET_KEY` |
| [PayPal](./mcp-paypal/) | 15 | Orders, captures, refunds, invoices, payouts | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` |
| [Razorpay](./mcp-razorpay/) | 15 | Orders, payments, refunds, customers, payouts | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |
| [Shopify](./mcp-shopify/) | 12 | Products, orders, customers, fulfillments | `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_SHOP_DOMAIN` |

**Market coverage:**
- Stripe → US, EU, global SaaS
- PayPal → 400M users, preferred in Germany/Eastern Europe/LatAm
- Razorpay → India (1.4B population, dominant payment gateway)
- Shopify → any product/order context

**Payment recovery flow (automated):**
```
Stripe: list_subscriptions(status: past_due) → 12 customers
For each:
  WhatsApp: send_template("payment_failed", {name, amount, retry_link})
  HubSpot: create_task("Follow up on payment", due: tomorrow)

If no action in 48h:
  Gmail: send_email(personalized recovery email)

If still no action in 7 days:
  Zendesk: create_ticket(priority: high, "At-risk customer")
```

---

### Project Management — Your Team's OS

| Server | Tools | Key Capability | Secrets |
|--------|-------|----------------|---------|
| [Linear](./mcp-linear/) | 12 | Issues, projects, teams, cycles, labels | `LINEAR_API_KEY` |
| [Jira](./mcp-jira/) | 12 | Issues, projects, sprints, transitions, comments | `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_DOMAIN` |
| [Notion](./mcp-notion/) | 10 | Pages, databases, search, blocks | `NOTION_TOKEN` |
| [Airtable](./mcp-airtable/) | 10 | Records, tables, bases, views | `AIRTABLE_API_KEY` |

**Notion + Discord combo:**
Your community asks questions in Discord. Your bot searches Notion for the answer. If no match: creates a Notion page stub so the team knows what to document next.

**Linear + Sentry combo:**
Every new Sentry error → search Linear for duplicate → if none, create issue with error context, stacktrace, affected users count, and link to Sentry event. Your on-call engineer sees a Linear issue, not an email flood.

---

### Developer Tools — Ship Faster

| Server | Tools | Key Capability | Secrets |
|--------|-------|----------------|---------|
| [GitHub](./mcp-github/) | 14 | Repos, issues, PRs, commits, branches, files | `GITHUB_TOKEN` |
| [Vercel](./mcp-vercel/) | 14 | Projects, deployments, domains, env vars | `VERCEL_TOKEN` |
| [Railway](./mcp-railway/) | 12 | Projects, services, deployments, logs, variables | `RAILWAY_API_TOKEN` |
| [Sentry](./mcp-sentry/) | 12 | Orgs, projects, issues, events, releases | `SENTRY_AUTH_TOKEN` |
| [Cloudflare](./mcp-cloudflare/) | 18 | Workers, KV, R2, D1 databases | `CF_API_TOKEN`, `CF_ACCOUNT_ID` |

**The deployment bot:**
PR merged → Vercel deploys → bot posts in Slack:
- Link to preview deployment
- Changed files from GitHub
- Any new Sentry errors in the last 30 minutes
- Railway service health for dependent services

One message. Complete picture. No tab switching.

---

### Database & Storage

| Server | Tools | Key Capability | Secrets |
|--------|-------|----------------|---------|
| [Supabase](./mcp-supabase/) | 12 | Select, insert, update, delete, RPC, storage | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| [PlanetScale](./mcp-planetscale/) | 10 | Databases, branches, deploy requests | `PLANETSCALE_TOKEN` |

**Bot memory pattern with Supabase:**
Every bot conversation stored in Supabase. Query conversation history by user ID. Build full audit trail of what your AI agent did and why.

---

### Forms & Marketing

| Server | Tools | Key Capability | Secrets |
|--------|-------|----------------|---------|
| [Typeform](./mcp-typeform/) | 16 | Forms, responses, webhooks, workspaces | `TYPEFORM_API_TOKEN` |
| [Klaviyo](./mcp-klaviyo/) | 18 | Profiles, lists, events, campaigns, flows | `KLAVIYO_API_KEY` |
| [Mailchimp](./mcp-mailchimp/) | 15 | Audiences, members, campaigns, tags | `MAILCHIMP_API_KEY` |

**Typeform → trigger a bot flow:**
Customer submits a form. Webhook fires. Your bot reads the response, creates a HubSpot contact, books a Calendly slot, sends a confirmation email. All automated, zero code.

**Klaviyo use cases:**
- Sync bot interactions to Klaviyo profiles for behavioral email sequences
- Trigger flows when a bot conversation ends without resolution
- Segment customers by bot interaction history for targeted campaigns

---

### Productivity

| Server | Tools | Key Capability | Secrets |
|--------|-------|----------------|---------|
| [Google Sheets](./mcp-google-sheets/) | 18 | Read, write, append, find, format, batch update | `GOOGLE_SHEETS_ACCESS_TOKEN` |
| [Notion](./mcp-notion/) | 10 | Pages, databases, search, blocks | `NOTION_TOKEN` |
| [Airtable](./mcp-airtable/) | 10 | Records, tables, bases, views | `AIRTABLE_API_KEY` |

**Google Sheets as a lightweight database:**
Append every bot conversation as a row. Build live dashboards showing resolution rates, escalations, top questions. No data warehouse needed.

---

### Design & AI

| Server | Tools | Key Capability | Secrets |
|--------|-------|----------------|---------|
| [Figma](./mcp-figma/) | 12 | Files, nodes, comments, components, styles, images | `FIGMA_ACCESS_TOKEN` |
| [OpenAI](./mcp-openai/) | 10 | Chat, models, embeddings, images, moderation | `OPENAI_API_KEY` |
| [Anthropic](./mcp-anthropic/) | 12 | Messages, tool use, batches, models, admin | `ANTHROPIC_API_KEY` |

**Anthropic MCP — recursive agents:**
Use Claude as a tool inside your own Claude agent. Spin up sub-agents for specific tasks (translation, classification, summarization) while the main agent orchestrates the full conversation.

---

## Build Recipes

Quick-start combinations for the most common products:

### Recipe 1: WhatsApp Support Bot (30 min setup)
```
Secrets needed: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
                HUBSPOT_ACCESS_TOKEN, ZENDESK_SUBDOMAIN,
                ZENDESK_EMAIL, ZENDESK_API_TOKEN
MCPs: mcp-whatsapp, mcp-hubspot, mcp-zendesk
```

### Recipe 2: Discord Dev Community Bot
```
Secrets needed: DISCORD_BOT_TOKEN, NOTION_TOKEN,
                GITHUB_TOKEN, LINEAR_API_KEY
MCPs: mcp-discord, mcp-notion, mcp-github, mcp-linear
```

### Recipe 3: E-Commerce Concierge (WhatsApp)
```
Secrets needed: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
                SHOPIFY_ACCESS_TOKEN, SHOPIFY_SHOP_DOMAIN,
                STRIPE_SECRET_KEY, SENDGRID_API_KEY
MCPs: mcp-whatsapp, mcp-shopify, mcp-stripe, mcp-sendgrid
```

### Recipe 4: B2B Sales Assistant (Telegram)
```
Secrets needed: TELEGRAM_BOT_TOKEN, PIPEDRIVE_API_TOKEN,
                CALENDLY_API_TOKEN, RESEND_API_KEY
MCPs: mcp-telegram, mcp-pipedrive, mcp-calendly, mcp-resend
```

### Recipe 5: Incident Response Bot (Slack)
```
Secrets needed: SLACK_BOT_TOKEN, SENTRY_AUTH_TOKEN,
                GITHUB_TOKEN, LINEAR_API_KEY, RAILWAY_API_TOKEN
MCPs: mcp-slack, mcp-sentry, mcp-github, mcp-linear, mcp-railway
```

### Recipe 6: Payment Recovery (WhatsApp + Stripe)
```
Secrets needed: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
                STRIPE_SECRET_KEY, HUBSPOT_ACCESS_TOKEN
MCPs: mcp-whatsapp, mcp-stripe, mcp-hubspot
```

---

## Using These Servers

Sign up at [aerostack.dev](https://aerostack.dev). Add secrets once. Connect any servers. Paste one endpoint into your AI client:

```json
{
  "mcpServers": {
    "aerostack": {
      "url": "https://aerostack.run/api/gateway/ws/YOUR_WORKSPACE_SLUG",
      "headers": {
        "Authorization": "Bearer mwt_YOUR_WORKSPACE_TOKEN"
      }
    }
  }
}
```

All tools from all your servers appear automatically. Claude sees `discord__send_message`, `stripe__create_invoice`, `hubspot__search_contacts` — and it knows how to chain them.

---

## Architecture

Each server is a Cloudflare Worker that:
1. Accepts JSON-RPC 2.0 POST requests
2. Reads secrets from `X-Mcp-Secret-*` headers (injected by the Aerostack gateway)
3. Calls the target API with your credentials
4. Returns MCP-formatted tool results

No runtime dependencies. No npm packages in production. No cold start delay. Pure `fetch()` at the edge.

Protocol: [MCP 2024-11-05](https://spec.modelcontextprotocol.io)
Methods: `initialize`, `tools/list`, `tools/call`
Health: `GET /health`

---

## Contributing

### Add a new server
1. Fork this repo
2. Copy a template: `cp -r mcp-github mcp-YOUR_SERVICE`
3. Edit `src/index.ts` — implement `TOOLS` array and `callTool()`
4. Update `aerostack.toml` with correct worker name
5. Run `npm test` — all tests must pass
6. Submit a PR describing the service and which tools you built

### Add tools to an existing server
Open `mcp-{slug}/src/index.ts`, add to `TOOLS` and `callTool()`. Submit a PR.

### Template
```typescript
const TOOLS = [
    {
        name: 'tool_name',
        description: 'What this tool does',
        inputSchema: {
            type: 'object',
            properties: {
                param: { type: 'string', description: '...' },
            },
            required: ['param'],
        },
    },
];

async function callTool(name: string, args: Record<string, unknown>, token: string) {
    switch (name) {
        case 'tool_name': {
            const res = await fetch('https://api.example.com/endpoint', {
                headers: { Authorization: `Bearer ${token}` },
            });
            return res.json();
        }
    }
}
```

### Test locally
```bash
cd mcp-YOUR_SERVICE
npm install
npm test           # unit tests (no real credentials needed)
npm run dev        # local wrangler dev server
```

---

## Claiming Your Company's MCP

If you work at one of the companies in this catalog — claim the server and take over maintenance.

You get: verified company profile on Aerostack Hub, full code control, your branding, and option to add paid tiers.

Email **hello@aerostack.dev** with your company domain. Verified and transferred in 48h.

---

## License

MIT
