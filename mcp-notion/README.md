# mcp-notion — Notion MCP Server

> Full read/write access to Notion pages, databases, and blocks using a simple API key. No OAuth required.

## Setup

### 1. Create a Notion Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **New integration**
3. Give it a name (e.g. "Aerostack")
4. Select the workspace to connect
5. Copy the **Internal Integration Secret** (starts with `ntn_` or `secret_`)

### 2. Share Pages/Databases with the Integration

In Notion, open any page or database you want accessible:
1. Click the **...** menu (top right)
2. Click **Connections** -> **Connect to** -> select your integration
3. Confirm access

### 3. Add to Aerostack

Add this MCP to your workspace and set the `NOTION_API_KEY` secret to your integration token.

```
Environment variable: NOTION_API_KEY
Value: ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Tools (9)

| Tool | Description |
|------|-------------|
| `search` | Search across all pages and databases by title or content |
| `get_page` | Get a page with all its properties (title, status, dates, tags) |
| `create_page` | Create a new page in a database with properties and optional body content |
| `update_page` | Update properties on an existing page (partial update). Can also archive pages |
| `query_database` | Query a database with filters and sorts. Returns pages matching criteria |
| `get_database` | Get a database schema — property names, types, select options |
| `get_page_content` | Read the full body content of a page (paragraphs, headings, lists, code) |
| `append_blocks` | Add content blocks to the end of an existing page |
| `list_databases` | List all databases shared with your integration |

---

## Example Workflows

### Notion -> Social Media (with Ocoya MCP)

1. `query_database` — filter posts where Status = "Ready to Publish"
2. `get_page_content` — read the full post body
3. Ocoya `create_post` — schedule to social platforms
4. `update_page` — set Status to "Published"

### Blog Publishing

1. `query_database` — filter drafts where Status = "Approved"
2. `get_page_content` — extract the blog content as plain text
3. Blog API — publish the post
4. `update_page` — add blog URL, set Status to "Published"

### Content Pipeline

1. `list_databases` — discover available content databases
2. `get_database` — inspect schema to understand property structure
3. `create_page` — add new content entries from external sources
4. `query_database` — pull content for review/processing

---

## Comparison: MCP vs Functions

| Feature | MCP (this package) | Functions |
|---------|-------------------|-----------|
| **Tools** | 9 tools in one package | 1 tool per function |
| **Auth** | One API key for all tools | API key per function |
| **Best for** | Agent Endpoints (LLM orchestration) | Workflows (step-by-step, no LLM) |
| **Setup** | Add MCP to workspace, set 1 secret | Add each function, set secret on each |

Use the **MCP** when an AI agent needs to dynamically decide which Notion operations to perform.
Use **functions** when you have a fixed workflow where each step is predetermined.

---

## Notes

- Uses Notion API version `2022-06-28` (latest stable)
- Requires an **internal integration token** (`ntn_` or `secret_` prefix) — NOT an OAuth token
- Pages and databases must be explicitly shared with the integration to be accessible
- Maximum 100 results per query/search — use `start_cursor` pagination for larger datasets
- Rate limits are enforced by Notion (3 requests/second per integration)
