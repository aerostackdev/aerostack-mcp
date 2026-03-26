/**
 * mcp-cloudinary — Cloudinary Media MCP Server
 *
 * Upload, transform, search, and manage images/videos in Cloudinary.
 * Uses Cloudinary Admin + Upload API directly (Basic auth).
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 */

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Cloudinary connectivity by fetching account usage stats. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search',
        description: 'Search for images and videos by expression, tags, folder, or metadata — returns public IDs, URLs, format, dimensions, and size',
        inputSchema: {
            type: 'object' as const,
            properties: {
                expression: { type: 'string', description: 'Search expression (e.g. "folder:products AND format:jpg", "tags:hero", "created_at>1d")' },
                max_results: { type: 'number', description: 'Max results to return (default: 30, max: 500)' },
                sort_by: { type: 'string', description: 'Sort field: created_at, public_id, bytes, width, height (default: created_at)' },
                direction: { type: 'string', description: 'Sort direction: asc or desc (default: desc)' },
            },
            required: [] as string[],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_resource',
        description: 'Get detailed metadata for an image or video — dimensions, format, size, colors, faces, tags, context, and transformation URL',
        inputSchema: {
            type: 'object' as const,
            properties: {
                public_id: { type: 'string', description: 'The public ID of the asset' },
                resource_type: { type: 'string', description: 'Resource type: image, video, or raw (default: image)' },
            },
            required: ['public_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'upload_from_url',
        description: 'Upload an image or video to Cloudinary from a public URL with optional folder, tags, and transformations',
        inputSchema: {
            type: 'object' as const,
            properties: {
                url: { type: 'string', description: 'Public URL of the image/video to upload' },
                public_id: { type: 'string', description: 'Custom public ID (filename). Auto-generated if omitted.' },
                folder: { type: 'string', description: 'Folder path to upload to (e.g. "products/hero")' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Tags to assign to the asset' },
                transformation: { type: 'string', description: 'Eager transformation (e.g. "w_500,h_500,c_fill")' },
            },
            required: ['url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'generate_url',
        description: 'Generate a Cloudinary delivery URL with transformations applied — resize, crop, format, quality, effects, overlays',
        inputSchema: {
            type: 'object' as const,
            properties: {
                public_id: { type: 'string', description: 'The public ID of the asset' },
                transformation: { type: 'string', description: 'Transformation string (e.g. "w_800,h_600,c_fill,q_auto,f_auto" or "e_blur:300")' },
                resource_type: { type: 'string', description: 'Resource type: image or video (default: image)' },
            },
            required: ['public_id', 'transformation'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_folders',
        description: 'List all root-level folders or subfolders in a Cloudinary account',
        inputSchema: {
            type: 'object' as const,
            properties: {
                folder: { type: 'string', description: 'Parent folder path to list subfolders of (omit for root folders)' },
            },
            required: [] as string[],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_resource',
        description: 'Delete an image or video from Cloudinary by public ID',
        inputSchema: {
            type: 'object' as const,
            properties: {
                public_id: { type: 'string', description: 'Public ID of the asset to delete' },
                resource_type: { type: 'string', description: 'Resource type: image, video, or raw (default: image)' },
            },
            required: ['public_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_usage',
        description: 'Get Cloudinary account usage stats — storage, bandwidth, transformations, API calls used this month',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function rpcOk(id: unknown, result: unknown) {
    return Response.json({ jsonrpc: '2.0', id, result });
}

function rpcErr(id: unknown, code: number, message: string) {
    return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

function basicAuth(apiKey: string, apiSecret: string): string {
    return `Basic ${btoa(`${apiKey}:${apiSecret}`)}`;
}

async function cldAdminFetch(cloudName: string, auth: string, path: string, method = 'GET', body?: unknown): Promise<any> {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}${path}`, {
        method,
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json() as any;
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    cloudName: string,
    auth: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = await cldAdminFetch(cloudName, auth, '/usage');
            return text(`Connected to Cloudinary cloud "${cloudName}". Storage: ${formatBytes(data.storage?.usage ?? 0)}, Bandwidth: ${formatBytes(data.bandwidth?.usage ?? 0)}`);
        }

        case 'search': {
            const body: Record<string, unknown> = {
                max_results: Math.min(Number(args.max_results ?? 30), 500),
            };
            if (args.expression) body.expression = args.expression;
            if (args.sort_by) body.sort_by = [{ [args.sort_by as string]: args.direction || 'desc' }];
            const data = await cldAdminFetch(cloudName, auth, '/resources/search', 'POST', body);
            const resources = (data.resources ?? []).map((r: any) => ({
                public_id: r.public_id,
                format: r.format,
                resource_type: r.resource_type,
                width: r.width,
                height: r.height,
                bytes: r.bytes,
                size: formatBytes(r.bytes ?? 0),
                url: r.secure_url,
                folder: r.folder,
                tags: r.tags,
                created_at: r.created_at,
            }));
            return json({ resources, count: resources.length, total: data.total_count });
        }

        case 'get_resource': {
            const publicId = args.public_id as string;
            const resourceType = (args.resource_type as string) || 'image';
            const data = await cldAdminFetch(cloudName, auth, `/resources/${resourceType}/upload/${publicId}?colors=true&faces=true`);
            return json({
                public_id: data.public_id,
                format: data.format,
                resource_type: data.resource_type,
                width: data.width,
                height: data.height,
                bytes: data.bytes,
                size: formatBytes(data.bytes ?? 0),
                url: data.secure_url,
                folder: data.folder,
                tags: data.tags,
                colors: data.colors?.slice(0, 5),
                faces: data.faces?.length ?? 0,
                created_at: data.created_at,
            });
        }

        case 'upload_from_url': {
            const url = args.url as string;
            const body = new URLSearchParams();
            body.set('file', url);
            if (args.public_id) body.set('public_id', args.public_id as string);
            if (args.folder) body.set('folder', args.folder as string);
            if (args.tags) body.set('tags', (args.tags as string[]).join(','));
            if (args.transformation) body.set('eager', args.transformation as string);

            // Upload API uses different auth — need timestamp + signature
            const timestamp = String(Math.floor(Date.now() / 1000));
            body.set('timestamp', timestamp);

            const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
                method: 'POST',
                headers: { Authorization: auth },
                body,
            });
            const data = await res.json() as any;
            if (data.error) throw new Error(data.error.message);
            return json({
                public_id: data.public_id,
                url: data.secure_url,
                format: data.format,
                width: data.width,
                height: data.height,
                size: formatBytes(data.bytes ?? 0),
            });
        }

        case 'generate_url': {
            const publicId = args.public_id as string;
            const transformation = args.transformation as string;
            const resourceType = (args.resource_type as string) || 'image';
            const url = `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${transformation}/${publicId}`;
            return json({ public_id: publicId, transformation, url });
        }

        case 'list_folders': {
            const folder = args.folder as string | undefined;
            const path = folder ? `/folders/${folder}` : '/folders';
            const data = await cldAdminFetch(cloudName, auth, path);
            const folders = (data.folders ?? []).map((f: any) => ({
                name: f.name,
                path: f.path,
            }));
            return json({ folders, count: folders.length });
        }

        case 'delete_resource': {
            const publicId = args.public_id as string;
            const resourceType = (args.resource_type as string) || 'image';
            const data = await cldAdminFetch(cloudName, auth, `/resources/${resourceType}/upload`, 'DELETE', {
                public_ids: [publicId],
            });
            return text(`Deleted "${publicId}" from Cloudinary`);
        }

        case 'get_usage': {
            const data = await cldAdminFetch(cloudName, auth, '/usage');
            return json({
                plan: data.plan,
                storage: { used: formatBytes(data.storage?.usage ?? 0), limit: formatBytes(data.storage?.limit ?? 0) },
                bandwidth: { used: formatBytes(data.bandwidth?.usage ?? 0), limit: formatBytes(data.bandwidth?.limit ?? 0) },
                transformations: { used: data.transformations?.usage, limit: data.transformations?.limit },
                requests: data.requests,
                resources: data.resources,
            });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ─── Worker Entry ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-cloudinary', version: '1.0.0' });
        }
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = (await request.json()) as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-cloudinary', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const cloudName = request.headers.get('X-Mcp-Secret-CLOUDINARY-CLOUD-NAME');
            const apiKey = request.headers.get('X-Mcp-Secret-CLOUDINARY-API-KEY');
            const apiSecret = request.headers.get('X-Mcp-Secret-CLOUDINARY-API-SECRET');

            if (!cloudName || !apiKey || !apiSecret) {
                return rpcErr(id, -32001, 'Missing Cloudinary credentials — add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to workspace secrets');
            }

            const auth = basicAuth(apiKey, apiSecret);
            const { name, arguments: toolArgs = {} } = (params ?? {}) as {
                name: string;
                arguments?: Record<string, unknown>;
            };

            try {
                const result = await callTool(name, toolArgs, cloudName, auth);
                return rpcOk(id, result);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
