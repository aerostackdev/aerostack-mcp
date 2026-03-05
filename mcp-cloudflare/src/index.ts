/**
 * Cloudflare MCP Worker
 * Implements MCP protocol over HTTP for Cloudflare API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   CF_API_TOKEN    → header: X-Mcp-Secret-CF-API-TOKEN
 *   CF_ACCOUNT_ID   → header: X-Mcp-Secret-CF-ACCOUNT-ID
 */

const CF_API = 'https://api.cloudflare.com/client/v4';

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

const TOOLS = [
    {
        name: 'list_workers',
        description: 'List all Cloudflare Workers deployed in the account',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_worker',
        description: 'Get details of a specific Cloudflare Worker script',
        inputSchema: {
            type: 'object',
            properties: {
                script_name: { type: 'string', description: 'The Worker script name' },
            },
            required: ['script_name'],
        },
    },
    {
        name: 'list_kv_namespaces',
        description: 'List all KV namespaces in the Cloudflare account',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'kv_get',
        description: 'Read a value from a Cloudflare KV namespace',
        inputSchema: {
            type: 'object',
            properties: {
                namespace_id: { type: 'string', description: 'KV namespace ID' },
                key: { type: 'string', description: 'Key to read' },
            },
            required: ['namespace_id', 'key'],
        },
    },
    {
        name: 'kv_put',
        description: 'Write a value to a Cloudflare KV namespace',
        inputSchema: {
            type: 'object',
            properties: {
                namespace_id: { type: 'string', description: 'KV namespace ID' },
                key: { type: 'string', description: 'Key to write' },
                value: { type: 'string', description: 'Value to store' },
                expiration_ttl: { type: 'number', description: 'TTL in seconds (optional)' },
            },
            required: ['namespace_id', 'key', 'value'],
        },
    },
    {
        name: 'list_r2_buckets',
        description: 'List all R2 buckets in the Cloudflare account',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'list_d1_databases',
        description: 'List all D1 databases in the Cloudflare account',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'query_d1',
        description: 'Execute a SQL query against a Cloudflare D1 database',
        inputSchema: {
            type: 'object',
            properties: {
                database_id: { type: 'string', description: 'D1 database ID' },
                sql: { type: 'string', description: 'SQL query to execute' },
            },
            required: ['database_id', 'sql'],
        },
    },
    {
        name: 'get_worker_logs',
        description: 'Get recent tail log events for a Cloudflare Worker (last 100 events if available)',
        inputSchema: {
            type: 'object',
            properties: {
                script_name: { type: 'string', description: 'Worker script name' },
            },
            required: ['script_name'],
        },
    },
    {
        name: 'get_account_analytics',
        description: 'Get account-level request analytics for the past 24 hours',
        inputSchema: { type: 'object', properties: {} },
    },
];

async function cfApi(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${CF_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    const data = await res.json() as { success: boolean; result?: unknown; errors?: unknown[] };
    if (!data.success) {
        throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
    }
    return data.result;
}

async function callTool(name: string, args: Record<string, unknown>, token: string, accountId: string): Promise<unknown> {
    switch (name) {
        case 'list_workers': {
            const scripts = await cfApi(`/accounts/${accountId}/workers/scripts`, token) as any[];
            return (scripts ?? []).map((s: any) => ({
                id: s.id,
                etag: s.etag,
                handlers: s.handlers,
                modified_on: s.modified_on,
                created_on: s.created_on,
            }));
        }

        case 'get_worker': {
            const script = await cfApi(`/accounts/${accountId}/workers/scripts/${args.script_name}`, token) as any;
            return {
                id: script.id,
                etag: script.etag,
                handlers: script.handlers,
                modified_on: script.modified_on,
            };
        }

        case 'list_kv_namespaces': {
            const namespaces = await cfApi(`/accounts/${accountId}/storage/kv/namespaces?per_page=50`, token) as any[];
            return (namespaces ?? []).map((ns: any) => ({ id: ns.id, title: ns.title, supports_url_encoding: ns.supports_url_encoding }));
        }

        case 'kv_get': {
            const res = await fetch(`${CF_API}/accounts/${accountId}/storage/kv/namespaces/${args.namespace_id}/values/${encodeURIComponent(args.key as string)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 404) return { value: null, found: false };
            if (!res.ok) throw new Error(`KV get failed: ${res.status}`);
            const value = await res.text();
            return { value, found: true };
        }

        case 'kv_put': {
            const url = `${CF_API}/accounts/${accountId}/storage/kv/namespaces/${args.namespace_id}/values/${encodeURIComponent(args.key as string)}`;
            const query = args.expiration_ttl ? `?expiration_ttl=${args.expiration_ttl}` : '';
            const res = await fetch(url + query, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
                body: args.value as string,
            });
            if (!res.ok) throw new Error(`KV put failed: ${res.status}`);
            return { success: true, key: args.key };
        }

        case 'list_r2_buckets': {
            const buckets = await cfApi(`/accounts/${accountId}/r2/buckets`, token) as any;
            return (buckets?.buckets ?? []).map((b: any) => ({ name: b.name, creation_date: b.creation_date }));
        }

        case 'list_d1_databases': {
            const dbs = await cfApi(`/accounts/${accountId}/d1/database?per_page=50`, token) as any[];
            return (dbs ?? []).map((d: any) => ({ uuid: d.uuid, name: d.name, created_at: d.created_at, num_tables: d.num_tables }));
        }

        case 'query_d1': {
            const result = await cfApi(`/accounts/${accountId}/d1/database/${args.database_id}/query`, token, {
                method: 'POST',
                body: JSON.stringify({ sql: args.sql }),
            }) as any;
            return result;
        }

        case 'get_worker_logs': {
            // Note: Tail logs require a WebSocket — we return recent analytics instead
            const now = new Date();
            const from = new Date(now.getTime() - 60 * 60 * 1000).toISOString(); // 1 hour ago
            const to = now.toISOString();
            try {
                const analytics = await cfApi(
                    `/accounts/${accountId}/workers/scripts/${args.script_name}/analytics/requests?from=${from}&to=${to}`,
                    token
                ) as any;
                return { note: 'Tail logs require WebSocket; showing analytics instead', analytics };
            } catch {
                return { note: 'Analytics not available for this worker', script: args.script_name };
            }
        }

        case 'get_account_analytics': {
            const now = new Date();
            const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
            const to = now.toISOString();
            try {
                const analytics = await cfApi(
                    `/accounts/${accountId}/analytics/dashboard?since=${from}&until=${to}`,
                    token
                ) as any;
                return { totals: analytics?.totals, uniques: analytics?.uniques };
            } catch {
                return { note: 'Analytics query failed — check account permissions' };
            }
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'cloudflare-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'cloudflare-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            // Read secrets from injected headers (underscores in key_name → hyphens in header)
            const token = request.headers.get('X-Mcp-Secret-CF-API-TOKEN');
            const accountId = request.headers.get('X-Mcp-Secret-CF-ACCOUNT-ID');

            if (!token) return rpcErr(id, -32001, 'Missing CF_API_TOKEN secret — add it to workspace secrets');
            if (!accountId) return rpcErr(id, -32001, 'Missing CF_ACCOUNT_ID secret — add it to workspace secrets');

            try {
                const result = await callTool(toolName, toolArgs, token, accountId);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
