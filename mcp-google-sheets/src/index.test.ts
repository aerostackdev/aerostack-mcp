import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const TOKEN = 'ya29.mock_google_oauth_token_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockSpreadsheet = {
    spreadsheetId: 'abc123spreadsheetid',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/abc123spreadsheetid/edit',
    properties: { title: 'My Test Sheet', locale: 'en_US', timeZone: 'America/New_York' },
    sheets: [
        {
            properties: {
                sheetId: 0,
                title: 'Sheet1',
                index: 0,
                sheetType: 'GRID',
                gridProperties: { rowCount: 1000, columnCount: 26 },
            },
        },
        {
            properties: {
                sheetId: 1,
                title: 'Data',
                index: 1,
                sheetType: 'GRID',
                gridProperties: { rowCount: 500, columnCount: 10 },
            },
        },
    ],
    namedRanges: [],
};

const mockReadRange = {
    range: 'Sheet1!A1:B2',
    majorDimension: 'ROWS',
    values: [['Name', 'Age'], ['Alice', '30']],
};

const mockWriteRange = {
    spreadsheetId: 'abc',
    updatedRange: 'Sheet1!A1',
    updatedRows: 1,
    updatedColumns: 2,
    updatedCells: 2,
};

const mockAppendRows = {
    spreadsheetId: 'abc',
    tableRange: 'Sheet1!A1:B1',
    updates: { updatedRange: 'Sheet1!A3:B3', updatedRows: 1, updatedColumns: 2, updatedCells: 2 },
};

const mockClearRange = {
    spreadsheetId: 'abc',
    clearedRange: 'Sheet1!A1:B2',
};

const mockBatchUpdate = {
    spreadsheetId: 'abc',
    replies: [{}],
};

const mockBatchUpdateValues = {
    spreadsheetId: 'abc',
    totalUpdatedRows: 2,
    totalUpdatedColumns: 3,
    totalUpdatedCells: 6,
    responses: [
        { updatedRange: 'Sheet1!A1:C2', updatedRows: 2 },
    ],
};

const mockCopySheet = {
    sheetId: 999,
    title: 'Copy of Sheet1',
    index: 2,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function sheetsOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function sheetsErr(message: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ error: { message, status } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, missingToken = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingToken) headers['X-Mcp-Secret-GOOGLE-SHEETS-ACCESS-TOKEN'] = TOKEN;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(toolName: string, args: Record<string, unknown> = {}, missingToken = false) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingToken);
}

async function callTool(toolName: string, args: Record<string, unknown> = {}, missingToken = false) {
    const req = makeToolReq(toolName, args, missingToken);
    const res = await worker.fetch(req);
    return res.json() as Promise<{
        jsonrpc: string;
        id: number;
        result?: { content: [{ type: string; text: string }] };
        error?: { code: number; message: string };
    }>;
}

async function getToolResult(toolName: string, args: Record<string, unknown> = {}) {
    const body = await callTool(toolName, args);
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    return JSON.parse(body.result!.content[0].text);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-google-sheets and tools 18', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-google-sheets');
        expect(body.tools).toBe(18);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json{{{',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-google-sheets');
    });

    it('tools/list returns exactly 18 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(18);
        for (const tool of body.result.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
        }
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq('unknown/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('notifications/initialized returns empty result', async () => {
        const req = makeReq('notifications/initialized');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: unknown };
        expect(body.result).toBeDefined();
    });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing token returns -32001 with helpful message', async () => {
        const body = await callTool('get_spreadsheet', { spreadsheet_id: 'abc' }, true);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('GOOGLE_SHEETS_ACCESS_TOKEN');
    });

    it('Google Sheets 401 maps to Authentication failed message', async () => {
        mockFetch.mockReturnValueOnce(sheetsErr('Invalid Credentials', 401));
        const body = await callTool('get_spreadsheet', { spreadsheet_id: 'abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Authentication failed');
    });

    it('Google Sheets 403 maps to Permission denied message', async () => {
        mockFetch.mockReturnValueOnce(sheetsErr('The caller does not have permission', 403));
        const body = await callTool('get_spreadsheet', { spreadsheet_id: 'abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Permission denied');
    });

    it('fetch call includes Bearer token Authorization header', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockSpreadsheet));
        await callTool('get_spreadsheet', { spreadsheet_id: 'abc' });
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
    });
});

// ── Spreadsheet Management ────────────────────────────────────────────────────

describe('get_spreadsheet', () => {
    it('returns shaped metadata with sheets array', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockSpreadsheet));
        const result = await getToolResult('get_spreadsheet', { spreadsheet_id: 'abc123' });
        expect(result.spreadsheet_id).toBe('abc123spreadsheetid');
        expect(result.title).toBe('My Test Sheet');
        expect(result.locale).toBe('en_US');
        expect(Array.isArray(result.sheets)).toBe(true);
        expect(result.sheets).toHaveLength(2);
        expect(result.sheets[0].id).toBe(0);
        expect(result.sheets[0].title).toBe('Sheet1');
    });

    it('includes includeGridData=false in request URL', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockSpreadsheet));
        await callTool('get_spreadsheet', { spreadsheet_id: 'mySheet' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('includeGridData=false');
        expect(url).toContain('mySheet');
    });

    it('missing spreadsheet_id returns validation error', async () => {
        const body = await callTool('get_spreadsheet', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('spreadsheet_id');
    });
});

describe('create_spreadsheet', () => {
    it('returns spreadsheet_id, title, and url', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({
            spreadsheetId: 'newSheet123',
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/newSheet123/edit',
            properties: { title: 'My New Sheet' },
            sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }],
        }));
        const result = await getToolResult('create_spreadsheet', { title: 'My New Sheet' });
        expect(result.spreadsheet_id).toBe('newSheet123');
        expect(result.title).toBe('My New Sheet');
        expect(result.url).toContain('newSheet123');
    });

    it('with sheet_titles sends sheets array in request body', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({
            spreadsheetId: 'newSheet456',
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/newSheet456/edit',
            properties: { title: 'Multi Sheet' },
            sheets: [
                { properties: { sheetId: 0, title: 'Data' } },
                { properties: { sheetId: 1, title: 'Summary' } },
            ],
        }));
        const result = await getToolResult('create_spreadsheet', {
            title: 'Multi Sheet',
            sheet_titles: ['Data', 'Summary'],
        });
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { sheets: Array<{ properties: { title: string } }> };
        expect(reqBody.sheets).toHaveLength(2);
        expect(reqBody.sheets[0].properties.title).toBe('Data');
        expect(result.sheets).toHaveLength(2);
    });

    it('missing title returns validation error', async () => {
        const body = await callTool('create_spreadsheet', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('title');
    });
});

describe('list_sheets', () => {
    it('returns sheets array with id, title, index', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockSpreadsheet));
        const result = await getToolResult('list_sheets', { spreadsheet_id: 'abc' });
        expect(result.sheets).toHaveLength(2);
        expect(result.sheets[0].id).toBe(0);
        expect(result.sheets[0].title).toBe('Sheet1');
        expect(result.sheets[0].index).toBe(0);
        expect(result.sheets[1].title).toBe('Data');
    });

    it('missing spreadsheet_id returns validation error', async () => {
        const body = await callTool('list_sheets', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('spreadsheet_id');
    });
});

// ── Reading Data ──────────────────────────────────────────────────────────────

describe('read_range', () => {
    it('returns range, values, and row_count', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockReadRange));
        const result = await getToolResult('read_range', {
            spreadsheet_id: 'abc',
            range: 'Sheet1!A1:B2',
        });
        expect(result.range).toBe('Sheet1!A1:B2');
        expect(result.values).toEqual([['Name', 'Age'], ['Alice', '30']]);
        expect(result.row_count).toBe(2);
    });

    it('URL-encodes the range in the fetch URL', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockReadRange));
        await callTool('read_range', { spreadsheet_id: 'abc', range: 'Sheet1!A1:B2' });
        const url = mockFetch.mock.calls[0][0] as string;
        // encodeURIComponent encodes ':' as %3A but not '!' (unreserved character)
        expect(url).toContain('Sheet1!A1%3AB2');
    });

    it('missing spreadsheet_id returns validation error', async () => {
        const body = await callTool('read_range', { range: 'A1:B2' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('spreadsheet_id');
    });

    it('missing range returns validation error', async () => {
        const body = await callTool('read_range', { spreadsheet_id: 'abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('range');
    });
});

describe('read_multiple_ranges', () => {
    it('returns value_ranges array with ranges and values', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({
            spreadsheetId: 'abc',
            valueRanges: [
                { range: 'Sheet1!A1:B2', majorDimension: 'ROWS', values: [['Name', 'Age'], ['Alice', '30']] },
                { range: 'Sheet2!A1:C1', majorDimension: 'ROWS', values: [['X', 'Y', 'Z']] },
            ],
        }));
        const result = await getToolResult('read_multiple_ranges', {
            spreadsheet_id: 'abc',
            ranges: ['Sheet1!A1:B2', 'Sheet2!A1:C1'],
        });
        expect(result.spreadsheet_id).toBe('abc');
        expect(result.value_ranges).toHaveLength(2);
        expect(result.value_ranges[0].row_count).toBe(2);
        expect(result.value_ranges[1].values[0]).toEqual(['X', 'Y', 'Z']);
    });

    it('missing ranges returns validation error', async () => {
        const body = await callTool('read_multiple_ranges', { spreadsheet_id: 'abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('ranges');
    });
});

describe('get_all_values', () => {
    it('returns values, row_count, and col_count', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({
            range: 'Sheet1',
            majorDimension: 'ROWS',
            values: [['A', 'B', 'C'], ['1', '2', '3'], ['4', '5', '6']],
        }));
        const result = await getToolResult('get_all_values', {
            spreadsheet_id: 'abc',
            sheet_name: 'Sheet1',
        });
        expect(result.values).toHaveLength(3);
        expect(result.row_count).toBe(3);
        expect(result.col_count).toBe(3);
    });

    it('missing sheet_name returns validation error', async () => {
        const body = await callTool('get_all_values', { spreadsheet_id: 'abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('sheet_name');
    });
});

describe('find_row', () => {
    it('returns matching rows and total count', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({
            range: 'Sheet1!A:Z',
            majorDimension: 'ROWS',
            values: [
                ['Name', 'Email', 'Status'],
                ['Alice', 'alice@example.com', 'active'],
                ['Bob', 'bob@example.com', 'inactive'],
                ['Alice Smith', 'asmith@example.com', 'active'],
            ],
        }));
        const result = await getToolResult('find_row', {
            spreadsheet_id: 'abc',
            range: 'Sheet1!A:Z',
            search_term: 'alice',
        });
        expect(result.total).toBe(2);
        expect(result.matches).toHaveLength(2);
        expect(result.matches[0][0]).toBe('Alice');
    });

    it('case-insensitive match', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({
            values: [['HELLO'], ['world'], ['Hello World']],
        }));
        const result = await getToolResult('find_row', {
            spreadsheet_id: 'abc',
            range: 'Sheet1!A:A',
            search_term: 'hello',
        });
        expect(result.total).toBe(2);
    });

    it('no matches returns empty array', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({
            values: [['Apple'], ['Banana'], ['Cherry']],
        }));
        const result = await getToolResult('find_row', {
            spreadsheet_id: 'abc',
            range: 'Sheet1!A:A',
            search_term: 'mango',
        });
        expect(result.total).toBe(0);
        expect(result.matches).toHaveLength(0);
    });

    it('missing search_term returns validation error', async () => {
        const body = await callTool('find_row', { spreadsheet_id: 'abc', range: 'A:Z' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('search_term');
    });
});

// ── Writing Data ──────────────────────────────────────────────────────────────

describe('write_range', () => {
    it('returns updated range and counts', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockWriteRange));
        const result = await getToolResult('write_range', {
            spreadsheet_id: 'abc',
            range: 'Sheet1!A1',
            values: [['Name', 'Age'], ['Alice', '30']],
        });
        expect(result.spreadsheet_id).toBe('abc');
        expect(result.updated_range).toBe('Sheet1!A1');
        expect(result.updated_rows).toBe(1);
    });

    it('uses PUT method and USER_ENTERED valueInputOption', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockWriteRange));
        await callTool('write_range', {
            spreadsheet_id: 'abc',
            range: 'Sheet1!A1',
            values: [['test']],
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('PUT');
        expect((call[0] as string)).toContain('valueInputOption=USER_ENTERED');
    });

    it('missing values returns validation error', async () => {
        const body = await callTool('write_range', { spreadsheet_id: 'abc', range: 'A1' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('values');
    });
});

describe('append_rows', () => {
    it('returns table_range and updated_rows', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockAppendRows));
        const result = await getToolResult('append_rows', {
            spreadsheet_id: 'abc',
            range: 'Sheet1!A:A',
            values: [['New Row', '42']],
        });
        expect(result.spreadsheet_id).toBe('abc');
        expect(result.table_range).toBe('Sheet1!A1:B1');
        expect(result.updated_rows).toBe(1);
    });

    it('uses POST method with INSERT_ROWS insertDataOption', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockAppendRows));
        await callTool('append_rows', {
            spreadsheet_id: 'abc',
            range: 'Sheet1!A:A',
            values: [['test']],
        });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect((call[0] as string)).toContain('INSERT_ROWS');
    });

    it('missing values returns validation error', async () => {
        const body = await callTool('append_rows', { spreadsheet_id: 'abc', range: 'A:A' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('values');
    });
});

describe('clear_range', () => {
    it('returns spreadsheet_id and cleared_range', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockClearRange));
        const result = await getToolResult('clear_range', {
            spreadsheet_id: 'abc',
            range: 'Sheet1!A1:B2',
        });
        expect(result.spreadsheet_id).toBe('abc');
        expect(result.cleared_range).toBe('Sheet1!A1:B2');
    });

    it('uses POST method to :clear endpoint', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockClearRange));
        await callTool('clear_range', { spreadsheet_id: 'abc', range: 'Sheet1!A1:B2' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
        expect((call[0] as string)).toContain(':clear');
    });

    it('missing range returns validation error', async () => {
        const body = await callTool('clear_range', { spreadsheet_id: 'abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('range');
    });
});

describe('update_cell', () => {
    it('returns updated_range and updated_cells', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({
            spreadsheetId: 'abc',
            updatedRange: 'Sheet1!B3',
            updatedRows: 1,
            updatedCells: 1,
        }));
        const result = await getToolResult('update_cell', {
            spreadsheet_id: 'abc',
            cell: 'Sheet1!B3',
            value: 'Hello World',
        });
        expect(result.updated_range).toBe('Sheet1!B3');
        expect(result.updated_cells).toBe(1);
    });

    it('wraps value in 2D array [[value]] in request body', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({
            spreadsheetId: 'abc',
            updatedRange: 'A1',
            updatedRows: 1,
            updatedCells: 1,
        }));
        await callTool('update_cell', {
            spreadsheet_id: 'abc',
            cell: 'A1',
            value: '42',
        });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { values: string[][] };
        expect(body.values).toEqual([['42']]);
    });

    it('missing value returns validation error', async () => {
        const body = await callTool('update_cell', { spreadsheet_id: 'abc', cell: 'A1' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('value');
    });
});

describe('batch_update_values', () => {
    it('returns total updated counts and responses array', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockBatchUpdateValues));
        const result = await getToolResult('batch_update_values', {
            spreadsheet_id: 'abc',
            data: [
                { range: 'Sheet1!A1:C2', values: [['a', 'b', 'c'], ['d', 'e', 'f']] },
            ],
        });
        expect(result.spreadsheet_id).toBe('abc');
        expect(result.total_updated_rows).toBe(2);
        expect(result.total_updated_cells).toBe(6);
        expect(result.responses).toHaveLength(1);
    });

    it('sends valueInputOption USER_ENTERED in request body', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockBatchUpdateValues));
        await callTool('batch_update_values', {
            spreadsheet_id: 'abc',
            data: [{ range: 'A1', values: [['x']] }],
        });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { valueInputOption: string };
        expect(body.valueInputOption).toBe('USER_ENTERED');
    });

    it('missing data returns validation error', async () => {
        const body = await callTool('batch_update_values', { spreadsheet_id: 'abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('data');
    });
});

// ── Sheet Operations ──────────────────────────────────────────────────────────

describe('add_sheet', () => {
    it('returns new sheet_id, title, and index', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({
            spreadsheetId: 'abc',
            replies: [{ addSheet: { properties: { sheetId: 5, title: 'New Sheet', index: 2 } } }],
        }));
        const result = await getToolResult('add_sheet', {
            spreadsheet_id: 'abc',
            title: 'New Sheet',
        });
        expect(result.sheet_id).toBe(5);
        expect(result.title).toBe('New Sheet');
        expect(result.index).toBe(2);
    });

    it('sends addSheet request in batchUpdate body', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockBatchUpdate));
        await callTool('add_sheet', { spreadsheet_id: 'abc', title: 'Test' });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { requests: Array<{ addSheet: unknown }> };
        expect(body.requests[0].addSheet).toBeDefined();
    });

    it('missing title returns validation error', async () => {
        const body = await callTool('add_sheet', { spreadsheet_id: 'abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('title');
    });
});

describe('delete_sheet', () => {
    it('returns success true with deleted_sheet_id', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({ spreadsheetId: 'abc', replies: [{}] }));
        const result = await getToolResult('delete_sheet', {
            spreadsheet_id: 'abc',
            sheet_id: 3,
        });
        expect(result.success).toBe(true);
        expect(result.deleted_sheet_id).toBe(3);
    });

    it('sends deleteSheet request in batchUpdate body', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockBatchUpdate));
        await callTool('delete_sheet', { spreadsheet_id: 'abc', sheet_id: 3 });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { requests: Array<{ deleteSheet: { sheetId: number } }> };
        expect(body.requests[0].deleteSheet.sheetId).toBe(3);
    });

    it('missing sheet_id returns validation error', async () => {
        const body = await callTool('delete_sheet', { spreadsheet_id: 'abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('sheet_id');
    });
});

describe('rename_sheet', () => {
    it('returns success true with new_title', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({ spreadsheetId: 'abc', replies: [{}] }));
        const result = await getToolResult('rename_sheet', {
            spreadsheet_id: 'abc',
            sheet_id: 0,
            new_title: 'Renamed Sheet',
        });
        expect(result.success).toBe(true);
        expect(result.new_title).toBe('Renamed Sheet');
    });

    it('sends updateSheetProperties with fields=title', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockBatchUpdate));
        await callTool('rename_sheet', { spreadsheet_id: 'abc', sheet_id: 0, new_title: 'New Name' });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
            requests: Array<{ updateSheetProperties: { fields: string; properties: { title: string } } }>;
        };
        expect(body.requests[0].updateSheetProperties.fields).toBe('title');
        expect(body.requests[0].updateSheetProperties.properties.title).toBe('New Name');
    });

    it('missing new_title returns validation error', async () => {
        const body = await callTool('rename_sheet', { spreadsheet_id: 'abc', sheet_id: 0 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('new_title');
    });
});

describe('copy_sheet', () => {
    it('returns new_sheet_id, title, and destination_spreadsheet_id', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockCopySheet));
        const result = await getToolResult('copy_sheet', {
            spreadsheet_id: 'abc',
            sheet_id: 0,
            destination_spreadsheet_id: 'dest123',
        });
        expect(result.new_sheet_id).toBe(999);
        expect(result.title).toBe('Copy of Sheet1');
        expect(result.destination_spreadsheet_id).toBe('dest123');
    });

    it('sends destinationSpreadsheetId in copyTo request body', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockCopySheet));
        await callTool('copy_sheet', {
            spreadsheet_id: 'abc',
            sheet_id: 0,
            destination_spreadsheet_id: 'dest456',
        });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { destinationSpreadsheetId: string };
        expect(body.destinationSpreadsheetId).toBe('dest456');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(':copyTo');
    });

    it('missing destination_spreadsheet_id returns validation error', async () => {
        const body = await callTool('copy_sheet', { spreadsheet_id: 'abc', sheet_id: 0 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('destination_spreadsheet_id');
    });
});

// ── Formatting ────────────────────────────────────────────────────────────────

describe('format_range', () => {
    it('returns success true and sheet_id', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({ spreadsheetId: 'abc', replies: [{}] }));
        const result = await getToolResult('format_range', {
            spreadsheet_id: 'abc',
            sheet_id: 0,
            start_row: 0,
            end_row: 1,
            bold: true,
        });
        expect(result.success).toBe(true);
        expect(result.sheet_id).toBe(0);
    });

    it('sends repeatCell request with bold=true', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockBatchUpdate));
        await callTool('format_range', {
            spreadsheet_id: 'abc',
            sheet_id: 0,
            bold: true,
            end_row: 1,
            end_col: 4,
        });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
            requests: Array<{ repeatCell: { cell: { userEnteredFormat: { textFormat: { bold: boolean } } } } }>;
        };
        expect(body.requests[0].repeatCell.cell.userEnteredFormat.textFormat.bold).toBe(true);
    });

    it('with background_color sends backgroundColor in cell format', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockBatchUpdate));
        await callTool('format_range', {
            spreadsheet_id: 'abc',
            sheet_id: 0,
            background_color: true,
            red: 1,
            green: 0,
            blue: 0,
        });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
            requests: Array<{
                repeatCell: {
                    cell: { userEnteredFormat: { backgroundColor: { red: number; green: number; blue: number } } };
                };
            }>;
        };
        expect(body.requests[0].repeatCell.cell.userEnteredFormat.backgroundColor).toBeDefined();
        expect(body.requests[0].repeatCell.cell.userEnteredFormat.backgroundColor.red).toBe(1);
    });

    it('missing sheet_id returns validation error', async () => {
        const body = await callTool('format_range', { spreadsheet_id: 'abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('sheet_id');
    });
});

describe('auto_resize_columns', () => {
    it('returns success true and sheet_id', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk({ spreadsheetId: 'abc', replies: [{}] }));
        const result = await getToolResult('auto_resize_columns', {
            spreadsheet_id: 'abc',
            sheet_id: 0,
        });
        expect(result.success).toBe(true);
        expect(result.sheet_id).toBe(0);
        expect(result.resized).toBe(true);
    });

    it('sends autoResizeDimensions COLUMNS request', async () => {
        mockFetch.mockReturnValueOnce(sheetsOk(mockBatchUpdate));
        await callTool('auto_resize_columns', {
            spreadsheet_id: 'abc',
            sheet_id: 0,
            start_col: 0,
            end_col: 5,
        });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
            requests: Array<{ autoResizeDimensions: { dimensions: { dimension: string; endIndex: number } } }>;
        };
        expect(body.requests[0].autoResizeDimensions.dimensions.dimension).toBe('COLUMNS');
        expect(body.requests[0].autoResizeDimensions.dimensions.endIndex).toBe(5);
    });

    it('missing sheet_id returns validation error', async () => {
        const body = await callTool('auto_resize_columns', { spreadsheet_id: 'abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('sheet_id');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('Google Sheets 404 maps to Not found message', async () => {
        mockFetch.mockReturnValueOnce(sheetsErr('Requested entity was not found.', 404));
        const body = await callTool('get_spreadsheet', { spreadsheet_id: 'nonexistent' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Not found');
    });

    it('Google Sheets 429 maps to rate limited message', async () => {
        mockFetch.mockReturnValueOnce(sheetsErr('Quota exceeded', 429));
        const body = await callTool('get_spreadsheet', { spreadsheet_id: 'abc' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Rate limited');
    });

    it('unknown tool returns error', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Unknown tool');
    });
});

// ── E2E tests (skipped — require real credentials) ────────────────────────────

describe.skip('E2E — requires real GOOGLE_SHEETS_ACCESS_TOKEN', () => {
    const REAL_TOKEN = process.env['GOOGLE_SHEETS_ACCESS_TOKEN'] || '';
    const REAL_SPREADSHEET_ID = process.env['TEST_SPREADSHEET_ID'] || '';

    it('E2E: get_spreadsheet returns real metadata', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-GOOGLE-SHEETS-ACCESS-TOKEN': REAL_TOKEN,
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'get_spreadsheet', arguments: { spreadsheet_id: REAL_SPREADSHEET_ID } },
            }),
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] }; error?: unknown };
        expect(body.error).toBeUndefined();
        const data = JSON.parse(body.result!.content[0].text);
        expect(data.spreadsheet_id).toBeTruthy();
        expect(data.title).toBeTruthy();
    });

    it('E2E: read_range returns real values', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-GOOGLE-SHEETS-ACCESS-TOKEN': REAL_TOKEN,
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'read_range',
                    arguments: { spreadsheet_id: REAL_SPREADSHEET_ID, range: 'Sheet1!A1:B5' },
                },
            }),
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] }; error?: unknown };
        expect(body.error).toBeUndefined();
    });

    it('E2E: list_sheets returns real sheet tabs', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-GOOGLE-SHEETS-ACCESS-TOKEN': REAL_TOKEN,
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'list_sheets',
                    arguments: { spreadsheet_id: REAL_SPREADSHEET_ID },
                },
            }),
        });
        const res = await worker.fetch(req);
        const body = await res.json() as { result?: { content: [{ text: string }] }; error?: unknown };
        expect(body.error).toBeUndefined();
        const data = JSON.parse(body.result!.content[0].text);
        expect(Array.isArray(data.sheets)).toBe(true);
    });
});
