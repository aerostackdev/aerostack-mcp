# mcp-whatsapp

WhatsApp Business MCP server for Aerostack. Exposes 24 tools covering the full Meta Cloud API v20.0 surface: session messages (text, image, document, video, audio, location, reactions), interactive messages (buttons, lists, CTA URL), template management (create, list, send, delete), media upload/download, and account management.

This MCP powers real business workflows: order notifications, appointment reminders, broadcast campaigns, AI support agents — all via Claude in an Aerostack workspace, no code required.

---

## The 24-Hour Window Rule

WhatsApp enforces a strict conversation window:

```
User messages your business
    ↓
24-hour window opens
    ↓
During window: send ANY message freely (use send_text, send_image, send_buttons, etc.)
    ↓
Window closes after 24h of inactivity
    ↓
After window: can ONLY send pre-approved template messages (use send_template)
```

This is enforced at the API level. If you try to send a session message after the window expires, you'll get error 131047. Use `send_template` to re-engage users outside the window.

---

## Setup — Path A: Test in 15 Minutes (Free)

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create App → Select **Business** type
3. Add **WhatsApp** product to the app
4. In WhatsApp > Getting Started:
   - Meta provides a **free test phone number** (no real phone needed)
   - Meta provides a **temporary access token** (24h, good for testing)
   - Copy **Phone Number ID** from the same page
   - Copy **WhatsApp Business Account ID** from the same page
5. Under "To" numbers, add your personal number to the test allowlist (up to 5 numbers)
6. Add secrets to your Aerostack workspace (see table below)

## Setup — Path B: Production

1. Complete Meta Business Verification (submit business documents, 1-3 business days)
2. Create a **System User** in Meta Business Manager > System Users
3. Assign the System User to your app with `whatsapp_business_messaging` permission
4. Generate a **permanent access token** for the System User (never expires)
5. Add a real phone number (or port an existing number)
6. Production starts at 1,000 conversations/day, scales with business tier

---

## Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | YES | Bearer token from Meta System User or App Dashboard |
| `WHATSAPP_PHONE_NUMBER_ID` | YES | Numeric ID of the sending phone number (NOT the phone number itself — found in Meta Dashboard) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | For template tools | WABA ID — required for list_templates, create_template, delete_template, get_account_info |

Add these in Aerostack: **Project → Secrets → Add Secret**

---

## Phone Number Format

All `to` fields must be in **E.164 format WITHOUT the + sign**:

| Country | Format | Example |
|---------|--------|---------|
| United States | `1XXXXXXXXXX` | `15551234567` |
| United Kingdom | `44XXXXXXXXXX` | `447911123456` |
| Brazil | `55XXXXXXXXXXX` | `5511999998888` |
| India | `91XXXXXXXXXX` | `919876543210` |
| Germany | `49XXXXXXXXXX` | `4915123456789` |

---

## Tool Reference

### Group 1 — Account & Profile

| Tool | Description |
|------|-------------|
| `get_business_profile` | Get business name, description, address, email, website, category, profile picture |
| `update_business_profile` | Update any profile field: description, address, email, websites, vertical |
| `get_phone_number_info` | Display number, verified name, quality rating, platform type, throughput level |
| `get_account_info` | WABA name, currency, timezone, template namespace (requires WABA ID secret) |

### Group 2 — Session Messages (within 24h window)

| Tool | Description |
|------|-------------|
| `send_text` | Send text message, optional URL preview |
| `send_image` | Send image by URL or media_id, optional caption |
| `send_document` | Send document/file by URL or media_id, optional caption and filename |
| `send_video` | Send video by URL or media_id, optional caption |
| `send_audio` | Send audio/voice note by URL or media_id |
| `send_location` | Send location pin with latitude, longitude, optional name and address |
| `send_reaction` | React to a received message with an emoji |

### Group 3 — Interactive Messages

| Tool | Description |
|------|-------------|
| `send_buttons` | Message with 1-3 quick-reply buttons (users tap instead of typing) |
| `send_list` | Message with scrollable list of options in sections (max 10 rows) |
| `send_cta_url` | Message with a URL call-to-action button |

### Group 4 — Template Messages (work outside 24h window)

| Tool | Description |
|------|-------------|
| `list_templates` | List all templates with status filter (APPROVED/PENDING/REJECTED/PAUSED) |
| `get_template` | Full template details including components, variables, rejection reason |
| `send_template` | Send approved template with variable values and optional media header |
| `create_template` | Submit new template for Meta review (24-48h approval) |
| `delete_template` | Delete template by name |

### Group 5 — Message Management

| Tool | Description |
|------|-------------|
| `mark_as_read` | Mark received message as read (shows blue double-tick to sender) |
| `delete_message` | Delete a sent message from recipient's view |
| `get_message_status` | Documentation: explains webhook-based status delivery |

### Group 6 — Media

| Tool | Description |
|------|-------------|
| `upload_media` | Upload media from public URL to WhatsApp servers, returns reusable media_id |
| `get_media_url` | Get download URL for media received in webhook (expires in 5 minutes) |
| `delete_media` | Delete uploaded media from WhatsApp servers |

---

## Local Development

```bash
cd MCP/mcp-whatsapp
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Test a tool with curl
curl -s -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-WHATSAPP-ACCESS-TOKEN: YOUR_TOKEN" \
  -H "X-Mcp-Secret-WHATSAPP-PHONE-NUMBER-ID: YOUR_PHONE_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "send_text",
      "arguments": {
        "to": "15551234567",
        "text": "Hello from mcp-whatsapp!"
      }
    }
  }'

# List templates (requires WABA ID)
curl -s -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-WHATSAPP-ACCESS-TOKEN: YOUR_TOKEN" \
  -H "X-Mcp-Secret-WHATSAPP-PHONE-NUMBER-ID: YOUR_PHONE_ID" \
  -H "X-Mcp-Secret-WHATSAPP-BUSINESS-ACCOUNT-ID: YOUR_WABA_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "list_templates",
      "arguments": { "status": "APPROVED" }
    }
  }'
```

## Deploy

```bash
npm run deploy
```

Or via Aerostack CLI:

```bash
aerostack deploy mcp --slug whatsapp
```
