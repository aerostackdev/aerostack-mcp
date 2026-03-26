/**
 * Neon MCP Worker
 * Implements MCP protocol over HTTP for Neon serverless PostgreSQL.
 *
 * Secret: DATABASE_URL → header: X-Mcp-Secret-DATABASE-URL
 * Format: postgresql://user:pass@host.neon.tech/dbname?sslmode=require
 */

import { neon } from '@neondatabase/serverless';

function rpcOk(id: unknown, result: unknown) {
    return Response.json({ jsonrpc: '2.0', id, result });
}

function rpcErr(id: unknown, code: number, message: string) {
    return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify database connectivity by running SELECT 1. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_tables',
        description: 'List all user tables in the Neon PostgreSQL database with their column names and types',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'select',
        description: 'Query rows from a table with optional WHERE filter, ORDER BY, and LIMIT',
        inputSchema: {
            type: 'object',
            properties: {
                table: { type: 'string', description: 'Table name to query' },
                columns: { type: 'string', description: 'Comma-separated columns to return (default: *)' },
                where: { type: 'string', description: 'SQL WHERE clause without the WHERE keyword, e.g. "status = \'active\' AND age > 18"' },
                order_by: { type: 'string', description: 'ORDER BY expression, e.g. "created_at DESC"' },
                limit: { type: 'number', description: 'Max rows to return (default: 50, max: 500)' },
                offset: { type: 'number', description: 'Number of rows to skip for pagination' },
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
                table: { type: 'string', description: 'Table name to insert into' },
                rows: {
                    type: 'array',
                    description: 'Array of row objects to insert. Each object keys must match column names.',
                    items: { type: 'object' },
                },
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
                table: { type: 'string', description: 'Table name to update' },
                values: { type: 'object', description: 'Column/value pairs to set, e.g. { "status": "closed", "updated_at": "NOW()" }' },
                where: { type: 'string', description: 'SQL WHERE clause (required — prevents full-table updates), e.g. "id = 42"' },
            },
            required: ['table', 'values', 'where'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete',
        description: 'Delete rows from a table matching a WHERE condition',
        inputSchema: {
            type: 'object',
            properties: {
                table: { type: 'string', description: 'Table name to delete from' },
                where: { type: 'string', description: 'SQL WHERE clause (required — prevents full-table deletes), e.g. "id = 42"' },
            },
            required: ['table', 'where'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'run_sql',
        description: 'Execute a raw parameterized SQL query. Use $1, $2, ... for parameters.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'SQL query with optional $1, $2, ... placeholders' },
                params: {
                    type: 'array',
                    description: 'Parameter values corresponding to $1, $2, ... in query',
                    items: {},
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
];

/** Parse a Postgres connection string into its components */
function parseDbUrl(databaseUrl: string) {
    const url = new URL(databaseUrl.replace(/^postgres(ql)?:\/\//, 'https://'));
    return {
        host: url.hostname,
        database: url.pathname.replace(/^\//, ''),
    };
}

/** Execute a SQL query via @neondatabase/serverless driver */
async function neonQuery(databaseUrl: string, query: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    const sql = neon(databaseUrl, { fullResults: true });
    const result = await sql.query(query, params) as any;
    return { rows: result.rows ?? [], rowCount: result.rowCount ?? 0 };
}

/** Build a parameterized INSERT statement from row objects */
function buildInsert(table: string, rows: Record<string, unknown>[]): { query: string; params: unknown[] } {
    const columns = Object.keys(rows[0]);
    const params: unknown[] = [];
    const valueSets = rows.map(row => {
        const placeholders = columns.map(col => {
            params.push(row[col]);
            return `$${params.length}`;
        });
        return `(${placeholders.join(', ')})`;
    });

    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valueSets.join(', ')} RETURNING *`;
    return { query, params };
}

/** Build a parameterized UPDATE statement */
function buildUpdate(table: string, values: Record<string, unknown>, where: string): { query: string; params: unknown[] } {
    const params: unknown[] = [];
    const setClauses = Object.entries(values).map(([col, val]) => {
        // Allow SQL expressions like NOW() to pass through unparameterized
        if (typeof val === 'string' && /^[A-Z_]+\(\)$/.test(val)) {
            return `${col} = ${val}`;
        }
        params.push(val);
        return `${col} = $${params.length}`;
    });

    const query = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${where} RETURNING *`;
    return { query, params };
}

async function callTool(name: string, args: Record<string, unknown>, dbUrl: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await neonQuery(dbUrl, 'SELECT 1 AS ok');
            const { host, database } = parseDbUrl(dbUrl);
            return text(`Connected to Neon database "${database}" on ${host}`);
        }

        case 'list_tables': {
            const { rows } = await neonQuery(dbUrl, `
                SELECT
                    t.table_name,
                    array_agg(c.column_name || ' ' || c.data_type ORDER BY c.ordinal_position) AS columns
                FROM information_schema.tables t
                JOIN information_schema.columns c
                    ON t.table_name = c.table_name AND t.table_schema = c.table_schema
                WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
                GROUP BY t.table_name
                ORDER BY t.table_name
            `);
            return json({ tables: rows });
        }

        case 'select': {
            const table = args.table as string;
            const columns = (args.columns as string) || '*';
            const limit = Math.min(Number(args.limit ?? 50), 500);
            const parts = [`SELECT ${columns} FROM ${table}`];
            if (args.where) parts.push(`WHERE ${args.where}`);
            if (args.order_by) parts.push(`ORDER BY ${args.order_by}`);
            parts.push(`LIMIT ${limit}`);
            if (args.offset) parts.push(`OFFSET ${args.offset}`);

            const { rows, rowCount } = await neonQuery(dbUrl, parts.join(' '));
            return json({ rows, count: rows.length, total: rowCount });
        }

        case 'insert': {
            // Auto-wrap single object into array (LLMs often send {..} instead of [{..}])
            const rawRows = args.rows;
            const rows: Record<string, unknown>[] = Array.isArray(rawRows)
                ? rawRows : (rawRows && typeof rawRows === 'object' ? [rawRows as Record<string, unknown>] : []);
            if (!rows.length) throw new Error('rows array is empty');
            const { query, params } = buildInsert(args.table as string, rows);
            const { rows: inserted } = await neonQuery(dbUrl, query, params);
            return json({ inserted, count: inserted.length });
        }

        case 'update': {
            const { query, params } = buildUpdate(
                args.table as string,
                args.values as Record<string, unknown>,
                args.where as string,
            );
            const { rows, rowCount } = await neonQuery(dbUrl, query, params);
            return json({ updated: rows, count: rowCount });
        }

        case 'delete': {
            const { rows, rowCount } = await neonQuery(
                dbUrl,
                `DELETE FROM ${args.table} WHERE ${args.where} RETURNING *`,
            );
            return json({ deleted: rows, count: rowCount });
        }

        case 'run_sql': {
            const { rows, rowCount } = await neonQuery(
                dbUrl,
                args.query as string,
                (args.params as unknown[]) ?? [],
            );
            return json({ rows, rowCount });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-neon', version: '1.0.0' });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-neon', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const dbUrl = request.headers.get('X-Mcp-Secret-DATABASE-URL');
            if (!dbUrl) {
                return rpcErr(id, -32001, 'Missing DATABASE_URL secret — add it to your workspace secrets');
            }

            const { name, arguments: toolArgs = {} } = (params ?? {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, toolArgs, dbUrl);
                return rpcOk(id, result);
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
