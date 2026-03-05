/**
 * Airtable MCP Worker
 * Implements MCP protocol over HTTP for Airtable API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: AIRTABLE_API_KEY → header: X-Mcp-Secret-AIRTABLE-API-KEY
 *
 * Source: https://github.com/aerostackdev/aerostack-mcp/tree/main/workers/mcp-airtable
 */

const AIRTABLE_API = 'https://api.airtable.com/v0';

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
        name: 'list_bases',
        description: 'List all Airtable bases the authenticated user has access to',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'list_tables',
        description: 'List tables in an Airtable base with their field schemas',
        inputSchema: {
            type: 'object',
            properties: {
                base_id: { type: 'string', description: 'Airtable base ID (appXXX format)' },
            },
            required: ['base_id'],
        },
    },
    {
        name: 'list_records',
        description: 'List records from an Airtable table with optional filtering and sorting',
        inputSchema: {
            type: 'object',
            properties: {
                base_id: { type: 'string', description: 'Airtable base ID (appXXX format)' },
                table_name: { type: 'string', description: 'Table name or table ID' },
                filter_formula: { type: 'string', description: "Airtable filter formula (e.g. \"{Status}='Active'\") (optional)" },
                max_records: { type: 'number', description: 'Max records to return (default 10, max 100)' },
                sort_field: { type: 'string', description: 'Field name to sort by (optional)' },
                sort_direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction (optional, default asc)' },
            },
            required: ['base_id', 'table_name'],
        },
    },
    {
        name: 'get_record',
        description: 'Get a single record from an Airtable table by its ID',
        inputSchema: {
            type: 'object',
            properties: {
                base_id: { type: 'string', description: 'Airtable base ID' },
                table_name: { type: 'string', description: 'Table name or ID' },
                record_id: { type: 'string', description: 'Record ID (recXXX format)' },
            },
            required: ['base_id', 'table_name', 'record_id'],
        },
    },
    {
        name: 'create_record',
        description: 'Create a new record in an Airtable table',
        inputSchema: {
            type: 'object',
            properties: {
                base_id: { type: 'string', description: 'Airtable base ID' },
                table_name: { type: 'string', description: 'Table name or ID' },
                fields: { type: 'object', description: 'Record fields as a key-value object (field name → value)' },
            },
            required: ['base_id', 'table_name', 'fields'],
        },
    },
    {
        name: 'update_record',
        description: 'Update specific fields of an existing record in Airtable (other fields untouched)',
        inputSchema: {
            type: 'object',
            properties: {
                base_id: { type: 'string', description: 'Airtable base ID' },
                table_name: { type: 'string', description: 'Table name or ID' },
                record_id: { type: 'string', description: 'Record ID to update (recXXX format)' },
                fields: { type: 'object', description: 'Fields to update as key-value object' },
            },
            required: ['base_id', 'table_name', 'record_id', 'fields'],
        },
    },
    {
        name: 'search_records',
        description: 'Search records in an Airtable table using a filter formula',
        inputSchema: {
            type: 'object',
            properties: {
                base_id: { type: 'string', description: 'Airtable base ID' },
                table_name: { type: 'string', description: 'Table name or ID' },
                search_field: { type: 'string', description: 'Field name to search in' },
                search_value: { type: 'string', description: 'Value to search for' },
                max_records: { type: 'number', description: 'Max results (default 10)' },
            },
            required: ['base_id', 'table_name', 'search_field', 'search_value'],
        },
    },
];

async function at(path: string, key: string, opts: RequestInit = {}) {
    const res = await fetch(`${AIRTABLE_API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(`Airtable API ${res.status}: ${err.error?.message ?? err.error?.type ?? 'unknown'}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, key: string): Promise<unknown> {
    switch (name) {
        case 'list_bases': {
            const data = await at('/meta/bases', key) as any;
            return data.bases?.map((b: any) => ({
                id: b.id,
                name: b.name,
                permission_level: b.permissionLevel,
            })) ?? [];
        }

        case 'list_tables': {
            const data = await at(`/meta/bases/${args.base_id}/tables`, key) as any;
            return data.tables?.map((t: any) => ({
                id: t.id,
                name: t.name,
                primary_field: t.primaryFieldId,
                fields: t.fields?.map((f: any) => ({ id: f.id, name: f.name, type: f.type })) ?? [],
                views_count: t.views?.length ?? 0,
            })) ?? [];
        }

        case 'list_records': {
            const params = new URLSearchParams({
                maxRecords: String(Math.min(Number(args.max_records ?? 10), 100)),
            });
            if (args.filter_formula) params.set('filterByFormula', String(args.filter_formula));
            if (args.sort_field) {
                params.set('sort[0][field]', String(args.sort_field));
                params.set('sort[0][direction]', String(args.sort_direction ?? 'asc'));
            }
            const data = await at(`/${args.base_id}/${encodeURIComponent(String(args.table_name))}?${params}`, key) as any;
            return {
                records: data.records?.map((r: any) => ({ id: r.id, fields: r.fields, created_time: r.createdTime })) ?? [],
                has_more: !!data.offset,
            };
        }

        case 'get_record': {
            const data = await at(`/${args.base_id}/${encodeURIComponent(String(args.table_name))}/${args.record_id}`, key) as any;
            return { id: data.id, fields: data.fields, created_time: data.createdTime };
        }

        case 'create_record': {
            const data = await at(`/${args.base_id}/${encodeURIComponent(String(args.table_name))}`, key, {
                method: 'POST',
                body: JSON.stringify({ fields: args.fields }),
            }) as any;
            return { id: data.id, fields: data.fields, created_time: data.createdTime };
        }

        case 'update_record': {
            const data = await at(`/${args.base_id}/${encodeURIComponent(String(args.table_name))}/${args.record_id}`, key, {
                method: 'PATCH',
                body: JSON.stringify({ fields: args.fields }),
            }) as any;
            return { id: data.id, fields: data.fields };
        }

        case 'search_records': {
            const formula = `SEARCH(LOWER("${String(args.search_value).replace(/"/g, '\\"')}"), LOWER({${args.search_field}}))`;
            const params = new URLSearchParams({
                filterByFormula: formula,
                maxRecords: String(Math.min(Number(args.max_records ?? 10), 100)),
            });
            const data = await at(`/${args.base_id}/${encodeURIComponent(String(args.table_name))}?${params}`, key) as any;
            return data.records?.map((r: any) => ({ id: r.id, fields: r.fields })) ?? [];
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'airtable-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'airtable-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const key = request.headers.get('X-Mcp-Secret-AIRTABLE-API-KEY');
            if (!key) {
                return rpcErr(id, -32001, 'Missing AIRTABLE_API_KEY secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, key);
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
