# mcp-gusto — Gusto HR & Payroll MCP Server

> Automate your HR operations — manage employees, run payroll, track benefits, and access company data from any AI agent.

Gusto is the all-in-one platform used by 300,000+ businesses for payroll, benefits, and HR. This MCP server gives your agents complete access to the Gusto API v1: listing and creating employees, retrieving payrolls with full compensation breakdowns, managing benefits enrollments, and accessing company-level HR data. Rate limits (200 req/min) are handled gracefully with informative error messages.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-gusto`

---

## What You Can Do

- Automatically onboard new employees — create profile, job, and compensation in a single call
- Query payroll runs with full earnings, deductions, and tax breakdowns for reporting
- List employee benefits enrollments and available company plans
- Pull pay stubs, time-off balances, and earning types for any employee
- Access company locations, departments, bank accounts, and contractor records

## Available Tools

| Tool | Description |
|------|-------------|
| list_employees | List all employees with optional includes (jobs, compensations, home_address, custom_fields) |
| get_employee | Get full employee profile by UUID |
| create_employee | Create a new employee with job title, compensation rate, and payment unit |
| update_employee | Update employee fields (first_name, last_name, email, date_of_birth) |
| list_employee_time_off | Get time off accruals, usages, and adjustments for an employee |
| get_employee_pay_stubs | Get pay stubs for an employee, optionally filtered by year |
| list_payrolls | List payrolls with filters for processed status, off-cycle, and date range |
| get_payroll | Get a payroll with full employee compensation breakdowns |
| get_payroll_summary | Get payroll summary report (totals for wages, taxes, deductions) for a date range |
| list_pay_schedules | List pay schedules (weekly, biweekly, semimonthly, monthly) |
| get_tax_liabilities | Get federal, state, and local tax liabilities for the company |
| get_company | Get company details: name, EIN, entity type, and primary address |
| list_locations | List all company work locations with full address |
| list_departments | List departments with employee counts |
| list_company_bank_accounts | List company bank accounts for payroll deposits |
| list_benefits | List all supported Gusto benefit types |
| list_company_benefits | List benefits offered by the company with deduction and contribution amounts |
| get_company_benefit | Get a specific company benefit plan by ID |
| list_employee_benefits | List benefits an employee is enrolled in |
| list_contractors | List contractors optionally including compensation details |
| list_earning_types | List custom earning types (bonuses, commissions, etc.) |
| get_current_user | Get authenticated user info and company access list |
| _ping | Validate credentials — returns current user and companies |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| GUSTO_ACCESS_TOKEN | Yes | OAuth 2.0 Bearer access token for the Gusto API | [Gusto Developer Docs — OAuth](https://docs.gusto.com/app-integrations/docs/authentication) — Create an app at [dev.gusto.com](https://dev.gusto.com) and complete the OAuth flow |
| GUSTO_COMPANY_ID | Yes | UUID of the Gusto company to manage | Call `GET /v1/me` with your token and read `companies[0].uuid`, or find it in **Company Settings → Integrations → API** in the Gusto dashboard |

### Required Scopes

Your OAuth token must include:
- `employees:read` and `employees:write` — for employee management
- `payrolls:read` — for payroll and pay stub access
- `company_benefits:read` — for benefits data
- `companies:read` — for company and location info
- `contractors:read` — for contractor access

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Gusto"** and click **Add to Workspace**
3. Add your `GUSTO_ACCESS_TOKEN` and `GUSTO_COMPANY_ID` under **Project → Secrets**

Once added, your AI agents can automate HR tasks — onboarding, payroll queries, benefits lookups — without any manual Gusto interaction.

### Example Prompts

```
"Create a new employee record for Sarah Chen starting April 1st as a Senior Engineer at $145,000/year"
"Show me all payrolls processed in Q1 2026 with totals"
"List all employees in the Engineering department with their current compensation"
"Get the tax liabilities report for this company"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-gusto \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GUSTO-ACCESS-TOKEN: your-bearer-token' \
  -H 'X-Mcp-Secret-GUSTO-COMPANY-ID: your-company-uuid' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_employees","arguments":{"include":["jobs","compensations"]}}}'
```

## License

MIT
