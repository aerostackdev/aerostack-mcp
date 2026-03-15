# WhatsApp Business MCP — Architecture Plan

> Status: PLANNED — priority build
> Opportunity: 2B users, dominant business messaging globally, no quality MCP exists

---

## Why This Is a Bigger Moat Than Telegram

Telegram is developer-first. WhatsApp is **business-first**.

Every restaurant, bank, airline, hospital, e-commerce store, and SaaS company in Latin America,
India, Europe, Middle East, and Africa runs customer communication on WhatsApp. It is THE
business messaging channel for 180+ countries.

The developer building on Aerostack is not building a chat bot for fun — they are replacing their
company's SMS provider, their email marketing tool, their support queue. The dollar value per
workflow is 10-100x higher than Telegram.

### The Gap Today

| Channel | Official MCP | Quality |
|---------|-------------|---------|
| Telegram | None | — |
| Discord | None | — |
| **WhatsApp Business** | **None** | — |
| The `whatsapp-mcp` npm package | Exists | Very low quality, outdated, no templates |

No serious cloud-hosted WhatsApp MCP exists anywhere. This is a gap in the market.

---

## WhatsApp Business Platform — What It Actually Is

Meta offers two API tiers:

| Tier | Who Uses It | How It Works |
|------|------------|-------------|
| **Cloud API** | Businesses via Meta directly | REST API hosted by Meta, `graph.facebook.com` |
| **On-Premises API** | Large enterprises (legacy) | Self-hosted Docker container |

**We build for Cloud API only.** It is the modern path, Meta is deprecating On-Premises,
and it is pure REST — perfect for Cloudflare Workers.

### The 24-Hour Window Rule (Critical)

This is the most important concept to understand. WhatsApp has strict rules:

```
User messages your business
    ↓
24-hour window opens
    ↓
During window: send ANY message freely ("session message")
    ↓
Window closes after 24h of inactivity
    ↓
After window: can ONLY send pre-approved "template messages"
```

This is not optional — it is enforced at the API level. Template messages must be submitted to
Meta for approval (24-48h review). Once approved, they can be used to re-engage users at any time.

Our MCP exposes both session messages AND templates so developers can handle both flows.

---

## Architecture Decision

### API: Meta Cloud API (REST)

```
Base URL:  https://graph.facebook.com/v20.0
Auth:      Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
Format:    JSON
Transport: HTTPS — pure fetch(), CF Workers compatible
```

Meta regularly updates the API version (v17, v18, v19, v20...). We pin to `v20.0` which is
the current stable version and update via aerostack.toml when needed.

### Credentials — 3 Variables, 2 Required

| Variable | Required | Description |
|----------|----------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | YES | Bearer token from Meta System User or App Dashboard |
| `WHATSAPP_PHONE_NUMBER_ID` | YES | Numeric ID of the sending phone number (NOT the phone number itself) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | For templates only | WABA ID — needed for template management operations |

**Why three?** Meta separates the phone number (sends messages) from the business account
(owns templates). Most operations only need the first two.

Header injection:
- `X-Mcp-Secret-WHATSAPP-ACCESS-TOKEN`
- `X-Mcp-Secret-WHATSAPP-PHONE-NUMBER-ID`
- `X-Mcp-Secret-WHATSAPP-BUSINESS-ACCOUNT-ID`

### How Users Get These Credentials

#### Path A — Test / Development (15 minutes, free)
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create App → Select **Business** type
3. Add **WhatsApp** product to the app
4. In WhatsApp → Getting Started:
   - Meta provides a **free test phone number** (no real phone needed)
   - Meta provides a **temporary access token** (24h, good for testing)
   - **Phone Number ID** is shown on the same page
   - **Business Account ID** is shown on the same page
5. Add a recipient number to the test allowlist (5 numbers allowed in test)

#### Path B — Production (requires Meta Business Verification)
1. Complete Meta Business Verification (submit business docs, 1-3 days)
2. Create a **System User** in Meta Business Manager
3. Generate a **permanent access token** for the system user (never expires)
4. Add a real phone number (or port an existing one)
5. Get production rate limits (1,000 conversations/day → scales with tier)

**For Aerostack docs:** Show Path A first (testable in 15 min), Path B as production upgrade.

---

## Full Tool Surface (24 tools)

### Group 1 — Account & Profile (4 tools)

| Tool | API Endpoint | Description |
|------|-------------|-------------|
| `get_business_profile` | `GET /{phone-number-id}/whatsapp_business_profile` | Business name, description, category, address, website, email, logo |
| `update_business_profile` | `POST /{phone-number-id}/whatsapp_business_profile` | Update any profile field: name, description, category, website, email |
| `get_phone_number_info` | `GET /{phone-number-id}` | Display number, verified name, quality rating, messaging tier, status |
| `get_account_info` | `GET /{business-account-id}` | WABA name, timezone, currency, ownership |

### Group 2 — Session Messages (7 tools)

These are free-form messages sent within the 24-hour window after a user contacts the business.

| Tool | API Endpoint | Description |
|------|-------------|-------------|
| `send_text` | `POST /{phone-number-id}/messages` | Text with optional `preview_url` for link previews |
| `send_image` | `POST /{phone-number-id}/messages` | Image by URL or `media_id`, optional caption |
| `send_document` | `POST /{phone-number-id}/messages` | File by URL or `media_id`, optional caption and filename |
| `send_video` | `POST /{phone-number-id}/messages` | Video by URL or `media_id`, optional caption |
| `send_audio` | `POST /{phone-number-id}/messages` | Audio/voice note by URL or `media_id` |
| `send_location` | `POST /{phone-number-id}/messages` | Latitude, longitude, optional name and address label |
| `send_reaction` | `POST /{phone-number-id}/messages` | Emoji reaction to a specific `message_id` |

### Group 3 — Interactive Messages (3 tools)

WhatsApp's richest message type. Users can tap buttons instead of typing.

| Tool | API Endpoint | Description |
|------|-------------|-------------|
| `send_buttons` | `POST /{phone-number-id}/messages` | Message with up to 3 quick-reply buttons. `body` text + array of `{id, title}` buttons |
| `send_list` | `POST /{phone-number-id}/messages` | Message with a scrollable list. `body`, `button` label, sections with rows `{id, title, description?}` |
| `send_cta_url` | `POST /{phone-number-id}/messages` | Call-to-action with a URL button. `body` text + `{display_text, url}` button |

### Group 4 — Template Messages (5 tools)

The only way to contact users outside the 24-hour window. Must be pre-approved by Meta.

| Tool | API Endpoint | Description |
|------|-------------|-------------|
| `list_templates` | `GET /{business-account-id}/message_templates` | All templates with status (APPROVED/PENDING/REJECTED), category, language |
| `get_template` | `GET /{template-id}` | Full template: components, variables, rejection reason if any |
| `send_template` | `POST /{phone-number-id}/messages` | Send approved template. Specify `template_name`, `language_code`, and `components` with variable values |
| `create_template` | `POST /{business-account-id}/message_templates` | Submit new template for Meta approval. Category, components (HEADER/BODY/FOOTER/BUTTONS) |
| `delete_template` | `DELETE /{business-account-id}/message_templates` | Delete template by name. Cannot delete APPROVED templates in active use |

### Group 5 — Message Management (3 tools)

| Tool | API Endpoint | Description |
|------|-------------|-------------|
| `mark_as_read` | `POST /{phone-number-id}/messages` (`status: "read"`) | Mark a received message as read — shows blue double-tick to sender |
| `delete_message` | `DELETE /{phone-number-id}/messages/{message-id}` | Delete a sent message (within time window, removes from recipient too) |
| `get_message_status` | Webhook data only | NOTE: Message delivery status (sent/delivered/read) only arrives via webhooks. Document this clearly. |

### Group 6 — Media (3 tools)

| Tool | API Endpoint | Description |
|------|-------------|-------------|
| `upload_media` | `POST /{phone-number-id}/media` | Upload image/video/audio/document to WhatsApp servers. Returns `media_id` for reuse |
| `get_media_url` | `GET /{media-id}` | Get download URL for media received in webhooks (URL expires in 5 minutes) |
| `delete_media` | `DELETE /{media-id}` | Delete uploaded media from WhatsApp servers |

---

## Key Input Schemas

### `send_text`
```json
{
  "properties": {
    "to": {
      "type": "string",
      "description": "Recipient phone number in E.164 format without + (e.g. '15551234567' for US, '447911123456' for UK)"
    },
    "text": { "type": "string", "description": "Message body (max 4096 characters)" },
    "preview_url": { "type": "boolean", "description": "Show URL preview if text contains a link (default false)" }
  },
  "required": ["to", "text"]
}
```

### `send_buttons`
```json
{
  "properties": {
    "to": { "type": "string", "description": "Recipient phone in E.164 format (no +)" },
    "body": { "type": "string", "description": "Main message body text" },
    "header": { "type": "string", "description": "Optional header text above the body" },
    "footer": { "type": "string", "description": "Optional footer text below the buttons" },
    "buttons": {
      "type": "array",
      "description": "1-3 quick reply buttons",
      "maxItems": 3,
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Button payload returned when tapped (max 256 chars)" },
          "title": { "type": "string", "description": "Button label shown to user (max 20 chars)" }
        },
        "required": ["id", "title"]
      }
    }
  },
  "required": ["to", "body", "buttons"]
}
```

### `send_list`
```json
{
  "properties": {
    "to": { "type": "string" },
    "body": { "type": "string", "description": "Main message text" },
    "button_label": { "type": "string", "description": "Text on the button that opens the list (e.g. 'View Options')" },
    "header": { "type": "string", "description": "Optional header" },
    "footer": { "type": "string", "description": "Optional footer" },
    "sections": {
      "type": "array",
      "description": "1-10 sections each with rows",
      "items": {
        "type": "object",
        "properties": {
          "title": { "type": "string", "description": "Section header (required if multiple sections)" },
          "rows": {
            "type": "array",
            "description": "List items in this section (max 10 rows total across all sections)",
            "items": {
              "type": "object",
              "properties": {
                "id": { "type": "string" },
                "title": { "type": "string", "description": "Item title (max 24 chars)" },
                "description": { "type": "string", "description": "Item description (max 72 chars, optional)" }
              },
              "required": ["id", "title"]
            }
          }
        },
        "required": ["rows"]
      }
    }
  },
  "required": ["to", "body", "button_label", "sections"]
}
```

### `send_template`
```json
{
  "properties": {
    "to": { "type": "string", "description": "Recipient phone in E.164 format (no +)" },
    "template_name": { "type": "string", "description": "Approved template name (e.g. 'order_confirmation')" },
    "language_code": { "type": "string", "description": "Template language (e.g. 'en_US', 'pt_BR', 'es', 'ar')" },
    "header_variables": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Values for {{1}}, {{2}}... in the template HEADER component"
    },
    "body_variables": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Values for {{1}}, {{2}}... in the template BODY component"
    },
    "button_variables": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Values for dynamic URL buttons in the template"
    },
    "header_media_url": {
      "type": "string",
      "description": "If template header is IMAGE/VIDEO/DOCUMENT, provide the media URL here"
    }
  },
  "required": ["to", "template_name", "language_code"]
}
```

### `create_template`
```json
{
  "properties": {
    "name": {
      "type": "string",
      "description": "Template name (lowercase, underscores only, e.g. 'order_confirmation')"
    },
    "category": {
      "type": "string",
      "enum": ["MARKETING", "UTILITY", "AUTHENTICATION"],
      "description": "MARKETING=promotions, UTILITY=transactional/support, AUTHENTICATION=OTP codes"
    },
    "language": { "type": "string", "description": "Language code (e.g. 'en_US', 'pt_BR')" },
    "header": {
      "type": "object",
      "description": "Optional header component",
      "properties": {
        "format": { "type": "string", "enum": ["TEXT", "IMAGE", "VIDEO", "DOCUMENT"] },
        "text": { "type": "string", "description": "Header text (if format is TEXT). Use {{1}} for variables" }
      }
    },
    "body": {
      "type": "string",
      "description": "Body text (required). Use {{1}}, {{2}} etc. for variables. Supports *bold* and _italic_"
    },
    "footer": { "type": "string", "description": "Optional footer text (no variables allowed)" },
    "buttons": {
      "type": "array",
      "description": "Optional CTA or Quick Reply buttons",
      "items": {
        "type": "object",
        "properties": {
          "type": { "type": "string", "enum": ["QUICK_REPLY", "URL", "PHONE_NUMBER"] },
          "text": { "type": "string", "description": "Button label" },
          "url": { "type": "string", "description": "URL for URL button type" },
          "phone_number": { "type": "string", "description": "Phone number for PHONE_NUMBER type" }
        }
      }
    }
  },
  "required": ["name", "category", "language", "body"]
}
```

---

## Error Handling Map

| Meta Error Code | HTTP | MCP Message |
|-----------------|------|-------------|
| 190 | 401 | "Access token expired or invalid — regenerate in Meta Business Manager" |
| 200 | 403 | "Permission denied — ensure your access token has `whatsapp_business_messaging` permission" |
| 100 | 400 | "Invalid parameter: {field} — {detail}" |
| 131030 | 400 | "Phone number not in allowlist — in test mode, add recipient to the allowed numbers list in Meta Dashboard" |
| 131026 | 400 | "Message undeliverable — recipient may not have WhatsApp or number is invalid" |
| 131047 | 400 | "24-hour window expired — you must use a pre-approved template message to contact this user now" |
| 132000 | 400 | "Template not found or not approved yet — check template status with list_templates" |
| 132001 | 400 | "Template language/locale not found — verify the language_code matches the template's language" |
| 132007 | 400 | "Template parameter count mismatch — check body_variables matches number of {{N}} in template body" |
| 133004 | 400 | "Phone number deregistered — number is not active on this WABA" |
| 80007 | 429 | "Rate limit exceeded — upgrade your messaging tier or retry after backoff" |

---

## Power Use Cases

### UC-1: Order Notification Pipeline (E-commerce)
**Workspace: WhatsApp MCP + Shopify MCP**

Shopify order placed → Claude:
1. `send_template` to customer → "Your order {{order_id}} has been confirmed! Estimated delivery: {{date}}"
2. When order ships → `send_template` → "Your order is on the way! Track here: {{tracking_url}}"
3. On delivery → `send_template` + `send_buttons` → "Order delivered! How was your experience?" [👍 Great] [😐 OK] [👎 Issue]

Zero code. Shopify MCP + WhatsApp MCP in one Aerostack workspace.

### UC-2: AI Support Agent (SaaS)
**Workspace: WhatsApp MCP + Linear MCP + Stripe MCP**

Customer messages business → `get_updates` webhook handler →
Claude reads message → understands it's a billing question →
Stripe `get_customer` → finds account → WhatsApp `send_text` with specific invoice info →
If unresolved → Linear `create_issue` → WhatsApp `send_buttons` ["Talk to human"] ["Send invoice PDF"]

### UC-3: Appointment Reminders (Healthcare / Services)
**Workspace: WhatsApp MCP + Google Calendar MCP**

Runs daily:
1. Google Calendar `list_events` → get tomorrow's appointments
2. For each appointment → WhatsApp `send_template` → "Reminder: your appointment is tomorrow at {{time}} with {{doctor}}" [Confirm] [Reschedule]
3. User taps [Reschedule] → callback_data comes via webhook → Claude responds with available slots

### UC-4: Broadcast Campaign Management (Marketing)
**Workspace: WhatsApp MCP + Airtable MCP**

"Send our new feature announcement to all active customers in Brazil":
1. Airtable `list_records` → get customers with country=BR and status=active
2. WhatsApp `list_templates` → find approved "feature_announcement_ptbr" template
3. WhatsApp `send_template` in batches → personalized with customer name
4. Returns delivery summary

### UC-5: Template Management Workflow (Operations)
**Workspace: WhatsApp MCP only**

"Create a shipping notification template in English, Spanish, and Portuguese":
1. `create_template` × 3 with different language codes
2. `list_templates` → check pending approval status
3. When approved → `send_template` to test numbers to verify formatting

---

## What Makes WhatsApp Different from Telegram/Discord

| Aspect | Telegram | Discord | WhatsApp |
|--------|----------|---------|----------|
| Primary use | Personal / communities | Gaming / developer communities | Business to customer |
| Message types | Rich (polls, invoices, stickers) | Rich (embeds, threads) | Rich (templates, interactive) |
| Reading history | `getUpdates` rolling window | REST pagination | Webhook only (no history API) |
| Initiating contact | Any time (bot token) | Any time (bot token) | **Template only after 24h** |
| Approval process | None | None | **Templates need Meta approval** |
| Real-time events | Webhooks (separate) | Webhooks (separate) | Webhooks (separate) |
| Business use | Medium | Low | **Primary channel** |

### The Key Limitation: No Message History API

WhatsApp Cloud API has **no `getChatHistory` equivalent**. Incoming messages only arrive via webhooks. The MCP itself cannot retrieve past conversation history.

This is documented clearly, not hidden. The pattern for developers: store messages as they arrive (via webhook → Airtable/Supabase MCP), then query that store.

---

## File Structure

```
MCP/mcp-whatsapp/
├── src/
│   └── index.ts          ← 24 tools, pure fetch(), ~1000 lines
├── src/
│   └── index.test.ts     ← 55+ tests (unit + E2E skip block)
├── aerostack.toml
├── package.json           ← devDeps only
├── tsconfig.json
├── vitest.config.ts
├── PLAN.md               ← This file
└── README.md             ← Meta setup guide + tool reference
```

---

## Build Checklist

- [ ] `src/index.ts` — all 24 tools implemented
- [ ] `src/index.test.ts` — 55+ tests passing
- [ ] `aerostack.toml`
- [ ] `package.json` with vitest
- [ ] `tsconfig.json`
- [ ] `vitest.config.ts`
- [ ] `README.md` — Meta developer setup guide (Path A: test in 15min, Path B: production)
- [ ] `MCP-list.json` — status → built, env_vars updated
- [ ] `MCP/README.md` — add to table
- [ ] typecheck passes
- [ ] all unit tests pass

---

## After WhatsApp: Communication Tier Complete

| MCP | Status | Users | Auth |
|-----|--------|-------|------|
| Discord | ✅ Built | 500M | `DISCORD_BOT_TOKEN` |
| Telegram | ✅ Built | 800M | `TELEGRAM_BOT_TOKEN` |
| WhatsApp Business | 🔵 Planning | 2B | `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` |
| Zoom | Next | 300M/day | `ZOOM_ACCOUNT_ID` + `ZOOM_CLIENT_ID` + `ZOOM_CLIENT_SECRET` |
| Twitter/X | Next | 600M | `TWITTER_BEARER_TOKEN` |

After the communication tier is complete (5 MCPs), the story writes itself:
> "Connect Claude to every messaging platform your business uses — Discord, Telegram,
> WhatsApp, Zoom, and Twitter — all from one Aerostack workspace, no local processes."
