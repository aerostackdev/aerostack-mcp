/**
 * Sanity MCP Worker
 * Implements MCP protocol over HTTP for Sanity.io CMS operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: SANITY_API_TOKEN  → header: X-Mcp-Secret-SANITY-API-TOKEN
 * Secret: SANITY_PROJECT_ID → header: X-Mcp-Secret-SANITY-PROJECT-ID
 * Secret: SANITY_DATASET    → header: X-Mcp-Secret-SANITY-DATASET (default: production)
 */

const SANITY_MGMT = 'https://api.sanity.io/v2021-06-07';

function rpcOk(id: string | number | null, result: unknown): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: string | number | null, code: number, message: string): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    const missing = fields.filter(f => args[f] === undefined || args[f] === null || args[f] === '');
    if (missing.length > 0) throw new Error(`Missing required fields: ${missing.join(', ')}`);
}

function getSanityUrl(projectId: string, dataset: string, path: string): string {
    return `https://${projectId}.api.sanity.io/v2021-06-07/data/${path}/${dataset}`;
}

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Sanity credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'query',
        description: 'Run a GROQ query against the Sanity dataset',
        inputSchema: {
            type: 'object',
            properties: {
                groqQuery: { type: 'string', description: 'GROQ query string (e.g. *[_type == "post"][0..10])' },
            },
            required: ['groqQuery'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_document',
        description: 'Get a document by its ID',
        inputSchema: {
            type: 'object',
            properties: {
                documentId: { type: 'string', description: 'Document ID' },
            },
            required: ['documentId'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'create_document',
        description: 'Create a new document in Sanity',
        inputSchema: {
            type: 'object',
            properties: {
                _type: { type: 'string', description: 'Document type' },
                fields: { type: 'object', description: 'Additional document fields' },
            },
            required: ['_type', 'fields'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'patch_document',
        description: 'Update specific fields in an existing document',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Document ID to patch' },
                fields: { type: 'object', description: 'Fields to set/update' },
            },
            required: ['id', 'fields'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'delete_document',
        description: 'Delete a document from Sanity',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Document ID to delete' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false },
    },
    {
        name: 'list_projects',
        description: 'List all Sanity projects accessible with the current token',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_project',
        description: 'Get details about a Sanity project',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Sanity project ID (uses default if not provided)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_datasets',
        description: 'List datasets in a Sanity project',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Sanity project ID (uses default if not provided)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_schemas',
        description: 'List all document types defined in the dataset',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'count_documents',
        description: 'Count documents of a specific type',
        inputSchema: {
            type: 'object',
            properties: {
                docType: { type: 'string', description: 'Document type to count' },
            },
            required: ['docType'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'list_recent_documents',
        description: 'List recently updated documents of a given type',
        inputSchema: {
            type: 'object',
            properties: {
                docType: { type: 'string', description: 'Document type to list' },
                limit: { type: 'number', description: 'Number of results (default 10)' },
            },
            required: ['docType'],
        },
        annotations: { readOnlyHint: true },
    },
    {
        name: 'get_api_stats',
        description: 'Get API usage statistics and project details',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Sanity project ID (uses default if not provided)' },
            },
        },
        annotations: { readOnlyHint: true },
    },
];

async function sanityFetch(url: string, token: string, opts: RequestInit = {}): Promise<unknown> {
    const res = await fetch(url, {
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Sanity API ${res.status}: ${err}`);
    }
    return res.json();
}

async function groqQuery(projectId: string, dataset: string, token: string, groq: string): Promise<unknown> {
    const url = `${getSanityUrl(projectId, dataset, 'query')}?query=${encodeURIComponent(groq)}`;
    const data = await sanityFetch(url, token) as any;
    return data.result;
}

async function mutate(projectId: string, dataset: string, token: string, mutations: unknown[]): Promise<unknown> {
    const url = getSanityUrl(projectId, dataset, 'mutate');
    return sanityFetch(url, token, {
        method: 'POST',
        body: JSON.stringify({ mutations }),
    });
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    defaultProjectId: string | null,
    defaultDataset: string
): Promise<unknown> {
    const projectId = (args.projectId as string | undefined) ?? defaultProjectId;

    const requireProject = () => {
        if (!projectId) throw new Error('projectId is required — provide it as an argument or add SANITY_PROJECT_ID to your workspace secrets');
    };

    switch (name) {
        case '_ping': {
            await sanityFetch(`${SANITY_MGMT}/projects`, token);
            return { content: [{ type: 'text', text: 'Connected to Sanity' }] };
        }

        case 'query': {
            validateRequired(args, ['groqQuery']);
            requireProject();
            return groqQuery(projectId!, defaultDataset, token, String(args.groqQuery));
        }
        case 'get_document': {
            validateRequired(args, ['documentId']);
            requireProject();
            return groqQuery(projectId!, defaultDataset, token, `*[_id=="${args.documentId}"][0]`);
        }
        case 'create_document': {
            validateRequired(args, ['_type', 'fields']);
            requireProject();
            const doc = { _type: args._type, ...(args.fields as Record<string, unknown>) };
            return mutate(projectId!, defaultDataset, token, [{ create: doc }]);
        }
        case 'patch_document': {
            validateRequired(args, ['id', 'fields']);
            requireProject();
            return mutate(projectId!, defaultDataset, token, [{ patch: { id: args.id, set: args.fields } }]);
        }
        case 'delete_document': {
            validateRequired(args, ['id']);
            requireProject();
            return mutate(projectId!, defaultDataset, token, [{ delete: { id: args.id } }]);
        }
        case 'list_projects': {
            return sanityFetch(`${SANITY_MGMT}/projects`, token);
        }
        case 'get_project': {
            requireProject();
            return sanityFetch(`${SANITY_MGMT}/projects/${projectId}`, token);
        }
        case 'list_datasets': {
            requireProject();
            return sanityFetch(`${SANITY_MGMT}/projects/${projectId}/datasets`, token);
        }
        case 'list_schemas': {
            requireProject();
            return groqQuery(projectId!, defaultDataset, token, 'array::unique(*[]._type)');
        }
        case 'count_documents': {
            validateRequired(args, ['docType']);
            requireProject();
            return groqQuery(projectId!, defaultDataset, token, `count(*[_type == "${args.docType}"])`);
        }
        case 'list_recent_documents': {
            validateRequired(args, ['docType']);
            requireProject();
            const limit = Number(args.limit ?? 10) - 1;
            return groqQuery(
                projectId!,
                defaultDataset,
                token,
                `*[_type == "${args.docType}"] | order(_updatedAt desc) [0..${limit}]`
            );
        }
        case 'get_api_stats': {
            requireProject();
            return sanityFetch(`${SANITY_MGMT}/projects/${projectId}`, token);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'sanity-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string | null; method: string; params?: Record<string, unknown> };
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
                serverInfo: { name: 'sanity-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-SANITY-API-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing SANITY_API_TOKEN secret — add it to your workspace secrets');
            }

            const defaultProjectId = request.headers.get('X-Mcp-Secret-SANITY-PROJECT-ID');
            const defaultDataset = request.headers.get('X-Mcp-Secret-SANITY-DATASET') ?? 'production';

            try {
                const result = await callTool(toolName, toolArgs, token, defaultProjectId, defaultDataset);
                return rpcOk(id, toolOk(result));
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
