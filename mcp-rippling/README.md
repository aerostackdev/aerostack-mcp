# mcp-rippling — Rippling MCP Server

> Automate HR operations — query employees, departments, org charts, compensation, work locations, and app provisioning from Rippling.

Rippling is the all-in-one HR, IT, and Finance platform. This MCP server gives AI agents full read access to your Rippling workforce data: listing and searching employees, traversing the org chart, reading compensation details, finding work locations, and checking app provisioning status.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-rippling`

---

## What You Can Do

- Look up employees by name, email, or employment status in natural language
- Traverse the full manager chain for any employee up to the root
- Get a headcount breakdown by department for planning and reporting
- Read compensation data for budgeting and benchmarking workflows
- Identify work location assignments across offices and remote employees

## Available Tools

| Tool | Description |
|------|-------------|
| list_employees | List employees with optional status filter (ACTIVE/INACTIVE/TERMINATED), expand, limit, offset |
| get_employee | Get full employee details by ID — supports expand for department, manager, compensation, work_location |
| get_employee_by_email | Find an employee by their exact work email address |
| search_employees | Search employees by name keyword — filters client-side across first name, last name, full name |
| list_terminated_employees | List terminated employees with optional date range filters |
| get_employment_history | Get full employment status history for an employee |
| list_departments | List all departments with parent hierarchy IDs |
| get_department | Get department details and current member list |
| list_legal_entities | List all legal entities (companies/subsidiaries) in Rippling |
| get_manager_chain | Walk the full management chain for an employee up to the root |
| get_org_chart | Get all employees with manager IDs for building org trees |
| get_compensation | Get compensation details for an employee (salary, currency, payment type, effective date) |
| list_employment_types | List employment types (FULL_TIME, PART_TIME, CONTRACTOR) |
| list_work_locations | List all office and remote work locations |
| get_work_location | Get the work location assigned to a specific employee |
| list_users | List all Rippling users with role and status |
| get_user | Get a specific Rippling user by ID |
| get_current_user | Get the currently authenticated user info |
| list_apps | List apps and integrations managed through Rippling IT |
| get_headcount_by_department | Get active headcount broken down by department |
| _ping | Confirm auth by calling /me — returns current user |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| RIPPLING_API_TOKEN | Yes | Rippling API Bearer token | Rippling → Settings → API & Integrations → API Tokens. Token expires after 30 days of inactivity — regenerate to extend. |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Rippling"** and click **Add to Workspace**
3. Add your `RIPPLING_API_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can query your Rippling HR data automatically.

### Example Prompts

```
"List all active employees in the Engineering department"
"Who is the manager chain for Jane Smith up to the CEO?"
"Give me a headcount breakdown by department"
"Find the employee with email jane.smith@acmecorp.com"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-rippling \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-RIPPLING-API-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_employees","arguments":{"employment_status":"ACTIVE","expand":"department,manager","limit":20}}}'
```

## Notes

- The `expand` parameter accepts comma-separated field names: `department`, `manager`, `compensation`, `work_location`
- `search_employees` fetches up to 200 employees client-side and filters by name — use `list_employees` with filters for large orgs
- `get_manager_chain` walks up the hierarchy iteratively — it stops when it finds an employee with no manager or when the root is reached
- `get_headcount_by_department` derives counts from active employees — it calls both `/departments` and `/employees` in parallel

## License

MIT
