# Zendesk MCP — Architecture Plan

> Status: PLANNED — priority build (Phase 1 of AI Bot Stack)
> Market: No official MCP. Best community option (71 stars) is Python, abandoned Dec 2024.
> Opportunity: Every business running customer support uses Zendesk (100,000+ companies)

---

## Why Zendesk Is the First Business MCP to Build

In the AI Bot Stack, the support ticket layer is the single most important business tool:

1. **Every bot needs an escape hatch** — when AI can't solve it, create a ticket
2. **Identity lives here** — Zendesk knows the customer's history better than any CRM
3. **Agents live here** — the human team sees everything through Zendesk
4. **Knowledge Base** — the answers to 80% of customer questions are already written

Without Zendesk, the AI bot is a dead end. With it, the bot becomes a triage layer that
handles routine questions and routes complex ones to humans — seamlessly.

### What the Best Community Option (reminia, 71 stars) Can't Do

| Capability | reminia | Aerostack |
|------------|---------|-----------|
| Language | Python | TypeScript |
| Hosting | Local process only | Cloud (CF Workers) |
| Auth injection | Manual .env | Gateway secret headers |
| Ticket search | Basic | Full query syntax |
| User management | ❌ None | ✅ Search, create, update |
| Organizations | ❌ None | ✅ Full CRUD |
| Macros | ❌ None | ✅ List + apply |
| Views | ❌ None | ✅ List + get tickets |
| CSAT ratings | ❌ None | ✅ Get satisfaction scores |
| Last commit | Dec 2024 (dead) | Actively maintained |
| Test coverage | None | Full vitest suite |

---

## Architecture Decision

### API: Zendesk REST API v2

```
Base URL:   https://{subdomain}.zendesk.com/api/v2
Auth:       Authorization: Basic base64(email/token:api_token)
Format:     JSON
Transport:  HTTPS — pure fetch(), CF Workers compatible
```

### Auth — The Subtle Detail

Zendesk API token auth uses a non-obvious format. The Basic auth username is NOT just the
email — it appends `/token`:

```
Username:  agent@company.com/token    ← note the /token suffix
Password:  your_api_token_here

Base64:    btoa("agent@company.com/token:api_token_here")
Header:    Authorization: Basic {base64_string}
```

This trips up most developers. We handle it in the helper, so users just provide 3 clean values.

### Credentials — 3 Variables

| Variable | Header | Example |
|----------|--------|---------|
| `ZENDESK_SUBDOMAIN` | `X-Mcp-Secret-ZENDESK-SUBDOMAIN` | `acme` (from acme.zendesk.com) |
| `ZENDESK_EMAIL` | `X-Mcp-Secret-ZENDESK-EMAIL` | `admin@acme.com` |
| `ZENDESK_API_TOKEN` | `X-Mcp-Secret-ZENDESK-API-TOKEN` | `abc123...` |

### How Users Get Credentials (5 minutes)

1. Log into Zendesk Admin Center → `https://{subdomain}.zendesk.com/admin`
2. Go to **Apps and Integrations → APIs → Zendesk API**
3. Enable **Token Access** if not already on
4. Click **Add API Token** → give it a name → copy the token (shown once)
5. Add all 3 values to Aerostack workspace secrets

**No app creation, no OAuth, no review process.** Just copy-paste.

---

## Full Tool Surface — 26 Tools

### Group 1 — Tickets (9 tools) — The Core

Tickets are the atomic unit of Zendesk. Everything else orbits them.

| Tool | Method + Endpoint | Description |
|------|------------------|-------------|
| `list_tickets` | `GET /tickets` | Recent tickets. Filters: status, priority, assignee_id. Returns shaped list with key fields |
| `search_tickets` | `GET /search?query=type:ticket+{query}` | Full Zendesk search syntax. Query can include `status:open`, `priority:high`, `requester:email@...`, free text |
| `get_ticket` | `GET /tickets/{id}` | Full ticket details: subject, description, status, priority, tags, assignee, requester, created_at, updated_at |
| `create_ticket` | `POST /tickets` | Create ticket with subject, body, priority (low/normal/high/urgent), requester_email, tags[], assignee_id, custom fields |
| `update_ticket` | `PUT /tickets/{id}` | Update status (open/pending/hold/solved/closed), priority, assignee_id, tags, add comment in same call |
| `delete_ticket` | `DELETE /tickets/{id}` | Soft-delete (moves to trash, recoverable) |
| `list_ticket_comments` | `GET /tickets/{id}/comments` | All public replies + internal notes. Each comment shows author, body, created_at, is_public flag |
| `add_comment` | `PUT /tickets/{id}` with comment in body | Add public reply (visible to customer) or internal note (agents only). `public: true/false` |
| `merge_tickets` | `POST /tickets/{id}/merge` | Merge one ticket into another. Useful for deduplication |

### Group 2 — Users (6 tools) — Customer Identity

The most important layer for the AI bot — knowing who you're talking to.

| Tool | Method + Endpoint | Description |
|------|------------------|-------------|
| `search_users` | `GET /users/search?query={q}` | Find by email, phone, name, external_id. Returns role (end-user/agent/admin), org, tags |
| `get_user` | `GET /users/{id}` | Full profile: name, email, phone, org_id, role, tags, notes, time_zone, locale, created_at |
| `get_user_tickets` | `GET /users/{id}/tickets/requested` | All tickets submitted by this user. Good for "what's their history?" |
| `create_user` | `POST /users` | Create end-user with name, email, phone, organization_id, role (default: end-user) |
| `update_user` | `PUT /users/{id}` | Update name, email, phone, org, tags, notes, custom fields |
| `get_user_identity` | `GET /users/{id}/identities` | All verified email/phone identities for a user |

### Group 3 — Organizations (4 tools) — Company Layer

For B2B use cases — every enterprise customer needs org-level management.

| Tool | Method + Endpoint | Description |
|------|------------------|-------------|
| `search_organizations` | `GET /organizations/search?query={q}` | Find by name, domain, external_id |
| `get_organization` | `GET /organizations/{id}` | Full org: name, domains, tags, notes, group_id |
| `create_organization` | `POST /organizations` | Create org with name, domain_names[], tags, notes |
| `update_organization` | `PUT /organizations/{id}` | Update org fields, add tags, assign default group |

### Group 4 — Knowledge Base / Help Center (4 tools) — Answer Engine

The KB is where 80% of customer answers already exist. The AI bot searches here first.

| Tool | Method + Endpoint | Description |
|------|------------------|-------------|
| `search_articles` | `GET /help_center/articles/search?query={q}` | Full-text search across all published Help Center articles. Returns title, snippet, url, vote_sum |
| `list_articles` | `GET /help_center/articles` | All articles with filters: locale, category, sort. Returns titles + summaries |
| `get_article` | `GET /help_center/articles/{id}` | Full article HTML body, title, labels, author, updated_at |
| `create_article` | `POST /help_center/sections/{section_id}/articles` | Create new Help Center article with title, body (HTML), locale |

### Group 5 — Views & Macros (3 tools) — Agent Workflow

Views are saved ticket filters. Macros are templated responses with actions.

| Tool | Method + Endpoint | Description |
|------|------------------|-------------|
| `list_views` | `GET /views/active` | All active views: name, conditions summary, ticket count |
| `get_view_tickets` | `GET /views/{id}/tickets` | Tickets in a specific view. Good for "show me all urgent open tickets" |
| `list_macros` | `GET /macros/active` | All active macros: name, actions (status change, canned reply, tags) |

### Group 6 — Satisfaction & Analytics (2 tools)

| Tool | Method + Endpoint | Description |
|------|------------------|-------------|
| `get_satisfaction_ratings` | `GET /satisfaction_ratings` | CSAT scores with score (good/bad), comment, ticket_id, created_at. Filters: score, start_time |
| `get_ticket_metrics` | `GET /tickets/{id}/metrics` | SLA breach times, first reply time, full resolution time, reopens count, replies count |

---

## Key Input Schemas

### `search_tickets`
```json
{
  "properties": {
    "query": {
      "type": "string",
      "description": "Zendesk search query. Examples: 'status:open priority:high', 'requester:sarah@acme.com', 'tag:billing created>2024-01-01'. Use free text for subject search."
    },
    "sort_by": {
      "type": "string",
      "enum": ["created_at", "updated_at", "priority", "status"],
      "description": "Sort field (default: updated_at)"
    },
    "sort_order": { "type": "string", "enum": ["asc", "desc"], "description": "default: desc" },
    "limit": { "type": "number", "description": "Results to return (default 10, max 100)" }
  },
  "required": ["query"]
}
```

### `create_ticket`
```json
{
  "properties": {
    "subject": { "type": "string", "description": "Ticket subject/title" },
    "body": { "type": "string", "description": "Initial ticket description (plain text or HTML)" },
    "requester_email": { "type": "string", "description": "Customer's email — links ticket to their user profile" },
    "requester_name": { "type": "string", "description": "Customer's name (used if email not found, creates new user)" },
    "priority": {
      "type": "string",
      "enum": ["low", "normal", "high", "urgent"],
      "description": "Ticket priority (default: normal). Use 'urgent' for outages/legal/payment issues."
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Tags for routing and filtering (e.g. ['billing', 'bot-escalation', 'whatsapp'])"
    },
    "channel": {
      "type": "string",
      "description": "Source channel for tracking (e.g. 'whatsapp', 'telegram', 'discord'). Stored as tag automatically."
    },
    "internal_note": {
      "type": "string",
      "description": "Private agent note added to ticket on creation (not visible to customer). Use for AI conversation summary."
    },
    "assignee_id": { "type": "number", "description": "Agent user ID to assign ticket to (optional)" },
    "group_id": { "type": "number", "description": "Team/group to assign to (optional)" }
  },
  "required": ["subject", "body"]
}
```

### `add_comment`
```json
{
  "properties": {
    "ticket_id": { "type": "number", "description": "Ticket ID to comment on" },
    "body": { "type": "string", "description": "Comment text (plain text or HTML)" },
    "public": {
      "type": "boolean",
      "description": "true = public reply visible to customer. false = internal note visible to agents only (default false — safer)"
    },
    "author_id": { "type": "number", "description": "Agent ID posting the comment (optional — uses API token owner if omitted)" }
  },
  "required": ["ticket_id", "body"]
}
```

### `update_ticket`
```json
{
  "properties": {
    "ticket_id": { "type": "number", "description": "Ticket ID to update" },
    "status": {
      "type": "string",
      "enum": ["open", "pending", "hold", "solved", "closed"],
      "description": "open=in progress, pending=waiting on customer, hold=waiting on third party, solved=resolved, closed=locked"
    },
    "priority": { "type": "string", "enum": ["low", "normal", "high", "urgent"] },
    "assignee_id": { "type": "number", "description": "Reassign to this agent ID" },
    "tags": { "type": "array", "items": { "type": "string" }, "description": "Replaces ALL existing tags — include current tags if you want to append" },
    "add_tags": { "type": "array", "items": { "type": "string" }, "description": "Add these tags without removing existing ones (preferred over tags for additive updates)" },
    "comment": { "type": "string", "description": "Optional: add a comment in the same API call as the update" },
    "comment_public": { "type": "boolean", "description": "Whether the comment is public (default false)" }
  },
  "required": ["ticket_id"]
}
```

---

## Error Handling Map

| HTTP | Zendesk Detail | MCP Message |
|------|---------------|-------------|
| 401 | Any | "Authentication failed — check ZENDESK_EMAIL and ZENDESK_API_TOKEN. Note: use admin email, not agent email." |
| 403 | Insufficient permissions | "Agent lacks permission for this action — requires admin role or specific permission in Zendesk" |
| 404 | Record not found | "Resource not found — check ticket/user/org ID (ID: {id})" |
| 422 | Validation error | "Validation error: {detail from response}" |
| 429 | Rate limit | "Rate limited — Zendesk allows {limit}/min. Retry after {retry_after}s" |
| 503 | Maintenance | "Zendesk is in maintenance mode — check status.zendesk.com" |

**Zendesk-specific error shapes:**
```json
// Success
{ "ticket": { ... } }

// Error
{ "error": "RecordNotFound", "description": "Not found" }
// or
{ "details": { "base": [{ "description": "Subject can't be blank" }] } }
```

Both shapes must be handled.

---

## Power Use Cases for AI Bot Stack

### UC-1: The Full Escalation Flow (most important)

```
WhatsApp/Telegram message: "I've been waiting 3 weeks for a refund, this is unacceptable"

Claude detects: negative sentiment, billing issue, escalation needed

Step 1 → Zendesk search_users(email from CRM)   → finds Sarah Chen, user_id: 12345
Step 2 → Zendesk get_user_tickets(user_id: 12345) → finds 2 open tickets, 1 about refund
Step 3 → Zendesk get_ticket(id: existing_ticket)  → reads full context
Step 4 → Zendesk add_comment(ticket_id, body: "Customer re-engaged via WhatsApp. Sentiment: frustrated. Quote: '3 weeks, unacceptable'", public: false)
Step 5 → Zendesk update_ticket(ticket_id, priority: "urgent", add_tags: ["escalated","whatsapp"])
Step 6 → WhatsApp send_message: "I can see your refund ticket from March 5. I've escalated it to urgent priority. A team member will contact you within 2 hours."
```

Customer feels heard. Agent has full context. Zero information lost.

---

### UC-2: Instant KB Answer with Ticket Fallback

```
User: "How do I export my data?"

Step 1 → Zendesk search_articles("export data")
       → finds: "How to Export Your Account Data" article

Step 2 → Claude reads article, extracts key steps
Step 3 → Reply with the answer + article link

If search returns nothing:
Step 4 → Zendesk create_ticket(
             subject: "How do I export my data?",
             body: user's question,
             tags: ["bot-unanswered", "knowledge-gap"],
             internal_note: "Bot could not find KB article. Customer needs manual answer."
         )
Step 5 → Reply: "I've logged this question for our team — you'll get an answer by email within 4 hours."
```

Every unanswered question becomes a ticket. Every ticket tagged `knowledge-gap` is a signal
to improve the KB. The bot self-improves over time.

---

### UC-3: New Customer Onboarding

```
New WhatsApp message from unknown number

Step 1 → Zendesk search_users(phone: "+447911123456") → not found
Step 2 → Zendesk create_user(name: "Unknown", phone: "+447911123456", tags: ["whatsapp"])
Step 3 → Zendesk create_ticket(
             subject: "New customer inquiry via WhatsApp",
             requester_email: auto-set,
             tags: ["whatsapp", "new-customer"],
             internal_note: "First contact. No CRM record. Message: '...'"
         )
Step 4 → Reply normally
Step 5 → When customer provides email later → Zendesk update_user(id, email: "...")
```

Every new contact becomes a tracked user from their first message.

---

### UC-4: Agent View Access

```
Support manager asks in Telegram:
"Show me all urgent open tickets right now"

Step 1 → Zendesk list_views() → finds "All Urgent" view
Step 2 → Zendesk get_view_tickets(view_id) → returns tickets
Step 3 → Claude formats as clean list with ticket IDs, subjects, requester names
Step 4 → Telegram send_message with formatted list

Or via search:
Step 1 → Zendesk search_tickets("status:open priority:urgent")
```

The support manager gets their queue inside their chat app. No Zendesk login needed.

---

### UC-5: Post-Resolution CSAT Analysis

```
Daily job:
Step 1 → Zendesk get_satisfaction_ratings(score: "bad", start_time: yesterday)
Step 2 → For each bad rating → Zendesk get_ticket(id)
Step 3 → Claude analyzes: what went wrong? patterns?
Step 4 → Slack send_message to #support-quality with:
         "3 bad CSAT yesterday. Common theme: response time on billing issues."
```

---

## The `create_ticket` AI Note Pattern

This is a critical pattern for the AI Bot Stack. Every time the bot escalates,
it writes a structured internal note that gives the human agent full context:

```
🤖 AI Bot Escalation — WhatsApp
────────────────────────────────
Channel: WhatsApp (+447911123456)
Session: 8 messages over 12 minutes
Customer sentiment: Frustrated (score: 0.2/1.0)

Conversation summary:
Customer has been waiting 3 weeks for a refund of £89 (Invoice #4821).
They mentioned contacting support twice previously with no resolution.
Tone escalated significantly in last 2 messages.

Actions taken by bot:
✓ Verified identity via HubSpot (contact_id: 12345)
✓ Found related Stripe refund request (ref: re_abc123) — status: pending
✗ Could not resolve: requires manual intervention

Recommended next step:
Check Stripe refund re_abc123 and process manually. Customer is high-value
(Enterprise plan, £4,800/yr). Prioritize resolution.
```

The human agent opens the ticket and already knows everything. They don't need to ask
the customer to repeat themselves.

---

## File Structure

```
MCP/mcp-zendesk/
├── src/
│   ├── index.ts          ← 26 tools, pure fetch(), ~1100 lines
│   └── index.test.ts     ← 60+ tests, all passing
├── aerostack.toml
├── package.json          ← devDeps only, vitest included
├── tsconfig.json
├── vitest.config.ts
├── PLAN.md               ← This file
└── README.md             ← Zendesk setup guide + tool reference
```

---

## Build Checklist

- [ ] `src/index.ts` — all 26 tools
- [ ] `src/index.test.ts` — 60+ tests
- [ ] Base64 auth helper handles `email/token:api_token` format correctly
- [ ] Both Zendesk error shapes handled (`error.description` and `details.base[].description`)
- [ ] `create_ticket` internal_note pattern documented and implemented
- [ ] `add_comment` defaults to `public: false` (safer — don't expose to customer accidentally)
- [ ] `update_ticket` supports additive `add_tags` without blowing away existing tags
- [ ] `README.md` includes 5-minute setup guide
- [ ] `MCP-list.json` updated to status: built
- [ ] `MCP/README.md` table updated
- [ ] typecheck passes
- [ ] all tests pass

---

## What Comes After Zendesk (Phase 1 complete)

| MCP | Why |
|-----|-----|
| **mcp-intercom** | Customer conversation history + user segments |
| **mcp-salesforce** | Enterprise CRM — accounts, leads, opportunities |
| **mcp-pipedrive** | SMB sales pipeline + deal management |
| **mcp-calendly** | Appointment booking (closes the "let me schedule you" use case) |
