// mcp-turso — Aerostack MCP Server
// Wraps the Turso (LibSQL) HTTP API for edge-native SQLite
// Secrets: X-Mcp-Secret-TURSO-DATABASE-URL, X-Mcp-Secret-TURSO-AUTH-TOKEN

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Turso database connectivity. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'execute',
        description: 'Execute a single SQL statement (SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, etc.)',
        inputSchema: {
            type: 'object',
            properties: {
                sql: { type: 'string', description: 'SQL statement to execute' },
                args: { type: 'array', description: 'Positional arguments for parameterized queries (use ? placeholders)', items: {} },
            },
            required: ['sql'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'batch',
        description: 'Execute multiple SQL statements in a batch/transaction',
        inputSchema: {
            type: 'object',
            properties: {
                statements: {
                    type: 'array',
                    description: 'Array of SQL statements — each is a string or { sql, args } object',
                    items: {},
                },
            },
            required: ['statements'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_tables',
        description: 'List all tables in the Turso database',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'describe_table',
        description: 'Get column info (name, type, nullable, primary key, default) for a table',
        inputSchema: {
            type: 'object',
            properties: {
                table: { type: 'string', description: 'Table name to describe' },
            },
            required: ['table'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'query',
        description: 'Shorthand SELECT query with structured parameters',
        inputSchema: {
            type: 'object',
            properties: {
                table: { type: 'string', description: 'Table name' },
                columns: { type: 'string', description: 'Columns to select (default: *)' },
                where: { type: 'string', description: 'WHERE clause without the WHERE keyword, e.g. "status = ? AND age > ?"' },
                args: { type: 'array', description: 'Positional arguments for WHERE clause placeholders', items: {} },
                order_by: { type: 'string', description: 'ORDER BY clause, e.g. "created_at DESC"' },
                limit: { type: 'number', description: 'Maximum rows to return (default: 100)' },
            },
            required: ['table'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'insert',
        description: 'Insert one or more rows into a table',
        inputSchema: {
            type: 'object',
            properties: {
                table: { type: 'string', description: 'Table name' },
                rows: { type: 'array', description: 'Array of row objects to insert', items: { type: 'object' } },
            },
            required: ['table', 'rows'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update',
        description: 'Update rows in a table matching a WHERE condition',
        inputSchema: {
            type: 'object',
            properties: {
                table: { type: 'string', description: 'Table name' },
                values: { type: 'object', description: 'Key/value pairs to set' },
                where: { type: 'string', description: 'WHERE clause without the WHERE keyword, e.g. "id = ?"' },
                args: { type: 'array', description: 'Positional arguments for WHERE clause placeholders', items: {} },
            },
            required: ['table', 'values', 'where'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_rows',
        description: 'Delete rows from a table matching a WHERE condition',
        inputSchema: {
            type: 'object',
            properties: {
                table: { type: 'string', description: 'Table name' },
                where: { type: 'string', description: 'WHERE clause without the WHERE keyword, e.g. "id = ?"' },
                args: { type: 'array', description: 'Positional arguments for WHERE clause placeholders', items: {} },
            },
            required: ['table', 'where'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'count',
        description: 'Count rows in a table with an optional WHERE condition',
        inputSchema: {
            type: 'object',
            properties: {
                table: { type: 'string', description: 'Table name' },
                where: { type: 'string', description: 'WHERE clause without the WHERE keyword' },
                args: { type: 'array', description: 'Positional arguments for WHERE clause placeholders', items: {} },
            },
            required: ['table'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

interface TursoCol {
    name: string;
    decltype?: string;
}

interface TursoResult {
    cols: TursoCol[];
    rows: unknown[][];
    affected_row_count: number;
    last_insert_rowid?: string | number | null;
}

interface TursoResponse {
    results: Array<{
        response?: {
            type: string;
            result: TursoResult;
        };
        error?: {
            message: string;
            code?: string;
        };
    }>;
}

function rowsToObjects(cols: TursoCol[], rows: unknown[][]): Record<string, unknown>[] {
    return rows.map(row =>
        Object.fromEntries(cols.map((col, i) => [col.name, row[i]])),
    );
}

async function tursoExecute(
    dbUrl: string,
    authToken: string,
    statements: Array<{ sql: string; args?: unknown[] }>,
): Promise<TursoResponse> {
    const url = `${dbUrl.replace(/\/$/, '')}/v2/pipeline`;
    const requests = statements.map(stmt => ({
        type: 'execute',
        stmt: {
            sql: stmt.sql,
            args: (stmt.args || []).map(arg => ({
                type: typeof arg === 'number'
                    ? (Number.isInteger(arg) ? 'integer' : 'float')
                    : arg === null
                        ? 'null'
                        : 'text',
                value: arg === null ? null : String(arg),
            })),
        },
    }));

    // Add a close request at the end
    const body = { requests: [...requests, { type: 'close' }] };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Turso API returned ${res.status}: ${errText}`);
    }

    return await res.json() as TursoResponse;
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    dbUrl: string,
    authToken: string,
) {
    switch (name) {
        case '_ping': {
            const data = await tursoExecute(dbUrl, authToken, [{ sql: 'SELECT 1' }]);
            if (data.results[0]?.error) throw new Error(data.results[0].error.message);
            const host = new URL(dbUrl).hostname.split('.')[0];
            return text(`Connected to Turso database "${host}"`);
        }

        case 'execute': {
            const sql = args.sql as string;
            if (!sql) return text('Error: "sql" is required');
            const stmtArgs = (args.args as unknown[]) || [];
            const data = await tursoExecute(dbUrl, authToken, [{ sql, args: stmtArgs }]);
            const entry = data.results[0];
            if (entry?.error) return text(`Error: ${entry.error.message}`);
            const result = entry?.response?.result;
            if (!result) return text('Error: No result returned');
            const rows = rowsToObjects(result.cols, result.rows);
            return json({
                rows,
                affected_row_count: result.affected_row_count,
                last_insert_rowid: result.last_insert_rowid ?? null,
            });
        }

        case 'batch': {
            const statements = args.statements as Array<string | { sql: string; args?: unknown[] }>;
            if (!statements || !statements.length) return text('Error: "statements" array is required');
            const stmts = statements.map(s =>
                typeof s === 'string' ? { sql: s } : { sql: s.sql, args: s.args },
            );
            const data = await tursoExecute(dbUrl, authToken, stmts);
            const results = data.results
                .filter(r => r.response || r.error)
                .map((entry, i) => {
                    if (entry.error) return { index: i, error: entry.error.message };
                    const result = entry.response!.result;
                    return {
                        index: i,
                        rows: rowsToObjects(result.cols, result.rows),
                        affected_row_count: result.affected_row_count,
                    };
                });
            return json({ results });
        }

        case 'list_tables': {
            const data = await tursoExecute(dbUrl, authToken, [
                { sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream_%' ORDER BY name" },
            ]);
            const entry = data.results[0];
            if (entry?.error) return text(`Error: ${entry.error.message}`);
            const result = entry?.response?.result;
            if (!result) return text('Error: No result returned');
            const tables = result.rows.map(r => r[0] as string);
            return json({ tables });
        }

        case 'describe_table': {
            const table = args.table as string;
            if (!table) return text('Error: "table" is required');
            // Validate table name to prevent injection in PRAGMA
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
                return text('Error: Invalid table name');
            }
            const data = await tursoExecute(dbUrl, authToken, [
                { sql: `PRAGMA table_info(${table})` },
            ]);
            const entry = data.results[0];
            if (entry?.error) return text(`Error: ${entry.error.message}`);
            const result = entry?.response?.result;
            if (!result) return text('Error: No result returned');
            const columns = rowsToObjects(result.cols, result.rows);
            return json({ table, columns });
        }

        case 'query': {
            const table = args.table as string;
            if (!table) return text('Error: "table" is required');
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
                return text('Error: Invalid table name');
            }
            const columns = (args.columns as string) || '*';
            let sql = `SELECT ${columns} FROM ${table}`;
            const stmtArgs: unknown[] = [];
            if (args.where) {
                sql += ` WHERE ${args.where}`;
                if (args.args) stmtArgs.push(...(args.args as unknown[]));
            }
            if (args.order_by) sql += ` ORDER BY ${args.order_by}`;
            const limit = (args.limit as number) || 100;
            sql += ` LIMIT ${limit}`;

            const data = await tursoExecute(dbUrl, authToken, [{ sql, args: stmtArgs }]);
            const entry = data.results[0];
            if (entry?.error) return text(`Error: ${entry.error.message}`);
            const result = entry?.response?.result;
            if (!result) return text('Error: No result returned');
            const rows = rowsToObjects(result.cols, result.rows);
            return json({ rows, count: rows.length });
        }

        case 'insert': {
            const table = args.table as string;
            const rows = args.rows as Record<string, unknown>[];
            if (!table) return text('Error: "table" is required');
            if (!rows || !rows.length) return text('Error: "rows" array is required');
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
                return text('Error: Invalid table name');
            }

            const stmts = rows.map(row => {
                const keys = Object.keys(row);
                const placeholders = keys.map(() => '?').join(', ');
                return {
                    sql: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
                    args: keys.map(k => row[k]),
                };
            });

            const data = await tursoExecute(dbUrl, authToken, stmts);
            const results = data.results
                .filter(r => r.response || r.error)
                .map((entry, i) => {
                    if (entry.error) return { index: i, error: entry.error.message };
                    const result = entry.response!.result;
                    return {
                        index: i,
                        affected_row_count: result.affected_row_count,
                        last_insert_rowid: result.last_insert_rowid ?? null,
                    };
                });
            return json({ inserted: results.length, results });
        }

        case 'update': {
            const table = args.table as string;
            const values = args.values as Record<string, unknown>;
            const where = args.where as string;
            if (!table) return text('Error: "table" is required');
            if (!values || !Object.keys(values).length) return text('Error: "values" object is required');
            if (!where) return text('Error: "where" clause is required to prevent accidental full-table updates');
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
                return text('Error: Invalid table name');
            }

            const keys = Object.keys(values);
            const setClauses = keys.map(k => `${k} = ?`).join(', ');
            const stmtArgs = [...keys.map(k => values[k]), ...((args.args as unknown[]) || [])];
            const sql = `UPDATE ${table} SET ${setClauses} WHERE ${where}`;

            const data = await tursoExecute(dbUrl, authToken, [{ sql, args: stmtArgs }]);
            const entry = data.results[0];
            if (entry?.error) return text(`Error: ${entry.error.message}`);
            const result = entry?.response?.result;
            if (!result) return text('Error: No result returned');
            return json({ affected_row_count: result.affected_row_count });
        }

        case 'delete_rows': {
            const table = args.table as string;
            const where = args.where as string;
            if (!table) return text('Error: "table" is required');
            if (!where) return text('Error: "where" clause is required to prevent accidental full-table deletes');
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
                return text('Error: Invalid table name');
            }

            const stmtArgs = (args.args as unknown[]) || [];
            const sql = `DELETE FROM ${table} WHERE ${where}`;

            const data = await tursoExecute(dbUrl, authToken, [{ sql, args: stmtArgs }]);
            const entry = data.results[0];
            if (entry?.error) return text(`Error: ${entry.error.message}`);
            const result = entry?.response?.result;
            if (!result) return text('Error: No result returned');
            return json({ affected_row_count: result.affected_row_count });
        }

        case 'count': {
            const table = args.table as string;
            if (!table) return text('Error: "table" is required');
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
                return text('Error: Invalid table name');
            }

            let sql = `SELECT COUNT(*) as count FROM ${table}`;
            const stmtArgs: unknown[] = [];
            if (args.where) {
                sql += ` WHERE ${args.where}`;
                if (args.args) stmtArgs.push(...(args.args as unknown[]));
            }

            const data = await tursoExecute(dbUrl, authToken, [{ sql, args: stmtArgs }]);
            const entry = data.results[0];
            if (entry?.error) return text(`Error: ${entry.error.message}`);
            const result = entry?.response?.result;
            if (!result) return text('Error: No result returned');
            const count = result.rows[0]?.[0] ?? 0;
            return json({ table, count });
        }

        default:
            return text(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-turso' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const dbUrl = request.headers.get('X-Mcp-Secret-TURSO-DATABASE-URL') || '';
        const authToken = request.headers.get('X-Mcp-Secret-TURSO-AUTH-TOKEN') || '';

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json() as typeof body;
        } catch {
            return new Response(
                JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }),
                { status: 400, headers: { 'Content-Type': 'application/json' } },
            );
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return Response.json({
                jsonrpc: '2.0', id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'mcp-turso', version: '1.0.0' },
                },
            });
        }

        if (method === 'tools/list') {
            return Response.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        }

        if (method === 'tools/call') {
            if (!dbUrl || !authToken) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32001, message: 'Missing secrets: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN required' },
                });
            }
            const { name, arguments: args = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, args, dbUrl, authToken);
                return Response.json({ jsonrpc: '2.0', id, result });
            } catch (err) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32603, message: String(err) },
                });
            }
        }

        return Response.json({
            jsonrpc: '2.0', id,
            error: { code: -32601, message: `Method not found: ${method}` },
        });
    },
};
