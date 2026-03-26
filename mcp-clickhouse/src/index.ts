// mcp-clickhouse — Aerostack MCP Server
// Wraps the ClickHouse HTTP Interface for SQL queries, schema exploration, and analytics
// Secrets: X-Mcp-Secret-CLICKHOUSE-URL, X-Mcp-Secret-CLICKHOUSE-USER, X-Mcp-Secret-CLICKHOUSE-PASSWORD

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify ClickHouse connectivity by running SELECT 1. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'query',
        description: 'Execute any SQL query (SELECT, SHOW, DESCRIBE, etc.) and return results as JSON',
        inputSchema: {
            type: 'object',
            properties: {
                sql: { type: 'string', description: 'SQL query to execute' },
            },
            required: ['sql'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_databases',
        description: 'List all databases in the ClickHouse instance',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_tables',
        description: 'List all tables in a specific database',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: "default")' },
            },
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'describe_table',
        description: 'Describe the schema (columns, types, defaults) of a table',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: "default")' },
                table: { type: 'string', description: 'Table name' },
            },
            required: ['table'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'insert',
        description: 'Insert rows into a ClickHouse table using VALUES syntax',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: "default")' },
                table: { type: 'string', description: 'Table name' },
                rows: { type: 'array', description: 'Array of row objects to insert', items: { type: 'object' } },
            },
            required: ['table', 'rows'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'count',
        description: 'Count rows in a table with optional WHERE filter',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: "default")' },
                table: { type: 'string', description: 'Table name' },
                where: { type: 'string', description: 'Optional WHERE clause (without the WHERE keyword), e.g. "status = \'active\'"' },
            },
            required: ['table'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'show_create',
        description: 'Show the CREATE TABLE statement for a table',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: "default")' },
                table: { type: 'string', description: 'Table name' },
            },
            required: ['table'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'system_metrics',
        description: 'Retrieve current ClickHouse system metrics (useful for monitoring and diagnostics)',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'table_sizes',
        description: 'Show table sizes (rows, compressed/uncompressed bytes) from system.parts',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name to filter (optional — shows all if omitted)' },
            },
            required: [],
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

async function runQuery(url: string, user: string, password: string, sql: string, format = 'JSON') {
    const res = await fetch(`${url}/?default_format=${format}`, {
        method: 'POST',
        headers: {
            'X-ClickHouse-User': user,
            'X-ClickHouse-Key': password,
            'Content-Type': 'text/plain',
        },
        body: sql,
    });
    if (!res.ok) throw new Error(`ClickHouse error: ${await res.text()}`);
    if (format === 'TabSeparatedRaw') return res.text();
    return res.json();
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    url: string,
    user: string,
    password: string,
) {
    const base = url.replace(/\/$/, '');

    switch (name) {
        case '_ping': {
            await runQuery(base, user, password, 'SELECT 1');
            const host = new URL(base).hostname;
            return text(`Connected to ClickHouse at "${host}"`);
        }

        case 'query': {
            const sql = args.sql as string;
            if (!sql) return text('Error: "sql" parameter is required');
            const data = await runQuery(base, user, password, sql);
            return json(data);
        }

        case 'list_databases': {
            const data = await runQuery(base, user, password, 'SHOW DATABASES');
            return json(data);
        }

        case 'list_tables': {
            const db = (args.database as string) || 'default';
            const data = await runQuery(base, user, password, `SHOW TABLES FROM ${db}`);
            return json(data);
        }

        case 'describe_table': {
            const db = (args.database as string) || 'default';
            const table = args.table as string;
            if (!table) return text('Error: "table" parameter is required');
            const data = await runQuery(base, user, password, `DESCRIBE TABLE ${db}.${table}`);
            return json(data);
        }

        case 'insert': {
            const db = (args.database as string) || 'default';
            const table = args.table as string;
            const rows = args.rows as Record<string, unknown>[];
            if (!table) return text('Error: "table" parameter is required');
            if (!rows || !rows.length) return text('Error: "rows" must be a non-empty array');

            const columns = Object.keys(rows[0]);
            const values = rows.map(row => {
                const vals = columns.map(col => {
                    const v = row[col];
                    if (v === null || v === undefined) return 'NULL';
                    if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`;
                    if (typeof v === 'boolean') return v ? '1' : '0';
                    return String(v);
                });
                return `(${vals.join(', ')})`;
            });

            const sql = `INSERT INTO ${db}.${table} (${columns.join(', ')}) VALUES ${values.join(', ')}`;
            await runQuery(base, user, password, sql, 'TabSeparatedRaw');
            return text(`Inserted ${rows.length} row(s) into ${db}.${table}`);
        }

        case 'count': {
            const db = (args.database as string) || 'default';
            const table = args.table as string;
            if (!table) return text('Error: "table" parameter is required');
            const where = args.where ? ` WHERE ${args.where}` : '';
            const data = await runQuery(base, user, password, `SELECT count() AS count FROM ${db}.${table}${where}`);
            return json(data);
        }

        case 'show_create': {
            const db = (args.database as string) || 'default';
            const table = args.table as string;
            if (!table) return text('Error: "table" parameter is required');
            const data = await runQuery(base, user, password, `SHOW CREATE TABLE ${db}.${table}`);
            return json(data);
        }

        case 'system_metrics': {
            const data = await runQuery(base, user, password, 'SELECT * FROM system.metrics ORDER BY metric');
            return json(data);
        }

        case 'table_sizes': {
            const dbFilter = args.database ? `WHERE database = '${args.database}'` : "WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')";
            const sql = `
                SELECT
                    database,
                    table,
                    sum(rows) AS total_rows,
                    formatReadableSize(sum(data_compressed_bytes)) AS compressed,
                    formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed,
                    sum(data_compressed_bytes) AS compressed_bytes,
                    sum(data_uncompressed_bytes) AS uncompressed_bytes
                FROM system.parts
                ${dbFilter}
                AND active
                GROUP BY database, table
                ORDER BY compressed_bytes DESC
            `;
            const data = await runQuery(base, user, password, sql);
            return json(data);
        }

        default:
            return text(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-clickhouse' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const clickhouseUrl = request.headers.get('X-Mcp-Secret-CLICKHOUSE-URL') || '';
        const clickhouseUser = request.headers.get('X-Mcp-Secret-CLICKHOUSE-USER') || '';
        const clickhousePassword = request.headers.get('X-Mcp-Secret-CLICKHOUSE-PASSWORD') || '';

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
                    serverInfo: { name: 'mcp-clickhouse', version: '1.0.0' },
                },
            });
        }

        if (method === 'tools/list') {
            return Response.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        }

        if (method === 'tools/call') {
            if (!clickhouseUrl || !clickhouseUser || !clickhousePassword) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32001, message: 'Missing secrets: CLICKHOUSE_URL, CLICKHOUSE_USER, and CLICKHOUSE_PASSWORD required' },
                });
            }
            const { name, arguments: args = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, args, clickhouseUrl, clickhouseUser, clickhousePassword);
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
