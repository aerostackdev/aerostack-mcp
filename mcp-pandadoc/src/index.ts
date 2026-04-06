/**
 * PandaDoc MCP Worker
 * Implements MCP protocol over HTTP for PandaDoc document operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   PANDADOC_API_KEY  → X-Mcp-Secret-PANDADOC-API-KEY  (PandaDoc API key)
 *
 * Auth format: Authorization: API-Key {api_key}
 * Note: PandaDoc uses "API-Key" prefix, NOT "Bearer"
 *
 * Covers: Documents (6), Templates (4), Recipients & Fields (4),
 *         Status & Tracking (4), Webhooks (2) = 20 tools total
 *
 * Rate limit: 60 requests per minute (default)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const PANDADOC_API_BASE = 'https://api.pandadoc.com/public/v1';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

function getSecrets(request: Request): { apiKey: string | null } {
    return {
        apiKey: request.headers.get('X-Mcp-Secret-PANDADOC-API-KEY'),
    };
}

async function pandaFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${PANDADOC_API_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `API-Key ${apiKey}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return { success: true };

    // Handle binary PDF download
    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
        if (!res.ok) {
            throw { code: -32603, message: `PandaDoc API error ${res.status}: ${res.statusText}` };
        }
        const buffer = await res.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return { pdf_base64: base64, content_type: contentType };
    }

    const text = await res.text();
    if (!text) return { success: true };

    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `PandaDoc HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object') {
            const d = data as { detail?: string; type?: string };
            msg = d.detail || d.type || msg;
        }
        throw { code: -32603, message: `PandaDoc API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify PandaDoc credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    // ── Group 1 — Documents (6 tools) ─────────────────────────────────────────

    {
        name: 'list_documents',
        description: 'List documents with optional status filter. Returns name, status, date_created, date_modified for each document.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    description: 'Filter by document status: document.draft, document.sent, document.completed, document.declined',
                },
                q: {
                    type: 'string',
                    description: 'Search query to filter documents by name',
                },
                count: {
                    type: 'number',
                    description: 'Number of documents to return (max 100, default 50)',
                },
                page: {
                    type: 'number',
                    description: 'Page number for pagination (default 1)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_document',
        description: 'Get full details of a document by ID. Returns name, status, date_created, date_modified, recipients, and expiration_date.',
        inputSchema: {
            type: 'object',
            properties: {
                document_id: {
                    type: 'string',
                    description: 'PandaDoc document ID',
                },
            },
            required: ['document_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_document',
        description: 'Create a new document from a template. Supports variable substitution via tokens.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Document name (required)',
                },
                template_uuid: {
                    type: 'string',
                    description: 'UUID of the template to create from (required)',
                },
                recipients: {
                    type: 'array',
                    description: 'Array of recipient objects',
                    items: {
                        type: 'object',
                        properties: {
                            email: { type: 'string', description: 'Recipient email address' },
                            first_name: { type: 'string', description: 'Recipient first name' },
                            last_name: { type: 'string', description: 'Recipient last name' },
                            role: { type: 'string', description: 'Recipient role as defined in template (e.g. "Signer", "Client")' },
                        },
                        required: ['email'],
                    },
                },
                tokens: {
                    type: 'array',
                    description: 'Array of variable substitution tokens',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Token name (e.g. "client.name")' },
                            value: { type: 'string', description: 'Token value to substitute' },
                        },
                        required: ['name', 'value'],
                    },
                },
            },
            required: ['name', 'template_uuid'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_document',
        description: 'Send a document to recipients for signing. Document must be in draft status.',
        inputSchema: {
            type: 'object',
            properties: {
                document_id: {
                    type: 'string',
                    description: 'PandaDoc document ID to send',
                },
                message: {
                    type: 'string',
                    description: 'Personal message to include in the email to recipients',
                },
                subject: {
                    type: 'string',
                    description: 'Email subject line (defaults to document name)',
                },
                silent: {
                    type: 'boolean',
                    description: 'If true, send without email notification (default false)',
                },
            },
            required: ['document_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'download_document',
        description: 'Download a completed and signed document as a base64-encoded PDF.',
        inputSchema: {
            type: 'object',
            properties: {
                document_id: {
                    type: 'string',
                    description: 'PandaDoc document ID to download (must be completed)',
                },
            },
            required: ['document_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_document',
        description: 'Delete a document. Only draft documents can be deleted.',
        inputSchema: {
            type: 'object',
            properties: {
                document_id: {
                    type: 'string',
                    description: 'PandaDoc document ID to delete',
                },
            },
            required: ['document_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 2 — Templates (4 tools) ─────────────────────────────────────────

    {
        name: 'list_templates',
        description: 'List available templates. Returns name, UUID, date_created, and date_modified.',
        inputSchema: {
            type: 'object',
            properties: {
                q: {
                    type: 'string',
                    description: 'Search query to filter templates by name',
                },
                tag: {
                    type: 'string',
                    description: 'Filter templates by tag',
                },
                count: {
                    type: 'number',
                    description: 'Number of templates to return (default 50)',
                },
                page: {
                    type: 'number',
                    description: 'Page number for pagination (default 1)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_template',
        description: 'Get template details by UUID. Returns name, roles, date_created, and date_modified.',
        inputSchema: {
            type: 'object',
            properties: {
                template_uuid: {
                    type: 'string',
                    description: 'PandaDoc template UUID',
                },
            },
            required: ['template_uuid'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_from_pdf',
        description: 'Create a new document from a PDF URL. Useful for uploading existing contracts or agreements.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Document name (required)',
                },
                url: {
                    type: 'string',
                    description: 'Publicly accessible URL of the PDF to upload (required)',
                },
                recipients: {
                    type: 'array',
                    description: 'Array of recipient objects',
                    items: {
                        type: 'object',
                        properties: {
                            email: { type: 'string' },
                            first_name: { type: 'string' },
                            last_name: { type: 'string' },
                            role: { type: 'string' },
                        },
                        required: ['email'],
                    },
                },
                fields: {
                    type: 'object',
                    description: 'Field definitions for the PDF (key: field_name, value: {role, type})',
                },
            },
            required: ['name', 'url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_template_folders',
        description: 'List all template folders in the workspace.',
        inputSchema: {
            type: 'object',
            properties: {
                count: {
                    type: 'number',
                    description: 'Number of folders to return',
                },
                page: {
                    type: 'number',
                    description: 'Page number for pagination',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Recipients & Fields (4 tools) ───────────────────────────────

    {
        name: 'list_recipients',
        description: 'Get all recipients for a document. Returns email, name, role, and signature status (completed/viewed/sent).',
        inputSchema: {
            type: 'object',
            properties: {
                document_id: {
                    type: 'string',
                    description: 'PandaDoc document ID',
                },
            },
            required: ['document_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_recipient',
        description: 'Add a new recipient to a draft document.',
        inputSchema: {
            type: 'object',
            properties: {
                document_id: {
                    type: 'string',
                    description: 'PandaDoc document ID (must be in draft status)',
                },
                email: {
                    type: 'string',
                    description: 'Recipient email address (required)',
                },
                first_name: {
                    type: 'string',
                    description: 'Recipient first name',
                },
                last_name: {
                    type: 'string',
                    description: 'Recipient last name',
                },
                role: {
                    type: 'string',
                    description: 'Recipient role as defined in template (e.g. "Signer", "Approver")',
                },
            },
            required: ['document_id', 'email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_document_fields',
        description: 'Get all form fields in a document. Returns field id, name, type, required flag, and current value.',
        inputSchema: {
            type: 'object',
            properties: {
                document_id: {
                    type: 'string',
                    description: 'PandaDoc document ID',
                },
            },
            required: ['document_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_field_values',
        description: 'Update form field values in a draft document. Pass a fields object where keys are field names and values are the new values.',
        inputSchema: {
            type: 'object',
            properties: {
                document_id: {
                    type: 'string',
                    description: 'PandaDoc document ID (must be in draft status)',
                },
                fields: {
                    type: 'object',
                    description: 'Object mapping field names to values (e.g. {"client_name": "Acme Corp", "contract_value": "50000"})',
                },
            },
            required: ['document_id', 'fields'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Status & Tracking (4 tools) ─────────────────────────────────

    {
        name: 'get_document_status',
        description: 'Get just the current status of a document. Returns: draft, sent, completed, declined, or expired.',
        inputSchema: {
            type: 'object',
            properties: {
                document_id: {
                    type: 'string',
                    description: 'PandaDoc document ID',
                },
            },
            required: ['document_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_document_activity',
        description: 'Get the activity/audit trail for a document. Returns opens, views, and completions with timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                document_id: {
                    type: 'string',
                    description: 'PandaDoc document ID',
                },
            },
            required: ['document_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'send_reminder',
        description: 'Send a signing reminder to pending recipients who have not yet signed.',
        inputSchema: {
            type: 'object',
            properties: {
                document_id: {
                    type: 'string',
                    description: 'PandaDoc document ID (must be in sent status)',
                },
            },
            required: ['document_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_document_sections',
        description: 'List all sections in a document.',
        inputSchema: {
            type: 'object',
            properties: {
                document_id: {
                    type: 'string',
                    description: 'PandaDoc document ID',
                },
            },
            required: ['document_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 5 — Webhooks (2 tools) ──────────────────────────────────────────

    {
        name: 'list_webhooks',
        description: 'List all configured webhooks in the workspace.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_webhook',
        description: 'Create a new webhook to receive document event notifications.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Webhook name (required)',
                },
                url: {
                    type: 'string',
                    description: 'HTTPS endpoint URL to receive events (required)',
                },
                payload_type: {
                    type: 'string',
                    description: 'Payload format: json or form_urlencoded (default: json)',
                },
                triggers: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Event triggers: document_state_changed, recipient_completed, document_created, document_updated',
                },
            },
            required: ['name', 'url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await pandaFetch('/templates?count=1', apiKey);
            return { content: [{ type: 'text', text: 'Connected to PandaDoc' }] };
        }

        // ── Documents ───────────────────────────────────────────────────────────

        case 'list_documents': {
            const params = new URLSearchParams();
            if (args.status) params.set('status', args.status as string);
            if (args.q) params.set('q', args.q as string);
            if (args.count) params.set('count', String(args.count));
            if (args.page) params.set('page', String(args.page));
            const qs = params.toString();
            return pandaFetch(`/documents${qs ? `?${qs}` : ''}`, apiKey);
        }

        case 'get_document': {
            validateRequired(args, ['document_id']);
            return pandaFetch(`/documents/${args.document_id}`, apiKey);
        }

        case 'create_document': {
            validateRequired(args, ['name', 'template_uuid']);
            const body: Record<string, unknown> = {
                name: args.name,
                template_uuid: args.template_uuid,
            };
            if (args.recipients !== undefined) body.recipients = args.recipients;
            if (args.tokens !== undefined) body.tokens = args.tokens;
            return pandaFetch('/documents', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'send_document': {
            validateRequired(args, ['document_id']);
            const body: Record<string, unknown> = {};
            if (args.message !== undefined) body.message = args.message;
            if (args.subject !== undefined) body.subject = args.subject;
            if (args.silent !== undefined) body.silent = args.silent;
            return pandaFetch(`/documents/${args.document_id}/send`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'download_document': {
            validateRequired(args, ['document_id']);
            return pandaFetch(`/documents/${args.document_id}/download`, apiKey, {
                headers: { 'Accept': 'application/pdf' },
            });
        }

        case 'delete_document': {
            validateRequired(args, ['document_id']);
            return pandaFetch(`/documents/${args.document_id}`, apiKey, { method: 'DELETE' });
        }

        // ── Templates ───────────────────────────────────────────────────────────

        case 'list_templates': {
            const params = new URLSearchParams();
            if (args.q) params.set('q', args.q as string);
            if (args.tag) params.set('tag', args.tag as string);
            if (args.count) params.set('count', String(args.count));
            if (args.page) params.set('page', String(args.page));
            const qs = params.toString();
            return pandaFetch(`/templates${qs ? `?${qs}` : ''}`, apiKey);
        }

        case 'get_template': {
            validateRequired(args, ['template_uuid']);
            return pandaFetch(`/templates/${args.template_uuid}`, apiKey);
        }

        case 'create_from_pdf': {
            validateRequired(args, ['name', 'url']);
            const body: Record<string, unknown> = {
                name: args.name,
                url: args.url,
            };
            if (args.recipients !== undefined) body.recipients = args.recipients;
            if (args.fields !== undefined) body.fields = args.fields;
            return pandaFetch('/documents', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_template_folders': {
            const params = new URLSearchParams();
            if (args.count) params.set('count', String(args.count));
            if (args.page) params.set('page', String(args.page));
            const qs = params.toString();
            return pandaFetch(`/templates/folders${qs ? `?${qs}` : ''}`, apiKey);
        }

        // ── Recipients & Fields ─────────────────────────────────────────────────

        case 'list_recipients': {
            validateRequired(args, ['document_id']);
            const doc = await pandaFetch(`/documents/${args.document_id}`, apiKey) as {
                recipients?: unknown[];
            };
            return doc.recipients ?? [];
        }

        case 'add_recipient': {
            validateRequired(args, ['document_id', 'email']);
            const body: Record<string, unknown> = {
                recipients: [{
                    email: args.email,
                    ...(args.first_name !== undefined ? { first_name: args.first_name } : {}),
                    ...(args.last_name !== undefined ? { last_name: args.last_name } : {}),
                    ...(args.role !== undefined ? { role: args.role } : {}),
                }],
            };
            return pandaFetch(`/documents/${args.document_id}/recipients`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_document_fields': {
            validateRequired(args, ['document_id']);
            return pandaFetch(`/documents/${args.document_id}/fields`, apiKey);
        }

        case 'update_field_values': {
            validateRequired(args, ['document_id', 'fields']);
            const fields = args.fields as Record<string, unknown>;
            const fieldsArray = Object.entries(fields).map(([name, value]) => ({ name, value }));
            return pandaFetch(`/documents/${args.document_id}/fields`, apiKey, {
                method: 'PUT',
                body: JSON.stringify({ fields: fieldsArray }),
            });
        }

        // ── Status & Tracking ───────────────────────────────────────────────────

        case 'get_document_status': {
            validateRequired(args, ['document_id']);
            const doc = await pandaFetch(`/documents/${args.document_id}`, apiKey) as {
                status?: string;
                id?: string;
                name?: string;
            };
            return { id: doc.id, name: doc.name, status: doc.status };
        }

        case 'get_document_activity': {
            validateRequired(args, ['document_id']);
            return pandaFetch(`/documents/${args.document_id}/session`, apiKey);
        }

        case 'send_reminder': {
            validateRequired(args, ['document_id']);
            return pandaFetch(`/documents/${args.document_id}/remind`, apiKey, {
                method: 'POST',
                body: JSON.stringify({}),
            });
        }

        case 'list_document_sections': {
            validateRequired(args, ['document_id']);
            return pandaFetch(`/documents/${args.document_id}/sections`, apiKey);
        }

        // ── Webhooks ─────────────────────────────────────────────────────────────

        case 'list_webhooks': {
            return pandaFetch('/webhook-subscriptions', apiKey);
        }

        case 'create_webhook': {
            validateRequired(args, ['name', 'url']);
            const body: Record<string, unknown> = {
                name: args.name,
                url: args.url,
            };
            if (args.payload_type !== undefined) body.payload_type = args.payload_type;
            if (args.triggers !== undefined) body.triggers = args.triggers;
            return pandaFetch('/webhook-subscriptions', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        default:
            throw { code: -32601, message: `Unknown tool: ${name}` };
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-pandadoc', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        // ── MCP protocol methods ──────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-pandadoc', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name;
            const args = p?.arguments ?? {};

            // Validate secrets
            const { apiKey } = getSecrets(request);
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: PANDADOC_API_KEY (header: X-Mcp-Secret-PANDADOC-API-KEY)');
            }

            try {
                const result = await callTool(toolName, args, apiKey);
                return rpcOk(id, toolOk(result));
            } catch (err: unknown) {
                if (err && typeof err === 'object' && 'code' in err) {
                    const e = err as { code: number; message: string };
                    return rpcErr(id, e.code, e.message);
                }
                if (err instanceof Error) {
                    return rpcErr(id, -32603, err.message);
                }
                return rpcErr(id, -32603, 'Internal error');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
