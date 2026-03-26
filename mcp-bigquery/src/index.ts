/**
 * mcp-bigquery — Google BigQuery MCP Server
 *
 * Run SQL queries, list datasets/tables, inspect schemas, and manage jobs.
 * Uses BigQuery REST API directly (no npm SDK) for minimal bundle size on Workers.
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 */

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify BigQuery connectivity by listing datasets. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_datasets',
        description: 'List all datasets in the Google Cloud project with ID, location, description, and creation time',
        inputSchema: {
            type: 'object' as const,
            properties: {
                max_results: { type: 'number', description: 'Maximum number of datasets to return (default: 50)' },
            },
            required: [] as string[],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_tables',
        description: 'List all tables in a BigQuery dataset with type (TABLE, VIEW, MATERIALIZED_VIEW), row count, and size',
        inputSchema: {
            type: 'object' as const,
            properties: {
                dataset: { type: 'string', description: 'Dataset ID to list tables from' },
                max_results: { type: 'number', description: 'Maximum number of tables to return (default: 100)' },
            },
            required: ['dataset'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_table_schema',
        description: 'Get the full schema of a BigQuery table — column names, types, modes (NULLABLE, REQUIRED, REPEATED), and descriptions',
        inputSchema: {
            type: 'object' as const,
            properties: {
                dataset: { type: 'string', description: 'Dataset ID' },
                table: { type: 'string', description: 'Table ID' },
            },
            required: ['dataset', 'table'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'query',
        description: 'Execute a SQL query on BigQuery and return results. Supports standard SQL with CTEs, joins, aggregations, and window functions.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                sql: { type: 'string', description: 'Standard SQL query to execute (e.g. "SELECT * FROM `project.dataset.table` LIMIT 100")' },
                max_results: { type: 'number', description: 'Maximum number of rows to return (default: 100, max: 10000)' },
                use_legacy_sql: { type: 'boolean', description: 'Use legacy SQL dialect instead of standard SQL (default: false)' },
                dry_run: { type: 'boolean', description: 'If true, validates the query and returns estimated bytes processed without running it' },
            },
            required: ['sql'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_job',
        description: 'Get the status and results of a BigQuery job by job ID — useful for checking long-running queries',
        inputSchema: {
            type: 'object' as const,
            properties: {
                job_id: { type: 'string', description: 'BigQuery job ID to check status of' },
            },
            required: ['job_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
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

/** Get an OAuth2 access token from a Google Service Account JSON key. */
async function getAccessToken(serviceAccountJson: string): Promise<string> {
    const sa = JSON.parse(serviceAccountJson);
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = btoa(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/bigquery',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    }));
    const signInput = `${header}.${claim}`;

    // Import RSA private key
    const pemContent = sa.private_key
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');
    const keyData = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', keyData,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign'],
    );

    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5', cryptoKey,
        new TextEncoder().encode(signInput),
    );
    const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const jwt = `${header}.${claim}.${sig}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = (await res.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) throw new Error(`Token error: ${tokenData.error || 'unknown'}`);
    return tokenData.access_token;
}

async function bqFetch(token: string, path: string, method = 'GET', body?: unknown): Promise<any> {
    const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json() as any;
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data;
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    projectId: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await bqFetch(token, `/projects/${projectId}/datasets?maxResults=1`);
            return text(`Connected to BigQuery project "${projectId}". Found ${data.totalItems ?? 0} dataset(s).`);
        }

        case 'list_datasets': {
            const max = Math.min(Number(args.max_results ?? 50), 200);
            const data = await bqFetch(token, `/projects/${projectId}/datasets?maxResults=${max}`);
            const datasets = (data.datasets ?? []).map((d: any) => ({
                id: d.datasetReference?.datasetId,
                location: d.location,
                description: d.friendlyName,
            }));
            return json({ datasets, count: datasets.length });
        }

        case 'list_tables': {
            const dataset = args.dataset as string;
            const max = Math.min(Number(args.max_results ?? 100), 500);
            const data = await bqFetch(token, `/projects/${projectId}/datasets/${dataset}/tables?maxResults=${max}`);
            const tables = (data.tables ?? []).map((t: any) => ({
                id: t.tableReference?.tableId,
                type: t.type,
                rows: t.numRows,
                size_bytes: t.numBytes,
                created: t.creationTime ? new Date(Number(t.creationTime)).toISOString() : null,
            }));
            return json({ tables, count: tables.length });
        }

        case 'get_table_schema': {
            const dataset = args.dataset as string;
            const table = args.table as string;
            const data = await bqFetch(token, `/projects/${projectId}/datasets/${dataset}/tables/${table}`);
            const columns = (data.schema?.fields ?? []).map((f: any) => ({
                name: f.name,
                type: f.type,
                mode: f.mode,
                description: f.description,
                fields: f.fields, // nested for RECORD types
            }));
            return json({
                table: data.tableReference?.tableId,
                type: data.type,
                rows: data.numRows,
                size_bytes: data.numBytes,
                columns,
            });
        }

        case 'query': {
            const sql = args.sql as string;
            const maxResults = Math.min(Number(args.max_results ?? 100), 10000);
            const dryRun = args.dry_run === true;
            const body = {
                query: sql,
                useLegacySql: args.use_legacy_sql === true,
                maxResults,
                dryRun,
            };
            const data = await bqFetch(token, `/projects/${projectId}/queries`, 'POST', body);

            if (dryRun) {
                return json({
                    dry_run: true,
                    bytes_processed: data.totalBytesProcessed,
                    gb_processed: (Number(data.totalBytesProcessed) / 1e9).toFixed(3),
                    cache_hit: data.cacheHit,
                });
            }

            const fields = (data.schema?.fields ?? []).map((f: any) => f.name);
            const rows = (data.rows ?? []).map((r: any) =>
                Object.fromEntries(fields.map((f: string, i: number) => [f, r.f?.[i]?.v]))
            );

            return json({
                rows,
                count: rows.length,
                total_rows: data.totalRows,
                bytes_processed: data.totalBytesProcessed,
                cache_hit: data.cacheHit,
                job_complete: data.jobComplete,
                job_id: data.jobReference?.jobId,
            });
        }

        case 'get_job': {
            const jobId = args.job_id as string;
            const data = await bqFetch(token, `/projects/${projectId}/jobs/${jobId}`);
            return json({
                id: data.jobReference?.jobId,
                status: data.status?.state,
                error: data.status?.errorResult,
                statistics: {
                    creation_time: data.statistics?.creationTime,
                    start_time: data.statistics?.startTime,
                    end_time: data.statistics?.endTime,
                    bytes_processed: data.statistics?.totalBytesProcessed,
                },
            });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ─── Worker Entry ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-bigquery', version: '1.0.0' });
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
                serverInfo: { name: 'mcp-bigquery', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const saJson = request.headers.get('X-Mcp-Secret-GOOGLE-SERVICE-ACCOUNT-JSON');
            const projectId = request.headers.get('X-Mcp-Secret-GOOGLE-PROJECT-ID');

            if (!saJson) {
                return rpcErr(id, -32001, 'Missing GOOGLE_SERVICE_ACCOUNT_JSON secret — add your service account key JSON to workspace secrets');
            }
            if (!projectId) {
                return rpcErr(id, -32001, 'Missing GOOGLE_PROJECT_ID secret — add your GCP project ID to workspace secrets');
            }

            let token: string;
            try {
                token = await getAccessToken(saJson);
            } catch (e: unknown) {
                return rpcErr(id, -32001, `Failed to authenticate: ${e instanceof Error ? e.message : 'unknown error'}`);
            }

            const { name, arguments: toolArgs = {} } = (params ?? {}) as {
                name: string;
                arguments?: Record<string, unknown>;
            };

            try {
                const result = await callTool(name, toolArgs, token, projectId);
                return rpcOk(id, result);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
