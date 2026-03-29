// mcp-weaviate — Aerostack MCP Server
// Wraps the Weaviate HTTP REST API for vector database operations
// Secrets: X-Mcp-Secret-WEAVIATE-URL, X-Mcp-Secret-WEAVIATE-API-KEY

const TOOLS = [
    {
        name: 'list_collections',
        description: 'List all collections/classes in the Weaviate schema',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_collection',
        description: 'Get the schema definition for a specific collection/class',
        inputSchema: {
            type: 'object',
            properties: {
                className: { type: 'string', description: 'Name of the collection/class' },
            },
            required: ['className'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_collection',
        description: 'Create a new collection/class in the Weaviate schema',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Collection name (PascalCase recommended)' },
                description: { type: 'string', description: 'Optional description of the collection' },
                vectorizer: { type: 'string', description: 'Vectorizer module (e.g. text2vec-openai, none)' },
                properties: {
                    type: 'array',
                    description: 'Array of property definitions',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            dataType: { type: 'array', items: { type: 'string' } },
                        },
                    },
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_collection',
        description: 'Delete a collection/class and all its objects from Weaviate',
        inputSchema: {
            type: 'object',
            properties: {
                className: { type: 'string', description: 'Name of the collection/class to delete' },
            },
            required: ['className'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'add_objects',
        description: 'Add one or more objects to a Weaviate collection. Uses batch endpoint for multiple objects.',
        inputSchema: {
            type: 'object',
            properties: {
                objects: {
                    type: 'array',
                    description: 'Array of objects to add, each with "class" and "properties"',
                    items: {
                        type: 'object',
                        properties: {
                            class: { type: 'string', description: 'Collection class name' },
                            properties: { type: 'object', description: 'Object properties' },
                        },
                    },
                },
            },
            required: ['objects'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'query_objects',
        description: 'Query objects using the Weaviate GraphQL API. Provide a full GraphQL query string.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'GraphQL query string, e.g. "{ Get { Article(limit: 5) { title body _additional { id } } } }"',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_object',
        description: 'Get a specific object by its class and UUID',
        inputSchema: {
            type: 'object',
            properties: {
                className: { type: 'string', description: 'Collection class name' },
                id: { type: 'string', description: 'Object UUID' },
            },
            required: ['className', 'id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_object',
        description: 'Delete a specific object by its class and UUID',
        inputSchema: {
            type: 'object',
            properties: {
                className: { type: 'string', description: 'Collection class name' },
                id: { type: 'string', description: 'Object UUID to delete' },
            },
            required: ['className', 'id'],
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
    weaviateUrl: string,
    apiKey: string,
) {
    const base = weaviateUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };

    switch (name) {
        case 'list_collections': {
            const res = await fetch(`${base}/v1/schema`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as { classes: unknown[] };
            return json({ collections: data.classes || [] });
        }

        case 'get_collection': {
            const className = args.className as string;
            if (!className) return text('Error: "className" is required');
            const res = await fetch(`${base}/v1/schema/${encodeURIComponent(className)}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'create_collection': {
            const className = args.name as string;
            if (!className) return text('Error: "name" is required');
            const body: Record<string, unknown> = { class: className };
            if (args.description) body.description = args.description;
            if (args.vectorizer) body.vectorizer = args.vectorizer;
            if (args.properties) body.properties = args.properties;
            const res = await fetch(`${base}/v1/schema`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete_collection': {
            const className = args.className as string;
            if (!className) return text('Error: "className" is required');
            const res = await fetch(`${base}/v1/schema/${encodeURIComponent(className)}`, {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return text(`Collection "${className}" deleted successfully`);
        }

        case 'add_objects': {
            const objects = args.objects as Array<{ class: string; properties: Record<string, unknown> }>;
            if (!objects || objects.length === 0) return text('Error: "objects" array is required and must not be empty');
            if (objects.length === 1) {
                const res = await fetch(`${base}/v1/objects`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(objects[0]),
                });
                if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
                return json(await res.json());
            }
            const res = await fetch(`${base}/v1/batch/objects`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ objects }),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            const data = await res.json() as unknown[];
            return json({ added: data.length, results: data });
        }

        case 'query_objects': {
            const query = args.query as string;
            if (!query) return text('Error: "query" is required');
            const res = await fetch(`${base}/v1/graphql`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ query }),
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'get_object': {
            const className = args.className as string;
            const id = args.id as string;
            if (!className || !id) return text('Error: "className" and "id" are required');
            const res = await fetch(`${base}/v1/objects/${encodeURIComponent(className)}/${encodeURIComponent(id)}`, { headers });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return json(await res.json());
        }

        case 'delete_object': {
            const className = args.className as string;
            const id = args.id as string;
            if (!className || !id) return text('Error: "className" and "id" are required');
            const res = await fetch(`${base}/v1/objects/${encodeURIComponent(className)}/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers,
            });
            if (!res.ok) return text(`Error: ${res.status} ${await res.text()}`);
            return text(`Object "${id}" deleted from collection "${className}"`);
        }

        default:
            return text(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-weaviate', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const weaviateUrl = request.headers.get('X-Mcp-Secret-WEAVIATE-URL') || '';
        const apiKey = request.headers.get('X-Mcp-Secret-WEAVIATE-API-KEY') || '';

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
                serverInfo: { name: 'mcp-weaviate', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(rpcId, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            if (!weaviateUrl || !apiKey) {
                return rpcErr(rpcId, -32001, 'Missing secrets: WEAVIATE_URL and WEAVIATE_API_KEY are required');
            }
            const { name, arguments: toolArgs = {} } = (params || {}) as { name: string; arguments?: Record<string, unknown> };
            try {
                const result = await callTool(name, toolArgs, weaviateUrl, apiKey);
                return rpcOk(rpcId, result);
            } catch (err) {
                return rpcErr(rpcId, -32603, String(err));
            }
        }

        return rpcErr(rpcId, -32601, `Method not found: ${method}`);
    },
};
