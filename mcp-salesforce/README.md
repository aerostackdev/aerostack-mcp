# mcp-salesforce — Salesforce MCP Server

> Automate your entire Salesforce CRM — manage leads, contacts, accounts, opportunities, tasks, and run SOQL queries from any AI agent.

Salesforce is the world's #1 CRM platform, used by enterprise sales and revenue operations teams globally. This MCP server gives your agents complete access to the Salesforce REST API: searching and creating leads, contacts, accounts, and opportunities; converting leads; logging tasks and activities; and running arbitrary SOQL queries for reporting and data extraction.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-salesforce`

---

## What You Can Do

- Automatically create and qualify leads from any inbound channel — web forms, emails, or enrichment data
- Convert leads to contacts and opportunities without touching the Salesforce UI
- Update opportunity stages, log notes, and complete tasks based on external signals like signed contracts
- Run custom SOQL queries to extract pipeline data, build reports, or audit CRM hygiene

## Available Tools

| Tool | Description |
|------|-------------|
| search_leads | Search leads by any field (Email, LastName, Company) using SOQL LIKE |
| get_lead | Get full details of a specific lead by Salesforce record ID |
| create_lead | Create a new lead — LastName and Company required |
| update_lead | Update lead fields including status and lead source |
| convert_lead | Convert a lead to contact and optionally create an opportunity |
| search_contacts | Search contacts by any field (Email, LastName, Phone) |
| get_contact | Get full details of a specific contact by record ID |
| create_contact | Create a new contact linked to an account |
| update_contact | Update contact fields including title, department, and account |
| list_contact_activities | List activity history for a contact (tasks, events, calls, emails) |
| search_accounts | Search accounts by name |
| get_account | Get full details of a specific account |
| create_account | Create a new account with industry, website, and billing details |
| update_account | Update account fields including revenue and billing address |
| list_account_contacts | List all contacts associated with a specific account |
| list_opportunities | List opportunities optionally filtered by account |
| get_opportunity | Get full details of a specific opportunity |
| create_opportunity | Create a new opportunity with stage and close date |
| update_opportunity | Update opportunity stage, amount, or close date |
| add_opportunity_note | Add a completed task/note to an opportunity |
| list_tasks | List tasks owned by a specific user |
| create_task | Create a new task linked to a contact, lead, or opportunity |
| complete_task | Mark a task as Completed |
| run_soql | Execute an arbitrary SOQL query against Salesforce |
| describe_object | Describe a Salesforce object to see its fields and relationships |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| SALESFORCE_ACCESS_TOKEN | Yes | Salesforce OAuth 2.0 access token | [Salesforce Connected Apps](https://help.salesforce.com/s/articleView?id=sf.connected_app_overview.htm) or Salesforce CLI: `sfdx auth:web:login` |
| SALESFORCE_INSTANCE_URL | Yes | Your Salesforce instance URL (e.g. `https://yourorg.my.salesforce.com`) | Found in Salesforce Setup → Company Information |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Salesforce"** and click **Add to Workspace**
3. Add your `SALESFORCE_ACCESS_TOKEN` and `SALESFORCE_INSTANCE_URL` under **Project → Secrets**

Once added, every AI agent in your workspace can manage Salesforce CRM data automatically — no per-user setup needed.

### Example Prompts

```
"Create a new lead in Salesforce for Jane Smith at Acme Corp from our website contact form"
"Convert lead 00Qxx0000001ABC to a contact and create an opportunity for $75,000"
"Run a SOQL query to find all opportunities closing this quarter with amount over $100,000"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-salesforce \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-SALESFORCE-ACCESS-TOKEN: your-token' \
  -H 'X-Mcp-Secret-SALESFORCE-INSTANCE-URL: https://yourorg.my.salesforce.com' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"run_soql","arguments":{"soql":"SELECT Id, Name, StageName, Amount FROM Opportunity WHERE StageName = '"'"'Prospecting'"'"' LIMIT 10"}}}'
```

## License

MIT
