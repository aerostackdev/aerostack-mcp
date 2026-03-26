// mcp-supabase — Aerostack MCP Server
// Wraps the Supabase REST (PostgREST) and Management APIs
// Secrets: X-Mcp-Secret-SUPABASE-URL, X-Mcp-Secret-SUPABASE-KEY

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Supabase connectivity by querying the health endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_tables',
        description: 'List all tables in the Supabase database',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'select',
        description: 'Query rows from a Supabase table with optional filters, ordering, and pagination',
        inputSchema: {
            type: 'object',
            properties: {
                table: { type: 'string', description: 'Table name' },
                select: { type: 'string', description: 'Columns to return (default: *)' },
                filter: { type: 'string', description: 'PostgREST filter string, e.g. "id=eq.1&status=eq.active"' },
                order: { type: 'string', description: 'Column to order by, e.g. "created_at.desc"' },
                limit: { type: 'number', description: 'Maximum rows to return (default: 100)' },
                offset: { type: 'number', description: 'Rows to skip for pagination' },
            },
            required: ['table'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'insert',
        description: 'Insert one or more rows into a Supabase table',
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
        description: 'Update rows in a Supabase table matching a filter',
        inputSchema: {
            type: 'object',
            properties: {
                table: { type: 'string', description: 'Table name' },
                filter: { type: 'string', description: 'PostgREST filter string identifying which rows to update, e.g. "id=eq.1"' },
                values: { type: 'object', description: 'Key/value pairs to update' },
            },
            required: ['table', 'filter', 'values'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete',
        description: 'Delete rows from a Supabase table matching a filter',
        inputSchema: {
            type: 'object',
            properties: {
                table: { type: 'string', description: 'Table name' },
                filter: { type: 'string', description: 'PostgREST filter string identifying which rows to delete, e.g. "id=eq.1"' },
            },
            required: ['table', 'filter'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'rpc',
        description: 'Call a Supabase RPC (PostgreSQL function)',
        inputSchema: {
            type: 'object',
            properties: {
                function_name: { type: 'string', description: 'The PostgreSQL function name' },
                params: { type: 'object', description: 'Arguments to pass to the function' },
            },
            required: ['function_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'storage_list',
        description: 'List files in a Supabase Storage bucket',
        inputSchema: {
            type: 'object',
            properties: {
                bucket: { type: 'string', description: 'Storage bucket name' },
                prefix: { type: 'string', description: 'Optional folder prefix to list within' },
            },
            required: ['bucket'],
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

async function callTool(
    name: string,
    args: Record<string, unknown>,
    supabaseUrl: string,
    anonKey: string,
) {
    const base = supabaseUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
    };

    switch (name) {
        case '_ping': {
            // Health check — use PostgREST health endpoint (no auth required for connectivity,
            // then verify the key works by attempting a lightweight query)
            const res = await fetch(`${base}/rest/v1/`, {
                method: 'HEAD',
                headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
            });
            // 401 = bad key, anything else = connected
            if (res.status === 401) throw new Error('Invalid Supabase key — authentication failed');
            const host = new URL(supabaseUrl).hostname.split('.')[0];
            return text(`Connected to Supabase project "${host}"`);
        }

        case 'list_tables': {
            // Try schema introspection (requires service-role key)
            const res = await fetch(`${base}/rest/v1/`, { headers, redirect: 'follow' });
            if (res.ok) {
                const data = await res.json() as { definitions?: Record<string, unknown>; paths?: Record<string, unknown> };
                const tables = Object.keys(data.definitions || data.paths || {}).filter(t => !t.startsWith('/'));
                return json({ tables });
            }
            // Fallback for anon key: query information_schema via RPC if available
            const rpcRes = await fetch(`${base}/rest/v1/rpc/list_tables`, {
                method: 'POST', headers, body: '{}',
            });
            if (rpcRes.ok) return json(await rpcRes.json());
            // If both fail, return a helpful error
            return text(`Cannot list tables — schema introspection requires a service-role key (not an anon key). Update SUPABASE_KEY in workspace secrets to your service_role key from Supabase Dashboard > Settings > API.`);
        }

        case 'select': {
            const table = args.table as string;
            const params = new URLSearchParams();
            if (args.select) params.set('select', args.select as string);
            if (args.filter) {
                // filter is raw query string like "id=eq.1&status=eq.active"
                for (const [k, v] of new URLSearchParams(args.filter as string)) {
                    params.set(k, v);
                }
            }
            if (args.order) params.set('order', args.order as string);
            if (args.limit) params.set('limit', String(args.limit));
            if (args.offset) params.set('offset', String(args.offset));

            const url = `${base}/rest/v1/${table}?${params}`;
            const res = await fetch(url, {
                headers: { ...headers, 'Prefer': 'count=exact' },
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const rows = await res.json();
            const count = res.headers.get('Content-Range');
            return json({ rows, count });
        }

        case 'insert': {
            const table = args.table as string;
            const rows = args.rows as object[];
            const res = await fetch(`${base}/rest/v1/${table}`, {
                method: 'POST',
                headers: { ...headers, 'Prefer': 'return=representation' },
                body: JSON.stringify(rows.length === 1 ? rows[0] : rows),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'update': {
            const table = args.table as string;
            const params = new URLSearchParams(args.filter as string);
            const url = `${base}/rest/v1/${table}?${params}`;
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { ...headers, 'Prefer': 'return=representation' },
                body: JSON.stringify(args.values),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete': {
            const table = args.table as string;
            const params = new URLSearchParams(args.filter as string);
            const url = `${base}/rest/v1/${table}?${params}`;
            const res = await fetch(url, {
                method: 'DELETE',
                headers: { ...headers, 'Prefer': 'return=representation' },
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'rpc': {
            const fn = args.function_name as string;
            const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(args.params || {}),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'storage_list': {
            const bucket = args.bucket as string;
            const prefix = args.prefix as string | undefined;
            const res = await fetch(`${base}/storage/v1/object/list/${bucket}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ prefix: prefix || '', limit: 100, offset: 0 }),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        default:
            return text(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-supabase' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const supabaseUrl = request.headers.get('X-Mcp-Secret-SUPABASE-URL') || '';
        const anonKey = request.headers.get('X-Mcp-Secret-SUPABASE-KEY') || '';

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
                    serverInfo: { name: 'mcp-supabase', version: '1.0.0' },
                },
            });
        }

        if (method === 'tools/list') {
            return Response.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        }

        if (method === 'tools/call') {
            if (!supabaseUrl || !anonKey) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32001, message: 'Missing secrets: SUPABASE_URL and SUPABASE_KEY required' },
                });
            }
            const { name, arguments: args = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, args, supabaseUrl, anonKey);
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
