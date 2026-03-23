/**
 * mcp-snowflake — Snowflake Data Warehouse MCP Server
 *
 * Run SQL queries, list databases/schemas/tables, inspect columns.
 * Uses Snowflake SQL REST API (v2) directly — no npm SDK needed.
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 */

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Snowflake connectivity by running SELECT CURRENT_VERSION(). Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
    {
        name: 'list_databases',
        description: 'List all databases in the Snowflake account with name, owner, creation time, and retention days',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
    {
        name: 'list_schemas',
        description: 'List all schemas in a Snowflake database with name, owner, and creation time',
        inputSchema: {
            type: 'object' as const,
            properties: {
                database: { type: 'string', description: 'Database name (uses default from SNOWFLAKE_DATABASE if omitted)' },
            },
            required: [] as string[],
        },
    },
    {
        name: 'list_tables',
        description: 'List all tables in a schema with name, type (TABLE, VIEW, MATERIALIZED VIEW), row count, bytes, and clustering keys',
        inputSchema: {
            type: 'object' as const,
            properties: {
                database: { type: 'string', description: 'Database name' },
                schema: { type: 'string', description: 'Schema name (default: PUBLIC)' },
            },
            required: [] as string[],
        },
    },
    {
        name: 'describe_table',
        description: 'Get the full column definitions of a table — column names, data types, nullable, default values, and comments',
        inputSchema: {
            type: 'object' as const,
            properties: {
                database: { type: 'string', description: 'Database name' },
                schema: { type: 'string', description: 'Schema name (default: PUBLIC)' },
                table: { type: 'string', description: 'Table or view name' },
            },
            required: ['table'],
        },
    },
    {
        name: 'query',
        description: 'Execute a SQL query on Snowflake and return results. Supports full Snowflake SQL with CTEs, window functions, semi-structured data, and time travel.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                sql: { type: 'string', description: 'SQL query to execute' },
                database: { type: 'string', description: 'Override the default database for this query' },
                schema: { type: 'string', description: 'Override the default schema for this query' },
                limit: { type: 'number', description: 'Max rows to return (default: 100, max: 10000). Appended as LIMIT if not already in query.' },
            },
            required: ['sql'],
        },
    },
    {
        name: 'list_warehouses',
        description: 'List all Snowflake virtual warehouses with name, size, state (STARTED, SUSPENDED), and auto-suspend settings',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

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

interface SnowflakeConfig {
    account: string;
    username: string;
    password: string;
    warehouse: string;
    database: string;
}

/**
 * Get a Snowflake session token via key-pair or password login.
 * Uses the Snowflake SQL REST API v2 login endpoint.
 */
async function getToken(cfg: SnowflakeConfig): Promise<string> {
    const url = `https://${cfg.account}.snowflakecomputing.com/session/v1/login-request`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            data: {
                CLIENT_APP_ID: 'aerostack-mcp-snowflake',
                CLIENT_APP_VERSION: '1.0.0',
                ACCOUNT_NAME: cfg.account,
                LOGIN_NAME: cfg.username,
                PASSWORD: cfg.password,
            },
        }),
    });
    const data = (await res.json()) as any;
    if (!data.success) throw new Error(data.message || `Login failed: ${JSON.stringify(data)}`);
    return data.data?.token;
}

/** Execute SQL via Snowflake SQL API v2 */
async function sfQuery(
    cfg: SnowflakeConfig,
    token: string,
    sql: string,
    database?: string,
    schema?: string,
): Promise<{ columns: string[]; rows: Record<string, unknown>[]; rowCount: number }> {
    const url = `https://${cfg.account}.snowflakecomputing.com/api/v2/statements`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Snowflake Token="${token}"`,
            Accept: 'application/json',
            'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
        },
        body: JSON.stringify({
            statement: sql,
            timeout: 60,
            database: database || cfg.database,
            schema: schema || 'PUBLIC',
            warehouse: cfg.warehouse,
        }),
    });
    const data = (await res.json()) as any;

    if (data.code && data.code !== '090001') {
        throw new Error(data.message || `Query error: code ${data.code}`);
    }

    const resultSetMetaData = data.resultSetMetaData || {};
    const columns = (resultSetMetaData.rowType || []).map((c: any) => c.name);
    const rawRows: string[][] = data.data || [];

    const rows = rawRows.map((row: string[]) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col: string, i: number) => {
            const val = row[i];
            // Try to parse numbers and booleans
            if (val === null || val === undefined) obj[col] = null;
            else if (val === 'true' || val === 'false') obj[col] = val === 'true';
            else if (/^-?\d+(\.\d+)?$/.test(val)) obj[col] = Number(val);
            else obj[col] = val;
        });
        return obj;
    });

    return { columns, rows, rowCount: rows.length };
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    cfg: SnowflakeConfig,
    token: string,
): Promise<unknown> {
    const db = (args.database as string) || cfg.database;
    const schema = (args.schema as string) || 'PUBLIC';

    switch (name) {
        case '_ping': {
            const { rows } = await sfQuery(cfg, token, 'SELECT CURRENT_VERSION() AS version, CURRENT_ACCOUNT() AS account');
            return text(`Connected to Snowflake: ${rows[0]?.version} (account: ${rows[0]?.account})`);
        }

        case 'list_databases': {
            const { rows } = await sfQuery(cfg, token, 'SHOW DATABASES');
            const databases = rows.map((r: any) => ({
                name: r.name,
                owner: r.owner,
                created: r.created_on,
                retention_days: r.retention_time,
            }));
            return json({ databases, count: databases.length });
        }

        case 'list_schemas': {
            const { rows } = await sfQuery(cfg, token, `SHOW SCHEMAS IN DATABASE "${db}"`);
            const schemas = rows.map((r: any) => ({
                name: r.name,
                owner: r.owner,
                created: r.created_on,
            }));
            return json({ schemas, count: schemas.length });
        }

        case 'list_tables': {
            const { rows } = await sfQuery(cfg, token, `SHOW TABLES IN "${db}"."${schema}"`);
            const tables = rows.map((r: any) => ({
                name: r.name,
                kind: r.kind,
                rows: r.rows,
                bytes: r.bytes,
                owner: r.owner,
                cluster_by: r.cluster_by,
                created: r.created_on,
            }));
            return json({ tables, count: tables.length });
        }

        case 'describe_table': {
            const table = args.table as string;
            const { rows } = await sfQuery(cfg, token, `DESCRIBE TABLE "${db}"."${schema}"."${table}"`);
            const columns = rows.map((r: any) => ({
                name: r.name,
                type: r.type,
                nullable: r.null_ === 'Y',
                default: r.default,
                comment: r.comment,
            }));
            return json({ table, database: db, schema, columns, count: columns.length });
        }

        case 'query': {
            let sql = args.sql as string;
            const limit = Math.min(Number(args.limit ?? 100), 10000);
            // Add LIMIT if not already present
            if (!/\bLIMIT\b/i.test(sql)) {
                sql = `${sql.replace(/;\s*$/, '')} LIMIT ${limit}`;
            }
            const { rows, columns, rowCount } = await sfQuery(cfg, token, sql, db, schema);
            return json({ columns, rows, count: rowCount });
        }

        case 'list_warehouses': {
            const { rows } = await sfQuery(cfg, token, 'SHOW WAREHOUSES');
            const warehouses = rows.map((r: any) => ({
                name: r.name,
                size: r.size,
                state: r.state,
                type: r.type,
                auto_suspend: r.auto_suspend,
                auto_resume: r.auto_resume,
            }));
            return json({ warehouses, count: warehouses.length });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ─── Worker Entry ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-snowflake', version: '1.0.0' });
        }
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = (await request.json()) as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-snowflake', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const account = request.headers.get('X-Mcp-Secret-SNOWFLAKE-ACCOUNT');
            const username = request.headers.get('X-Mcp-Secret-SNOWFLAKE-USERNAME');
            const password = request.headers.get('X-Mcp-Secret-SNOWFLAKE-PASSWORD');
            const warehouse = request.headers.get('X-Mcp-Secret-SNOWFLAKE-WAREHOUSE') || 'COMPUTE_WH';
            const database = request.headers.get('X-Mcp-Secret-SNOWFLAKE-DATABASE') || '';

            if (!account || !username || !password) {
                return rpcErr(id, -32001, 'Missing Snowflake credentials — add SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, and SNOWFLAKE_PASSWORD to your workspace secrets');
            }

            const cfg: SnowflakeConfig = { account, username, password, warehouse, database };

            let token: string;
            try {
                token = await getToken(cfg);
            } catch (e: unknown) {
                return rpcErr(id, -32001, `Snowflake login failed: ${e instanceof Error ? e.message : 'unknown error'}`);
            }

            const { name, arguments: toolArgs = {} } = (params ?? {}) as {
                name: string;
                arguments?: Record<string, unknown>;
            };

            try {
                const result = await callTool(name, toolArgs, cfg, token);
                return rpcOk(id, result);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
