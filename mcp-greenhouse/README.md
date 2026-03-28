# mcp-greenhouse — Greenhouse ATS MCP Server

> Automate your entire recruiting pipeline — manage jobs, candidates, applications, interviews, offers, and hiring reports from any AI agent.

Greenhouse is a leading applicant tracking system used by fast-growing companies to run structured hiring. This MCP server gives your agents complete access to the Greenhouse Harvest API: posting jobs, sourcing and managing candidates, moving applications through the hiring pipeline, scheduling interviews, creating offers, and pulling hiring reports.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-greenhouse`

---

## What You Can Do

- Automatically create job postings and update their status from your systems
- Source candidates, create their profiles, and apply them to open roles in one step
- Move applications through pipeline stages, reject with reasons, and schedule interviews
- Create and approve offers with salary and start date
- Pull hiring reports for date ranges or specific departments

## Available Tools

| Tool | Description |
|------|-------------|
| `list_jobs` | List jobs filtered by status (open/closed/draft), department, or office |
| `get_job` | Get full job details including departments, offices, hiring managers |
| `create_job` | Create a new job from a template or from scratch |
| `update_job` | Update job name, status, notes, or team responsibilities |
| `list_job_posts` | Get public job posts for a job (live and offline) |
| `list_candidates` | List candidates filtered by job, email, or date range |
| `get_candidate` | Get full candidate profile including applications, tags, social links |
| `create_candidate` | Create a new candidate and optionally apply to a job |
| `update_candidate` | Update candidate name, email, phone, company, title, or tags |
| `add_note_to_candidate` | Add a note to a candidate with configurable visibility |
| `search_candidates` | Search candidates by name or email |
| `merge_candidates` | Merge duplicate candidate records |
| `list_applications` | List applications filtered by job, candidate, status, or activity date |
| `get_application` | Get full application details including stage, credited_to, and jobs |
| `advance_application` | Move an application to the next stage in the pipeline |
| `reject_application` | Reject an application with a reason and optional notes |
| `schedule_interview` | Schedule an interview with interviewers, start/end times, and location |
| `get_scorecards` | Get interview scorecards submitted for an application |
| `list_offers` | List all offers for an application |
| `create_offer` | Create an offer with salary, currency, and start date |
| `approve_offer` | Mark an offer as approved |
| `get_hiring_report` | Get hiring summary report for a date range and optional department |
| `_ping` | Verify credentials by calling a lightweight read endpoint |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `GREENHOUSE_API_KEY` | Yes | Greenhouse Harvest API key | [Greenhouse Dev Center](https://developers.greenhouse.io/harvest.html#authentication) → Settings → Dev Center → API Credential Management → Create New API Key → select **Harvest** |

### Auth Format

Greenhouse uses HTTP Basic authentication with the API key as the username and an empty password:

```
Authorization: Basic base64(apiKey:)
```

This server handles the encoding automatically — just provide the raw API key as the secret.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Greenhouse"** and click **Add to Workspace**
3. Add your `GREENHOUSE_API_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can automate hiring workflows — no per-user setup needed.

### Example Prompts

```
"List all open engineering jobs and show me how many candidates are in each pipeline"
"Create a candidate profile for John Smith at Google, apply to job 101"
"Move application 401 from the Phone Screen stage to Technical Interview"
"Generate a hiring report for Q1 2026 for the Engineering department"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-greenhouse \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GREENHOUSE-API-KEY: your-api-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_jobs","arguments":{"status":"open"}}}'
```

## On-Behalf-Of Header

Some Greenhouse write operations require an `On-Behalf-Of` header containing the Greenhouse user ID performing the action (for audit trail purposes). Tools that support this include an optional `on_behalf_of` parameter — pass the numeric Greenhouse user ID when your org requires it.

## License

MIT
