/**
 * mcp-dropbox — Dropbox MCP Server
 *
 * List, upload, download, search, move, and manage files and folders in Dropbox.
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 *
 * Secret: DROPBOX_ACCESS_TOKEN → header: X-Mcp-Secret-DROPBOX-ACCESS-TOKEN
 */

const DROPBOX_API = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT = 'https://content.dropboxapi.com/2';

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Dropbox connectivity by fetching the current account info. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
    {
        name: 'list_folder',
        description: 'List files and folders at a given Dropbox path with metadata (name, type, size, modified date). Supports pagination via cursor.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'Dropbox folder path (e.g. "" for root, "/Documents", "/Photos/2026")' },
                recursive: { type: 'boolean', description: 'If true, list all contents recursively (default: false)' },
                limit: { type: 'number', description: 'Max entries to return per page (default: 100, max: 2000)' },
                cursor: { type: 'string', description: 'Pagination cursor from a previous list_folder response' },
            },
            required: [],
        },
    },
    {
        name: 'get_file_metadata',
        description: 'Get metadata for a file or folder — name, path, size, modified date, content hash, and sharing info',
        inputSchema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'Dropbox file or folder path (e.g. "/Documents/report.pdf")' },
            },
            required: ['path'],
        },
    },
    {
        name: 'download_file',
        description: 'Download a file from Dropbox. Returns text content inline for text files under 1MB; returns a temporary link for binary or large files.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'Dropbox file path to download (e.g. "/Documents/notes.txt")' },
            },
            required: ['path'],
        },
    },
    {
        name: 'upload_file',
        description: 'Upload text or JSON content to a Dropbox file. Creates or overwrites the file at the specified path.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'Destination path in Dropbox (e.g. "/Documents/config.json")' },
                content: { type: 'string', description: 'Text content to upload as the file body' },
                mode: { type: 'string', description: 'Write mode: "add" (fail if exists), "overwrite" (replace), or "update" (default: "overwrite")' },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'search',
        description: 'Search for files and folders in Dropbox by name or content. Returns matching paths with metadata.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Search query string' },
                path: { type: 'string', description: 'Scope search to a specific folder path (default: root)' },
                max_results: { type: 'number', description: 'Maximum number of results (default: 20, max: 100)' },
                file_categories: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Filter by category: "image", "document", "pdf", "spreadsheet", "presentation", "audio", "video", "folder", "paper", "others"',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'create_folder',
        description: 'Create a new folder at the specified Dropbox path',
        inputSchema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'Folder path to create (e.g. "/Projects/new-project")' },
            },
            required: ['path'],
        },
    },
    {
        name: 'delete',
        description: 'Delete a file or folder (and all its contents) from Dropbox',
        inputSchema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'Path of the file or folder to delete' },
            },
            required: ['path'],
        },
    },
    {
        name: 'move',
        description: 'Move or rename a file or folder in Dropbox',
        inputSchema: {
            type: 'object' as const,
            properties: {
                from_path: { type: 'string', description: 'Current path of the file or folder' },
                to_path: { type: 'string', description: 'New path (use for moving or renaming)' },
            },
            required: ['from_path', 'to_path'],
        },
    },
    {
        name: 'get_shared_link',
        description: 'Get or create a shared link for a Dropbox file or folder. Returns an existing link if one exists, otherwise creates a new one.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'Dropbox file or folder path to share' },
            },
            required: ['path'],
        },
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

async function dropboxRpc(endpoint: string, token: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${DROPBOX_API}${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Dropbox API error (${res.status}): ${errText}`);
    }
    return res.json();
}

async function dropboxContentDownload(endpoint: string, token: string, apiArg: unknown): Promise<Response> {
    const res = await fetch(`${DROPBOX_CONTENT}${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify(apiArg),
        },
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Dropbox API error (${res.status}): ${errText}`);
    }
    return res;
}

async function dropboxContentUpload(endpoint: string, token: string, apiArg: unknown, content: string): Promise<unknown> {
    const res = await fetch(`${DROPBOX_CONTENT}${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify(apiArg),
            'Content-Type': 'application/octet-stream',
        },
        body: content,
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Dropbox API error (${res.status}): ${errText}`);
    }
    return res.json();
}

const TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.json', '.csv', '.xml', '.yaml', '.yml', '.toml',
    '.html', '.htm', '.css', '.js', '.ts', '.jsx', '.tsx', '.py',
    '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.sh', '.bash',
    '.env', '.ini', '.cfg', '.conf', '.log', '.sql', '.graphql', '.svg',
]);

function isTextFile(path: string): boolean {
    const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
    return TEXT_EXTENSIONS.has(ext);
}

function formatEntry(entry: Record<string, unknown>) {
    return {
        name: entry.name,
        path: entry.path_display ?? entry.path_lower,
        type: entry['.tag'],
        size: entry.size,
        modified: entry.client_modified ?? entry.server_modified,
        content_hash: entry.content_hash,
    };
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const account = (await dropboxRpc('/users/get_current_account', token, null)) as Record<string, unknown>;
            const nameInfo = account.name as Record<string, string>;
            return text(`Connected to Dropbox. Account: ${nameInfo?.display_name} (${account.email})`);
        }

        case 'list_folder': {
            const cursor = args.cursor as string | undefined;
            let data: Record<string, unknown>;

            if (cursor) {
                data = (await dropboxRpc('/files/list_folder/continue', token, { cursor })) as Record<string, unknown>;
            } else {
                const path = (args.path as string) ?? '';
                const recursive = (args.recursive as boolean) ?? false;
                const limit = Math.min(Number(args.limit ?? 100), 2000);
                data = (await dropboxRpc('/files/list_folder', token, {
                    path: path === '/' ? '' : path,
                    recursive,
                    limit,
                })) as Record<string, unknown>;
            }

            const entries = ((data.entries as Record<string, unknown>[]) ?? []).map(formatEntry);
            return json({
                entries,
                count: entries.length,
                has_more: data.has_more,
                cursor: data.cursor,
            });
        }

        case 'get_file_metadata': {
            const path = args.path as string;
            const meta = (await dropboxRpc('/files/get_metadata', token, {
                path,
                include_media_info: true,
            })) as Record<string, unknown>;
            return json(formatEntry(meta));
        }

        case 'download_file': {
            const path = args.path as string;
            if (isTextFile(path)) {
                const res = await dropboxContentDownload('/files/download', token, { path });
                const resultHeader = res.headers.get('Dropbox-API-Result');
                const meta = resultHeader ? JSON.parse(resultHeader) : {};
                const size = meta.size ?? 0;
                if (size < 1_000_000) {
                    const content = await res.text();
                    return json({ path, size, content });
                }
            }
            // Binary or large file — get a temporary download link
            const linkData = (await dropboxRpc('/files/get_temporary_link', token, { path })) as Record<string, unknown>;
            return json({
                path,
                download_url: linkData.link,
                note: 'Binary or large file — use the download_url (valid for 4 hours)',
            });
        }

        case 'upload_file': {
            const path = args.path as string;
            const content = args.content as string;
            const mode = (args.mode as string) || 'overwrite';
            const meta = (await dropboxContentUpload('/files/upload', token, {
                path,
                mode,
                autorename: false,
                mute: false,
            }, content)) as Record<string, unknown>;
            return text(`Uploaded "${meta.path_display}" (${(meta.size as number) ?? content.length} bytes)`);
        }

        case 'search': {
            const query = args.query as string;
            const maxResults = Math.min(Number(args.max_results ?? 20), 100);
            const searchBody: Record<string, unknown> = {
                query,
                options: {
                    max_results: maxResults,
                    file_status: 'active',
                },
            };
            if (args.path) {
                (searchBody.options as Record<string, unknown>).path_scope = args.path;
            }
            if (args.file_categories) {
                (searchBody.options as Record<string, unknown>).file_categories = (args.file_categories as string[]).map(
                    (c) => ({ '.tag': c }),
                );
            }
            const data = (await dropboxRpc('/files/search_v2', token, searchBody)) as Record<string, unknown>;
            const matches = ((data.matches as Record<string, unknown>[]) ?? []).map((m) => {
                const metadata = (m.metadata as Record<string, unknown>)?.metadata as Record<string, unknown>;
                return formatEntry(metadata ?? {});
            });
            return json({ matches, count: matches.length, has_more: data.has_more });
        }

        case 'create_folder': {
            const path = args.path as string;
            const data = (await dropboxRpc('/files/create_folder_v2', token, {
                path,
                autorename: false,
            })) as Record<string, unknown>;
            const meta = data.metadata as Record<string, unknown>;
            return text(`Created folder "${meta?.path_display ?? path}"`);
        }

        case 'delete': {
            const path = args.path as string;
            const data = (await dropboxRpc('/files/delete_v2', token, { path })) as Record<string, unknown>;
            const meta = data.metadata as Record<string, unknown>;
            return text(`Deleted "${meta?.path_display ?? path}"`);
        }

        case 'move': {
            const fromPath = args.from_path as string;
            const toPath = args.to_path as string;
            const data = (await dropboxRpc('/files/move_v2', token, {
                from_path: fromPath,
                to_path: toPath,
                autorename: false,
            })) as Record<string, unknown>;
            const meta = data.metadata as Record<string, unknown>;
            return text(`Moved "${fromPath}" → "${meta?.path_display ?? toPath}"`);
        }

        case 'get_shared_link': {
            const path = args.path as string;
            // Try to get existing shared links first
            try {
                const existing = (await dropboxRpc('/sharing/list_shared_links', token, {
                    path,
                    direct_only: true,
                })) as Record<string, unknown>;
                const links = existing.links as Record<string, unknown>[];
                if (links && links.length > 0) {
                    return json({
                        url: links[0].url,
                        path: links[0].path_lower,
                        visibility: (links[0].link_permissions as Record<string, unknown>)?.resolved_visibility,
                        existing: true,
                    });
                }
            } catch {
                // No existing link — create one below
            }
            // Create a new shared link
            const link = (await dropboxRpc('/sharing/create_shared_link_with_settings', token, {
                path,
                settings: { requested_visibility: 'public' },
            })) as Record<string, unknown>;
            return json({
                url: link.url,
                path: link.path_lower,
                visibility: 'public',
                existing: false,
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
            return Response.json({ status: 'ok', server: 'mcp-dropbox', version: '1.0.0' });
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
                serverInfo: { name: 'mcp-dropbox', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-DROPBOX-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing DROPBOX_ACCESS_TOKEN — add it to your workspace secrets');
            }

            const { name, arguments: toolArgs = {} } = (params ?? {}) as {
                name: string;
                arguments?: Record<string, unknown>;
            };

            try {
                const result = await callTool(name, toolArgs, token);
                return rpcOk(id, result);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
