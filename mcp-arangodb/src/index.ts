// mcp-arangodb — Aerostack MCP Server
// Wraps the ArangoDB HTTP REST API for document CRUD, AQL queries, and graph traversals
// Secrets: X-Mcp-Secret-ARANGODB-URL, X-Mcp-Secret-ARANGODB-USERNAME, X-Mcp-Secret-ARANGODB-PASSWORD

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify ArangoDB connectivity by querying the server version. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'list_databases',
        description: 'List all databases accessible by the authenticated user',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'list_collections',
        description: 'List all collections in a database',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: _system)' },
            },
            required: [],
        },
    },
    {
        name: 'create_collection',
        description: 'Create a new collection in a database',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: _system)' },
                name: { type: 'string', description: 'Collection name' },
                type: { type: 'number', description: 'Collection type: 2 = document (default), 3 = edge' },
            },
            required: ['name'],
        },
    },
    {
        name: 'get_document',
        description: 'Get a single document by its key from a collection',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: _system)' },
                collection: { type: 'string', description: 'Collection name' },
                key: { type: 'string', description: 'Document _key' },
            },
            required: ['collection', 'key'],
        },
    },
    {
        name: 'insert_document',
        description: 'Insert a document into a collection',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: _system)' },
                collection: { type: 'string', description: 'Collection name' },
                document: { type: 'object', description: 'The document to insert' },
            },
            required: ['collection', 'document'],
        },
    },
    {
        name: 'update_document',
        description: 'Partially update a document by its key',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: _system)' },
                collection: { type: 'string', description: 'Collection name' },
                key: { type: 'string', description: 'Document _key' },
                data: { type: 'object', description: 'Fields to update (partial update)' },
            },
            required: ['collection', 'key', 'data'],
        },
    },
    {
        name: 'delete_document',
        description: 'Delete a document by its key from a collection',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: _system)' },
                collection: { type: 'string', description: 'Collection name' },
                key: { type: 'string', description: 'Document _key' },
            },
            required: ['collection', 'key'],
        },
    },
    {
        name: 'aql_query',
        description: 'Execute an AQL (Arango Query Language) query with optional bind variables',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: _system)' },
                query: { type: 'string', description: 'AQL query string' },
                bindVars: { type: 'object', description: 'Bind variables for the query' },
                batchSize: { type: 'number', description: 'Maximum number of results to return (default: 100)' },
            },
            required: ['query'],
        },
    },
    {
        name: 'list_graphs',
        description: 'List all named graphs in a database',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: _system)' },
            },
            required: [],
        },
    },
    {
        name: 'traverse',
        description: 'Perform a graph traversal starting from a given vertex',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: _system)' },
                startVertex: { type: 'string', description: 'Document handle of the start vertex, e.g. "users/12345"' },
                graphName: { type: 'string', description: 'Name of the named graph to traverse' },
                direction: { type: 'string', description: 'Traversal direction: "outbound", "inbound", or "any" (default: "outbound")' },
                minDepth: { type: 'number', description: 'Minimum traversal depth (default: 1)' },
                maxDepth: { type: 'number', description: 'Maximum traversal depth (default: 3)' },
            },
            required: ['startVertex', 'graphName'],
        },
    },
    {
        name: 'collection_count',
        description: 'Get the number of documents in a collection',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name (default: _system)' },
                collection: { type: 'string', description: 'Collection name' },
            },
            required: ['collection'],
        },
    },
];

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

function basicAuth(user: string, pass: string): string {
    return 'Basic ' + btoa(`${user}:${pass}`);
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    arangoUrl: string,
    username: string,
    password: string,
) {
    const base = arangoUrl.replace(/\/$/, '');
    const auth = basicAuth(username, password);
    const headers: Record<string, string> = {
        'Authorization': auth,
        'Content-Type': 'application/json',
    };
    const db = (args.database as string) || '_system';

    switch (name) {
        case '_ping': {
            const res = await fetch(`${base}/_api/version`, { headers });
            if (!res.ok) throw new Error(`ArangoDB returned ${res.status}: ${await res.text()}`);
            const data = await res.json() as { server: string; version: string };
            return text(`Connected to ArangoDB ${data.version} (${data.server})`);
        }

        case 'list_databases': {
            const res = await fetch(`${base}/_api/database/user`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { result: string[] };
            return json({ databases: data.result });
        }

        case 'list_collections': {
            const res = await fetch(`${base}/_db/${encodeURIComponent(db)}/_api/collection`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { result: unknown[] };
            return json({ collections: data.result });
        }

        case 'create_collection': {
            const colName = args.name as string;
            if (!colName) return text('Error: "name" is required');
            const colType = (args.type as number) || 2;
            const res = await fetch(`${base}/_db/${encodeURIComponent(db)}/_api/collection`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: colName, type: colType }),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'get_document': {
            const collection = args.collection as string;
            const key = args.key as string;
            if (!collection || !key) return text('Error: "collection" and "key" are required');
            const res = await fetch(`${base}/_db/${encodeURIComponent(db)}/_api/document/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'insert_document': {
            const collection = args.collection as string;
            const document = args.document as object;
            if (!collection || !document) return text('Error: "collection" and "document" are required');
            const res = await fetch(`${base}/_db/${encodeURIComponent(db)}/_api/document/${encodeURIComponent(collection)}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(document),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'update_document': {
            const collection = args.collection as string;
            const key = args.key as string;
            const data = args.data as object;
            if (!collection || !key || !data) return text('Error: "collection", "key", and "data" are required');
            const res = await fetch(`${base}/_db/${encodeURIComponent(db)}/_api/document/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(data),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete_document': {
            const collection = args.collection as string;
            const key = args.key as string;
            if (!collection || !key) return text('Error: "collection" and "key" are required');
            const res = await fetch(`${base}/_db/${encodeURIComponent(db)}/_api/document/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`, {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'aql_query': {
            const query = args.query as string;
            if (!query) return text('Error: "query" is required');
            const batchSize = (args.batchSize as number) || 100;
            const bindVars = (args.bindVars as Record<string, unknown>) || {};
            const res = await fetch(`${base}/_db/${encodeURIComponent(db)}/_api/cursor`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ query, bindVars, batchSize }),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const result = await res.json() as { result: unknown[]; hasMore: boolean; count?: number };
            return json({ result: result.result, hasMore: result.hasMore, count: result.count });
        }

        case 'list_graphs': {
            const res = await fetch(`${base}/_db/${encodeURIComponent(db)}/_api/gharial`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { graphs: unknown[] };
            return json({ graphs: data.graphs });
        }

        case 'traverse': {
            const startVertex = args.startVertex as string;
            const graphName = args.graphName as string;
            if (!startVertex || !graphName) return text('Error: "startVertex" and "graphName" are required');
            const direction = (args.direction as string) || 'outbound';
            const minDepth = (args.minDepth as number) || 1;
            const maxDepth = (args.maxDepth as number) || 3;
            const res = await fetch(`${base}/_db/${encodeURIComponent(db)}/_api/traversal`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    startVertex,
                    graphName,
                    direction,
                    minDepth,
                    maxDepth,
                }),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { result: { visited: { vertices: unknown[]; paths: unknown[] } } };
            return json(data.result);
        }

        case 'collection_count': {
            const collection = args.collection as string;
            if (!collection) return text('Error: "collection" is required');
            const res = await fetch(`${base}/_db/${encodeURIComponent(db)}/_api/collection/${encodeURIComponent(collection)}/count`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { name: string; count: number };
            return json({ collection: data.name, count: data.count });
        }

        default:
            return text(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-arangodb' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const arangoUrl = request.headers.get('X-Mcp-Secret-ARANGODB-URL') || '';
        const username = request.headers.get('X-Mcp-Secret-ARANGODB-USERNAME') || '';
        const password = request.headers.get('X-Mcp-Secret-ARANGODB-PASSWORD') || '';

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
                    serverInfo: { name: 'mcp-arangodb', version: '1.0.0' },
                },
            });
        }

        if (method === 'tools/list') {
            return Response.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        }

        if (method === 'tools/call') {
            if (!arangoUrl || !username || !password) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32001, message: 'Missing secrets: ARANGODB_URL, ARANGODB_USERNAME, and ARANGODB_PASSWORD required' },
                });
            }
            const { name, arguments: args = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, args, arangoUrl, username, password);
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
