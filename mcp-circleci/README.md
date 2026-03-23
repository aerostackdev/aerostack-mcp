# mcp-circleci — CircleCI MCP Server

> Monitor pipelines, trigger builds, and manage CI/CD workflows in CircleCI.

CircleCI is a leading continuous integration and delivery platform. This MCP server gives your AI agents the ability to list pipelines, inspect workflow and job status, retrieve build artifacts, trigger new pipelines, and cancel running workflows — enabling automated CI/CD observability and control from any agent.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-circleci`

---

## What You Can Do

- Monitor pipeline status across projects — see which builds are passing, failing, or running
- Drill into workflow and job details to diagnose build failures without leaving your agent conversation
- Trigger new pipelines on specific branches with custom parameters for on-demand builds
- Cancel running workflows to stop wasted compute when a build is no longer needed
- Retrieve job artifacts (test reports, coverage files, binaries) programmatically

## Setup

### Step 1: Generate a CircleCI Personal API Token

1. Go to [circleci.com](https://app.circleci.com/) and log in
2. Click your avatar (bottom-left) → **User Settings** → **Personal API Tokens**
3. Click **Create New Token**, give it a name (e.g., "Aerostack MCP"), and copy the token

### Step 2: Add to Aerostack Workspace

1. Go to your Aerostack workspace → **Add Server** → search **"CircleCI"**
2. Paste your `CIRCLECI_TOKEN` when prompted
3. Click **Test** to verify the connection

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify token by fetching the current user |
| `list_pipelines` | List recent pipelines for a project |
| `get_pipeline` | Get details of a single pipeline |
| `list_workflows` | List workflows for a pipeline |
| `get_workflow` | Get details of a single workflow |
| `list_jobs` | List jobs for a workflow |
| `get_job` | Get details of a job by job number |
| `get_job_artifacts` | List artifacts produced by a job |
| `trigger_pipeline` | Trigger a new pipeline on a project |
| `cancel_workflow` | Cancel a running workflow |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `CIRCLECI_TOKEN` | Yes | CircleCI Personal API Token |

## Project Slugs

CircleCI identifies projects using a slug format: `{vcs}/{org}/{repo}`

- GitHub: `gh/my-org/my-repo`
- Bitbucket: `bb/my-org/my-repo`

Use this format for `project_slug` parameters in all tools.

## Example Prompts

```
"List the last 5 pipelines for gh/acme/api-server and tell me if any are failing"
"Show me the jobs in the most recent workflow for pipeline abc-123 and check if tests passed"
"Trigger a new pipeline on the staging branch of gh/acme/api-server"
"Cancel workflow xyz-789 — we pushed a fix and need to re-run"
"Get the test artifacts from job 542 in gh/acme/api-server"
```

## Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-circleci \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-CIRCLECI-TOKEN: your-circleci-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_pipelines","arguments":{"project_slug":"gh/my-org/my-repo"}}}'
```

## License

MIT
