/**
 * SendGrid MCP Worker
 * Implements MCP protocol over HTTP for SendGrid email operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   SENDGRID_API_KEY → X-Mcp-Secret-SENDGRID-API-KEY
 *
 * Auth format: Authorization: Bearer {api_key}
 *
 * Covers: Email Sending (4), Templates (4), Contacts & Lists (5),
 *         Stats & Analytics (4), Sender Management (3) = 20 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const SENDGRID_API_BASE = 'https://api.sendgrid.com/v3';

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

function getToken(request: Request): string | null {
    return request.headers.get('X-Mcp-Secret-SENDGRID-API-KEY');
}

async function sendgridFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
    const res = await fetch(`${SENDGRID_API_BASE}${path}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) || {}),
        },
    });

    // 202 Accepted (POST /mail/send) and 204 No Content → success
    if (res.status === 202 || res.status === 204) return { success: true };

    if (!res.ok) {
        let errBody: unknown;
        try { errBody = await res.json(); } catch { errBody = {}; }
        const errors = (errBody as Record<string, unknown>).errors;
        const msg = Array.isArray(errors) && errors.length > 0
            ? (errors[0] as Record<string, unknown>).message as string || res.statusText
            : res.statusText;

        switch (res.status) {
            case 401:
                throw { code: -32001, message: 'SendGrid authentication failed — verify SENDGRID_API_KEY is correct and has required permissions' };
            case 403:
                throw { code: -32603, message: 'SendGrid permission denied — your API key lacks access to this resource' };
            case 404:
                throw { code: -32603, message: `SendGrid resource not found — check the ID is correct` };
            case 429:
                throw { code: -32603, message: 'SendGrid rate limit exceeded — please retry after a moment' };
            default:
                throw { code: -32603, message: `SendGrid API error ${res.status}: ${msg}` };
        }
    }

    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify SendGrid credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    // ── Group 1 — Email Sending (4 tools) ────────────────────────────────────

    {
        name: 'send_email',
        description: 'Send a transactional email via SendGrid. Supports plain text and HTML content, CC, BCC, reply-to, dynamic templates, and custom template data.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    description: 'Recipient(s) — a single email string, an object {email, name}, or an array of {email, name} objects',
                },
                from: {
                    description: 'Sender — an email string or an object {email, name}. Must be a verified sender in SendGrid.',
                },
                subject: {
                    type: 'string',
                    description: 'Email subject line. Required unless using a template_id that includes a subject.',
                },
                content: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', description: 'text/plain or text/html' },
                            value: { type: 'string', description: 'The email body content' },
                        },
                    },
                    description: 'Array of content objects, e.g. [{type: "text/plain", value: "Hello"}, {type: "text/html", value: "<p>Hello</p>"}]',
                },
                reply_to: {
                    type: 'object',
                    properties: {
                        email: { type: 'string' },
                        name: { type: 'string' },
                    },
                    description: 'Reply-to address {email, name}',
                },
                cc: {
                    type: 'array',
                    items: { type: 'object', properties: { email: { type: 'string' }, name: { type: 'string' } } },
                    description: 'CC recipients array of {email, name}',
                },
                bcc: {
                    type: 'array',
                    items: { type: 'object', properties: { email: { type: 'string' }, name: { type: 'string' } } },
                    description: 'BCC recipients array of {email, name}',
                },
                template_id: {
                    type: 'string',
                    description: 'SendGrid dynamic template ID (starts with "d-"). When provided, uses the template for content.',
                },
                dynamic_template_data: {
                    type: 'object',
                    description: 'Key-value data for Handlebars substitutions in the dynamic template (e.g. {first_name: "Alice", order_id: "12345"})',
                },
            },
            required: ['to', 'from'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_bulk_email',
        description: 'Send the same email to multiple recipients using personalizations. Each recipient can have unique dynamic_template_data. Supports up to 1000 recipients per call.',
        inputSchema: {
            type: 'object',
            properties: {
                personalizations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            to: {
                                type: 'array',
                                items: { type: 'object', properties: { email: { type: 'string' }, name: { type: 'string' } } },
                                description: 'Recipients for this personalization',
                            },
                            dynamic_template_data: {
                                type: 'object',
                                description: 'Per-recipient template substitution data',
                            },
                        },
                        required: ['to'],
                    },
                    description: 'Array of personalizations, each with its own to list and optional template data. Max 1000 total recipients.',
                },
                from: {
                    description: 'Sender — email string or {email, name} object',
                },
                subject: {
                    type: 'string',
                    description: 'Email subject (required if not using a template that includes a subject)',
                },
                content: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string' },
                            value: { type: 'string' },
                        },
                    },
                    description: 'Email content array [{type, value}]',
                },
                template_id: {
                    type: 'string',
                    description: 'Dynamic template ID (starts with "d-")',
                },
            },
            required: ['personalizations', 'from'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_template_email',
        description: 'Simplified tool to send an email using a SendGrid dynamic template. Just provide the template ID, recipient, sender, and template data.',
        inputSchema: {
            type: 'object',
            properties: {
                template_id: {
                    type: 'string',
                    description: 'SendGrid dynamic template ID (starts with "d-")',
                },
                to: {
                    description: 'Recipient — email string or {email, name} object',
                },
                from: {
                    description: 'Sender — email string or {email, name} object. Must be a verified sender.',
                },
                dynamic_template_data: {
                    type: 'object',
                    description: 'Handlebars substitution data for the template (e.g. {first_name: "Alice", company: "Acme"})',
                },
                subject: {
                    type: 'string',
                    description: 'Override the template subject line (optional)',
                },
            },
            required: ['template_id', 'to', 'from'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'schedule_email',
        description: 'Schedule an email to be sent at a specific future time. Uses a Unix timestamp for the send_at field. SendGrid allows scheduling up to 72 hours in advance.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    description: 'Recipient — email string or {email, name} object',
                },
                from: {
                    description: 'Sender — email string or {email, name} object',
                },
                subject: {
                    type: 'string',
                    description: 'Email subject line',
                },
                content: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string' },
                            value: { type: 'string' },
                        },
                    },
                    description: 'Email content array [{type: "text/plain"|"text/html", value: "..."}]',
                },
                send_at: {
                    type: 'number',
                    description: 'Unix timestamp (seconds since epoch) for when to send the email. Must be within 72 hours.',
                },
            },
            required: ['to', 'from', 'subject', 'content', 'send_at'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 2 — Templates (4 tools) ────────────────────────────────────────

    {
        name: 'list_templates',
        description: 'List all dynamic transactional email templates in your SendGrid account.',
        inputSchema: {
            type: 'object',
            properties: {
                page_size: {
                    type: 'number',
                    description: 'Number of templates to return per page (default 20, max 200)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_template',
        description: 'Get full details of a specific SendGrid template including all versions.',
        inputSchema: {
            type: 'object',
            properties: {
                template_id: {
                    type: 'string',
                    description: 'Template ID (e.g. "d-abc123...")',
                },
            },
            required: ['template_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_template',
        description: 'Create a new dynamic transactional email template in SendGrid.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Friendly name for the template (e.g. "Welcome Email v2")',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_template_version',
        description: 'Get a specific version of a template, including the HTML/text content and subject.',
        inputSchema: {
            type: 'object',
            properties: {
                template_id: {
                    type: 'string',
                    description: 'Template ID (e.g. "d-abc123...")',
                },
                version_id: {
                    type: 'string',
                    description: 'Version ID of the template',
                },
            },
            required: ['template_id', 'version_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Contacts & Lists (5 tools) ─────────────────────────────────

    {
        name: 'search_contacts',
        description: 'Search your SendGrid marketing contacts using SGQL (SendGrid Query Language). Supports filtering by email, first_name, last_name, custom fields, and list membership.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: "SGQL query string. Examples: \"email LIKE 'alice%'\", \"first_name = 'Alice'\", \"CONTAINS(list_ids, 'abc123')\", \"last_name = 'Smith' AND email LIKE '%@example.com'\"",
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_contact',
        description: 'Get full details of a specific contact by their SendGrid contact ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'SendGrid contact ID (UUID)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'upsert_contacts',
        description: 'Create or update (upsert) one or more marketing contacts. If a contact with the email already exists, it is updated; otherwise it is created. Asynchronous — returns a job_id.',
        inputSchema: {
            type: 'object',
            properties: {
                contacts: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            email: { type: 'string', description: 'Contact email address (required per contact)' },
                            first_name: { type: 'string' },
                            last_name: { type: 'string' },
                            phone_number_id: { type: 'string', description: 'Phone number' },
                            custom_fields: { type: 'object', description: 'Custom field key-value pairs' },
                        },
                        required: ['email'],
                    },
                    description: 'Array of contacts to create or update',
                },
            },
            required: ['contacts'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_contact_lists',
        description: 'List all contact lists (segments/audiences) in your SendGrid Marketing account.',
        inputSchema: {
            type: 'object',
            properties: {
                page_size: {
                    type: 'number',
                    description: 'Number of lists to return per page (default 20, max 1000)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_contacts_to_list',
        description: 'Add one or more contacts (by their contact IDs) to a specific marketing list.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'SendGrid list ID (UUID)',
                },
                contact_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of contact IDs (UUIDs) to add to the list',
                },
            },
            required: ['list_id', 'contact_ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Stats & Analytics (4 tools) ────────────────────────────────

    {
        name: 'get_global_stats',
        description: 'Get global email statistics (sends, deliveries, opens, clicks, bounces, spam reports) across all emails for a date range.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format (required)',
                },
                end_date: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format (defaults to today)',
                },
                aggregated_by: {
                    type: 'string',
                    enum: ['day', 'week', 'month'],
                    description: 'Aggregation interval (default: day)',
                },
            },
            required: ['start_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_email_stats',
        description: 'Get email statistics filtered by category for a date range.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format (required)',
                },
                category: {
                    type: 'string',
                    description: 'Filter stats by this category name (as tagged on sends)',
                },
                end_date: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format',
                },
                aggregated_by: {
                    type: 'string',
                    enum: ['day', 'week', 'month'],
                    description: 'Aggregation interval (default: day)',
                },
            },
            required: ['start_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_template_stats',
        description: 'Get delivery and engagement statistics for a specific template version.',
        inputSchema: {
            type: 'object',
            properties: {
                template_id: {
                    type: 'string',
                    description: 'Template ID (e.g. "d-abc123...")',
                },
                version_id: {
                    type: 'string',
                    description: 'Version ID of the template',
                },
                start_date: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format (required)',
                },
                end_date: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format',
                },
            },
            required: ['template_id', 'version_id', 'start_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_bounce_list',
        description: 'Get the list of email addresses that have bounced. Includes bounce reason and timestamp.',
        inputSchema: {
            type: 'object',
            properties: {
                start_time: {
                    type: 'number',
                    description: 'Unix timestamp for the start of the bounce window',
                },
                end_time: {
                    type: 'number',
                    description: 'Unix timestamp for the end of the bounce window',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of bounce records to return (default 20, max 500)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 5 — Sender Management (3 tools) ────────────────────────────────

    {
        name: 'list_senders',
        description: 'List all verified sender identities in your SendGrid account. Shows verification status.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_sender',
        description: 'Create a new sender identity in SendGrid. The sender must complete email verification before it can be used to send emails.',
        inputSchema: {
            type: 'object',
            properties: {
                from: {
                    type: 'object',
                    properties: {
                        email: { type: 'string', description: 'From email address' },
                        name: { type: 'string', description: 'From display name' },
                    },
                    required: ['email', 'name'],
                    description: 'From address details',
                },
                reply_to: {
                    type: 'object',
                    properties: {
                        email: { type: 'string', description: 'Reply-to email address' },
                        name: { type: 'string', description: 'Reply-to display name' },
                    },
                    required: ['email', 'name'],
                    description: 'Reply-to address details',
                },
                address: {
                    type: 'string',
                    description: 'Physical mailing address (required by CAN-SPAM)',
                },
                city: {
                    type: 'string',
                    description: 'City for the mailing address',
                },
                country: {
                    type: 'string',
                    description: 'Country code (e.g. "US", "GB")',
                },
                nickname: {
                    type: 'string',
                    description: 'Internal nickname for identifying this sender',
                },
            },
            required: ['from', 'reply_to', 'address', 'city', 'country'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'verify_sender_domain',
        description: 'Trigger domain authentication validation for a whitelabeled domain. Checks that DNS records (DKIM, SPF) are correctly configured.',
        inputSchema: {
            type: 'object',
            properties: {
                domain_id: {
                    type: 'number',
                    description: 'Numeric ID of the authenticated domain to validate',
                },
            },
            required: ['domain_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── callTool implementation ───────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await sendgridFetch('/user/profile', token);
            return { content: [{ type: 'text', text: 'Connected to SendGrid' }] };
        }

        // ── Email Sending ─────────────────────────────────────────────────────

        case 'send_email': {
            validateRequired(args, ['to', 'from']);
            const body: Record<string, unknown> = {
                personalizations: [{ to: Array.isArray(args.to) ? args.to : [typeof args.to === 'string' ? { email: args.to } : args.to] }],
                from: typeof args.from === 'string' ? { email: args.from } : args.from,
            };
            if (args.subject) body.subject = args.subject;
            if (args.content) body.content = args.content;
            if (args.reply_to) body.reply_to = args.reply_to;
            if (args.template_id) body.template_id = args.template_id;
            if (args.dynamic_template_data) (body.personalizations as Record<string, unknown>[])[0].dynamic_template_data = args.dynamic_template_data;
            if (args.cc) (body.personalizations as Record<string, unknown>[])[0].cc = args.cc;
            if (args.bcc) (body.personalizations as Record<string, unknown>[])[0].bcc = args.bcc;
            return sendgridFetch('/mail/send', token, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'send_bulk_email': {
            validateRequired(args, ['personalizations', 'from']);
            const body: Record<string, unknown> = {
                personalizations: args.personalizations,
                from: typeof args.from === 'string' ? { email: args.from } : args.from,
            };
            if (args.subject) body.subject = args.subject;
            if (args.content) body.content = args.content;
            if (args.template_id) body.template_id = args.template_id;
            return sendgridFetch('/mail/send', token, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'send_template_email': {
            validateRequired(args, ['template_id', 'to', 'from']);
            const body: Record<string, unknown> = {
                personalizations: [{ to: Array.isArray(args.to) ? args.to : [typeof args.to === 'string' ? { email: args.to } : args.to] }],
                from: typeof args.from === 'string' ? { email: args.from } : args.from,
                template_id: args.template_id,
            };
            if (args.subject) body.subject = args.subject;
            if (args.dynamic_template_data) (body.personalizations as Record<string, unknown>[])[0].dynamic_template_data = args.dynamic_template_data;
            return sendgridFetch('/mail/send', token, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'schedule_email': {
            validateRequired(args, ['to', 'from', 'subject', 'content', 'send_at']);
            const body: Record<string, unknown> = {
                personalizations: [{ to: Array.isArray(args.to) ? args.to : [typeof args.to === 'string' ? { email: args.to } : args.to] }],
                from: typeof args.from === 'string' ? { email: args.from } : args.from,
                subject: args.subject,
                content: args.content,
                send_at: args.send_at,
            };
            return sendgridFetch('/mail/send', token, { method: 'POST', body: JSON.stringify(body) });
        }

        // ── Templates ─────────────────────────────────────────────────────────

        case 'list_templates': {
            const pageSize = args.page_size ?? 20;
            return sendgridFetch(`/templates?generations=dynamic&page_size=${pageSize}`, token);
        }

        case 'get_template': {
            validateRequired(args, ['template_id']);
            return sendgridFetch(`/templates/${args.template_id}`, token);
        }

        case 'create_template': {
            validateRequired(args, ['name']);
            return sendgridFetch('/templates', token, {
                method: 'POST',
                body: JSON.stringify({ name: args.name, generation: 'dynamic' }),
            });
        }

        case 'get_template_version': {
            validateRequired(args, ['template_id', 'version_id']);
            return sendgridFetch(`/templates/${args.template_id}/versions/${args.version_id}`, token);
        }

        // ── Contacts & Lists ──────────────────────────────────────────────────

        case 'search_contacts': {
            validateRequired(args, ['query']);
            return sendgridFetch('/marketing/contacts/search', token, {
                method: 'POST',
                body: JSON.stringify({ query: args.query }),
            });
        }

        case 'get_contact': {
            validateRequired(args, ['id']);
            return sendgridFetch(`/marketing/contacts/${args.id}`, token);
        }

        case 'upsert_contacts': {
            validateRequired(args, ['contacts']);
            return sendgridFetch('/marketing/contacts', token, {
                method: 'PUT',
                body: JSON.stringify({ contacts: args.contacts }),
            });
        }

        case 'list_contact_lists': {
            const pageSize = args.page_size ?? 20;
            return sendgridFetch(`/marketing/lists?page_size=${pageSize}`, token);
        }

        case 'add_contacts_to_list': {
            validateRequired(args, ['list_id', 'contact_ids']);
            return sendgridFetch(`/marketing/lists/${args.list_id}/contacts`, token, {
                method: 'POST',
                body: JSON.stringify({ contact_ids: args.contact_ids }),
            });
        }

        // ── Stats & Analytics ─────────────────────────────────────────────────

        case 'get_global_stats': {
            validateRequired(args, ['start_date']);
            const params = new URLSearchParams({ start_date: args.start_date as string });
            if (args.end_date) params.set('end_date', args.end_date as string);
            params.set('aggregated_by', (args.aggregated_by as string) || 'day');
            return sendgridFetch(`/stats?${params.toString()}`, token);
        }

        case 'get_email_stats': {
            validateRequired(args, ['start_date']);
            const params = new URLSearchParams({ start_date: args.start_date as string });
            if (args.end_date) params.set('end_date', args.end_date as string);
            if (args.category) params.set('categories', args.category as string);
            params.set('aggregated_by', (args.aggregated_by as string) || 'day');
            return sendgridFetch(`/stats?${params.toString()}`, token);
        }

        case 'get_template_stats': {
            validateRequired(args, ['template_id', 'version_id', 'start_date']);
            const params = new URLSearchParams({ start_date: args.start_date as string });
            if (args.end_date) params.set('end_date', args.end_date as string);
            return sendgridFetch(`/templates/${args.template_id}/versions/${args.version_id}/stats?${params.toString()}`, token);
        }

        case 'get_bounce_list': {
            const params = new URLSearchParams();
            if (args.start_time) params.set('start_time', String(args.start_time));
            if (args.end_time) params.set('end_time', String(args.end_time));
            params.set('limit', String(args.limit ?? 20));
            return sendgridFetch(`/suppression/bounces?${params.toString()}`, token);
        }

        // ── Sender Management ─────────────────────────────────────────────────

        case 'list_senders': {
            return sendgridFetch('/senders', token);
        }

        case 'create_sender': {
            validateRequired(args, ['from', 'reply_to', 'address', 'city', 'country']);
            const body: Record<string, unknown> = {
                from: args.from,
                reply_to: args.reply_to,
                address: args.address,
                city: args.city,
                country: args.country,
            };
            if (args.nickname) body.nickname = args.nickname;
            return sendgridFetch('/senders', token, { method: 'POST', body: JSON.stringify(body) });
        }

        case 'verify_sender_domain': {
            validateRequired(args, ['domain_id']);
            return sendgridFetch(`/whitelabel/domains/${args.domain_id}/validate`, token, { method: 'POST' });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker export ─────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-sendgrid', tools: TOOLS.length }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        // Parse JSON-RPC body
        let rpc: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
        try {
            rpc = await request.json() as typeof rpc;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = rpc;

        // JSON-RPC method dispatch
        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                serverInfo: { name: 'mcp-sendgrid', version: '1.0.0' },
                capabilities: { tools: {} },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = (params as Record<string, unknown>)?.name as string;
            const toolArgs = ((params as Record<string, unknown>)?.arguments as Record<string, unknown>) || {};

            // Validate auth
            const token = getToken(request);
            if (!token) {
                return rpcErr(id, -32001, 'Missing SendGrid API key. Provide via X-Mcp-Secret-SENDGRID-API-KEY header.');
            }

            try {
                const result = await callTool(toolName, toolArgs, token);
                return rpcOk(id, toolOk(result));
            } catch (err: unknown) {
                const e = err as { code?: number; message?: string };
                if (e.code && e.message) {
                    return rpcErr(id, e.code, e.message);
                }
                return rpcErr(id, -32603, (err as Error).message || 'Internal error');
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
