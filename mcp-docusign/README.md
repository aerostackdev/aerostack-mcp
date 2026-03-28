# mcp-docusign — DocuSign MCP Server

> Send envelopes, collect e-signatures, manage templates, and audit signing workflows — all from any AI agent using the DocuSign eSignature REST API v2.1.

DocuSign is the world's leading e-signature platform. This MCP server gives your agents complete access to the DocuSign eSignature API: creating and sending envelopes from documents or templates, managing recipients, generating embedded signing URLs for in-app flows, downloading signed documents, and auditing the full signing trail.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-docusign`

---

## What You Can Do

- Send signature requests from a PDF document or an existing DocuSign template in one API call
- Monitor envelope status and resend reminders to outstanding signers automatically
- Generate embedded signing URLs for in-app signature flows without recipients needing to check email
- Download signed PDF documents as base64 content for archiving or processing
- Get the complete audit trail — every view, sign, decline, and timestamp — for compliance reporting
- Build and manage reusable signing templates with named roles

## Available Tools

| Tool | Description |
|------|-------------|
| `list_envelopes` | List envelopes filtered by status and date range |
| `get_envelope` | Get full envelope details: status, subject, signers, timestamps |
| `create_envelope` | Create and send an envelope from a template or inline document |
| `void_envelope` | Void (cancel) a sent envelope with a reason |
| `resend_envelope` | Resend signing notification to pending recipients |
| `get_envelope_documents` | List all documents in an envelope |
| `download_envelope_document` | Download a document as base64 PDF |
| `get_envelope_recipients` | Get all recipients with status per recipient |
| `add_recipient` | Add a new signer or CC to a draft envelope |
| `update_recipient` | Update recipient email, name, or routing order |
| `delete_recipient` | Remove a recipient from a draft envelope |
| `create_signing_url` | Generate an embedded signing URL for in-app signing |
| `list_templates` | List templates in the account, filter by name |
| `get_template` | Get template details: roles, documents, description |
| `create_template` | Create a new template with a document and signer role |
| `send_from_template` | Send an envelope using a template, mapping recipients to roles |
| `list_folders` | List envelope folders (inbox, sent, drafts, custom) |
| `get_folder_envelopes` | List envelopes inside a specific folder |
| `get_envelope_audit_events` | Get full audit trail for an envelope |
| `search_envelopes` | Search envelopes by recipient email or subject text |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `DOCUSIGN_ACCESS_TOKEN` | Yes | DocuSign OAuth 2.0 access token | [DocuSign Developer Center](https://developers.docusign.com/docs/esign-rest-api/guides/authentication/) — use JWT Grant or Authorization Code flow. For testing: [DocuSign OAuth Playground](https://developers.docusign.com/tools/oauth-token-generator) |
| `DOCUSIGN_ACCOUNT_ID` | Yes | Your DocuSign account UUID | Log into [DocuSign Admin](https://admindemo.docusign.com/) → Settings → Account Profile → Account ID |
| `DOCUSIGN_BASE_URL` | Yes | Your account's API base URL (e.g. `https://na4.docusign.net`) | Found in your account settings, or use the [DocuSign UserInfo endpoint](https://developers.docusign.com/docs/esign-rest-api/reference/authentication/userinfo/) after authenticating |

**Required OAuth scopes:** `signature` `impersonation` (for JWT) or `signature` (for Authorization Code)

**Demo environment:** Use `https://demo.docusign.net` as the base URL when using DocuSign sandbox accounts.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"DocuSign"** and click **Add to Workspace**
3. Add your `DOCUSIGN_ACCESS_TOKEN`, `DOCUSIGN_ACCOUNT_ID`, and `DOCUSIGN_BASE_URL` under **Project → Secrets**

Once added, your AI agents can send contracts, track signatures, and download signed documents automatically.

### Example Prompts

```
"Send an NDA to sarah@example.com using our standard NDA template"
"List all envelopes that are still waiting for signature"
"Generate a signing URL for envelope abc-123 so the user can sign in our app"
"Download the signed contract from envelope abc-456 as a PDF"
"Get the full audit trail for envelope abc-789 to verify when it was signed"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-docusign \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-DOCUSIGN-ACCESS-TOKEN: your-access-token' \
  -H 'X-Mcp-Secret-DOCUSIGN-ACCOUNT-ID: your-account-id' \
  -H 'X-Mcp-Secret-DOCUSIGN-BASE-URL: https://na4.docusign.net' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_envelopes","arguments":{"status":"sent","count":10}}}'
```

## License

MIT
