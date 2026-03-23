/**
 * Coda MCP Worker
 * Implements MCP protocol over HTTP for Coda API v1 operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: CODA_API_TOKEN -> header: X-Mcp-Secret-CODA-API-TOKEN
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-coda
 */

const CODA_API = 'https://coda.io/apis/v1';

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
        name: '_ping',
        description: 'Health check — returns { ok: true } if the server and API token are working',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'list_docs',
        description: 'List Coda docs accessible to the authenticated user, with optional search',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query to filter docs by name (optional)' },
                limit: { type: 'number', description: 'Max docs to return (default 25, max 100)' },
            },
        },
    },
    {
        name: 'get_doc',
        description: 'Get detailed information about a specific Coda doc',
        inputSchema: {
            type: 'object',
            properties: {
                doc_id: { type: 'string', description: 'Coda doc ID' },
            },
            required: ['doc_id'],
        },
    },
    {
        name: 'list_tables',
        description: 'List all tables in a Coda doc',
        inputSchema: {
            type: 'object',
            properties: {
                doc_id: { type: 'string', description: 'Coda doc ID' },
            },
            required: ['doc_id'],
        },
    },
    {
        name: 'get_table_rows',
        description: 'Get rows from a Coda table with optional query filter, sort, and limit',
        inputSchema: {
            type: 'object',
            properties: {
                doc_id: { type: 'string', description: 'Coda doc ID' },
                table_id: { type: 'string', description: 'Table ID or name' },
                query: { type: 'string', description: 'Filter formula to search rows (optional)' },
                sort_by: { type: 'string', description: 'Column ID or name to sort by (optional)' },
                sort_direction: { type: 'string', enum: ['ascending', 'descending'], description: 'Sort direction (optional, default ascending)' },
                limit: { type: 'number', description: 'Max rows to return (default 25, max 500)' },
            },
            required: ['doc_id', 'table_id'],
        },
    },
    {
        name: 'insert_rows',
        description: 'Insert one or more rows into a Coda table',
        inputSchema: {
            type: 'object',
            properties: {
                doc_id: { type: 'string', description: 'Coda doc ID' },
                table_id: { type: 'string', description: 'Table ID or name' },
                rows: {
                    type: 'array',
                    description: 'Array of row objects. Each row is { cells: [{ column: "Column Name", value: "cell value" }, ...] }',
                    items: {
                        type: 'object',
                        properties: {
                            cells: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        column: { type: 'string' },
                                        value: {},
                                    },
                                    required: ['column', 'value'],
                                },
                            },
                        },
                        required: ['cells'],
                    },
                },
            },
            required: ['doc_id', 'table_id', 'rows'],
        },
    },
    {
        name: 'update_row',
        description: 'Update an existing row in a Coda table',
        inputSchema: {
            type: 'object',
            properties: {
                doc_id: { type: 'string', description: 'Coda doc ID' },
                table_id: { type: 'string', description: 'Table ID or name' },
                row_id: { type: 'string', description: 'Row ID to update' },
                cells: {
                    type: 'array',
                    description: 'Array of cell updates: [{ column: "Column Name", value: "new value" }, ...]',
                    items: {
                        type: 'object',
                        properties: {
                            column: { type: 'string' },
                            value: {},
                        },
                        required: ['column', 'value'],
                    },
                },
            },
            required: ['doc_id', 'table_id', 'row_id', 'cells'],
        },
    },
    {
        name: 'delete_row',
        description: 'Delete a row from a Coda table',
        inputSchema: {
            type: 'object',
            properties: {
                doc_id: { type: 'string', description: 'Coda doc ID' },
                table_id: { type: 'string', description: 'Table ID or name' },
                row_id: { type: 'string', description: 'Row ID to delete' },
            },
            required: ['doc_id', 'table_id', 'row_id'],
        },
    },
    {
        name: 'list_formulas',
        description: 'List all named formulas in a Coda doc',
        inputSchema: {
            type: 'object',
            properties: {
                doc_id: { type: 'string', description: 'Coda doc ID' },
            },
            required: ['doc_id'],
        },
    },
    {
        name: 'list_controls',
        description: 'List all controls (buttons, sliders, inputs) in a Coda doc',
        inputSchema: {
            type: 'object',
            properties: {
                doc_id: { type: 'string', description: 'Coda doc ID' },
            },
            required: ['doc_id'],
        },
    },
];

async function coda(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${CODA_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`Coda API ${res.status}: ${err.message ?? err.statusMessage ?? 'unknown'}`);
    }
    if (res.status === 204) return {};
    return res.json();
}

function enc(s: string) {
    return encodeURIComponent(s);
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await coda('/whoami', token) as any;
            return { ok: true, name: data.name, login_id: data.loginId };
        }

        case 'list_docs': {
            const params = new URLSearchParams();
            if (args.query) params.set('query', String(args.query));
            params.set('limit', String(Math.min(Number(args.limit ?? 25), 100)));
            const qs = params.toString();
            const data = await coda(`/docs${qs ? `?${qs}` : ''}`, token) as any;
            return data.items?.map((d: any) => ({
                id: d.id,
                name: d.name,
                owner: d.owner,
                created_at: d.createdAt,
                updated_at: d.updatedAt,
                folder: d.folder?.name ?? null,
            })) ?? [];
        }

        case 'get_doc': {
            const data = await coda(`/docs/${enc(String(args.doc_id))}`, token) as any;
            return {
                id: data.id,
                name: data.name,
                owner: data.owner,
                created_at: data.createdAt,
                updated_at: data.updatedAt,
                doc_size: data.docSize,
                source_doc: data.sourceDoc ?? null,
                folder: data.folder?.name ?? null,
            };
        }

        case 'list_tables': {
            const data = await coda(`/docs/${enc(String(args.doc_id))}/tables`, token) as any;
            return data.items?.map((t: any) => ({
                id: t.id,
                name: t.name,
                type: t.tableType,
                row_count: t.rowCount,
                parent_table_id: t.parentTableId ?? null,
            })) ?? [];
        }

        case 'get_table_rows': {
            const params = new URLSearchParams();
            params.set('limit', String(Math.min(Number(args.limit ?? 25), 500)));
            params.set('useColumnNames', 'true');
            if (args.query) params.set('query', String(args.query));
            if (args.sort_by) {
                params.set('sortBy', String(args.sort_by));
                if (args.sort_direction) params.set('direction', String(args.sort_direction));
            }
            const data = await coda(
                `/docs/${enc(String(args.doc_id))}/tables/${enc(String(args.table_id))}/rows?${params}`,
                token,
            ) as any;
            return {
                rows: data.items?.map((r: any) => ({
                    id: r.id,
                    name: r.name,
                    index: r.index,
                    values: r.values,
                    created_at: r.createdAt,
                    updated_at: r.updatedAt,
                })) ?? [],
                has_more: !!data.nextPageToken,
            };
        }

        case 'insert_rows': {
            const data = await coda(
                `/docs/${enc(String(args.doc_id))}/tables/${enc(String(args.table_id))}/rows`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        rows: args.rows,
                        keyColumns: [],
                    }),
                },
            ) as any;
            return {
                request_id: data.requestId,
                added_row_ids: data.addedRowIds ?? [],
            };
        }

        case 'update_row': {
            const data = await coda(
                `/docs/${enc(String(args.doc_id))}/tables/${enc(String(args.table_id))}/rows/${enc(String(args.row_id))}`,
                token,
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        row: { cells: args.cells },
                    }),
                },
            ) as any;
            return { request_id: data.requestId, id: data.id };
        }

        case 'delete_row': {
            await coda(
                `/docs/${enc(String(args.doc_id))}/tables/${enc(String(args.table_id))}/rows/${enc(String(args.row_id))}`,
                token,
                { method: 'DELETE' },
            );
            return { deleted: true, row_id: args.row_id };
        }

        case 'list_formulas': {
            const data = await coda(`/docs/${enc(String(args.doc_id))}/formulas`, token) as any;
            return data.items?.map((f: any) => ({
                id: f.id,
                name: f.name,
                value: f.value,
            })) ?? [];
        }

        case 'list_controls': {
            const data = await coda(`/docs/${enc(String(args.doc_id))}/controls`, token) as any;
            return data.items?.map((c: any) => ({
                id: c.id,
                name: c.name,
                type: c.controlType,
                value: c.value,
            })) ?? [];
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'coda-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'coda-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-CODA-API-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing CODA_API_TOKEN secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
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
