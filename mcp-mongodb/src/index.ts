// mcp-mongodb — Aerostack MCP Server
// Uses MongoDB Atlas Data API (REST, no native driver needed)
// Secrets: X-Mcp-Secret-MONGODB-APP-ID, X-Mcp-Secret-MONGODB-API-KEY, X-Mcp-Secret-MONGODB-CLUSTER
//
// Setup: https://www.mongodb.com/docs/atlas/app-services/data-api/
// App ID: found in Atlas App Services → your app → App ID
// API Key: Atlas App Services → Authentication → API Keys

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify MongoDB Atlas connectivity. Used internally by Aerostack to validate credentials.',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Optional: database name to test against (default: test)' },
                collection: { type: 'string', description: 'Optional: collection name to test against (default: _ping)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_collections',
        description: 'List all collections in a MongoDB database using $listCatalog (requires MongoDB 6.0+)',
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
        description: 'Find multiple documents with optional filter, sort, limit, skip, and projection',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
                collection: { type: 'string', description: 'Collection name' },
                filter: { type: 'object', description: 'MongoDB query filter (default: {})' },
                sort: { type: 'object', description: 'Sort order, e.g. {"createdAt": -1}' },
                limit: { type: 'number', description: 'Maximum documents to return (default: 100, max: 500)' },
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
        description: 'Update a single document matching a filter',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
                collection: { type: 'string', description: 'Collection name' },
                filter: { type: 'object', description: 'MongoDB query filter to match the document' },
                update: { type: 'object', description: 'Update operations, e.g. {"$set": {"status": "active"}}' },
                upsert: { type: 'boolean', description: 'Insert if no document matches the filter' },
            },
            required: ['database', 'collection', 'filter', 'update'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_many',
        description: 'Update all documents matching a filter',
        inputSchema: {
            type: 'object',
            properties: {
                database: { type: 'string', description: 'Database name' },
                collection: { type: 'string', description: 'Collection name' },
                filter: { type: 'object', description: 'MongoDB query filter to match documents' },
                update: { type: 'object', description: 'Update operations, e.g. {"$set": {"archived": true}}' },
                upsert: { type: 'boolean', description: 'Insert if no documents match the filter' },
            },
            required: ['database', 'collection', 'filter', 'update'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_one',
        description: 'Delete a single document matching a filter',
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
        description: 'Delete all documents matching a filter',
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

/**
 * Call the MongoDB Atlas Data API.
 * Throws on HTTP errors with a descriptive message.
 */
async function mongoFetch(
    appId: string,
    apiKey: string,
    action: string,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const url = `https://data.mongodb-api.com/app/${appId}/endpoint/data/v1/action/${action}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
        },
        body: JSON.stringify(payload),
    });

    const body = await res.text();

    if (!res.ok) {
        // Surface helpful error context
        if (res.status === 404) {
            throw new Error(`App ID not found (404). Verify your MONGODB_APP_ID — it should look like "data-abcde" from Atlas App Services. Raw: ${body}`);
        }
        if (res.status === 401) {
            throw new Error(`Authentication failed (401). Check your MONGODB_API_KEY. Raw: ${body}`);
        }
        throw new Error(`MongoDB Atlas API error ${res.status}: ${body}`);
    }

    try {
        return JSON.parse(body) as Record<string, unknown>;
    } catch {
        throw new Error(`Unexpected non-JSON response: ${body}`);
    }
}

// ─── Tool execution ───────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    appId: string,
    apiKey: string,
    cluster: string,
): Promise<{ content: { type: string; text: string }[] }> {
    switch (name) {
        case '_ping': {
            // Use optional database/collection params with safe defaults.
            // Any valid response (even empty result) proves credentials work.
            const database = (args.database as string) || 'test';
            const collection = (args.collection as string) || '_ping';
            await mongoFetch(appId, apiKey, 'findOne', {
                dataSource: cluster,
                database,
                collection,
                filter: {},
            });
            return text(`Connected to MongoDB Atlas cluster "${cluster}" successfully.`);
        }

        case 'list_collections': {
            const database = args.database as string;
            if (!database) return text('Error: database is required');
            // $listCatalog (MongoDB 6.0+) returns all collections in the database.
            // We run it against a sentinel collection — the stage is database-level
            // and works even if the sentinel collection has no documents.
            const result = await mongoFetch(appId, apiKey, 'aggregate', {
                dataSource: cluster,
                database,
                collection: '_catalog',
                pipeline: [{ $listCatalog: {} }],
            });
            const docs = (result.documents as Record<string, unknown>[]) || [];
            // Filter out system/internal collections
            const collections = docs
                .filter((d) => typeof d.name === 'string' && !d.name.startsWith('system.'))
                .map((d) => ({ name: d.name, type: d.type }));
            if (collections.length === 0) {
                return text(`No user collections found in database "${database}". The database may be empty or $listCatalog may not be supported on your cluster version (requires MongoDB 6.0+).`);
            }
            return json(collections);
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
            return json(result.document ?? null);
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
            if (typeof args.skip === 'number') payload.skip = args.skip;
            payload.limit = typeof args.limit === 'number' ? Math.min(args.limit, 500) : 100;
            if (args.projection) payload.projection = args.projection;
            const result = await mongoFetch(appId, apiKey, 'find', payload);
            return json(result.documents ?? []);
        }

        case 'insert_one': {
            const database = args.database as string;
            const collection = args.collection as string;
            const document = args.document as Record<string, unknown>;
            if (!database || !collection) return text('Error: database and collection are required');
            if (!document || typeof document !== 'object') return text('Error: document must be an object');
            const result = await mongoFetch(appId, apiKey, 'insertOne', {
                dataSource: cluster,
                database,
                collection,
                document,
            });
            return json({ insertedId: result.insertedId });
        }

        case 'insert_many': {
            const database = args.database as string;
            const collection = args.collection as string;
            const documents = args.documents as Record<string, unknown>[];
            if (!database || !collection) return text('Error: database and collection are required');
            if (!Array.isArray(documents) || documents.length === 0) return text('Error: documents must be a non-empty array');
            const result = await mongoFetch(appId, apiKey, 'insertMany', {
                dataSource: cluster,
                database,
                collection,
                documents,
            });
            return json({ insertedIds: result.insertedIds });
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
                dataSource: cluster, database, collection, filter, update,
            };
            if (args.upsert !== undefined) payload.upsert = args.upsert;
            const result = await mongoFetch(appId, apiKey, 'updateOne', payload);
            return json({ matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, upsertedId: result.upsertedId });
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
                dataSource: cluster, database, collection, filter, update,
            };
            if (args.upsert !== undefined) payload.upsert = args.upsert;
            const result = await mongoFetch(appId, apiKey, 'updateMany', payload);
            return json({ matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, upsertedId: result.upsertedId });
        }

        case 'delete_one': {
            const database = args.database as string;
            const collection = args.collection as string;
            const filter = args.filter as Record<string, unknown>;
            if (!database || !collection) return text('Error: database and collection are required');
            if (!filter) return text('Error: filter is required');
            const result = await mongoFetch(appId, apiKey, 'deleteOne', {
                dataSource: cluster, database, collection, filter,
            });
            return json({ deletedCount: result.deletedCount });
        }

        case 'delete_many': {
            const database = args.database as string;
            const collection = args.collection as string;
            const filter = args.filter as Record<string, unknown>;
            if (!database || !collection) return text('Error: database and collection are required');
            if (!filter) return text('Error: filter is required');
            const result = await mongoFetch(appId, apiKey, 'deleteMany', {
                dataSource: cluster, database, collection, filter,
            });
            return json({ deletedCount: result.deletedCount });
        }

        case 'aggregate': {
            const database = args.database as string;
            const collection = args.collection as string;
            const pipeline = args.pipeline as Record<string, unknown>[];
            if (!database || !collection) return text('Error: database and collection are required');
            if (!Array.isArray(pipeline)) return text('Error: pipeline must be an array');
            const result = await mongoFetch(appId, apiKey, 'aggregate', {
                dataSource: cluster, database, collection, pipeline,
            });
            return json(result.documents ?? []);
        }

        default:
            return text(`Unknown tool: ${name}`);
    }
}

// ─── Worker handler ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-mongodb', version: '2.1.0' });
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
            return Response.json(
                { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
                { status: 400 },
            );
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return Response.json({
                jsonrpc: '2.0', id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'mcp-mongodb', version: '2.1.0' },
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
                    error: {
                        code: -32001,
                        message: 'Missing credentials. Configure MONGODB_APP_ID (Atlas App Services App ID), MONGODB_API_KEY, and MONGODB_CLUSTER (cluster name, e.g. "Cluster0").',
                    },
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
