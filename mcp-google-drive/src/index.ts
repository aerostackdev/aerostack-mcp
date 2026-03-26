/**
 * Google Drive MCP Worker
 * Implements MCP protocol over HTTP for Google Drive API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secret: GOOGLE_ACCESS_TOKEN → header: X-Mcp-Secret-GOOGLE-ACCESS-TOKEN
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

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
        name: 'list_files',
        description: 'List files in Google Drive, optionally filtered by folder or MIME type',
        inputSchema: {
            type: 'object',
            properties: {
                folder_id: { type: 'string', description: 'Folder ID to list files from (optional, lists all files if omitted)' },
                limit: { type: 'number', description: 'Max files to return (default 20)' },
                mime_type: { type: 'string', description: 'Filter by MIME type (optional, e.g. application/vnd.google-apps.spreadsheet)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_file_metadata',
        description: 'Get metadata for a specific file in Google Drive',
        inputSchema: {
            type: 'object',
            properties: {
                file_id: { type: 'string', description: 'The ID of the file to retrieve' },
            },
            required: ['file_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_files',
        description: 'Search for files by name or full text content in Google Drive',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query — matches file names and content' },
                limit: { type: 'number', description: 'Max files to return (default 20)' },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_folder',
        description: 'Create a new folder in Google Drive',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Name of the new folder' },
                parent_id: { type: 'string', description: 'Parent folder ID (optional, defaults to root)' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'move_file',
        description: 'Move a file to a different folder in Google Drive',
        inputSchema: {
            type: 'object',
            properties: {
                file_id: { type: 'string', description: 'ID of the file to move' },
                new_parent_id: { type: 'string', description: 'ID of the destination folder' },
                current_parent_id: { type: 'string', description: 'ID of the current parent folder' },
            },
            required: ['file_id', 'new_parent_id', 'current_parent_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'copy_file',
        description: 'Copy a file in Google Drive',
        inputSchema: {
            type: 'object',
            properties: {
                file_id: { type: 'string', description: 'ID of the file to copy' },
                name: { type: 'string', description: 'Name for the copy (optional, defaults to "Copy of {original name}")' },
            },
            required: ['file_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_file',
        description: 'Delete a file or folder from Google Drive (moves to trash)',
        inputSchema: {
            type: 'object',
            properties: {
                file_id: { type: 'string', description: 'ID of the file or folder to delete' },
            },
            required: ['file_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'share_file',
        description: 'Share a file with a user or make it public',
        inputSchema: {
            type: 'object',
            properties: {
                file_id: { type: 'string', description: 'ID of the file to share' },
                email: { type: 'string', description: 'Email address to share with (omit to make public)' },
                role: { type: 'string', description: 'Permission role: reader, writer, or commenter (default: reader)' },
            },
            required: ['file_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'export_file_as_pdf',
        description: 'Export a Google Docs/Sheets/Slides file as a PDF (base64 encoded)',
        inputSchema: {
            type: 'object',
            properties: {
                file_id: { type: 'string', description: 'ID of the Google Docs/Sheets/Slides file to export' },
            },
            required: ['file_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_shared_drives',
        description: 'List all shared drives (Team Drives) accessible to the user',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max shared drives to return (default 20)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function driveRequest(
    method: string,
    path: string,
    token: string,
    params?: Record<string, string>,
    body?: unknown,
): Promise<Response> {
    const url = new URL(`${DRIVE_API}${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
    }

    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
    };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url.toString(), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    return res;
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'list_files': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const parts: string[] = [];

            if (args.folder_id) {
                parts.push(`'${args.folder_id}' in parents`);
            }
            if (args.mime_type) {
                parts.push(`mimeType='${args.mime_type}'`);
            }
            parts.push('trashed=false');

            const q = parts.join(' and ');
            const fields = 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents)';

            const res = await driveRequest('GET', '/files', token, { q, fields, pageSize: String(limit) });
            if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
            const data = await res.json() as any;
            return data.files ?? [];
        }

        case 'get_file_metadata': {
            const fileId = args.file_id as string;
            const fields = 'id,name,mimeType,size,modifiedTime,webViewLink,parents,description';
            const res = await driveRequest('GET', `/files/${fileId}`, token, { fields });
            if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
            return res.json();
        }

        case 'search_files': {
            const query = args.query as string;
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const q = `(name contains '${query}' or fullText contains '${query}') and trashed=false`;
            const fields = 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents)';

            const res = await driveRequest('GET', '/files', token, { q, fields, pageSize: String(limit) });
            if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
            const data = await res.json() as any;
            return data.files ?? [];
        }

        case 'create_folder': {
            const name = args.name as string;
            const parentId = (args.parent_id as string | undefined) ?? 'root';

            const res = await driveRequest('POST', '/files', token, undefined, {
                name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId],
            });
            if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
            const data = await res.json() as any;
            // Fetch full details including webViewLink
            const metaRes = await driveRequest('GET', `/files/${data.id}`, token, {
                fields: 'id,name,webViewLink',
            });
            if (!metaRes.ok) return { id: data.id, name: data.name };
            return metaRes.json();
        }

        case 'move_file': {
            const fileId = args.file_id as string;
            const newParentId = args.new_parent_id as string;
            const currentParentId = args.current_parent_id as string;

            const res = await driveRequest('PATCH', `/files/${fileId}`, token, {
                addParents: newParentId,
                removeParents: currentParentId,
                fields: 'id,name,parents',
            });
            if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
            return res.json();
        }

        case 'copy_file': {
            const fileId = args.file_id as string;
            const body: Record<string, unknown> = {};
            if (args.name) body.name = args.name;

            const res = await driveRequest('POST', `/files/${fileId}/copy`, token, {
                fields: 'id,name',
            }, body);
            if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
            return res.json();
        }

        case 'delete_file': {
            const fileId = args.file_id as string;
            const res = await driveRequest('DELETE', `/files/${fileId}`, token);
            if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
            return { deleted: true, file_id: fileId };
        }

        case 'share_file': {
            const fileId = args.file_id as string;
            const email = args.email as string | undefined;
            const role = (args.role as string | undefined) ?? 'reader';
            const type = email ? 'user' : 'anyone';

            const permBody: Record<string, unknown> = { role, type };
            if (email) permBody.emailAddress = email;

            const res = await driveRequest('POST', `/files/${fileId}/permissions`, token, {
                fields: 'id,role,type',
            }, permBody);
            if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
            return res.json();
        }

        case 'export_file_as_pdf': {
            const fileId = args.file_id as string;
            const url = new URL(`${DRIVE_API}/files/${fileId}/export`);
            url.searchParams.set('mimeType', 'application/pdf');

            const res = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);

            const buffer = await res.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);

            return {
                file_id: fileId,
                format: 'pdf',
                size_bytes: buffer.byteLength,
                base64,
            };
        }

        case 'list_shared_drives': {
            const limit = Math.min(Number(args.limit ?? 20), 100);
            const res = await driveRequest('GET', '/drives', token, {
                pageSize: String(limit),
                fields: 'drives(id,name,createdTime)',
            });
            if (!res.ok) throw new Error(`Drive API error ${res.status}: ${await res.text()}`);
            const data = await res.json() as any;
            return data.drives ?? [];
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'GET' && url.pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'google-drive-mcp', version: '1.0.0' }), {
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
                serverInfo: { name: 'google-drive-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const token = request.headers.get('X-Mcp-Secret-GOOGLE-ACCESS-TOKEN');
            if (!token) {
                return rpcErr(id, -32001, 'Missing GOOGLE_ACCESS_TOKEN secret — add it to your workspace secrets');
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
