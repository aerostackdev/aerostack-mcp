# mcp-pandadoc — PandaDoc MCP Server

> Create, send, and track document signatures — proposals, contracts, and agreements — from any AI agent.

PandaDoc is a leading e-signature and document automation platform used by over 50,000 companies. This MCP server gives AI agents complete control over the PandaDoc document lifecycle: creating documents from templates, sending for signatures, tracking status, managing recipients, and configuring webhooks.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-pandadoc`

---

## What You Can Do

- Create proposals and contracts from templates with dynamic variable substitution
- Send documents for signing with personalized cover messages
- Track real-time status — draft, sent, viewed, completed, or declined
- Download signed PDFs as base64 for storage or forwarding
- Add recipients and update form fields programmatically on draft documents
- Set up webhooks to receive real-time notifications when documents change state

## Available Tools

| Tool | Description |
|------|-------------|
| list_documents | List documents with status, search, and pagination filters |
| get_document | Get full document details by ID |
| create_document | Create document from template with recipients and token substitution |
| send_document | Send document for signing with optional message and subject |
| download_document | Download signed document as base64 PDF |
| delete_document | Delete a draft document |
| list_templates | List templates with search and tag filters |
| get_template | Get template details and roles by UUID |
| create_from_pdf | Create a document from a PDF URL |
| list_template_folders | List template folders in the workspace |
| list_recipients | Get all recipients and their signing status |
| add_recipient | Add a recipient to a draft document |
| get_document_fields | Get all form fields in a document |
| update_field_values | Update field values in a draft document |
| get_document_status | Get just the current status of a document |
| get_document_activity | Get the activity/audit trail with timestamps |
| send_reminder | Send signing reminder to pending recipients |
| list_document_sections | List sections in a document |
| list_webhooks | List all configured webhooks |
| create_webhook | Create a webhook for document event notifications |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| PANDADOC_API_KEY | Yes | PandaDoc API key for authentication | PandaDoc → Settings → Integrations → API → Generate API Key |

Use the **Production** API key for live documents. The Sandbox key is available for testing.

**Important:** PandaDoc uses `Authorization: API-Key {key}` — not `Bearer`. This is handled automatically.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"PandaDoc"** and click **Add to Workspace**
3. Add your `PANDADOC_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can manage the full document lifecycle automatically.

### Example Prompts

```
"Create a service agreement for Acme Corp using the 'Service Agreement' template and send it to john@acme.com"
"Check the status of all documents sent this week that haven't been signed yet"
"Download the signed contract for deal doc_abc123 and save it"
"Send a reminder to all pending signers on document doc_xyz789"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-pandadoc \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-PANDADOC-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_documents","arguments":{"status":"document.sent","count":20}}}'
```

### Document Status Values

| Status | Meaning |
|--------|---------|
| `document.draft` | Created but not yet sent |
| `document.sent` | Sent to recipients, awaiting signatures |
| `document.completed` | All recipients have signed |
| `document.declined` | A recipient declined to sign |
| `document.expired` | Passed expiration date |

### Token Substitution

When creating documents from templates, use `tokens` to substitute variables:

```json
{
  "tokens": [
    { "name": "client.name", "value": "Acme Corp" },
    { "name": "contract.value", "value": "$50,000" },
    { "name": "start.date", "value": "April 1, 2026" }
  ]
}
```

Token names must match variables defined in your PandaDoc template.

## Rate Limits

PandaDoc allows 60 API requests per minute by default. Enterprise plans have higher limits. For bulk document creation, add delays between requests or contact PandaDoc for rate limit increases.

## License

MIT
