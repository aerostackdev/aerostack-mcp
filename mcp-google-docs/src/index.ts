/**
 * Google Docs MCP Worker
 * Create, read, edit, and format Google Docs via the Google Docs API.
 *
 * Secret: GOOGLE_ACCESS_TOKEN → X-Mcp-Secret-GOOGLE-ACCESS-TOKEN
 * Scopes: https://www.googleapis.com/auth/documents, https://www.googleapis.com/auth/drive.file
 *
 * Covers: Documents (3), Content (4), Formatting (3), Comments (3), Collaboration (2) = 15 tools
 */

const DOCS_API = 'https://docs.googleapis.com/v1';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

function rpcOk(id: number | string, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { 'Content-Type': 'application/json' } });
}

function rpcErr(id: number | string | null, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function gFetch(url: string, token: string, method = 'GET', body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (!res.ok) throw new Error(`Google API error (${res.status}): ${text.slice(0, 500)}`);
    if (!text) return { success: true };
    try { return JSON.parse(text); } catch { return { raw: text }; }
}

const TOOLS = [
    // ── Documents ───────────────────────────────────────────────────────────
    { name: 'create_document', description: 'Create a new blank Google Doc with a title',
        inputSchema: { type: 'object', properties: {
            title: { type: 'string', description: 'Document title' },
        }, required: ['title'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'get_document', description: 'Get a document with its full content structure (paragraphs, tables, lists)',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
        }, required: ['document_id'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'list_documents', description: 'List Google Docs in Drive with title, last modified, and sharing info',
        inputSchema: { type: 'object', properties: {
            query: { type: 'string', description: 'Search query (e.g. "name contains \'report\'")' },
            max_results: { type: 'number', description: 'Max results (default 20)' },
        } }, annotations: { readOnlyHint: true, destructiveHint: false } },

    // ── Content Editing ─────────────────────────────────────────────────────
    { name: 'insert_text', description: 'Insert text at a specific position in the document',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
            text: { type: 'string', description: 'Text to insert' },
            index: { type: 'number', description: 'Character index to insert at (1 = start of document)' },
        }, required: ['document_id', 'text', 'index'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'append_text', description: 'Append text to the end of the document',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
            text: { type: 'string', description: 'Text to append' },
        }, required: ['document_id', 'text'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'replace_text', description: 'Find and replace text throughout the document',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
            find: { type: 'string', description: 'Text to find' },
            replace_with: { type: 'string', description: 'Replacement text' },
            match_case: { type: 'boolean', description: 'Case-sensitive match (default: false)' },
        }, required: ['document_id', 'find', 'replace_with'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'delete_content', description: 'Delete content in a range of character indices',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
            start_index: { type: 'number', description: 'Start character index (inclusive)' },
            end_index: { type: 'number', description: 'End character index (exclusive)' },
        }, required: ['document_id', 'start_index', 'end_index'] }, annotations: { readOnlyHint: false, destructiveHint: true } },

    // ── Formatting ──────────────────────────────────────────────────────────
    { name: 'format_text', description: 'Apply formatting (bold, italic, font size, color) to a text range',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
            start_index: { type: 'number', description: 'Start character index' },
            end_index: { type: 'number', description: 'End character index' },
            bold: { type: 'boolean', description: 'Bold text' },
            italic: { type: 'boolean', description: 'Italic text' },
            underline: { type: 'boolean', description: 'Underline text' },
            font_size: { type: 'number', description: 'Font size in points' },
            font_family: { type: 'string', description: 'Font family (e.g. "Arial")' },
            color: { type: 'string', description: 'Text color as hex (e.g. "#FF0000")' },
        }, required: ['document_id', 'start_index', 'end_index'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'set_paragraph_style', description: 'Set paragraph heading level, alignment, or spacing',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
            start_index: { type: 'number', description: 'Start index of paragraph' },
            end_index: { type: 'number', description: 'End index of paragraph' },
            heading: { type: 'string', enum: ['NORMAL_TEXT', 'HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'HEADING_5', 'HEADING_6', 'TITLE', 'SUBTITLE'], description: 'Heading style' },
            alignment: { type: 'string', enum: ['START', 'CENTER', 'END', 'JUSTIFIED'], description: 'Text alignment' },
        }, required: ['document_id', 'start_index', 'end_index'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'insert_table', description: 'Insert a table at a position in the document',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
            rows: { type: 'number', description: 'Number of rows' },
            columns: { type: 'number', description: 'Number of columns' },
            index: { type: 'number', description: 'Character index to insert at' },
        }, required: ['document_id', 'rows', 'columns', 'index'] }, annotations: { readOnlyHint: false, destructiveHint: false } },

    // ── Comments ────────────────────────────────────────────────────────────
    { name: 'list_comments', description: 'List all comments on a document with replies',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
        }, required: ['document_id'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
    { name: 'add_comment', description: 'Add a comment to the document (anchored to quoted text)',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
            content: { type: 'string', description: 'Comment text' },
            quoted_text: { type: 'string', description: 'Text in the document to anchor the comment to' },
        }, required: ['document_id', 'content'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'resolve_comment', description: 'Resolve (close) a comment',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
            comment_id: { type: 'string', description: 'Comment ID' },
        }, required: ['document_id', 'comment_id'] }, annotations: { readOnlyHint: false, destructiveHint: false } },

    // ── Collaboration ───────────────────────────────────────────────────────
    { name: 'share_document', description: 'Share a document with a user (viewer, commenter, or editor)',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
            email: { type: 'string', description: 'Email address to share with' },
            role: { type: 'string', enum: ['reader', 'commenter', 'writer'], description: 'Permission role' },
            send_notification: { type: 'boolean', description: 'Send email notification (default: true)' },
        }, required: ['document_id', 'email', 'role'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
    { name: 'get_document_permissions', description: 'List who has access to a document and their roles',
        inputSchema: { type: 'object', properties: {
            document_id: { type: 'string', description: 'Google Doc ID' },
        }, required: ['document_id'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
];

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
    const h = hex.replace('#', '');
    return { red: parseInt(h.slice(0, 2), 16) / 255, green: parseInt(h.slice(2, 4), 16) / 255, blue: parseInt(h.slice(4, 6), 16) / 255 };
}

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case 'create_document':
            return gFetch(`${DOCS_API}/documents`, token, 'POST', { title: args.title });
        case 'get_document':
            return gFetch(`${DOCS_API}/documents/${args.document_id}`, token);
        case 'list_documents': {
            const max = (args.max_results as number) || 20;
            let q = "mimeType='application/vnd.google-apps.document'";
            if (args.query) q += ` and ${args.query}`;
            return gFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&pageSize=${max}&fields=files(id,name,modifiedTime,owners,shared)`, token);
        }
        case 'insert_text':
            return gFetch(`${DOCS_API}/documents/${args.document_id}:batchUpdate`, token, 'POST', {
                requests: [{ insertText: { text: args.text, location: { index: args.index } } }],
            });
        case 'append_text': {
            const doc = await gFetch(`${DOCS_API}/documents/${args.document_id}`, token) as any;
            const endIndex = doc.body?.content?.slice(-1)?.[0]?.endIndex || 1;
            return gFetch(`${DOCS_API}/documents/${args.document_id}:batchUpdate`, token, 'POST', {
                requests: [{ insertText: { text: args.text, location: { index: Math.max(1, endIndex - 1) } } }],
            });
        }
        case 'replace_text':
            return gFetch(`${DOCS_API}/documents/${args.document_id}:batchUpdate`, token, 'POST', {
                requests: [{ replaceAllText: { containsText: { text: args.find, matchCase: args.match_case || false }, replaceText: args.replace_with } }],
            });
        case 'delete_content':
            return gFetch(`${DOCS_API}/documents/${args.document_id}:batchUpdate`, token, 'POST', {
                requests: [{ deleteContentRange: { range: { startIndex: args.start_index, endIndex: args.end_index } } }],
            });
        case 'format_text': {
            const style: Record<string, unknown> = {};
            const fields: string[] = [];
            if (args.bold !== undefined) { style.bold = args.bold; fields.push('bold'); }
            if (args.italic !== undefined) { style.italic = args.italic; fields.push('italic'); }
            if (args.underline !== undefined) { style.underline = args.underline; fields.push('underline'); }
            if (args.font_size) { style.fontSize = { magnitude: args.font_size, unit: 'PT' }; fields.push('fontSize'); }
            if (args.font_family) { style.weightedFontFamily = { fontFamily: args.font_family }; fields.push('weightedFontFamily'); }
            if (args.color) { style.foregroundColor = { color: { rgbColor: hexToRgb(args.color as string) } }; fields.push('foregroundColor'); }
            return gFetch(`${DOCS_API}/documents/${args.document_id}:batchUpdate`, token, 'POST', {
                requests: [{ updateTextStyle: { textStyle: style, range: { startIndex: args.start_index, endIndex: args.end_index }, fields: fields.join(',') } }],
            });
        }
        case 'set_paragraph_style': {
            const pStyle: Record<string, unknown> = {};
            const fields: string[] = [];
            if (args.heading) { pStyle.namedStyleType = args.heading; fields.push('namedStyleType'); }
            if (args.alignment) { pStyle.alignment = args.alignment; fields.push('alignment'); }
            return gFetch(`${DOCS_API}/documents/${args.document_id}:batchUpdate`, token, 'POST', {
                requests: [{ updateParagraphStyle: { paragraphStyle: pStyle, range: { startIndex: args.start_index, endIndex: args.end_index }, fields: fields.join(',') } }],
            });
        }
        case 'insert_table':
            return gFetch(`${DOCS_API}/documents/${args.document_id}:batchUpdate`, token, 'POST', {
                requests: [{ insertTable: { rows: args.rows, columns: args.columns, location: { index: args.index } } }],
            });
        case 'list_comments':
            return gFetch(`${DRIVE_API}/files/${args.document_id}/comments?fields=comments(id,content,author,resolved,replies)`, token);
        case 'add_comment': {
            const comment: Record<string, unknown> = { content: args.content };
            if (args.quoted_text) comment.quotedFileContent = { mimeType: 'text/plain', value: args.quoted_text };
            return gFetch(`${DRIVE_API}/files/${args.document_id}/comments?fields=id,content,author`, token, 'POST', comment);
        }
        case 'resolve_comment':
            return gFetch(`${DRIVE_API}/files/${args.document_id}/comments/${args.comment_id}`, token, 'PATCH', { resolved: true });
        case 'share_document':
            return gFetch(`${DRIVE_API}/files/${args.document_id}/permissions?sendNotificationEmail=${args.send_notification !== false}`, token, 'POST', {
                type: 'user', emailAddress: args.email, role: args.role,
            });
        case 'get_document_permissions':
            return gFetch(`${DRIVE_API}/files/${args.document_id}/permissions?fields=permissions(id,emailAddress,role,displayName)`, token);
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-google-docs', version: '1.0.0', tools: TOOLS.length }), { headers: { 'Content-Type': 'application/json' } });
        }
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
        try { body = await request.json(); } catch { return rpcErr(null, -32700, 'Parse error'); }
        const { id, method, params } = body;

        if (method === 'initialize') return rpcOk(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mcp-google-docs', version: '1.0.0' } });
        if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });

        if (method === 'tools/call') {
            const token = request.headers.get('X-Mcp-Secret-GOOGLE-ACCESS-TOKEN');
            if (!token) return rpcErr(id, -32001, 'Missing GOOGLE_ACCESS_TOKEN — add your Google access token to workspace secrets');
            try {
                const result = await callTool(params?.name as string, (params?.arguments ?? {}) as Record<string, unknown>, token);
                return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
            } catch (e: unknown) {
                return rpcErr(id, -32603, e instanceof Error ? e.message : 'Tool execution failed');
            }
        }
        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
