/**
 * Microsoft Excel MCP Worker
 * Deep Excel/workbook operations via Microsoft Graph API.
 * Separate from mcp-microsoft-graph (which covers broad 365 access).
 * This MCP focuses on spreadsheet operations: cells, ranges, formulas, worksheets, tables, charts.
 *
 * Secret: MICROSOFT_ACCESS_TOKEN → X-Mcp-Secret-MICROSOFT-ACCESS-TOKEN
 * Scope: Files.ReadWrite (OneDrive/SharePoint access)
 *
 * Covers: Workbooks (3), Worksheets (3), Ranges (4), Tables (3), Charts (2), Formulas (2) = 17 tools
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';

function rpcOk(id: number | string, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { 'Content-Type': 'application/json' } });
}

function rpcErr(id: number | string | null, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function graphFetch(method: string, path: string, token: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const res = await fetch(`${GRAPH}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (!res.ok) throw new Error(`Graph API error (${res.status}): ${text.slice(0, 500)}`);
    if (!text) return { success: true };
    try { return JSON.parse(text); } catch { return { raw: text }; }
}

// Workbook paths use /me/drive/items/{id}/workbook/...
function wb(itemId: string) { return `/me/drive/items/${itemId}/workbook`; }

const TOOLS = [
    { name: '_ping', description: 'Verify Microsoft credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] }, annotations: { readOnlyHint: true, destructiveHint: false } },

    // ── Workbooks ───────────────────────────────────────────────────────────
    { name: 'list_excel_files', description: 'List Excel files (.xlsx) in OneDrive root or a specific folder',
        inputSchema: { type: 'object', properties: {
            folder_path: { type: 'string', description: 'Folder path in OneDrive (default: root). e.g. "Documents/Reports"' },
        } }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'get_workbook_info', description: 'Get workbook metadata: worksheets, named ranges, tables',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID of the Excel file' },
        }, required: ['item_id'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'create_workbook_session', description: 'Create a persistent session for batch operations (keeps file open for edits)',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            persist_changes: { type: 'boolean', description: 'Whether to persist changes (default: true)' },
        }, required: ['item_id'] }, annotations: { readOnlyHint: false, destructiveHint: false } },

    // ── Worksheets ──────────────────────────────────────────────────────────
    { name: 'list_worksheets', description: 'List all worksheets in a workbook with visibility and position',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
        }, required: ['item_id'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'add_worksheet', description: 'Add a new worksheet to the workbook',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            name: { type: 'string', description: 'Worksheet name (optional — auto-generated if omitted)' },
        }, required: ['item_id'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'delete_worksheet', description: 'Delete a worksheet from the workbook',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            sheet_name: { type: 'string', description: 'Worksheet name or ID to delete' },
        }, required: ['item_id', 'sheet_name'] }, annotations: { readOnlyHint: false, destructiveHint: true } },

    // ── Ranges (read/write cells) ───────────────────────────────────────────
    { name: 'get_range', description: 'Read cell values from a range (e.g. "A1:D10" or "Sheet1!B2:F20")',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            sheet_name: { type: 'string', description: 'Worksheet name' },
            range: { type: 'string', description: 'Cell range (e.g. "A1:D10")' },
        }, required: ['item_id', 'sheet_name', 'range'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'update_range', description: 'Write values to a cell range. Values is a 2D array matching range dimensions.',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            sheet_name: { type: 'string', description: 'Worksheet name' },
            range: { type: 'string', description: 'Cell range (e.g. "A1:C3")' },
            values: { type: 'array', items: { type: 'array' }, description: '2D array of values, e.g. [["Name","Age"],["Alice",30]]' },
        }, required: ['item_id', 'sheet_name', 'range', 'values'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'clear_range', description: 'Clear cell contents, formatting, or both from a range',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            sheet_name: { type: 'string', description: 'Worksheet name' },
            range: { type: 'string', description: 'Cell range to clear' },
            apply_to: { type: 'string', enum: ['all', 'contents', 'formats'], description: 'What to clear (default: all)' },
        }, required: ['item_id', 'sheet_name', 'range'] }, annotations: { readOnlyHint: false, destructiveHint: true } },
    { name: 'get_used_range', description: 'Get the used range of a worksheet (smallest range containing all data)',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            sheet_name: { type: 'string', description: 'Worksheet name' },
        }, required: ['item_id', 'sheet_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },

    // ── Tables ──────────────────────────────────────────────────────────────
    { name: 'list_tables', description: 'List all tables in a worksheet with column names and row count',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            sheet_name: { type: 'string', description: 'Worksheet name (optional — lists all tables in workbook)' },
        }, required: ['item_id'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'get_table_rows', description: 'Get all rows from a table',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            table_name: { type: 'string', description: 'Table name or ID' },
            top: { type: 'number', description: 'Max rows to return (default 100)' },
        }, required: ['item_id', 'table_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'add_table_rows', description: 'Append rows to an existing table',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            table_name: { type: 'string', description: 'Table name or ID' },
            values: { type: 'array', items: { type: 'array' }, description: '2D array of row values to append' },
        }, required: ['item_id', 'table_name', 'values'] }, annotations: { readOnlyHint: false, destructiveHint: false } },

    // ── Charts ──────────────────────────────────────────────────────────────
    { name: 'list_charts', description: 'List all charts in a worksheet',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            sheet_name: { type: 'string', description: 'Worksheet name' },
        }, required: ['item_id', 'sheet_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'get_chart_image', description: 'Get a chart as a base64-encoded PNG image',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            sheet_name: { type: 'string', description: 'Worksheet name' },
            chart_name: { type: 'string', description: 'Chart name' },
        }, required: ['item_id', 'sheet_name', 'chart_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },

    // ── Formulas ────────────────────────────────────────────────────────────
    { name: 'set_formula', description: 'Set a formula in a cell (e.g. "=SUM(A1:A10)")',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            sheet_name: { type: 'string', description: 'Worksheet name' },
            cell: { type: 'string', description: 'Cell address (e.g. "B5")' },
            formula: { type: 'string', description: 'Excel formula (e.g. "=SUM(A1:A10)")' },
        }, required: ['item_id', 'sheet_name', 'cell', 'formula'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'calculate_workbook', description: 'Recalculate all formulas in the workbook',
        inputSchema: { type: 'object', properties: {
            item_id: { type: 'string', description: 'OneDrive item ID' },
            calculation_type: { type: 'string', enum: ['recalculate', 'full', 'fullRebuild'], description: 'Calculation type (default: recalculate)' },
        }, required: ['item_id'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
];

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            return graphFetch('GET', '/me', token);
        }
        case 'list_excel_files': {
            const folder = args.folder_path ? `/me/drive/root:/${args.folder_path}:/children` : '/me/drive/root/children';
            const data = await graphFetch('GET', `${folder}?$filter=file/mimeType eq 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'&$select=id,name,size,lastModifiedDateTime,webUrl`, token) as any;
            return { files: data.value };
        }
        case 'get_workbook_info': {
            const [worksheets, tables, names] = await Promise.all([
                graphFetch('GET', `${wb(args.item_id as string)}/worksheets`, token),
                graphFetch('GET', `${wb(args.item_id as string)}/tables`, token),
                graphFetch('GET', `${wb(args.item_id as string)}/names`, token),
            ]);
            return { worksheets, tables, named_ranges: names };
        }
        case 'create_workbook_session':
            return graphFetch('POST', `${wb(args.item_id as string)}/createSession`, token, { persistChanges: args.persist_changes !== false });
        case 'list_worksheets':
            return graphFetch('GET', `${wb(args.item_id as string)}/worksheets`, token);
        case 'add_worksheet':
            return graphFetch('POST', `${wb(args.item_id as string)}/worksheets/add`, token, args.name ? { name: args.name } : {});
        case 'delete_worksheet':
            return graphFetch('DELETE', `${wb(args.item_id as string)}/worksheets/${encodeURIComponent(args.sheet_name as string)}`, token);
        case 'get_range':
            return graphFetch('GET', `${wb(args.item_id as string)}/worksheets/${encodeURIComponent(args.sheet_name as string)}/range(address='${args.range}')`, token);
        case 'update_range':
            return graphFetch('PATCH', `${wb(args.item_id as string)}/worksheets/${encodeURIComponent(args.sheet_name as string)}/range(address='${args.range}')`, token, { values: args.values });
        case 'clear_range':
            return graphFetch('POST', `${wb(args.item_id as string)}/worksheets/${encodeURIComponent(args.sheet_name as string)}/range(address='${args.range}')/clear`, token, { applyTo: args.apply_to || 'all' });
        case 'get_used_range':
            return graphFetch('GET', `${wb(args.item_id as string)}/worksheets/${encodeURIComponent(args.sheet_name as string)}/usedRange`, token);
        case 'list_tables': {
            const path = args.sheet_name
                ? `${wb(args.item_id as string)}/worksheets/${encodeURIComponent(args.sheet_name as string)}/tables`
                : `${wb(args.item_id as string)}/tables`;
            return graphFetch('GET', path, token);
        }
        case 'get_table_rows': {
            const top = (args.top as number) || 100;
            return graphFetch('GET', `${wb(args.item_id as string)}/tables/${encodeURIComponent(args.table_name as string)}/rows?$top=${top}`, token);
        }
        case 'add_table_rows':
            return graphFetch('POST', `${wb(args.item_id as string)}/tables/${encodeURIComponent(args.table_name as string)}/rows`, token, { values: args.values });
        case 'list_charts':
            return graphFetch('GET', `${wb(args.item_id as string)}/worksheets/${encodeURIComponent(args.sheet_name as string)}/charts`, token);
        case 'get_chart_image':
            return graphFetch('GET', `${wb(args.item_id as string)}/worksheets/${encodeURIComponent(args.sheet_name as string)}/charts/${encodeURIComponent(args.chart_name as string)}/image`, token);
        case 'set_formula':
            return graphFetch('PATCH', `${wb(args.item_id as string)}/worksheets/${encodeURIComponent(args.sheet_name as string)}/range(address='${args.cell}')`, token, { formulas: [[args.formula]] });
        case 'calculate_workbook':
            return graphFetch('POST', `${wb(args.item_id as string)}/application/calculate`, token, { calculationType: args.calculation_type || 'recalculate' });
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-excel', version: '1.0.0', tools: TOOLS.length }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
        try { body = await request.json(); } catch { return rpcErr(null, -32700, 'Parse error'); }
        const { id, method, params } = body;

        if (method === 'initialize') return rpcOk(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mcp-excel', version: '1.0.0' } });
        if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-MICROSOFT-ACCESS-TOKEN');
            if (!token) return rpcErr(id, -32001, 'Missing MICROSOFT_ACCESS_TOKEN — add your Microsoft access token to workspace secrets');
            try {
                const result = await callTool(params?.name as string, (params?.arguments ?? {}) as Record<string, unknown>, token);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            }
        }
        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
