// mcp-qdrant — Aerostack MCP Server
// Wraps the Qdrant REST API for vector database operations
// Secrets: X-Mcp-Secret-QDRANT-URL, X-Mcp-Secret-QDRANT-API-KEY

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Qdrant connectivity by querying the collections endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'list_collections',
        description: 'List all collections in the Qdrant database',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'get_collection',
        description: 'Get detailed info about a collection including vectors count, config, and status',
        inputSchema: {
            type: 'object',
            properties: {
                collection_name: { type: 'string', description: 'Name of the collection' },
            },
            required: ['collection_name'],
        },
    },
    {
        name: 'create_collection',
        description: 'Create a new collection with vector configuration',
        inputSchema: {
            type: 'object',
            properties: {
                collection_name: { type: 'string', description: 'Name of the collection to create' },
                vector_size: { type: 'number', description: 'Dimensionality of vectors (e.g. 1536 for OpenAI, 768 for Cohere)' },
                distance: { type: 'string', description: 'Distance metric: Cosine, Euclid, or Dot (default: Cosine)' },
            },
            required: ['collection_name', 'vector_size'],
        },
    },
    {
        name: 'delete_collection',
        description: 'Delete a collection and all its data',
        inputSchema: {
            type: 'object',
            properties: {
                collection_name: { type: 'string', description: 'Name of the collection to delete' },
            },
            required: ['collection_name'],
        },
    },
    {
        name: 'upsert_points',
        description: 'Upsert points (vectors + payload) into a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collection_name: { type: 'string', description: 'Name of the collection' },
                points: {
                    type: 'array',
                    description: 'Array of points to upsert. Each point: { id: string|number, vector: number[], payload?: object }',
                    items: { type: 'object' },
                },
            },
            required: ['collection_name', 'points'],
        },
    },
    {
        name: 'search',
        description: 'Search for similar vectors in a collection. Returns nearest neighbors ranked by similarity.',
        inputSchema: {
            type: 'object',
            properties: {
                collection_name: { type: 'string', description: 'Name of the collection to search' },
                vector: { type: 'array', items: { type: 'number' }, description: 'Query vector' },
                limit: { type: 'number', description: 'Maximum number of results (default: 10)' },
                filter: { type: 'object', description: 'Optional Qdrant filter object to narrow results' },
                with_payload: { type: 'boolean', description: 'Include payload in results (default: true)' },
                with_vectors: { type: 'boolean', description: 'Include vectors in results (default: false)' },
                score_threshold: { type: 'number', description: 'Minimum similarity score threshold' },
            },
            required: ['collection_name', 'vector'],
        },
    },
    {
        name: 'get_points',
        description: 'Get points by their IDs from a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collection_name: { type: 'string', description: 'Name of the collection' },
                ids: { type: 'array', description: 'Array of point IDs to retrieve', items: {} },
                with_payload: { type: 'boolean', description: 'Include payload in results (default: true)' },
                with_vectors: { type: 'boolean', description: 'Include vectors in results (default: false)' },
            },
            required: ['collection_name', 'ids'],
        },
    },
    {
        name: 'delete_points',
        description: 'Delete points by IDs or filter from a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collection_name: { type: 'string', description: 'Name of the collection' },
                ids: { type: 'array', description: 'Array of point IDs to delete', items: {} },
                filter: { type: 'object', description: 'Optional Qdrant filter object — delete all points matching this filter (used instead of ids)' },
            },
            required: ['collection_name'],
        },
    },
    {
        name: 'scroll',
        description: 'Scroll through points in a collection with optional filter and pagination',
        inputSchema: {
            type: 'object',
            properties: {
                collection_name: { type: 'string', description: 'Name of the collection' },
                filter: { type: 'object', description: 'Optional Qdrant filter object' },
                limit: { type: 'number', description: 'Maximum number of points per page (default: 10)' },
                offset: { description: 'Point ID to start scrolling from (for pagination)' },
                with_payload: { type: 'boolean', description: 'Include payload in results (default: true)' },
                with_vectors: { type: 'boolean', description: 'Include vectors in results (default: false)' },
            },
            required: ['collection_name'],
        },
    },
    {
        name: 'count',
        description: 'Count points in a collection with optional filter',
        inputSchema: {
            type: 'object',
            properties: {
                collection_name: { type: 'string', description: 'Name of the collection' },
                filter: { type: 'object', description: 'Optional Qdrant filter object to count only matching points' },
                exact: { type: 'boolean', description: 'If true, return exact count (slower). Default: true' },
            },
            required: ['collection_name'],
        },
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
    qdrantUrl: string,
    apiKey: string,
) {
    const base = qdrantUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {
        'api-key': apiKey,
        'Content-Type': 'application/json',
    };

    switch (name) {
        case '_ping': {
            const res = await fetch(`${base}/collections`, { headers });
            if (!res.ok) throw new Error(`Qdrant returned ${res.status}: ${await res.text()}`);
            const host = new URL(base).hostname.split('.')[0];
            return text(`Connected to Qdrant cluster "${host}"`);
        }

        case 'list_collections': {
            const res = await fetch(`${base}/collections`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'get_collection': {
            const colName = args.collection_name as string;
            if (!colName) return text('Error: collection_name is required');
            const res = await fetch(`${base}/collections/${encodeURIComponent(colName)}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'create_collection': {
            const colName = args.collection_name as string;
            if (!colName) return text('Error: collection_name is required');
            const vectorSize = args.vector_size as number;
            if (!vectorSize) return text('Error: vector_size is required');
            const distance = (args.distance as string) || 'Cosine';

            const res = await fetch(`${base}/collections/${encodeURIComponent(colName)}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    vectors: {
                        size: vectorSize,
                        distance,
                    },
                }),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete_collection': {
            const colName = args.collection_name as string;
            if (!colName) return text('Error: collection_name is required');
            const res = await fetch(`${base}/collections/${encodeURIComponent(colName)}`, {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'upsert_points': {
            const colName = args.collection_name as string;
            if (!colName) return text('Error: collection_name is required');
            const points = args.points as object[];
            if (!points || !points.length) return text('Error: points array is required and must not be empty');

            const res = await fetch(`${base}/collections/${encodeURIComponent(colName)}/points`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ points }),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'search': {
            const colName = args.collection_name as string;
            if (!colName) return text('Error: collection_name is required');
            const vector = args.vector as number[];
            if (!vector || !vector.length) return text('Error: vector is required');

            const body: Record<string, unknown> = {
                vector,
                limit: (args.limit as number) || 10,
                with_payload: args.with_payload !== false,
                with_vector: args.with_vectors === true,
            };
            if (args.filter) body.filter = args.filter;
            if (args.score_threshold != null) body.score_threshold = args.score_threshold;

            const res = await fetch(`${base}/collections/${encodeURIComponent(colName)}/points/search`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'get_points': {
            const colName = args.collection_name as string;
            if (!colName) return text('Error: collection_name is required');
            const ids = args.ids as unknown[];
            if (!ids || !ids.length) return text('Error: ids array is required');

            const body: Record<string, unknown> = {
                ids,
                with_payload: args.with_payload !== false,
                with_vector: args.with_vectors === true,
            };

            const res = await fetch(`${base}/collections/${encodeURIComponent(colName)}/points`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete_points': {
            const colName = args.collection_name as string;
            if (!colName) return text('Error: collection_name is required');

            let body: Record<string, unknown>;
            if (args.ids) {
                body = { points: args.ids };
            } else if (args.filter) {
                body = { filter: args.filter };
            } else {
                return text('Error: either ids or filter is required');
            }

            const res = await fetch(`${base}/collections/${encodeURIComponent(colName)}/points/delete`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'scroll': {
            const colName = args.collection_name as string;
            if (!colName) return text('Error: collection_name is required');

            const body: Record<string, unknown> = {
                limit: (args.limit as number) || 10,
                with_payload: args.with_payload !== false,
                with_vector: args.with_vectors === true,
            };
            if (args.filter) body.filter = args.filter;
            if (args.offset != null) body.offset = args.offset;

            const res = await fetch(`${base}/collections/${encodeURIComponent(colName)}/points/scroll`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'count': {
            const colName = args.collection_name as string;
            if (!colName) return text('Error: collection_name is required');

            const body: Record<string, unknown> = {
                exact: args.exact !== false,
            };
            if (args.filter) body.filter = args.filter;

            const res = await fetch(`${base}/collections/${encodeURIComponent(colName)}/points/count`, {
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
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-qdrant' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const qdrantUrl = request.headers.get('X-Mcp-Secret-QDRANT-URL') || '';
        const apiKey = request.headers.get('X-Mcp-Secret-QDRANT-API-KEY') || '';

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
                    serverInfo: { name: 'mcp-qdrant', version: '1.0.0' },
                },
            });
        }

        if (method === 'tools/list') {
            return Response.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        }

        if (method === 'tools/call') {
            if (!qdrantUrl || !apiKey) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32001, message: 'Missing secrets: QDRANT_URL and QDRANT_API_KEY required' },
                });
            }
            const { name, arguments: args = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, args, qdrantUrl, apiKey);
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
