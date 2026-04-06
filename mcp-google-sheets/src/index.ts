/**
 * Google Sheets MCP Worker
 * Implements MCP protocol over HTTP for Google Sheets API v4 operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   GOOGLE_SHEETS_ACCESS_TOKEN → X-Mcp-Secret-GOOGLE-SHEETS-ACCESS-TOKEN
 *   (OAuth 2.0 access token with spreadsheets scope)
 *
 * Covers:
 *   Spreadsheet Management (3): get_spreadsheet, create_spreadsheet, list_sheets
 *   Reading Data (4): read_range, read_multiple_ranges, get_all_values, find_row
 *   Writing Data (5): write_range, append_rows, clear_range, update_cell, batch_update_values
 *   Sheet Operations (4): add_sheet, delete_sheet, rename_sheet, copy_sheet
 *   Formatting (2): format_range, auto_resize_columns
 *   = 18 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4';

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpcOk(id: number | string, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: number | string | null, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

function getToken(request: Request): string | null {
    return request.headers.get('X-Mcp-Secret-GOOGLE-SHEETS-ACCESS-TOKEN');
}

async function sheetsFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${SHEETS_API_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw { code: -32603, message: `Google Sheets HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        const errData = data as { error?: { message?: string; status?: string } };
        const msg = errData.error?.message || res.statusText;

        switch (res.status) {
            case 400:
                throw new Error(`Bad request — ${msg}`);
            case 401:
                throw new Error(
                    'Authentication failed — verify GOOGLE_SHEETS_ACCESS_TOKEN is a valid OAuth 2.0 access token with spreadsheets scope',
                );
            case 403:
                throw new Error(
                    `Permission denied — the access token does not have permission to access this spreadsheet. ${msg}`,
                );
            case 404:
                throw new Error(
                    `Not found — check that the spreadsheetId or range is correct. ${msg}`,
                );
            case 429:
                throw new Error(
                    'Rate limited — Google Sheets API quota exceeded. Try again later.',
                );
            default:
                throw new Error(`Google Sheets API error ${res.status}: ${msg}`);
        }
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Google Sheets credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    // ── Group 1 — Spreadsheet Management (3 tools) ───────────────────────────

    {
        name: 'get_spreadsheet',
        description: 'Get metadata for a spreadsheet — title, locale, sheet names, sheet IDs, grid properties, and named ranges. Does not return cell data.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID (from the URL: /spreadsheets/d/{spreadsheetId}/)',
                },
            },
            required: ['spreadsheet_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_spreadsheet',
        description: 'Create a new Google Sheets spreadsheet with a title and optional initial sheets. Returns the spreadsheetId and URL.',
        inputSchema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Title of the new spreadsheet',
                },
                sheet_titles: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional array of initial sheet tab titles (e.g. ["Sheet1", "Data", "Summary"]). Defaults to single "Sheet1" if omitted.',
                },
            },
            required: ['title'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_sheets',
        description: 'List all sheet tabs in a spreadsheet — returns sheet ID, title, and tab index for each sheet.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
            },
            required: ['spreadsheet_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Reading Data (4 tools) ─────────────────────────────────────

    {
        name: 'read_range',
        description: 'Read cell values from a specific range. Range can be a full A1 notation like "Sheet1!A1:D10" or just column span like "A:D" (reads all rows).',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                range: {
                    type: 'string',
                    description: 'A1 notation range (e.g. "Sheet1!A1:D10", "A:D", "Sheet1!A:Z")',
                },
            },
            required: ['spreadsheet_id', 'range'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'read_multiple_ranges',
        description: 'Read multiple ranges in a single API call (batch read). More efficient than calling read_range multiple times.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                ranges: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of A1 notation ranges to read (e.g. ["Sheet1!A1:D5", "Sheet2!B2:C10"])',
                },
            },
            required: ['spreadsheet_id', 'ranges'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_all_values',
        description: 'Read all cell values from an entire sheet tab. Returns every row and column in the sheet.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                sheet_name: {
                    type: 'string',
                    description: 'Name of the sheet tab to read entirely (e.g. "Sheet1", "Data")',
                },
            },
            required: ['spreadsheet_id', 'sheet_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'find_row',
        description: 'Search for rows where any cell contains the given search term (case-insensitive substring match). Reads the range then filters rows in code.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                range: {
                    type: 'string',
                    description: 'A1 notation range to search within (e.g. "Sheet1!A:Z", "Sheet1!A1:E100")',
                },
                search_term: {
                    type: 'string',
                    description: 'Text to search for (case-insensitive substring match against any cell value)',
                },
            },
            required: ['spreadsheet_id', 'range', 'search_term'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Writing Data (5 tools) ─────────────────────────────────────

    {
        name: 'write_range',
        description: 'Write values to a range (overwrites existing cell values). Uses USER_ENTERED mode so formulas and dates are parsed correctly.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                range: {
                    type: 'string',
                    description: 'A1 notation range to write to (e.g. "Sheet1!A1:C3")',
                },
                values: {
                    type: 'array',
                    items: { type: 'array', items: { type: 'string' } },
                    description: '2D array of values (rows × columns). E.g. [["Name","Age"],["Alice","30"],["Bob","25"]]',
                },
            },
            required: ['spreadsheet_id', 'range', 'values'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'append_rows',
        description: 'Append rows after the last row with data in a range. Inserts new rows so existing data is never overwritten.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                range: {
                    type: 'string',
                    description: 'A1 notation range to append after (e.g. "Sheet1!A:A" to append after column A data)',
                },
                values: {
                    type: 'array',
                    items: { type: 'array', items: { type: 'string' } },
                    description: '2D array of rows to append. E.g. [["Alice","30","alice@example.com"]]',
                },
            },
            required: ['spreadsheet_id', 'range', 'values'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'clear_range',
        description: 'Clear all values from a range (cells become empty). Does not delete the cells or affect formatting.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                range: {
                    type: 'string',
                    description: 'A1 notation range to clear (e.g. "Sheet1!A1:D100")',
                },
            },
            required: ['spreadsheet_id', 'range'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'update_cell',
        description: 'Update a single cell value. Simpler than write_range when only one cell needs to be updated.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                cell: {
                    type: 'string',
                    description: 'A1 notation for a single cell (e.g. "Sheet1!B3", "A1")',
                },
                value: {
                    type: 'string',
                    description: 'New value to set. Can be a string, number, or formula (e.g. "=SUM(A1:A10)")',
                },
            },
            required: ['spreadsheet_id', 'cell', 'value'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'batch_update_values',
        description: 'Update multiple ranges in a single API call. More efficient than calling write_range multiple times.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                data: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            range: { type: 'string', description: 'A1 notation range' },
                            values: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: '2D array of values' },
                        },
                        required: ['range', 'values'],
                    },
                    description: 'Array of {range, values} objects to update in one batch',
                },
            },
            required: ['spreadsheet_id', 'data'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Sheet Operations (4 tools) ─────────────────────────────────

    {
        name: 'add_sheet',
        description: 'Add a new sheet tab to an existing spreadsheet. Returns the new sheet ID and index.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                title: {
                    type: 'string',
                    description: 'Title for the new sheet tab',
                },
            },
            required: ['spreadsheet_id', 'title'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_sheet',
        description: 'Delete a sheet tab by its numeric sheet ID. WARNING: this permanently deletes the sheet and all its data.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                sheet_id: {
                    type: 'number',
                    description: 'Numeric sheet ID to delete (use list_sheets to find sheet IDs)',
                },
            },
            required: ['spreadsheet_id', 'sheet_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'rename_sheet',
        description: 'Rename a sheet tab to a new title.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                sheet_id: {
                    type: 'number',
                    description: 'Numeric sheet ID to rename (use list_sheets to find sheet IDs)',
                },
                new_title: {
                    type: 'string',
                    description: 'New title for the sheet tab',
                },
            },
            required: ['spreadsheet_id', 'sheet_id', 'new_title'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'copy_sheet',
        description: 'Copy a sheet tab to another (or the same) spreadsheet. Returns the new sheet ID in the destination spreadsheet.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The source spreadsheet ID containing the sheet to copy',
                },
                sheet_id: {
                    type: 'number',
                    description: 'Numeric sheet ID to copy (use list_sheets to find sheet IDs)',
                },
                destination_spreadsheet_id: {
                    type: 'string',
                    description: 'Destination spreadsheet ID to copy the sheet into. Can be the same as spreadsheet_id.',
                },
            },
            required: ['spreadsheet_id', 'sheet_id', 'destination_spreadsheet_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 5 — Formatting (2 tools) ───────────────────────────────────────

    {
        name: 'format_range',
        description: 'Apply formatting to a range of cells — bold text, background color. Uses repeatCell batchUpdate request.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                sheet_id: {
                    type: 'number',
                    description: 'Numeric sheet ID (use list_sheets to find sheet IDs)',
                },
                start_row: {
                    type: 'number',
                    description: 'Start row index (0-based, inclusive). Default 0.',
                },
                end_row: {
                    type: 'number',
                    description: 'End row index (0-based, exclusive). E.g. 1 to format just row 0.',
                },
                start_col: {
                    type: 'number',
                    description: 'Start column index (0-based, inclusive). Default 0.',
                },
                end_col: {
                    type: 'number',
                    description: 'End column index (0-based, exclusive). E.g. 4 for columns A-D.',
                },
                bold: {
                    type: 'boolean',
                    description: 'Whether to make text bold. Default false.',
                },
                background_color: {
                    type: 'boolean',
                    description: 'Whether to apply a background color. Default false.',
                },
                red: {
                    type: 'number',
                    description: 'Red component of background color (0.0–1.0). Used when background_color is true.',
                },
                green: {
                    type: 'number',
                    description: 'Green component of background color (0.0–1.0). Used when background_color is true.',
                },
                blue: {
                    type: 'number',
                    description: 'Blue component of background color (0.0–1.0). Used when background_color is true.',
                },
            },
            required: ['spreadsheet_id', 'sheet_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'auto_resize_columns',
        description: 'Auto-resize columns to fit their content in a sheet. Resizes a range of columns or all columns.',
        inputSchema: {
            type: 'object',
            properties: {
                spreadsheet_id: {
                    type: 'string',
                    description: 'The Google Sheets spreadsheet ID',
                },
                sheet_id: {
                    type: 'number',
                    description: 'Numeric sheet ID (use list_sheets to find sheet IDs)',
                },
                start_col: {
                    type: 'number',
                    description: 'Start column index (0-based, inclusive). Default 0.',
                },
                end_col: {
                    type: 'number',
                    description: 'End column index (0-based, exclusive). E.g. 5 for columns A-E.',
                },
            },
            required: ['spreadsheet_id', 'sheet_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {

        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
            const data = await res.json() as { email?: string };
            return { connected: true, email: data.email ?? 'unknown' };
        }

        // ── Spreadsheet Management ────────────────────────────────────────────

        case 'get_spreadsheet': {
            validateRequired(args, ['spreadsheet_id']);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}?includeGridData=false`,
                token,
            ) as {
                spreadsheetId: string;
                properties: { title: string; locale: string; timeZone: string };
                sheets: Array<{ properties: { sheetId: number; title: string; index: number; sheetType: string; gridProperties: { rowCount: number; columnCount: number } } }>;
                namedRanges?: Array<{ name: string; range: unknown }>;
                spreadsheetUrl: string;
            };
            return {
                spreadsheet_id: data.spreadsheetId,
                title: data.properties.title,
                locale: data.properties.locale,
                time_zone: data.properties.timeZone,
                url: data.spreadsheetUrl,
                sheets: (data.sheets || []).map(s => ({
                    id: s.properties.sheetId,
                    title: s.properties.title,
                    index: s.properties.index,
                    type: s.properties.sheetType,
                    rows: s.properties.gridProperties?.rowCount,
                    columns: s.properties.gridProperties?.columnCount,
                })),
                named_ranges: (data.namedRanges || []).map(nr => ({ name: nr.name, range: nr.range })),
            };
        }

        case 'create_spreadsheet': {
            validateRequired(args, ['title']);
            const sheetTitles = (args.sheet_titles as string[] | undefined) || [];
            const body: Record<string, unknown> = {
                properties: { title: args.title },
            };
            if (sheetTitles.length > 0) {
                body.sheets = sheetTitles.map(t => ({ properties: { title: t } }));
            }
            const data = await sheetsFetch('/spreadsheets', token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as {
                spreadsheetId: string;
                spreadsheetUrl: string;
                properties: { title: string };
                sheets: Array<{ properties: { sheetId: number; title: string } }>;
            };
            return {
                spreadsheet_id: data.spreadsheetId,
                title: data.properties.title,
                url: data.spreadsheetUrl,
                sheets: (data.sheets || []).map(s => ({
                    id: s.properties.sheetId,
                    title: s.properties.title,
                })),
            };
        }

        case 'list_sheets': {
            validateRequired(args, ['spreadsheet_id']);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}`,
                token,
            ) as {
                sheets: Array<{ properties: { sheetId: number; title: string; index: number } }>;
            };
            return {
                sheets: (data.sheets || []).map(s => ({
                    id: s.properties.sheetId,
                    title: s.properties.title,
                    index: s.properties.index,
                })),
            };
        }

        // ── Reading Data ──────────────────────────────────────────────────────

        case 'read_range': {
            validateRequired(args, ['spreadsheet_id', 'range']);
            const range = encodeURIComponent(args.range as string);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}/values/${range}`,
                token,
            ) as { range: string; majorDimension: string; values: string[][] };
            return {
                range: data.range,
                major_dimension: data.majorDimension,
                values: data.values || [],
                row_count: (data.values || []).length,
            };
        }

        case 'read_multiple_ranges': {
            validateRequired(args, ['spreadsheet_id', 'ranges']);
            const ranges = (args.ranges as string[]).map(r => `ranges=${encodeURIComponent(r)}`).join('&');
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}/values:batchGet?${ranges}`,
                token,
            ) as {
                spreadsheetId: string;
                valueRanges: Array<{ range: string; majorDimension: string; values: string[][] }>;
            };
            return {
                spreadsheet_id: data.spreadsheetId,
                value_ranges: (data.valueRanges || []).map(vr => ({
                    range: vr.range,
                    values: vr.values || [],
                    row_count: (vr.values || []).length,
                })),
            };
        }

        case 'get_all_values': {
            validateRequired(args, ['spreadsheet_id', 'sheet_name']);
            const range = encodeURIComponent(args.sheet_name as string);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}/values/${range}`,
                token,
            ) as { range: string; majorDimension: string; values: string[][] };
            return {
                range: data.range,
                values: data.values || [],
                row_count: (data.values || []).length,
                col_count: (data.values?.[0] || []).length,
            };
        }

        case 'find_row': {
            validateRequired(args, ['spreadsheet_id', 'range', 'search_term']);
            const range = encodeURIComponent(args.range as string);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}/values/${range}`,
                token,
            ) as { values: string[][] };
            const rows = data.values || [];
            const term = (args.search_term as string).toLowerCase();
            const matches = rows.filter((row: string[]) =>
                row.some(cell => String(cell).toLowerCase().includes(term))
            );
            return { matches, total: matches.length };
        }

        // ── Writing Data ──────────────────────────────────────────────────────

        case 'write_range': {
            validateRequired(args, ['spreadsheet_id', 'range', 'values']);
            const range = encodeURIComponent(args.range as string);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}/values/${range}?valueInputOption=USER_ENTERED`,
                token,
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        range: args.range,
                        majorDimension: 'ROWS',
                        values: args.values,
                    }),
                },
            ) as {
                spreadsheetId: string;
                updatedRange: string;
                updatedRows: number;
                updatedColumns: number;
                updatedCells: number;
            };
            return {
                spreadsheet_id: data.spreadsheetId,
                updated_range: data.updatedRange,
                updated_rows: data.updatedRows,
                updated_columns: data.updatedColumns,
                updated_cells: data.updatedCells,
            };
        }

        case 'append_rows': {
            validateRequired(args, ['spreadsheet_id', 'range', 'values']);
            const range = encodeURIComponent(args.range as string);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({ values: args.values }),
                },
            ) as {
                spreadsheetId: string;
                tableRange: string;
                updates: { updatedRange: string; updatedRows: number; updatedColumns: number; updatedCells: number };
            };
            return {
                spreadsheet_id: data.spreadsheetId,
                table_range: data.tableRange,
                updated_range: data.updates?.updatedRange,
                updated_rows: data.updates?.updatedRows,
            };
        }

        case 'clear_range': {
            validateRequired(args, ['spreadsheet_id', 'range']);
            const range = encodeURIComponent(args.range as string);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}/values/${range}:clear`,
                token,
                { method: 'POST' },
            ) as { spreadsheetId: string; clearedRange: string };
            return {
                spreadsheet_id: data.spreadsheetId,
                cleared_range: data.clearedRange,
            };
        }

        case 'update_cell': {
            validateRequired(args, ['spreadsheet_id', 'cell', 'value']);
            const cell = encodeURIComponent(args.cell as string);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}/values/${cell}?valueInputOption=USER_ENTERED`,
                token,
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        range: args.cell,
                        majorDimension: 'ROWS',
                        values: [[args.value]],
                    }),
                },
            ) as {
                spreadsheetId: string;
                updatedRange: string;
                updatedRows: number;
                updatedCells: number;
            };
            return {
                spreadsheet_id: data.spreadsheetId,
                updated_range: data.updatedRange,
                updated_cells: data.updatedCells,
            };
        }

        case 'batch_update_values': {
            validateRequired(args, ['spreadsheet_id', 'data']);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}/values:batchUpdate`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        valueInputOption: 'USER_ENTERED',
                        data: args.data,
                    }),
                },
            ) as {
                spreadsheetId: string;
                totalUpdatedRows: number;
                totalUpdatedColumns: number;
                totalUpdatedCells: number;
                responses: Array<{ updatedRange: string; updatedRows: number }>;
            };
            return {
                spreadsheet_id: data.spreadsheetId,
                total_updated_rows: data.totalUpdatedRows,
                total_updated_columns: data.totalUpdatedColumns,
                total_updated_cells: data.totalUpdatedCells,
                responses: (data.responses || []).map(r => ({
                    updated_range: r.updatedRange,
                    updated_rows: r.updatedRows,
                })),
            };
        }

        // ── Sheet Operations ──────────────────────────────────────────────────

        case 'add_sheet': {
            validateRequired(args, ['spreadsheet_id', 'title']);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}:batchUpdate`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        requests: [{ addSheet: { properties: { title: args.title } } }],
                    }),
                },
            ) as {
                spreadsheetId: string;
                replies: Array<{ addSheet: { properties: { sheetId: number; title: string; index: number } } }>;
            };
            const newSheet = data.replies?.[0]?.addSheet?.properties;
            return {
                spreadsheet_id: data.spreadsheetId,
                sheet_id: newSheet?.sheetId,
                title: newSheet?.title,
                index: newSheet?.index,
            };
        }

        case 'delete_sheet': {
            validateRequired(args, ['spreadsheet_id', 'sheet_id']);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}:batchUpdate`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        requests: [{ deleteSheet: { sheetId: args.sheet_id } }],
                    }),
                },
            ) as { spreadsheetId: string };
            return {
                success: true,
                spreadsheet_id: data.spreadsheetId,
                deleted_sheet_id: args.sheet_id,
            };
        }

        case 'rename_sheet': {
            validateRequired(args, ['spreadsheet_id', 'sheet_id', 'new_title']);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}:batchUpdate`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        requests: [{
                            updateSheetProperties: {
                                properties: {
                                    sheetId: args.sheet_id,
                                    title: args.new_title,
                                },
                                fields: 'title',
                            },
                        }],
                    }),
                },
            ) as { spreadsheetId: string };
            return {
                success: true,
                spreadsheet_id: data.spreadsheetId,
                sheet_id: args.sheet_id,
                new_title: args.new_title,
            };
        }

        case 'copy_sheet': {
            validateRequired(args, ['spreadsheet_id', 'sheet_id', 'destination_spreadsheet_id']);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}/sheets/${args.sheet_id as number}:copyTo`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        destinationSpreadsheetId: args.destination_spreadsheet_id,
                    }),
                },
            ) as { sheetId: number; title: string; index: number };
            return {
                new_sheet_id: data.sheetId,
                title: data.title,
                index: data.index,
                destination_spreadsheet_id: args.destination_spreadsheet_id,
            };
        }

        // ── Formatting ────────────────────────────────────────────────────────

        case 'format_range': {
            validateRequired(args, ['spreadsheet_id', 'sheet_id']);
            const request = {
                repeatCell: {
                    range: {
                        sheetId: args.sheet_id,
                        startRowIndex: (args.start_row as number) || 0,
                        endRowIndex: args.end_row,
                        startColumnIndex: (args.start_col as number) || 0,
                        endColumnIndex: args.end_col,
                    },
                    cell: {
                        userEnteredFormat: {
                            textFormat: { bold: (args.bold as boolean) || false },
                            backgroundColor: (args.background_color as boolean)
                                ? {
                                    red: (args.red as number) ?? 1,
                                    green: (args.green as number) ?? 1,
                                    blue: (args.blue as number) ?? 1,
                                }
                                : undefined,
                        },
                    },
                    fields: 'userEnteredFormat(textFormat,backgroundColor)',
                },
            };
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}:batchUpdate`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({ requests: [request] }),
                },
            ) as { spreadsheetId: string; replies: unknown[] };
            return {
                success: true,
                spreadsheet_id: data.spreadsheetId,
                sheet_id: args.sheet_id,
                formatted: true,
            };
        }

        case 'auto_resize_columns': {
            validateRequired(args, ['spreadsheet_id', 'sheet_id']);
            const data = await sheetsFetch(
                `/spreadsheets/${args.spreadsheet_id as string}:batchUpdate`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        requests: [{
                            autoResizeDimensions: {
                                dimensions: {
                                    sheetId: args.sheet_id,
                                    dimension: 'COLUMNS',
                                    startIndex: (args.start_col as number) || 0,
                                    endIndex: args.end_col,
                                },
                            },
                        }],
                    }),
                },
            ) as { spreadsheetId: string; replies: unknown[] };
            return {
                success: true,
                spreadsheet_id: data.spreadsheetId,
                sheet_id: args.sheet_id,
                resized: true,
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-google-sheets', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        // Parse JSON-RPC body
        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error — invalid JSON');
        }

        const { id, method, params } = body;

        // ── Protocol methods ──────────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-google-sheets', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'notifications/initialized') {
            return rpcOk(id, {});
        }

        if (method !== 'tools/call') {
            return rpcErr(id, -32601, `Method not found: ${method}`);
        }

        // ── tools/call ────────────────────────────────────────────────────────

        // Extract secret from header
        const token = getToken(request);

        if (!token) {
            return rpcErr(
                id,
                -32001,
                'Missing required secret — add GOOGLE_SHEETS_ACCESS_TOKEN to workspace secrets. This should be an OAuth 2.0 access token with the spreadsheets scope.',
            );
        }

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        try {
            const result = await callTool(toolName, args, token);
            return rpcOk(id, toolOk(result));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.startsWith('Missing required parameter:')) {
                return rpcErr(id, -32603, msg);
            }
            return rpcErr(id, -32603, msg);
        }
    },
};
