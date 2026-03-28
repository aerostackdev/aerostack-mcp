# mcp-bamboohr — BambooHR MCP Server

> Automate your entire HR workflow — manage employees, time off, org structure, reports, and custom fields from any AI agent.

BambooHR is a leading HR platform for small and medium businesses. This MCP server gives your agents complete access to the BambooHR API: creating and updating employee records, managing time off requests (approve/deny), querying the org chart, listing job openings, running HR reports, and working with custom employee fields.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-bamboohr`

---

## What You Can Do

- Onboard new employees — create records, set job title, department, location, and manager
- Search the employee directory by name or department, pull org chart hierarchy
- Create, approve, or deny time off requests automatically based on team calendar or policy rules
- Run headcount reports and benefits summaries for HR analytics
- Read and update custom employee fields for any workflow-specific HR data

## Available Tools

| Tool | Description |
|------|-------------|
| `list_employees` | List all employees with key fields — supports status and department filters |
| `get_employee` | Get full employee details — specific fields or all fields |
| `create_employee` | Create a new employee record with name, email, hire date, department |
| `update_employee` | Update employee fields — job title, department, supervisor, location |
| `get_employee_photo` | Get the profile photo URL for an employee |
| `search_employees` | Search employees by name or department (partial match) |
| `get_employee_files` | List files uploaded for an employee (contracts, reviews, etc.) |
| `list_time_off_requests` | List time off requests with filters for status, dates, and employee |
| `get_time_off_request` | Get details of a specific time off request by ID |
| `create_time_off_request` | Create a time off request for an employee |
| `approve_time_off` | Approve a pending time off request |
| `deny_time_off` | Deny a time off request with an optional reason note |
| `list_job_openings` | List open job requisitions from BambooHR ATS |
| `get_org_chart` | Get org chart hierarchy — full company or rooted at an employee |
| `list_departments` | List all departments defined in BambooHR |
| `list_locations` | List all office locations |
| `get_who_is_out` | Get employees out of office today or for a date range |
| `get_company_report` | Run a standard BambooHR report by report ID |
| `list_custom_fields` | List all custom employee fields defined in BambooHR |
| `get_employee_custom_field` | Get a specific custom field value for an employee |
| `update_custom_field` | Update a custom field value for an employee |
| `get_benefits_summary` | Get benefits enrollment summary for the company |
| `_ping` | Verify credentials by calling the meta/users endpoint |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `BAMBOOHR_API_KEY` | Yes | BambooHR API key | BambooHR → **My Account** → **API Keys** → Generate New Key |
| `BAMBOOHR_SUBDOMAIN` | Yes | Your company subdomain (e.g. `mycompany` from `mycompany.bamboohr.com`) | Visible in your BambooHR URL when logged in |

### Getting an API Key

1. Log in to BambooHR
2. Click your name in the top right → **My Account**
3. Click the **API Keys** tab
4. Click **Add New Key**, give it a name (e.g. "Aerostack"), and copy the key

> API keys have the same permissions as the user who generated them. Use an admin account for full access.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"BambooHR"** and click **Add to Workspace**
3. Add your `BAMBOOHR_API_KEY` and `BAMBOOHR_SUBDOMAIN` under **Project → Secrets**

Once added, every AI agent in your workspace can manage HR data automatically.

### Example Prompts

```
"List all active employees in the Engineering department"
"Create a time off request for employee 123 for vacation from April 1 to April 5"
"Approve time off request 500"
"Get the org chart for the team reporting to employee 50"
"Who is out of office this week?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-bamboohr \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-BAMBOOHR-API-KEY: your-api-key' \
  -H 'X-Mcp-Secret-BAMBOOHR-SUBDOMAIN: mycompany' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_who_is_out","arguments":{}}}'
```

## License

MIT
