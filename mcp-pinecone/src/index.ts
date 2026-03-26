// mcp-pinecone — Aerostack MCP Server
// Wraps the Pinecone REST API for vector database operations
// Secrets: X-Mcp-Secret-PINECONE-API-KEY

const CONTROL_PLANE = 'https://api.pinecone.io';

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Pinecone connectivity by listing indexes. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_indexes',
        description: 'List all Pinecone indexes with their status, dimension, metric, and host',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'describe_index',
        description: 'Get detailed information about a specific Pinecone index including host, dimension, metric, pod type, and status',
        inputSchema: {
            type: 'object',
            properties: {
                index_name: { type: 'string', description: 'Name of the index to describe' },
            },
            required: ['index_name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'query',
        description: 'Query vectors by vector values or by ID. Returns the most similar vectors with optional metadata and values.',
        inputSchema: {
            type: 'object',
            properties: {
                index_host: { type: 'string', description: 'Index host (e.g. "my-index-abc123.svc.pinecone.io"). Get this from describe_index.' },
                namespace: { type: 'string', description: 'Namespace to query within (default: "")' },
                vector: { type: 'array', items: { type: 'number' }, description: 'Query vector values. Required if id is not provided.' },
                id: { type: 'string', description: 'Query by vector ID instead of vector values' },
                topK: { type: 'number', description: 'Number of results to return (default: 10)' },
                filter: { type: 'object', description: 'Metadata filter object (Pinecone filter syntax)' },
                includeMetadata: { type: 'boolean', description: 'Whether to include metadata in results (default: true)' },
                includeValues: { type: 'boolean', description: 'Whether to include vector values in results (default: false)' },
            },
            required: ['index_host'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'upsert',
        description: 'Upsert vectors into a Pinecone index. Each vector needs an id, values array, and optional metadata.',
        inputSchema: {
            type: 'object',
            properties: {
                index_host: { type: 'string', description: 'Index host from describe_index' },
                namespace: { type: 'string', description: 'Namespace to upsert into (default: "")' },
                vectors: {
                    type: 'array',
                    description: 'Array of vectors to upsert',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'Unique vector ID' },
                            values: { type: 'array', items: { type: 'number' }, description: 'Vector values' },
                            metadata: { type: 'object', description: 'Optional metadata key/value pairs' },
                        },
                        required: ['id', 'values'],
                    },
                },
            },
            required: ['index_host', 'vectors'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'fetch',
        description: 'Fetch vectors by their IDs from a Pinecone index',
        inputSchema: {
            type: 'object',
            properties: {
                index_host: { type: 'string', description: 'Index host from describe_index' },
                namespace: { type: 'string', description: 'Namespace to fetch from (default: "")' },
                ids: { type: 'array', items: { type: 'string' }, description: 'Array of vector IDs to fetch' },
            },
            required: ['index_host', 'ids'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_vectors',
        description: 'Delete vectors by IDs, by metadata filter, or delete all vectors in a namespace',
        inputSchema: {
            type: 'object',
            properties: {
                index_host: { type: 'string', description: 'Index host from describe_index' },
                namespace: { type: 'string', description: 'Namespace to delete from (default: "")' },
                ids: { type: 'array', items: { type: 'string' }, description: 'Vector IDs to delete' },
                filter: { type: 'object', description: 'Metadata filter to select vectors for deletion' },
                deleteAll: { type: 'boolean', description: 'Delete all vectors in the namespace' },
            },
            required: ['index_host'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'describe_stats',
        description: 'Get index statistics including total vector count, dimension, and per-namespace counts',
        inputSchema: {
            type: 'object',
            properties: {
                index_host: { type: 'string', description: 'Index host from describe_index' },
                filter: { type: 'object', description: 'Optional metadata filter to get stats for matching vectors only' },
            },
            required: ['index_host'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_vectors',
        description: 'List vector IDs in a namespace with optional pagination. Returns IDs only, not values.',
        inputSchema: {
            type: 'object',
            properties: {
                index_host: { type: 'string', description: 'Index host from describe_index' },
                namespace: { type: 'string', description: 'Namespace to list from (default: "")' },
                prefix: { type: 'string', description: 'ID prefix to filter by' },
                limit: { type: 'number', description: 'Maximum number of IDs to return (default: 100)' },
                paginationToken: { type: 'string', description: 'Token for fetching the next page of results' },
            },
            required: ['index_host'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_vector',
        description: 'Update a vector\'s values, metadata, or both by ID',
        inputSchema: {
            type: 'object',
            properties: {
                index_host: { type: 'string', description: 'Index host from describe_index' },
                namespace: { type: 'string', description: 'Namespace of the vector (default: "")' },
                id: { type: 'string', description: 'ID of the vector to update' },
                values: { type: 'array', items: { type: 'number' }, description: 'New vector values' },
                setMetadata: { type: 'object', description: 'Metadata fields to set or update (merged with existing)' },
            },
            required: ['index_host', 'id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
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
    apiKey: string,
) {
    const controlHeaders: Record<string, string> = {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
    };

    function dataHeaders(): Record<string, string> {
        return { 'Api-Key': apiKey, 'Content-Type': 'application/json' };
    }

    function requireHost(): string {
        const host = args.index_host as string | undefined;
        if (!host) throw new Error('Missing required parameter: index_host (get it from describe_index)');
        return host.replace(/^https?:\/\//, '');
    }

    switch (name) {
        case '_ping': {
            const res = await fetch(`${CONTROL_PLANE}/indexes`, { headers: controlHeaders });
            if (!res.ok) throw new Error(`Pinecone returned ${res.status}: ${await res.text()}`);
            return text('Connected to Pinecone successfully');
        }

        case 'list_indexes': {
            const res = await fetch(`${CONTROL_PLANE}/indexes`, { headers: controlHeaders });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'describe_index': {
            const indexName = args.index_name as string;
            if (!indexName) return text('Error: index_name is required');
            const res = await fetch(`${CONTROL_PLANE}/indexes/${indexName}`, { headers: controlHeaders });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'query': {
            const host = requireHost();
            const body: Record<string, unknown> = {
                topK: (args.topK as number) || 10,
                includeMetadata: args.includeMetadata !== false,
                includeValues: args.includeValues === true,
            };
            if (args.vector) body.vector = args.vector;
            if (args.id) body.id = args.id;
            if (args.namespace) body.namespace = args.namespace;
            if (args.filter) body.filter = args.filter;
            if (!body.vector && !body.id) return text('Error: either vector or id is required for query');

            const res = await fetch(`https://${host}/query`, {
                method: 'POST',
                headers: dataHeaders(),
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'upsert': {
            const host = requireHost();
            const vectors = args.vectors as unknown[];
            if (!vectors || !vectors.length) return text('Error: vectors array is required and must not be empty');

            const body: Record<string, unknown> = { vectors };
            if (args.namespace) body.namespace = args.namespace;

            const res = await fetch(`https://${host}/vectors/upsert`, {
                method: 'POST',
                headers: dataHeaders(),
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'fetch': {
            const host = requireHost();
            const ids = args.ids as string[];
            if (!ids || !ids.length) return text('Error: ids array is required');

            const params = new URLSearchParams();
            for (const id of ids) params.append('ids', id);
            if (args.namespace) params.set('namespace', args.namespace as string);

            const res = await fetch(`https://${host}/vectors/fetch?${params}`, {
                headers: dataHeaders(),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete_vectors': {
            const host = requireHost();
            const body: Record<string, unknown> = {};
            if (args.ids) body.ids = args.ids;
            if (args.filter) body.filter = args.filter;
            if (args.deleteAll) body.deleteAll = true;
            if (args.namespace) body.namespace = args.namespace;

            if (!body.ids && !body.filter && !body.deleteAll) {
                return text('Error: provide ids, filter, or deleteAll to specify which vectors to delete');
            }

            const res = await fetch(`https://${host}/vectors/delete`, {
                method: 'POST',
                headers: dataHeaders(),
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'describe_stats': {
            const host = requireHost();
            const body: Record<string, unknown> = {};
            if (args.filter) body.filter = args.filter;

            const res = await fetch(`https://${host}/describe_index_stats`, {
                method: 'POST',
                headers: dataHeaders(),
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'list_vectors': {
            const host = requireHost();
            const params = new URLSearchParams();
            if (args.namespace) params.set('namespace', args.namespace as string);
            if (args.prefix) params.set('prefix', args.prefix as string);
            if (args.limit) params.set('limit', String(args.limit));
            if (args.paginationToken) params.set('paginationToken', args.paginationToken as string);

            const res = await fetch(`https://${host}/vectors/list?${params}`, {
                headers: dataHeaders(),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'update_vector': {
            const host = requireHost();
            const id = args.id as string;
            if (!id) return text('Error: id is required');

            const body: Record<string, unknown> = { id };
            if (args.values) body.values = args.values;
            if (args.setMetadata) body.setMetadata = args.setMetadata;
            if (args.namespace) body.namespace = args.namespace;

            if (!body.values && !body.setMetadata) {
                return text('Error: provide values, setMetadata, or both to update');
            }

            const res = await fetch(`https://${host}/vectors/update`, {
                method: 'POST',
                headers: dataHeaders(),
                body: JSON.stringify(body),
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
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-pinecone' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const apiKey = request.headers.get('X-Mcp-Secret-PINECONE-API-KEY') || '';

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
                    serverInfo: { name: 'mcp-pinecone', version: '1.0.0' },
                },
            });
        }

        if (method === 'tools/list') {
            return Response.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        }

        if (method === 'tools/call') {
            if (!apiKey) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32001, message: 'Missing secret: PINECONE_API_KEY required' },
                });
            }
            const { name, arguments: args = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, args, apiKey);
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
