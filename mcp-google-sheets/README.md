# mcp-google-sheets — Google Sheets MCP Server

> Read, write, search, and format Google Sheets spreadsheets — give AI agents a live data layer backed by the world's most popular spreadsheet tool.

Google Sheets is used by millions of teams as a lightweight database, reporting tool, and operational hub. This MCP server gives your agents full access to the Sheets API v4: reading and writing cell ranges, appending rows, searching data, managing sheet tabs, applying formatting, and creating new spreadsheets — making Sheets a fully programmable data store for AI-driven workflows.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-google-sheets`

---

## What You Can Do

- Use a Google Sheet as a live operational database — read rows, append records, and update cells from AI agents
- Automate reporting by writing analysis results, summaries, or extracted data directly into spreadsheets
- Search across sheet data with substring matching to find specific records without exporting
- Manage spreadsheet structure — add, rename, copy, or delete sheet tabs programmatically

## Available Tools

| Tool | Description |
|------|-------------|
| get_spreadsheet | Get spreadsheet metadata — title, sheet names, grid dimensions, named ranges |
| create_spreadsheet | Create a new spreadsheet with a title and optional initial sheet tabs |
| list_sheets | List all sheet tabs in a spreadsheet with IDs and indexes |
| read_range | Read cell values from a specific A1 notation range |
| read_multiple_ranges | Batch-read multiple ranges in a single API call |
| get_all_values | Read all values from an entire sheet tab |
| find_row | Search for rows where any cell contains a substring (case-insensitive) |
| write_range | Write a 2D array of values to a range, overwriting existing cells |
| append_rows | Append new rows after the last row with data |
| clear_range | Clear all values from a range without affecting formatting |
| update_cell | Update a single cell value or formula |
| batch_update_values | Update multiple ranges in one API call |
| add_sheet | Add a new sheet tab to an existing spreadsheet |
| delete_sheet | Permanently delete a sheet tab and all its data |
| rename_sheet | Rename a sheet tab |
| copy_sheet | Copy a sheet tab to another (or the same) spreadsheet |
| format_range | Apply bold text or background color to a cell range |
| auto_resize_columns | Auto-resize columns to fit their content |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| GOOGLE_SHEETS_ACCESS_TOKEN | Yes | OAuth 2.0 access token with `spreadsheets` scope | [Google Cloud Console](https://console.cloud.google.com) → APIs → Sheets API → OAuth 2.0 credentials |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Google Sheets"** and click **Add to Workspace**
3. Add your `GOOGLE_SHEETS_ACCESS_TOKEN` under **Project → Secrets**

Once added, every AI agent in your workspace can read and write Google Sheets automatically — no per-user setup needed.

### Example Prompts

```
"Append a new row to the Sales Pipeline sheet with today's date, Acme Corp, and $50,000 deal value"
"Search the Customers sheet for any row containing 'enterprise' and return the results"
"Create a new spreadsheet called 'Q1 Report' with tabs for Revenue, Expenses, and Summary"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-google-sheets \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GOOGLE-SHEETS-ACCESS-TOKEN: your-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_range","arguments":{"spreadsheet_id":"1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms","range":"Sheet1!A1:D10"}}}'
```

## License

MIT
