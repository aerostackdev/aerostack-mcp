// mcp-chroma — Aerostack MCP Server
// Wraps the Chroma vector database HTTP API
// Secrets: X-Mcp-Secret-CHROMA-URL, X-Mcp-Secret-CHROMA-API-KEY

const TOOLS = [
    {
        name: 'list_collections',
        description: 'List all collections in Chroma with an optional limit',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Maximum number of collections to return (default: 100)' },
            },
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_collection',
        description: 'Create a new collection in Chroma',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Collection name' },
                metadata: { type: 'object', description: 'Optional metadata key-value pairs for the collection' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_collection',
        description: 'Get a collection by name',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Collection name' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_collection',
        description: 'Delete a collection by name',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Collection name to delete' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'add',
        description: 'Add documents/embeddings to a collection',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Collection name' },
                ids: { type: 'array', items: { type: 'string' }, description: 'Array of unique IDs for each item' },
                documents: { type: 'array', items: { type: 'string' }, description: 'Optional array of text documents' },
                embeddings: { type: 'array', description: 'Optional array of pre-computed embeddings (arrays of numbers)' },
                metadatas: { type: 'array', items: { type: 'object' }, description: 'Optional array of metadata objects' },
            },
            required: ['name', 'ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'query',
        description: 'Query a collection by text or embedding vectors',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Collection name' },
                query_texts: { type: 'array', items: { type: 'string' }, description: 'Array of query texts' },
                query_embeddings: { type: 'array', description: 'Array of query embedding vectors' },
                n_results: { type: 'number', description: 'Number of results to return (default: 10)' },
                where: { type: 'object', description: 'Metadata filter conditions' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get',
        description: 'Get documents from a collection by IDs or metadata filter',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Collection name' },
                ids: { type: 'array', items: { type: 'string' }, description: 'Optional array of IDs to retrieve' },
                where: { type: 'object', description: 'Optional metadata filter conditions' },
                limit: { type: 'number', description: 'Optional maximum number of results' },
                offset: { type: 'number', description: 'Optional offset for pagination' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete',
        description: 'Delete documents from a collection by IDs or metadata filter',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Collection name' },
                ids: { type: 'array', items: { type: 'string' }, description: 'Optional array of IDs to delete' },
                where: { type: 'object', description: 'Optional metadata filter for documents to delete' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
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
    chromaUrl: string,
    apiKey: string,
) {
    const base = chromaUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (apiKey) {
        headers['X-Chroma-Token'] = apiKey;
    }

    switch (name) {
        case 'list_collections': {
            const limit = (args.limit as number) || 100;
            const res = await fetch(`${base}/api/v1/collections?limit=${limit}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'create_collection': {
            const colName = args.name as string;
            if (!colName) return text('Error: "name" is required');
            const body: Record<string, unknown> = { name: colName };
            if (args.metadata) body.metadata = args.metadata;
            const res = await fetch(`${base}/api/v1/collections`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'get_collection': {
            const colName = args.name as string;
            if (!colName) return text('Error: "name" is required');
            const res = await fetch(`${base}/api/v1/collections/${encodeURIComponent(colName)}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete_collection': {
            const colName = args.name as string;
            if (!colName) return text('Error: "name" is required');
            const res = await fetch(`${base}/api/v1/collections/${encodeURIComponent(colName)}`, {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return text(`Collection "${colName}" deleted successfully`);
        }

        case 'add': {
            const colName = args.name as string;
            const ids = args.ids as string[];
            if (!colName || !ids) return text('Error: "name" and "ids" are required');
            const body: Record<string, unknown> = { ids };
            if (args.documents) body.documents = args.documents;
            if (args.embeddings) body.embeddings = args.embeddings;
            if (args.metadatas) body.metadatas = args.metadatas;
            const res = await fetch(`${base}/api/v1/collections/${encodeURIComponent(colName)}/add`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'query': {
            const colName = args.name as string;
            if (!colName) return text('Error: "name" is required');
            const body: Record<string, unknown> = {};
            if (args.query_texts) body.query_texts = args.query_texts;
            if (args.query_embeddings) body.query_embeddings = args.query_embeddings;
            if (args.n_results) body.n_results = args.n_results;
            if (args.where) body.where = args.where;
            const res = await fetch(`${base}/api/v1/collections/${encodeURIComponent(colName)}/query`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'get': {
            const colName = args.name as string;
            if (!colName) return text('Error: "name" is required');
            const body: Record<string, unknown> = {};
            if (args.ids) body.ids = args.ids;
            if (args.where) body.where = args.where;
            if (args.limit) body.limit = args.limit;
            if (args.offset) body.offset = args.offset;
            const res = await fetch(`${base}/api/v1/collections/${encodeURIComponent(colName)}/get`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete': {
            const colName = args.name as string;
            if (!colName) return text('Error: "name" is required');
            const body: Record<string, unknown> = {};
            if (args.ids) body.ids = args.ids;
            if (args.where) body.where = args.where;
            const res = await fetch(`${base}/api/v1/collections/${encodeURIComponent(colName)}/delete`, {
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
                JSON.stringify({ status: 'ok', server: 'mcp-chroma', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const chromaUrl = request.headers.get('X-Mcp-Secret-CHROMA-URL') || '';
        const apiKey = request.headers.get('X-Mcp-Secret-CHROMA-API-KEY') || '';

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
                serverInfo: { name: 'mcp-chroma', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(rpcId, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            if (!chromaUrl) {
                return rpcErr(rpcId, -32001, 'Missing secrets: CHROMA_URL is required');
            }
            const { name, arguments: toolArgs = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, toolArgs, chromaUrl, apiKey);
                return rpcOk(rpcId, result);
            } catch (err) {
                return rpcErr(rpcId, -32603, String(err));
            }
        }

        return rpcErr(rpcId, -32601, `Method not found: ${method}`);
    },
};
