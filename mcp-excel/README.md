# mcp-excel — Excel MCP Server

> Read, write, and analyze Excel workbooks — cell operations, formulas, pivot tables, charts, and worksheet management via Microsoft Graph.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-excel`

---

## What You Can Do

This MCP server gives AI agents access to Excel via 17 tools. Connect it to any Aerostack workspace and your agents can interact with Excel directly.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_excel_files` | List Excel files (.xlsx) in OneDrive root or a specific folder |
| `get_workbook_info` | Get workbook metadata: worksheets, named ranges, tables |
| `create_workbook_session` | Create a persistent session for batch operations (keeps file open for edits) |
| `list_worksheets` | List all worksheets in a workbook with visibility and position |
| `add_worksheet` | Add a new worksheet to the workbook |
| `delete_worksheet` | Delete a worksheet from the workbook |
| `get_range` | Read cell values from a range (e.g.  |
| `update_range` | Write values to a cell range. Values is a 2D array matching range dimensions. |
| `clear_range` | Clear cell contents, formatting, or both from a range |
| `get_used_range` | Get the used range of a worksheet (smallest range containing all data) |
| `list_tables` | List all tables in a worksheet with column names and row count |
| `get_table_rows` | Get all rows from a table |
| `add_table_rows` | Append rows to an existing table |
| `list_charts` | List all charts in a worksheet |
| `get_chart_image` | Get a chart as a base64-encoded PNG image |
| `set_formula` | Set a formula in a cell (e.g.  |
| `calculate_workbook` | Recalculate all formulas in the workbook |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MICROSOFT_ACCESS_TOKEN` | Yes | Microsoft OAuth 2.0 access token (requires Files.ReadWrite scope for OneDrive/SharePoint access) |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Excel"** and click **Add to Workspace**

Add the following secrets under **Project → Secrets**:
- `MICROSOFT_ACCESS_TOKEN`

Once added, every AI agent in your workspace can use Excel tools automatically.

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-excel \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-MICROSOFT-ACCESS-TOKEN: your-microsoft-access-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_excel_files","arguments":{}}}'
```

## License

MIT
