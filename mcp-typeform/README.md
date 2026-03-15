# mcp-typeform — Typeform MCP Server

> Read form submissions, manage forms and webhooks, and analyze response data — give AI agents full access to your Typeform account.

Typeform is a leading form and survey platform known for its conversational UX, used by millions of teams to collect leads, feedback, and research data. This MCP server gives your agents complete access to the Typeform API: listing and inspecting forms, reading and searching responses, managing webhook subscriptions for real-time triggers, and organizing forms across workspaces.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-typeform`

---

## What You Can Do

- Read and analyze form responses in real time to trigger downstream workflows automatically
- Create forms programmatically and set up webhooks to push new submissions to your systems
- Search response data by text query to find specific submissions without manual export
- Build a survey analysis agent that reads Typeform responses and generates insights or reports

## Available Tools

| Tool | Description |
|------|-------------|
| list_forms | List all forms in your account with pagination and title search |
| get_form | Get full details of a form including all fields and settings |
| create_form | Create a new Typeform form with fields, settings, and theme |
| update_form | Replace a form's complete definition (full PUT replacement) |
| delete_form | Permanently delete a form and all its responses |
| get_responses | Get responses for a form with date range, completion, and text filters |
| get_response | Get a specific response by response ID |
| delete_responses | Delete one or more responses from a form |
| get_response_count | Get the total number of responses for a form |
| search_responses | Search responses by text query |
| list_webhooks | List all webhooks configured for a form |
| create_webhook | Create or update a webhook to receive form submission events at a URL |
| delete_webhook | Delete a webhook from a form by its tag |
| list_workspaces | List all workspaces in your Typeform account |
| get_workspace | Get details about a specific workspace |
| get_me | Get information about the authenticated Typeform account |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| TYPEFORM_API_TOKEN | Yes | Typeform Personal Access Token | [admin.typeform.com](https://admin.typeform.com) → Account → Developer apps → Personal tokens → Generate token |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Typeform"** and click **Add to Workspace**
3. Add your `TYPEFORM_API_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can read Typeform responses and manage forms automatically — no per-user setup needed.

### Example Prompts

```
"Get the last 50 responses from our 'Customer Satisfaction' form and summarize the feedback"
"Set up a webhook on our lead capture form to POST new submissions to https://api.myapp.com/leads"
"How many total responses has the 'Product Feedback' form received this month?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-typeform \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-TYPEFORM-API-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_responses","arguments":{"form_id":"abc123","page_size":25,"completed":true}}}'
```

## License

MIT
