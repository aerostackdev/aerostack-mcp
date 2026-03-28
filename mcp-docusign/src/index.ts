/**
 * DocuSign MCP Worker
 * Implements MCP protocol over HTTP for DocuSign eSignature REST API v2.1 operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   DOCUSIGN_ACCESS_TOKEN  → X-Mcp-Secret-DOCUSIGN-ACCESS-TOKEN  (OAuth 2.0 access token)
 *   DOCUSIGN_ACCOUNT_ID    → X-Mcp-Secret-DOCUSIGN-ACCOUNT-ID    (DocuSign account UUID)
 *   DOCUSIGN_BASE_URL      → X-Mcp-Secret-DOCUSIGN-BASE-URL      (e.g. https://na4.docusign.net)
 *
 * Auth format: Authorization: Bearer {access_token}
 * Base URL: {DOCUSIGN_BASE_URL}/restapi/v2.1/accounts/{DOCUSIGN_ACCOUNT_ID}
 *
 * Covers: Envelopes (7), Recipients & Signing (5), Templates (4), Folders & Audit (4) = 20 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const DS_API_VERSION = 'v2.1';

function dsApiBase(baseUrl: string, accountId: string): string {
    return `${baseUrl}/restapi/${DS_API_VERSION}/accounts/${accountId}`;
}

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

function getSecrets(request: Request): {
    token: string | null;
    accountId: string | null;
    baseUrl: string | null;
} {
    return {
        token: request.headers.get('X-Mcp-Secret-DOCUSIGN-ACCESS-TOKEN'),
        accountId: request.headers.get('X-Mcp-Secret-DOCUSIGN-ACCOUNT-ID'),
        baseUrl: request.headers.get('X-Mcp-Secret-DOCUSIGN-BASE-URL'),
    };
}

const DOCUSIGN_ALLOWED_HOST_PATTERN = /^https:\/\/[a-z0-9-]+\.docusign\.(net|com)$/i;

function validateDocuSignBaseUrl(baseUrl: string): void {
    if (!DOCUSIGN_ALLOWED_HOST_PATTERN.test(baseUrl.replace(/\/$/, ''))) {
        throw { code: -32600, message: 'DOCUSIGN_BASE_URL must be a valid DocuSign host (e.g. https://na4.docusign.net)' };
    }
}

async function dsFetch(
    apiBase: string,
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path === '' ? apiBase : `${apiBase}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `DocuSign HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object') {
            const d = data as { message?: string; errorCode?: string };
            msg = d.message || d.errorCode || msg;
        }
        throw { code: -32603, message: `DocuSign API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Envelopes (7 tools) ─────────────────────────────────────────

    {
        name: 'list_envelopes',
        description: 'List envelopes in the account, optionally filtered by status and date. Returns envelopeId, subject, status, sentDateTime, completedDateTime.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['sent', 'delivered', 'completed', 'declined', 'voided', 'created'],
                    description: 'Filter by envelope status',
                },
                from_date: {
                    type: 'string',
                    description: 'Return envelopes created on or after this date (ISO 8601, e.g. 2026-01-01)',
                },
                count: {
                    type: 'number',
                    description: 'Max number of envelopes to return (default 20, max 100)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_envelope',
        description: 'Get full details of a specific envelope: status, subject, sentDateTime, completedDateTime, signers.',
        inputSchema: {
            type: 'object',
            properties: {
                envelope_id: {
                    type: 'string',
                    description: 'DocuSign envelope ID (UUID)',
                },
            },
            required: ['envelope_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_envelope',
        description: 'Create and send an envelope from a template or inline document. Provide either templateId or a base64-encoded document. Recipients need email, name, and routingOrder.',
        inputSchema: {
            type: 'object',
            properties: {
                emailSubject: {
                    type: 'string',
                    description: 'Subject line of the signing request email (required)',
                },
                status: {
                    type: 'string',
                    enum: ['created', 'sent'],
                    description: 'created = draft (save only), sent = deliver to signers immediately (default: sent)',
                },
                templateId: {
                    type: 'string',
                    description: 'DocuSign template ID to use. Provide this OR document (not both).',
                },
                document_name: {
                    type: 'string',
                    description: 'Document filename (e.g. contract.pdf). Required when providing document_base64.',
                },
                document_base64: {
                    type: 'string',
                    description: 'Base64-encoded document content (PDF recommended). Required when not using a template.',
                },
                recipients: {
                    type: 'array',
                    description: 'List of signers with email, name, and routingOrder',
                    items: {
                        type: 'object',
                        properties: {
                            email: { type: 'string', description: 'Signer email address' },
                            name: { type: 'string', description: 'Signer full name' },
                            routingOrder: { type: 'number', description: 'Signing order (1, 2, 3...)' },
                            roleName: { type: 'string', description: 'Template role name (required when using templateId)' },
                        },
                        required: ['email', 'name'],
                    },
                },
            },
            required: ['emailSubject', 'recipients'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'void_envelope',
        description: 'Void (cancel) an in-progress envelope. The envelope must be in sent or delivered status.',
        inputSchema: {
            type: 'object',
            properties: {
                envelope_id: {
                    type: 'string',
                    description: 'DocuSign envelope ID to void',
                },
                void_reason: {
                    type: 'string',
                    description: 'Reason for voiding the envelope (shown to recipients)',
                },
            },
            required: ['envelope_id', 'void_reason'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'resend_envelope',
        description: 'Resend the signing notification emails to all pending (not yet signed) recipients.',
        inputSchema: {
            type: 'object',
            properties: {
                envelope_id: {
                    type: 'string',
                    description: 'DocuSign envelope ID to resend',
                },
            },
            required: ['envelope_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_envelope_documents',
        description: 'List all documents included in an envelope (document ID, name, type, order).',
        inputSchema: {
            type: 'object',
            properties: {
                envelope_id: {
                    type: 'string',
                    description: 'DocuSign envelope ID',
                },
            },
            required: ['envelope_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'download_envelope_document',
        description: 'Download a specific document from an envelope as base64-encoded PDF content.',
        inputSchema: {
            type: 'object',
            properties: {
                envelope_id: {
                    type: 'string',
                    description: 'DocuSign envelope ID',
                },
                document_id: {
                    type: 'string',
                    description: 'Document ID within the envelope (use get_envelope_documents to find IDs, or "combined" for all docs merged)',
                },
            },
            required: ['envelope_id', 'document_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Recipients & Signing (5 tools) ──────────────────────────────

    {
        name: 'get_envelope_recipients',
        description: 'Get all recipients for an envelope: signers, carbon copies, status per recipient, and signing timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                envelope_id: {
                    type: 'string',
                    description: 'DocuSign envelope ID',
                },
            },
            required: ['envelope_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_recipient',
        description: 'Add a new signer or CC recipient to a draft (created status) envelope.',
        inputSchema: {
            type: 'object',
            properties: {
                envelope_id: {
                    type: 'string',
                    description: 'DocuSign envelope ID (must be in created/draft status)',
                },
                email: {
                    type: 'string',
                    description: 'Recipient email address',
                },
                name: {
                    type: 'string',
                    description: 'Recipient full name',
                },
                recipient_type: {
                    type: 'string',
                    enum: ['signers', 'carbonCopies'],
                    description: 'Type of recipient (default: signers)',
                },
                routing_order: {
                    type: 'number',
                    description: 'Signing order (default: 1)',
                },
            },
            required: ['envelope_id', 'email', 'name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_recipient',
        description: 'Update a recipient\'s email, name, or routing order on a draft envelope.',
        inputSchema: {
            type: 'object',
            properties: {
                envelope_id: {
                    type: 'string',
                    description: 'DocuSign envelope ID',
                },
                recipient_id: {
                    type: 'string',
                    description: 'Recipient ID within the envelope',
                },
                email: {
                    type: 'string',
                    description: 'New email address',
                },
                name: {
                    type: 'string',
                    description: 'New full name',
                },
                routing_order: {
                    type: 'number',
                    description: 'New routing/signing order',
                },
            },
            required: ['envelope_id', 'recipient_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_recipient',
        description: 'Remove a recipient from a draft envelope.',
        inputSchema: {
            type: 'object',
            properties: {
                envelope_id: {
                    type: 'string',
                    description: 'DocuSign envelope ID (must be in draft status)',
                },
                recipient_id: {
                    type: 'string',
                    description: 'Recipient ID to remove',
                },
            },
            required: ['envelope_id', 'recipient_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'create_signing_url',
        description: 'Generate an embedded signing URL for in-app signature flow (recipient signs in an iframe/webview, no email needed).',
        inputSchema: {
            type: 'object',
            properties: {
                envelope_id: {
                    type: 'string',
                    description: 'DocuSign envelope ID',
                },
                recipient_email: {
                    type: 'string',
                    description: 'Email address of the recipient who will sign',
                },
                recipient_name: {
                    type: 'string',
                    description: 'Full name of the recipient who will sign',
                },
                client_user_id: {
                    type: 'string',
                    description: 'Unique identifier for the signer in your system (must match the recipientId used when creating the envelope)',
                },
                return_url: {
                    type: 'string',
                    description: 'URL to redirect to after signing is complete',
                },
            },
            required: ['envelope_id', 'recipient_email', 'recipient_name', 'client_user_id', 'return_url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 3 — Templates (4 tools) ─────────────────────────────────────────

    {
        name: 'list_templates',
        description: 'List all templates in the DocuSign account, optionally filtered by name.',
        inputSchema: {
            type: 'object',
            properties: {
                search_text: {
                    type: 'string',
                    description: 'Filter templates by name (partial match)',
                },
                folder_id: {
                    type: 'string',
                    description: 'Filter templates within a specific folder',
                },
                count: {
                    type: 'number',
                    description: 'Max number of templates to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_template',
        description: 'Get full template details: name, description, defined roles, and document list.',
        inputSchema: {
            type: 'object',
            properties: {
                template_id: {
                    type: 'string',
                    description: 'DocuSign template ID (UUID)',
                },
            },
            required: ['template_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_template',
        description: 'Create a new DocuSign template with a role and an inline base64-encoded document.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Template name (required)',
                },
                description: {
                    type: 'string',
                    description: 'Template description',
                },
                document_name: {
                    type: 'string',
                    description: 'Document filename (e.g. agreement.pdf)',
                },
                document_base64: {
                    type: 'string',
                    description: 'Base64-encoded PDF document content',
                },
                role_name: {
                    type: 'string',
                    description: 'Name of the signer role in this template (e.g. "Client", "Contractor")',
                },
            },
            required: ['name', 'document_name', 'document_base64', 'role_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_from_template',
        description: 'Send an envelope using an existing template. Map recipients to template roles.',
        inputSchema: {
            type: 'object',
            properties: {
                template_id: {
                    type: 'string',
                    description: 'DocuSign template ID to send from',
                },
                email_subject: {
                    type: 'string',
                    description: 'Email subject for the signing request',
                },
                recipients: {
                    type: 'array',
                    description: 'Recipients mapped to template roles',
                    items: {
                        type: 'object',
                        properties: {
                            role_name: { type: 'string', description: 'Template role name to assign this recipient to' },
                            email: { type: 'string', description: 'Recipient email address' },
                            name: { type: 'string', description: 'Recipient full name' },
                        },
                        required: ['role_name', 'email', 'name'],
                    },
                },
            },
            required: ['template_id', 'email_subject', 'recipients'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Folders & Audit (4 tools) ───────────────────────────────────

    {
        name: 'list_folders',
        description: 'List all envelope folders in the DocuSign account (inbox, sent, drafts, deleted, and custom folders).',
        inputSchema: {
            type: 'object',
            properties: {
                include_items: {
                    type: 'boolean',
                    description: 'Whether to include envelope items in each folder (default false)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_folder_envelopes',
        description: 'List envelopes inside a specific folder by folder ID.',
        inputSchema: {
            type: 'object',
            properties: {
                folder_id: {
                    type: 'string',
                    description: 'DocuSign folder ID',
                },
                count: {
                    type: 'number',
                    description: 'Max number of envelopes to return (default 20)',
                },
            },
            required: ['folder_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_envelope_audit_events',
        description: 'Get the full audit trail for an envelope: who viewed, signed, declined, and when.',
        inputSchema: {
            type: 'object',
            properties: {
                envelope_id: {
                    type: 'string',
                    description: 'DocuSign envelope ID',
                },
            },
            required: ['envelope_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_envelopes',
        description: 'Search envelopes by recipient email address or envelope subject text.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search text to match against recipient email or envelope subject',
                },
                from_date: {
                    type: 'string',
                    description: 'Restrict search to envelopes created after this date (ISO 8601)',
                },
                count: {
                    type: 'number',
                    description: 'Max results to return (default 20)',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ──────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify credentials by calling GET /accounts/{accountId}. Returns account name and status.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    accountId: string,
    baseUrl: string,
): Promise<unknown> {
    const apiBase = dsApiBase(baseUrl, accountId);

    switch (name) {
        // ── Envelopes ────────────────────────────────────────────────────────────

        case 'list_envelopes': {
            const params = new URLSearchParams({
                count: String((args.count as number) || 20),
            });
            if (args.status) params.set('status', args.status as string);
            if (args.from_date) params.set('from_date', args.from_date as string);
            return dsFetch(apiBase, `/envelopes?${params}`, token);
        }

        case 'get_envelope': {
            validateRequired(args, ['envelope_id']);
            return dsFetch(apiBase, `/envelopes/${args.envelope_id}`, token);
        }

        case 'create_envelope': {
            validateRequired(args, ['emailSubject', 'recipients']);
            const recipients = args.recipients as Array<{
                email: string;
                name: string;
                routingOrder?: number;
                roleName?: string;
            }>;
            const status = (args.status as string) || 'sent';

            if (args.templateId) {
                // Template-based envelope
                const templateRoles = recipients.map((r, i) => ({
                    email: r.email,
                    name: r.name,
                    roleName: r.roleName || `Signer ${i + 1}`,
                    routingOrder: String(r.routingOrder || i + 1),
                }));
                return dsFetch(apiBase, '/envelopes', token, {
                    method: 'POST',
                    body: JSON.stringify({
                        templateId: args.templateId,
                        templateRoles,
                        emailSubject: args.emailSubject,
                        status,
                    }),
                });
            }

            // Document-based envelope
            validateRequired(args, ['document_name', 'document_base64']);
            const signers = recipients.map((r, i) => ({
                email: r.email,
                name: r.name,
                recipientId: String(i + 1),
                routingOrder: String(r.routingOrder || i + 1),
            }));
            return dsFetch(apiBase, '/envelopes', token, {
                method: 'POST',
                body: JSON.stringify({
                    emailSubject: args.emailSubject,
                    documents: [{
                        documentBase64: args.document_base64,
                        name: args.document_name,
                        fileExtension: 'pdf',
                        documentId: '1',
                    }],
                    recipients: { signers },
                    status,
                }),
            });
        }

        case 'void_envelope': {
            validateRequired(args, ['envelope_id', 'void_reason']);
            return dsFetch(apiBase, `/envelopes/${args.envelope_id}`, token, {
                method: 'PUT',
                body: JSON.stringify({
                    status: 'voided',
                    voidedReason: args.void_reason,
                }),
            });
        }

        case 'resend_envelope': {
            validateRequired(args, ['envelope_id']);
            return dsFetch(apiBase, `/envelopes/${args.envelope_id}?resend_envelope=true`, token, {
                method: 'PUT',
                body: JSON.stringify({}),
            });
        }

        case 'get_envelope_documents': {
            validateRequired(args, ['envelope_id']);
            return dsFetch(apiBase, `/envelopes/${args.envelope_id}/documents`, token);
        }

        case 'download_envelope_document': {
            validateRequired(args, ['envelope_id', 'document_id']);
            const url = `${apiBase}/envelopes/${args.envelope_id}/documents/${args.document_id}`;
            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/pdf',
                },
            });
            if (!res.ok) {
                throw { code: -32603, message: `DocuSign API error ${res.status}: failed to download document` };
            }
            const arrayBuf = await res.arrayBuffer();
            const bytes = new Uint8Array(arrayBuf);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            return {
                envelope_id: args.envelope_id,
                document_id: args.document_id,
                content_type: 'application/pdf',
                encoding: 'base64',
                data: base64,
            };
        }

        // ── Recipients & Signing ─────────────────────────────────────────────────

        case 'get_envelope_recipients': {
            validateRequired(args, ['envelope_id']);
            return dsFetch(apiBase, `/envelopes/${args.envelope_id}/recipients`, token);
        }

        case 'add_recipient': {
            validateRequired(args, ['envelope_id', 'email', 'name']);
            const recipientType = (args.recipient_type as string) || 'signers';
            const newRecipient = {
                email: args.email,
                name: args.name,
                recipientId: Date.now().toString(),
                routingOrder: String(args.routing_order || 1),
            };
            return dsFetch(apiBase, `/envelopes/${args.envelope_id}/recipients`, token, {
                method: 'POST',
                body: JSON.stringify({ [recipientType]: [newRecipient] }),
            });
        }

        case 'update_recipient': {
            validateRequired(args, ['envelope_id', 'recipient_id']);
            const body: Record<string, unknown> = { recipientId: args.recipient_id };
            if (args.email !== undefined) body.email = args.email;
            if (args.name !== undefined) body.name = args.name;
            if (args.routing_order !== undefined) body.routingOrder = String(args.routing_order);
            return dsFetch(apiBase, `/envelopes/${args.envelope_id}/recipients`, token, {
                method: 'PUT',
                body: JSON.stringify({ signers: [body] }),
            });
        }

        case 'delete_recipient': {
            validateRequired(args, ['envelope_id', 'recipient_id']);
            return dsFetch(apiBase, `/envelopes/${args.envelope_id}/recipients`, token, {
                method: 'DELETE',
                body: JSON.stringify({ signers: [{ recipientId: args.recipient_id }] }),
            });
        }

        case 'create_signing_url': {
            validateRequired(args, ['envelope_id', 'recipient_email', 'recipient_name', 'client_user_id', 'return_url']);
            return dsFetch(apiBase, `/envelopes/${args.envelope_id}/views/recipient`, token, {
                method: 'POST',
                body: JSON.stringify({
                    authenticationMethod: 'none',
                    email: args.recipient_email,
                    userName: args.recipient_name,
                    clientUserId: args.client_user_id,
                    returnUrl: args.return_url,
                }),
            });
        }

        // ── Templates ────────────────────────────────────────────────────────────

        case 'list_templates': {
            const params = new URLSearchParams({
                count: String((args.count as number) || 20),
            });
            if (args.search_text) params.set('search_text', args.search_text as string);
            if (args.folder_id) params.set('folder_id', args.folder_id as string);
            return dsFetch(apiBase, `/templates?${params}`, token);
        }

        case 'get_template': {
            validateRequired(args, ['template_id']);
            return dsFetch(apiBase, `/templates/${args.template_id}`, token);
        }

        case 'create_template': {
            validateRequired(args, ['name', 'document_name', 'document_base64', 'role_name']);
            return dsFetch(apiBase, '/templates', token, {
                method: 'POST',
                body: JSON.stringify({
                    name: args.name,
                    description: args.description || '',
                    documents: [{
                        documentBase64: args.document_base64,
                        name: args.document_name,
                        fileExtension: 'pdf',
                        documentId: '1',
                    }],
                    recipients: {
                        signers: [{
                            roleName: args.role_name,
                            recipientId: '1',
                            routingOrder: '1',
                        }],
                    },
                }),
            });
        }

        case 'send_from_template': {
            validateRequired(args, ['template_id', 'email_subject', 'recipients']);
            const recipients = args.recipients as Array<{
                role_name: string;
                email: string;
                name: string;
            }>;
            const templateRoles = recipients.map((r) => ({
                roleName: r.role_name,
                email: r.email,
                name: r.name,
            }));
            return dsFetch(apiBase, '/envelopes', token, {
                method: 'POST',
                body: JSON.stringify({
                    templateId: args.template_id,
                    templateRoles,
                    emailSubject: args.email_subject,
                    status: 'sent',
                }),
            });
        }

        // ── Folders & Audit ──────────────────────────────────────────────────────

        case 'list_folders': {
            const params = new URLSearchParams({
                include_items: String(args.include_items === true),
            });
            return dsFetch(apiBase, `/folders?${params}`, token);
        }

        case 'get_folder_envelopes': {
            validateRequired(args, ['folder_id']);
            const params = new URLSearchParams({
                count: String((args.count as number) || 20),
            });
            return dsFetch(apiBase, `/folders/${args.folder_id}?${params}`, token);
        }

        case 'get_envelope_audit_events': {
            validateRequired(args, ['envelope_id']);
            return dsFetch(apiBase, `/envelopes/${args.envelope_id}/audit_events`, token);
        }

        case 'search_envelopes': {
            validateRequired(args, ['query']);
            const params = new URLSearchParams({
                query: args.query as string,
                count: String((args.count as number) || 20),
                from_to_status: 'changed',
            });
            if (args.from_date) params.set('from_date', args.from_date as string);
            return dsFetch(apiBase, `/search_folders/drafts?${params}`, token);
        }

        // ── _ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            return dsFetch(dsApiBase(baseUrl, accountId), '', token);
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
                JSON.stringify({ status: 'ok', server: 'mcp-docusign', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-docusign', version: '1.0.0' },
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
            const { token, accountId, baseUrl } = getSecrets(request);
            const missing: string[] = [];
            if (!token) missing.push('DOCUSIGN_ACCESS_TOKEN (header: X-Mcp-Secret-DOCUSIGN-ACCESS-TOKEN)');
            if (!accountId) missing.push('DOCUSIGN_ACCOUNT_ID (header: X-Mcp-Secret-DOCUSIGN-ACCOUNT-ID)');
            if (!baseUrl) missing.push('DOCUSIGN_BASE_URL (header: X-Mcp-Secret-DOCUSIGN-BASE-URL)');

            if (missing.length > 0) {
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                validateDocuSignBaseUrl(baseUrl!);
            } catch (err: unknown) {
                const e = err as { code: number; message: string };
                return rpcErr(id, e.code, e.message);
            }

            try {
                const result = await callTool(toolName, args, token!, accountId!, baseUrl!);
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
