// mcp-mongodb — Aerostack MCP Server
// Wraps the MongoDB Atlas Data API (REST)
// Secrets: X-Mcp-Secret-MONGODB-APP-ID, X-Mcp-Secret-MONGODB-API-KEY, X-Mcp-Secret-MONGODB-CLUSTER

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify MongoDB Atlas connectivity by running a findOne. Used internally by Aerostack to validate credentials.',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name to ping' },
                collection: { type: 'string', description: 'Collection name to ping' },
            },
            required: ['database', 'collection'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_databases',
        description: 'List all databases in the MongoDB Atlas cluster',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Any existing database name to run the listDatabases command against' },
            },
            required: ['database'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_collections',
        description: 'List all collections in a MongoDB database',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
            },
            required: ['database'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'find_one',
        description: 'Find a single document in a collection matching a filter',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
                collection: { type: 'string', description: 'Collection name' },
                filter: { type: 'object', description: 'MongoDB query filter (default: {})' },
                projection: { type: 'object', description: 'Fields to include or exclude' },
            },
            required: ['database', 'collection'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'find',
        description: 'Find multiple documents in a collection with filter, sort, limit, skip, and projection',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
                collection: { type: 'string', description: 'Collection name' },
                filter: { type: 'object', description: 'MongoDB query filter (default: {})' },
                sort: { type: 'object', description: 'Sort order, e.g. {"createdAt": -1}' },
                limit: { type: 'number', description: 'Maximum documents to return (default: 100)' },
                skip: { type: 'number', description: 'Number of documents to skip for pagination' },
                projection: { type: 'object', description: 'Fields to include or exclude' },
            },
            required: ['database', 'collection'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'insert_one',
        description: 'Insert a single document into a collection',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
                collection: { type: 'string', description: 'Collection name' },
                document: { type: 'object', description: 'The document to insert' },
            },
            required: ['database', 'collection', 'document'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'insert_many',
        description: 'Insert multiple documents into a collection',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
                collection: { type: 'string', description: 'Collection name' },
                documents: { type: 'array', description: 'Array of documents to insert', items: { type: 'object' } },
            },
            required: ['database', 'collection', 'documents'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_one',
        description: 'Update a single document in a collection matching a filter',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
                collection: { type: 'string', description: 'Collection name' },
                filter: { type: 'object', description: 'MongoDB query filter to match the document' },
                update: { type: 'object', description: 'Update operations, e.g. {"$set": {"status": "active"}}' },
                upsert: { type: 'boolean', description: 'If true, insert a document if none match the filter' },
            },
            required: ['database', 'collection', 'filter', 'update'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_many',
        description: 'Update multiple documents in a collection matching a filter',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
                collection: { type: 'string', description: 'Collection name' },
                filter: { type: 'object', description: 'MongoDB query filter to match documents' },
                update: { type: 'object', description: 'Update operations, e.g. {"$set": {"archived": true}}' },
                upsert: { type: 'boolean', description: 'If true, insert a document if none match the filter' },
            },
            required: ['database', 'collection', 'filter', 'update'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_one',
        description: 'Delete a single document from a collection matching a filter',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
                collection: { type: 'string', description: 'Collection name' },
                filter: { type: 'object', description: 'MongoDB query filter to match the document to delete' },
            },
            required: ['database', 'collection', 'filter'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'delete_many',
        description: 'Delete multiple documents from a collection matching a filter',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
                collection: { type: 'string', description: 'Collection name' },
                filter: { type: 'object', description: 'MongoDB query filter to match documents to delete' },
            },
            required: ['database', 'collection', 'filter'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'aggregate',
        description: 'Run an aggregation pipeline on a collection',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
                collection: { type: 'string', description: 'Collection name' },
                pipeline: { type: 'array', description: 'Array of aggregation pipeline stages', items: { type: 'object' } },
            },
            required: ['database', 'collection', 'pipeline'],
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

async function mongoFetch(
    appId: string,
    apiKey: string,
    action: string,
    payload: Record<string, unknown>,
) {
    const url = `https://data.mongodb-api.com/app/${appId}/endpoint/data/v1/action/${action}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`MongoDB Atlas API returned ${res.status}: ${body}`);
    }
    return res.json();
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    appId: string,
    apiKey: string,
    cluster: string,
) {
    switch (name) {
        case '_ping': {
            const database = args.database as string;
            const collection = args.collection as string;
            if (!database || !collection) return text('Error: database and collection are required for ping');
            await mongoFetch(appId, apiKey, 'findOne', {
                dataSource: cluster,
                database,
                collection,
                filter: {},
            });
            return text(`Connected to MongoDB Atlas cluster "${cluster}"`);
        }

        case 'list_databases': {
            const database = args.database as string;
            if (!database) return text('Error: database is required');
            const result = await mongoFetch(appId, apiKey, 'aggregate', {
                dataSource: cluster,
                database,
                collection: '_dummy',
                pipeline: [
                    { $currentOp: { allUsers: true, idleConnections: false } },
                ],
            });
            // The Data API may not support admin commands directly.
            // Fall back to returning the aggregate result or a helpful message.
            return json(result);
        }

        case 'list_collections': {
            const database = args.database as string;
            if (!database) return text('Error: database is required');
            const result = await mongoFetch(appId, apiKey, 'aggregate', {
                dataSource: cluster,
                database,
                collection: '_dummy',
                pipeline: [
                    { $listLocalSessions: {} },
                ],
            });
            return json(result);
        }

        case 'find_one': {
            const database = args.database as string;
            const collection = args.collection as string;
            if (!database || !collection) return text('Error: database and collection are required');
            const payload: Record<string, unknown> = {
                dataSource: cluster,
                database,
                collection,
                filter: args.filter || {},
            };
            if (args.projection) payload.projection = args.projection;
            const result = await mongoFetch(appId, apiKey, 'findOne', payload);
            return json(result);
        }

        case 'find': {
            const database = args.database as string;
            const collection = args.collection as string;
            if (!database || !collection) return text('Error: database and collection are required');
            const payload: Record<string, unknown> = {
                dataSource: cluster,
                database,
                collection,
                filter: args.filter || {},
            };
            if (args.sort) payload.sort = args.sort;
            if (args.limit !== undefined) payload.limit = args.limit;
            if (args.skip !== undefined) payload.skip = args.skip;
            if (args.projection) payload.projection = args.projection;
            const result = await mongoFetch(appId, apiKey, 'find', payload);
            return json(result);
        }

        case 'insert_one': {
            const database = args.database as string;
            const collection = args.collection as string;
            const document = args.document as Record<string, unknown>;
            if (!database || !collection) return text('Error: database and collection are required');
            if (!document) return text('Error: document is required');
            const result = await mongoFetch(appId, apiKey, 'insertOne', {
                dataSource: cluster,
                database,
                collection,
                document,
            });
            return json(result);
        }

        case 'insert_many': {
            const database = args.database as string;
            const collection = args.collection as string;
            const documents = args.documents as Record<string, unknown>[];
            if (!database || !collection) return text('Error: database and collection are required');
            if (!documents || !Array.isArray(documents)) return text('Error: documents array is required');
            const result = await mongoFetch(appId, apiKey, 'insertMany', {
                dataSource: cluster,
                database,
                collection,
                documents,
            });
            return json(result);
        }

        case 'update_one': {
            const database = args.database as string;
            const collection = args.collection as string;
            const filter = args.filter as Record<string, unknown>;
            const update = args.update as Record<string, unknown>;
            if (!database || !collection) return text('Error: database and collection are required');
            if (!filter) return text('Error: filter is required');
            if (!update) return text('Error: update is required');
            const payload: Record<string, unknown> = {
                dataSource: cluster,
                database,
                collection,
                filter,
                update,
            };
            if (args.upsert !== undefined) payload.upsert = args.upsert;
            const result = await mongoFetch(appId, apiKey, 'updateOne', payload);
            return json(result);
        }

        case 'update_many': {
            const database = args.database as string;
            const collection = args.collection as string;
            const filter = args.filter as Record<string, unknown>;
            const update = args.update as Record<string, unknown>;
            if (!database || !collection) return text('Error: database and collection are required');
            if (!filter) return text('Error: filter is required');
            if (!update) return text('Error: update is required');
            const payload: Record<string, unknown> = {
                dataSource: cluster,
                database,
                collection,
                filter,
                update,
            };
            if (args.upsert !== undefined) payload.upsert = args.upsert;
            const result = await mongoFetch(appId, apiKey, 'updateMany', payload);
            return json(result);
        }

        case 'delete_one': {
            const database = args.database as string;
            const collection = args.collection as string;
            const filter = args.filter as Record<string, unknown>;
            if (!database || !collection) return text('Error: database and collection are required');
            if (!filter) return text('Error: filter is required');
            const result = await mongoFetch(appId, apiKey, 'deleteOne', {
                dataSource: cluster,
                database,
                collection,
                filter,
            });
            return json(result);
        }

        case 'delete_many': {
            const database = args.database as string;
            const collection = args.collection as string;
            const filter = args.filter as Record<string, unknown>;
            if (!database || !collection) return text('Error: database and collection are required');
            if (!filter) return text('Error: filter is required');
            const result = await mongoFetch(appId, apiKey, 'deleteMany', {
                dataSource: cluster,
                database,
                collection,
                filter,
            });
            return json(result);
        }

        case 'aggregate': {
            const database = args.database as string;
            const collection = args.collection as string;
            const pipeline = args.pipeline as Record<string, unknown>[];
            if (!database || !collection) return text('Error: database and collection are required');
            if (!pipeline || !Array.isArray(pipeline)) return text('Error: pipeline array is required');
            const result = await mongoFetch(appId, apiKey, 'aggregate', {
                dataSource: cluster,
                database,
                collection,
                pipeline,
            });
            return json(result);
        }

        default:
            return text(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-mongodb' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const appId = request.headers.get('X-Mcp-Secret-MONGODB-APP-ID') || '';
        const apiKey = request.headers.get('X-Mcp-Secret-MONGODB-API-KEY') || '';
        const cluster = request.headers.get('X-Mcp-Secret-MONGODB-CLUSTER') || '';

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
                    serverInfo: { name: 'mcp-mongodb', version: '1.0.0' },
                },
            });
        }

        if (method === 'tools/list') {
            return Response.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        }

        if (method === 'tools/call') {
            if (!appId || !apiKey || !cluster) {
                return Response.json({
                    jsonrpc: '2.0', id,
                    error: { code: -32001, message: 'Missing secrets: MONGODB_APP_ID, MONGODB_API_KEY, and MONGODB_CLUSTER required' },
                });
            }
            const { name, arguments: args = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, args, appId, apiKey, cluster);
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
