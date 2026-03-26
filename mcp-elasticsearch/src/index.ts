// mcp-elasticsearch — Aerostack MCP Server
// Wraps the Elasticsearch REST API for search, indexing, and cluster management
// Secrets: X-Mcp-Secret-ELASTICSEARCH-URL, X-Mcp-Secret-ELASTICSEARCH-API-KEY

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Elasticsearch connectivity by querying the cluster root. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_indices',
        description: 'List all indices in the Elasticsearch cluster with stats (health, status, doc count, size)',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_mapping',
        description: 'Get the field mapping for an Elasticsearch index',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name' },
            },
            required: ['index'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search',
        description: 'Search documents in an index using Elasticsearch Query DSL',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name' },
                query: { type: 'object', description: 'Elasticsearch query DSL object (e.g. { "match": { "title": "hello" } })' },
                size: { type: 'number', description: 'Maximum documents to return (default: 10)' },
                from: { type: 'number', description: 'Offset for pagination (default: 0)' },
                sort: { type: 'array', description: 'Sort criteria, e.g. [{ "created_at": "desc" }]', items: { type: 'object' } },
                _source: { type: 'array', description: 'Fields to include in results', items: { type: 'string' } },
            },
            required: ['index'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'index_document',
        description: 'Index (create or replace) a document in an Elasticsearch index',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name' },
                id: { type: 'string', description: 'Document ID (optional — Elasticsearch generates one if omitted)' },
                document: { type: 'object', description: 'The document body to index' },
            },
            required: ['index', 'document'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_document',
        description: 'Get a single document by ID from an Elasticsearch index',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name' },
                id: { type: 'string', description: 'Document ID' },
            },
            required: ['index', 'id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_document',
        description: 'Partially update a document by ID in an Elasticsearch index',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name' },
                id: { type: 'string', description: 'Document ID' },
                doc: { type: 'object', description: 'Partial document with fields to update' },
            },
            required: ['index', 'id', 'doc'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_document',
        description: 'Delete a document by ID from an Elasticsearch index',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name' },
                id: { type: 'string', description: 'Document ID' },
            },
            required: ['index', 'id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'bulk',
        description: 'Execute bulk indexing operations (index, create, update, delete) in a single request',
        inputSchema: {
            type: 'object',
            properties: {
                operations: {
                    type: 'array',
                    description: 'Array of bulk operation objects. Each item is { action: "index"|"create"|"update"|"delete", index: string, id?: string, doc?: object }',
                    items: { type: 'object' },
                },
            },
            required: ['operations'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'count',
        description: 'Count documents in an index, optionally matching a query',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name' },
                query: { type: 'object', description: 'Optional Elasticsearch query DSL to filter counted documents' },
            },
            required: ['index'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_index',
        description: 'Create a new Elasticsearch index with optional mappings and settings',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name to create' },
                mappings: { type: 'object', description: 'Optional field mappings, e.g. { "properties": { "title": { "type": "text" } } }' },
                settings: { type: 'object', description: 'Optional index settings, e.g. { "number_of_shards": 1 }' },
            },
            required: ['index'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_index',
        description: 'Delete an Elasticsearch index and all its documents',
        inputSchema: {
            type: 'object',
            properties: {
                index: { type: 'string', description: 'Index name to delete' },
            },
            required: ['index'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'cluster_health',
        description: 'Get the health status of the Elasticsearch cluster (green/yellow/red)',
        inputSchema: { type: 'object', properties: {}, required: [] },
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
    esUrl: string,
    apiKey: string,
) {
    const base = esUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {
        'Authorization': `ApiKey ${apiKey}`,
        'Content-Type': 'application/json',
    };

    switch (name) {
        case '_ping': {
            const res = await fetch(`${base}/`, { headers });
            if (!res.ok) throw new Error(`Elasticsearch returned ${res.status}: ${await res.text()}`);
            const data = await res.json() as { cluster_name?: string; version?: { number?: string } };
            return text(`Connected to Elasticsearch cluster "${data.cluster_name}" (v${data.version?.number})`);
        }

        case 'list_indices': {
            const res = await fetch(`${base}/_cat/indices?format=json`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'get_mapping': {
            const index = args.index as string;
            const res = await fetch(`${base}/${encodeURIComponent(index)}/_mapping`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'search': {
            const index = args.index as string;
            const body: Record<string, unknown> = {};
            if (args.query) body.query = args.query;
            if (args.size !== undefined) body.size = args.size;
            if (args.from !== undefined) body.from = args.from;
            if (args.sort) body.sort = args.sort;
            if (args._source) body._source = args._source;
            const res = await fetch(`${base}/${encodeURIComponent(index)}/_search`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { hits?: { total?: unknown; hits?: unknown[] } };
            return json({ total: data.hits?.total, hits: data.hits?.hits });
        }

        case 'index_document': {
            const index = args.index as string;
            const id = args.id as string | undefined;
            const doc = args.document as object;
            const url = id
                ? `${base}/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`
                : `${base}/${encodeURIComponent(index)}/_doc`;
            const method = id ? 'PUT' : 'POST';
            const res = await fetch(url, { method, headers, body: JSON.stringify(doc) });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'get_document': {
            const index = args.index as string;
            const id = args.id as string;
            const res = await fetch(`${base}/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'update_document': {
            const index = args.index as string;
            const id = args.id as string;
            const doc = args.doc as object;
            const res = await fetch(`${base}/${encodeURIComponent(index)}/_update/${encodeURIComponent(id)}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ doc }),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete_document': {
            const index = args.index as string;
            const id = args.id as string;
            const res = await fetch(`${base}/${encodeURIComponent(index)}/_doc/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'bulk': {
            const operations = args.operations as Array<{
                action: string;
                index: string;
                id?: string;
                doc?: object;
            }>;
            // Build NDJSON bulk body
            const lines: string[] = [];
            for (const op of operations) {
                const meta: Record<string, unknown> = { _index: op.index };
                if (op.id) meta._id = op.id;
                if (op.action === 'update') {
                    lines.push(JSON.stringify({ update: meta }));
                    lines.push(JSON.stringify({ doc: op.doc }));
                } else if (op.action === 'delete') {
                    lines.push(JSON.stringify({ delete: meta }));
                } else {
                    // index or create
                    lines.push(JSON.stringify({ [op.action]: meta }));
                    lines.push(JSON.stringify(op.doc || {}));
                }
            }
            const ndjson = lines.join('\n') + '\n';
            const res = await fetch(`${base}/_bulk`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/x-ndjson' },
                body: ndjson,
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'count': {
            const index = args.index as string;
            const body: Record<string, unknown> = {};
            if (args.query) body.query = args.query;
            const hasBody = Object.keys(body).length > 0;
            const res = await fetch(`${base}/${encodeURIComponent(index)}/_count`, {
                method: hasBody ? 'POST' : 'GET',
                headers,
                ...(hasBody ? { body: JSON.stringify(body) } : {}),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'create_index': {
            const index = args.index as string;
            const body: Record<string, unknown> = {};
            if (args.mappings) body.mappings = args.mappings;
            if (args.settings) body.settings = args.settings;
            const res = await fetch(`${base}/${encodeURIComponent(index)}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete_index': {
            const index = args.index as string;
            const res = await fetch(`${base}/${encodeURIComponent(index)}`, {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'cluster_health': {
            const res = await fetch(`${base}/_cluster/health`, { headers });
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
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-elasticsearch' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const esUrl = request.headers.get('X-Mcp-Secret-ELASTICSEARCH-URL') || '';
        const apiKey = request.headers.get('X-Mcp-Secret-ELASTICSEARCH-API-KEY') || '';

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
                    serverInfo: { name: 'mcp-elasticsearch', version: '1.0.0' },
                },
            });
        }

        if (method === 'tools/list') {
            return Response.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        }

        if (method === 'tools/call') {
            if (!esUrl || !apiKey) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32001, message: 'Missing secrets: ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY required' },
                });
            }
            const { name, arguments: args = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, args, esUrl, apiKey);
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
