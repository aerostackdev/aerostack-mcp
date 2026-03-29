// mcp-milvus — Aerostack MCP Server
// Wraps the Zilliz Cloud / Milvus REST API v2 for vector database operations
// Secrets: X-Mcp-Secret-MILVUS-ENDPOINT, X-Mcp-Secret-MILVUS-TOKEN

const TOOLS = [
    {
        name: 'list_collections',
        description: 'List all collections in the Milvus/Zilliz database',
        inputSchema: {
            type: 'object',
            properties: {
                dbName: { type: 'string', description: 'Database name (default: "default")' },
            },
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'describe_collection',
        description: 'Get detailed schema and metadata for a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collectionName: { type: 'string', description: 'Name of the collection' },
                dbName: { type: 'string', description: 'Database name (default: "default")' },
            },
            required: ['collectionName'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_collection',
        description: 'Create a new vector collection with specified dimensions',
        inputSchema: {
            type: 'object',
            properties: {
                collectionName: { type: 'string', description: 'Name for the new collection' },
                dimension: { type: 'number', description: 'Vector dimension size (e.g. 1536 for OpenAI ada-002)' },
                metricType: { type: 'string', description: 'Distance metric: COSINE, L2, or IP (default: COSINE)' },
                primaryFieldName: { type: 'string', description: 'Name for the primary key field (default: "id")' },
                vectorFieldName: { type: 'string', description: 'Name for the vector field (default: "vector")' },
                dbName: { type: 'string', description: 'Database name (default: "default")' },
            },
            required: ['collectionName', 'dimension'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'drop_collection',
        description: 'Drop (delete) a collection and all its data',
        inputSchema: {
            type: 'object',
            properties: {
                collectionName: { type: 'string', description: 'Name of the collection to drop' },
                dbName: { type: 'string', description: 'Database name (default: "default")' },
            },
            required: ['collectionName'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'insert',
        description: 'Insert entities/vectors into a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collectionName: { type: 'string', description: 'Collection name' },
                data: {
                    type: 'array',
                    description: 'Array of entity objects to insert, each containing field values including the vector',
                    items: { type: 'object' },
                },
                dbName: { type: 'string', description: 'Database name (default: "default")' },
            },
            required: ['collectionName', 'data'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'search',
        description: 'Search for similar vectors in a collection using ANN (Approximate Nearest Neighbor)',
        inputSchema: {
            type: 'object',
            properties: {
                collectionName: { type: 'string', description: 'Collection name' },
                data: {
                    type: 'array',
                    description: 'Array of query vectors (each vector is an array of numbers)',
                    items: { type: 'array', items: { type: 'number' } },
                },
                limit: { type: 'number', description: 'Number of results to return (default: 10)' },
                outputFields: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Fields to include in results',
                },
                dbName: { type: 'string', description: 'Database name (default: "default")' },
            },
            required: ['collectionName', 'data'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'query',
        description: 'Query entities from a collection using a scalar filter expression',
        inputSchema: {
            type: 'object',
            properties: {
                collectionName: { type: 'string', description: 'Collection name' },
                filter: { type: 'string', description: 'Filter expression (e.g. "id in [1, 2, 3]" or "age > 18")' },
                limit: { type: 'number', description: 'Maximum number of results (default: 100)' },
                outputFields: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Fields to include in results',
                },
                dbName: { type: 'string', description: 'Database name (default: "default")' },
            },
            required: ['collectionName', 'filter'],
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

async function callTool(
    name: string,
    args: Record<string, unknown>,
    endpoint: string,
    token: string,
) {
    const base = endpoint.replace(/\/$/, '');
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };

    switch (name) {
        case 'list_collections': {
            const body: Record<string, unknown> = { dbName: (args.dbName as string) || 'default' };
            const res = await fetch(`${base}/v2/vectordb/collections/list`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'describe_collection': {
            const collectionName = args.collectionName as string;
            if (!collectionName) return text('Error: "collectionName" is required');
            const body: Record<string, unknown> = {
                collectionName,
                dbName: (args.dbName as string) || 'default',
            };
            const res = await fetch(`${base}/v2/vectordb/collections/describe`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'create_collection': {
            const collectionName = args.collectionName as string;
            const dimension = args.dimension as number;
            if (!collectionName || !dimension) return text('Error: "collectionName" and "dimension" are required');
            const body: Record<string, unknown> = {
                collectionName,
                dimension,
                metricType: (args.metricType as string) || 'COSINE',
                primaryFieldName: (args.primaryFieldName as string) || 'id',
                vectorFieldName: (args.vectorFieldName as string) || 'vector',
                dbName: (args.dbName as string) || 'default',
            };
            const res = await fetch(`${base}/v2/vectordb/collections/create`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'drop_collection': {
            const collectionName = args.collectionName as string;
            if (!collectionName) return text('Error: "collectionName" is required');
            const body: Record<string, unknown> = {
                collectionName,
                dbName: (args.dbName as string) || 'default',
            };
            const res = await fetch(`${base}/v2/vectordb/collections/drop`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'insert': {
            const collectionName = args.collectionName as string;
            const data = args.data as object[];
            if (!collectionName || !data) return text('Error: "collectionName" and "data" are required');
            const body: Record<string, unknown> = {
                collectionName,
                data,
                dbName: (args.dbName as string) || 'default',
            };
            const res = await fetch(`${base}/v2/vectordb/entities/insert`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'search': {
            const collectionName = args.collectionName as string;
            const data = args.data as number[][];
            if (!collectionName || !data) return text('Error: "collectionName" and "data" are required');
            const body: Record<string, unknown> = {
                collectionName,
                data,
                dbName: (args.dbName as string) || 'default',
            };
            if (args.limit) body.limit = args.limit;
            if (args.outputFields) body.outputFields = args.outputFields;
            const res = await fetch(`${base}/v2/vectordb/entities/search`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'query': {
            const collectionName = args.collectionName as string;
            const filter = args.filter as string;
            if (!collectionName || !filter) return text('Error: "collectionName" and "filter" are required');
            const body: Record<string, unknown> = {
                collectionName,
                filter,
                dbName: (args.dbName as string) || 'default',
            };
            if (args.limit) body.limit = args.limit;
            if (args.outputFields) body.outputFields = args.outputFields;
            const res = await fetch(`${base}/v2/vectordb/entities/query`, {
                method: 'POST',
                headers,
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
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-milvus', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const endpoint = request.headers.get('X-Mcp-Secret-MILVUS-ENDPOINT') || '';
        const token = request.headers.get('X-Mcp-Secret-MILVUS-TOKEN') || '';

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;
        const rpcId = id as number | string;

        if (method === 'initialize') {
            return rpcOk(rpcId, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-milvus', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(rpcId, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            if (!endpoint || !token) {
                return rpcErr(rpcId, -32001, 'Missing secrets: MILVUS_ENDPOINT and MILVUS_TOKEN are required');
            }
            const { name, arguments: toolArgs = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, toolArgs, endpoint, token);
                return rpcOk(rpcId, result);
            } catch (err) {
                return rpcErr(rpcId, -32603, String(err));
            }
        }

        return rpcErr(rpcId, -32601, `Method not found: ${method}`);
    },
};
