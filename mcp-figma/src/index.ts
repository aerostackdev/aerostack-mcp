/**
 * Figma MCP Worker
 * Implements MCP protocol over HTTP for Figma API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: FIGMA_ACCESS_TOKEN → header: X-Mcp-Secret-FIGMA-ACCESS-TOKEN
 */

const FIGMA_API = 'https://api.figma.com/v1';

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

const TOOLS = [
    {
        name: 'get_file',
        description: 'Get a Figma file by its key. Returns file metadata, document structure, and components.',
        inputSchema: {
            type: 'object',
            properties: {
                fileKey: { type: 'string', description: 'The Figma file key (from the file URL)' },
            },
            required: ['fileKey'],
        },
    },
    {
        name: 'get_file_nodes',
        description: 'Get specific nodes from a Figma file by their IDs.',
        inputSchema: {
            type: 'object',
            properties: {
                fileKey: { type: 'string', description: 'The Figma file key' },
                nodeIds: { type: 'array', items: { type: 'string' }, description: 'Array of node IDs to retrieve' },
            },
            required: ['fileKey', 'nodeIds'],
        },
    },
    {
        name: 'get_comments',
        description: 'Get all comments on a Figma file.',
        inputSchema: {
            type: 'object',
            properties: {
                fileKey: { type: 'string', description: 'The Figma file key' },
            },
            required: ['fileKey'],
        },
    },
    {
        name: 'post_comment',
        description: 'Post a comment on a Figma file. Optionally pin it to a specific location.',
        inputSchema: {
            type: 'object',
            properties: {
                fileKey: { type: 'string', description: 'The Figma file key' },
                message: { type: 'string', description: 'The comment message text' },
                x: { type: 'number', description: 'X coordinate for pinned comment (optional)' },
                y: { type: 'number', description: 'Y coordinate for pinned comment (optional)' },
            },
            required: ['fileKey', 'message'],
        },
    },
    {
        name: 'get_file_components',
        description: 'Get all components in a Figma file.',
        inputSchema: {
            type: 'object',
            properties: {
                fileKey: { type: 'string', description: 'The Figma file key' },
            },
            required: ['fileKey'],
        },
    },
    {
        name: 'get_file_styles',
        description: 'Get all styles in a Figma file (colors, text styles, effects, grids).',
        inputSchema: {
            type: 'object',
            properties: {
                fileKey: { type: 'string', description: 'The Figma file key' },
            },
            required: ['fileKey'],
        },
    },
    {
        name: 'get_image',
        description: 'Export images from a Figma file. Renders nodes as PNG, JPG, SVG, or PDF.',
        inputSchema: {
            type: 'object',
            properties: {
                fileKey: { type: 'string', description: 'The Figma file key' },
                nodeIds: { type: 'array', items: { type: 'string' }, description: 'Array of node IDs to export' },
                format: { type: 'string', enum: ['png', 'jpg', 'svg', 'pdf'], description: 'Image export format (default: png)' },
                scale: { type: 'number', description: 'Export scale (0.01 to 4, default: 1)' },
            },
            required: ['fileKey', 'nodeIds'],
        },
    },
];

async function figma(path: string, token: string, opts: RequestInit = {}) {
    const res = await fetch(`${FIGMA_API}${path}`, {
        ...opts,
        headers: {
            'X-Figma-Token': token,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Figma API ${res.status}: ${err}`);
    }
    return res.json();
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'get_file': {
            const data = await figma(`/files/${args.fileKey}`, token) as any;
            return {
                name: data.name,
                lastModified: data.lastModified,
                version: data.version,
                role: data.role,
                editorType: data.editorType,
                thumbnailUrl: data.thumbnailUrl,
                pages: data.document?.children?.map((page: any) => ({
                    id: page.id,
                    name: page.name,
                    type: page.type,
                    childCount: page.children?.length ?? 0,
                })) ?? [],
            };
        }

        case 'get_file_nodes': {
            const ids = (args.nodeIds as string[]).join(',');
            const data = await figma(`/files/${args.fileKey}/nodes?ids=${encodeURIComponent(ids)}`, token) as any;
            const nodes: Record<string, unknown> = {};
            for (const [nodeId, nodeData] of Object.entries(data.nodes ?? {})) {
                const nd = nodeData as any;
                nodes[nodeId] = {
                    document: nd.document ? {
                        id: nd.document.id,
                        name: nd.document.name,
                        type: nd.document.type,
                        childCount: nd.document.children?.length ?? 0,
                    } : null,
                    components: nd.components ?? {},
                    styles: nd.styles ?? {},
                };
            }
            return { name: data.name, nodes };
        }

        case 'get_comments': {
            const data = await figma(`/files/${args.fileKey}/comments`, token) as any;
            return (data.comments ?? []).map((c: any) => ({
                id: c.id,
                message: c.message,
                user: c.user?.handle ?? c.user?.email ?? 'unknown',
                createdAt: c.created_at,
                resolvedAt: c.resolved_at,
                orderId: c.order_id,
            }));
        }

        case 'post_comment': {
            const body: Record<string, unknown> = { message: args.message };
            if (args.x !== undefined && args.y !== undefined) {
                body.client_meta = { x: args.x, y: args.y };
            }
            const comment = await figma(`/files/${args.fileKey}/comments`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as any;
            return {
                id: comment.id,
                message: comment.message,
                user: comment.user?.handle ?? comment.user?.email ?? 'unknown',
                createdAt: comment.created_at,
            };
        }

        case 'get_file_components': {
            const data = await figma(`/files/${args.fileKey}/components`, token) as any;
            return (data.meta?.components ?? []).map((c: any) => ({
                key: c.key,
                name: c.name,
                description: c.description,
                nodeId: c.node_id,
                thumbnailUrl: c.thumbnail_url,
                createdAt: c.created_at,
                updatedAt: c.updated_at,
            }));
        }

        case 'get_file_styles': {
            const data = await figma(`/files/${args.fileKey}/styles`, token) as any;
            return (data.meta?.styles ?? []).map((s: any) => ({
                key: s.key,
                name: s.name,
                description: s.description,
                styleType: s.style_type,
                nodeId: s.node_id,
                thumbnailUrl: s.thumbnail_url,
                createdAt: s.created_at,
                updatedAt: s.updated_at,
            }));
        }

        case 'get_image': {
            const ids = (args.nodeIds as string[]).join(',');
            const format = (args.format as string) ?? 'png';
            const scale = Math.min(Math.max(Number(args.scale ?? 1), 0.01), 4);
            const data = await figma(
                `/images/${args.fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`,
                token
            ) as any;
            return {
                images: data.images ?? {},
                err: data.err,
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'figma-mcp', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
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
                serverInfo: { name: 'figma-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            // Read token from injected secret header (underscore key → hyphen header)
            const token = request.headers.get('X-Mcp-Secret-FIGMA-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing FIGMA_ACCESS_TOKEN secret — add it to your workspace secrets');
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (e: any) {
                return rpcErr(id, -32603, e.message ?? 'Tool execution failed');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
