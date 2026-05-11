# mcp-apollo — Apollo MCP Server

> Search people and companies, enrich contact data, manage sequences, and access sales intelligence data via Apollo.io.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-apollo`

---

## What You Can Do

This MCP server gives AI agents access to Apollo via 21 tools. Connect it to any Aerostack workspace and your agents can interact with Apollo directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `search_people` | Search for people by keywords, job title, location, or company domain. Returns name, title, email, organization, and LinkedIn URL. |
| `get_person` | Get a person/contact by ID. Returns name, title, email, phone, organization, LinkedIn URL, and employment history. |
| `enrich_person` | Enrich a person by email address. Returns full profile with phone numbers, social links, employment history, and company data. |
| `list_people` | List people/contacts in the Apollo account with pagination. |
| `create_person` | Create a new contact/person in Apollo. Returns the created person record. |
| `update_person` | Update an existing person/contact in Apollo. Provide only the fields to change. |
| `search_accounts` | Search accounts/companies by name, industry tags, or keyword tags. Returns name, domain, industry, employee count, and website. |
| `get_account` | Get an account/company by ID. Returns name, domain, industry, employee count, phone, and website. |
| `create_account` | Create a new account/company in Apollo. Name is required. |
| `update_account` | Update an existing account/company in Apollo. Provide only the fields to change. |
| `list_accounts` | List accounts/companies in the Apollo workspace with pagination. |
| `list_sequences` | List all sequences in Apollo. Returns name, status (active/paused/archived), step count, and active contact count. |
| `get_sequence` | Get a sequence by ID. Returns name, steps count, and active contact count. |
| `add_to_sequence` | Add a contact to an Apollo sequence. Optionally specify which email account to send from. |
| `remove_from_sequence` | Remove a contact from an Apollo sequence. Stops any further outreach steps. |
| `list_contacts` | List contacts in Apollo with optional filters by account ID or label names. |
| `get_contact` | Get a contact by ID. Returns full contact details including email, phone, title, and stage. |
| `update_contact` | Update a contact in Apollo. Provide only the fields to change. |
| `delete_contact` | Delete a contact from Apollo permanently. |
| `get_api_usage` | Get API usage stats for the current Apollo account. Returns requests used today, monthly limit, and remaining quota. |
| `list_labels` | List all contact and account labels defined in the Apollo workspace. |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `APOLLO_API_KEY` | Yes | Apollo.io API Key — found in your Apollo account under Settings → Integrations → API. Provides access to people search, enrichment, and sequences. |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Apollo"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `APOLLO_API_KEY`

Once added, every AI agent in your workspace can use Apollo tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-apollo \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-APOLLO-API-KEY: your-apollo-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_people","arguments":{}}}'
```

## License

MIT
