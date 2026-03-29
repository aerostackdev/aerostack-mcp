/**
 * Brevo MCP Worker
 * Implements MCP protocol over HTTP for Brevo (formerly Sendinblue) email/SMS/marketing operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   BREVO_API_KEY → X-Mcp-Secret-BREVO-API-KEY
 *
 * Auth format: api-key: {API_KEY}  (lowercase header, Brevo-specific)
 *
 * Covers: Contacts (5), Email Campaigns (5), Transactional (4),
 *         Lists (4), Events & Webhooks (3) = 21 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const BREVO_BASE = 'https://api.brevo.com/v3';

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
        apiKey: request.headers.get('X-Mcp-Secret-BREVO-API-KEY'),
    };
}

async function brevoFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = `${BREVO_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return { success: true };

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Brevo HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        const d = data as { message?: string; code?: string };
        throw { code: -32603, message: `Brevo API error ${res.status}: ${d?.message || res.statusText}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Contacts (5 tools) ─────────────────────────────────────────

    {
        name: 'list_contacts',
        description: 'List contacts in Brevo. Supports pagination and filtering by modification date.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of contacts to return (max 1000, default 50)',
                },
                offset: {
                    type: 'number',
                    description: 'Index of first contact to return (default 0)',
                },
                modifiedSince: {
                    type: 'string',
                    description: 'Return contacts modified after this ISO8601 date (e.g. 2026-01-01T00:00:00Z)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_contact',
        description: 'Get a single contact by email address or numeric ID. Returns email, firstName, lastName, attributes, and list memberships.',
        inputSchema: {
            type: 'object',
            properties: {
                identifier: {
                    type: 'string',
                    description: 'Contact email address or numeric contact ID',
                },
            },
            required: ['identifier'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_contact',
        description: 'Create a new contact in Brevo. Set updateEnabled to true to upsert (update if already exists).',
        inputSchema: {
            type: 'object',
            properties: {
                email: {
                    type: 'string',
                    description: 'Contact email address (required)',
                },
                attributes: {
                    type: 'object',
                    description: 'Contact attributes object (e.g. {"FIRSTNAME":"Jane","LASTNAME":"Smith"})',
                },
                listIds: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'Array of list IDs to add the contact to',
                },
                updateEnabled: {
                    type: 'boolean',
                    description: 'If true, update existing contact with same email instead of erroring (default false)',
                },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_contact',
        description: 'Update a contact\'s attributes and list memberships. Identify by email or numeric ID.',
        inputSchema: {
            type: 'object',
            properties: {
                identifier: {
                    type: 'string',
                    description: 'Contact email address or numeric contact ID',
                },
                attributes: {
                    type: 'object',
                    description: 'Attributes to update (e.g. {"FIRSTNAME":"Jane","PHONE":"+1555000001"})',
                },
                listIds: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'List IDs to add the contact to',
                },
                unlinkListIds: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'List IDs to remove the contact from',
                },
            },
            required: ['identifier'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_contact',
        description: 'Permanently delete a contact by email address or numeric ID.',
        inputSchema: {
            type: 'object',
            properties: {
                identifier: {
                    type: 'string',
                    description: 'Contact email address or numeric contact ID',
                },
            },
            required: ['identifier'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 2 — Email Campaigns (5 tools) ───────────────────────────────────

    {
        name: 'list_campaigns',
        description: 'List email campaigns with optional filtering by type and status.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['classic', 'trigger'],
                    description: 'Campaign type: classic (standard) or trigger (automated)',
                },
                status: {
                    type: 'string',
                    enum: ['draft', 'queued', 'sent', 'archive'],
                    description: 'Filter by campaign status',
                },
                limit: {
                    type: 'number',
                    description: 'Number of campaigns to return (default 50)',
                },
                offset: {
                    type: 'number',
                    description: 'Pagination offset (default 0)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_campaign',
        description: 'Get full details of a specific email campaign including name, subject, status, and statistics.',
        inputSchema: {
            type: 'object',
            properties: {
                campaignId: {
                    type: 'number',
                    description: 'Brevo campaign ID',
                },
            },
            required: ['campaignId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_campaign',
        description: 'Create a new email campaign. Provide either htmlContent or templateId for the email body.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Campaign name (internal label, required)',
                },
                subject: {
                    type: 'string',
                    description: 'Email subject line (required)',
                },
                sender: {
                    type: 'object',
                    description: 'Sender info with name and email (required, e.g. {"name":"My Company","email":"hello@myco.com"})',
                },
                htmlContent: {
                    type: 'string',
                    description: 'Full HTML body of the email (use this or templateId)',
                },
                templateId: {
                    type: 'number',
                    description: 'Brevo template ID to use as the email body (use this or htmlContent)',
                },
                scheduledAt: {
                    type: 'string',
                    description: 'ISO8601 datetime to schedule sending (leave empty to save as draft)',
                },
                recipients: {
                    type: 'object',
                    description: 'Recipient object with listIds array (e.g. {"listIds":[1,2]})',
                },
            },
            required: ['name', 'subject', 'sender'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_test_email',
        description: 'Send a test email for a campaign to specified addresses for preview before going live.',
        inputSchema: {
            type: 'object',
            properties: {
                campaignId: {
                    type: 'number',
                    description: 'Brevo campaign ID to test',
                },
                emailTo: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of email addresses to send the test to (max 10)',
                },
            },
            required: ['campaignId', 'emailTo'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_campaign_stats',
        description: 'Get detailed statistics for an email campaign: opens, clicks, unsubscribes, bounces, and delivered count.',
        inputSchema: {
            type: 'object',
            properties: {
                campaignId: {
                    type: 'number',
                    description: 'Brevo campaign ID',
                },
            },
            required: ['campaignId'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Transactional (4 tools) ─────────────────────────────────────

    {
        name: 'send_email',
        description: 'Send a transactional email immediately. Use templateId to reference a Brevo template, or provide htmlContent directly.',
        inputSchema: {
            type: 'object',
            properties: {
                sender: {
                    type: 'object',
                    description: 'Sender object with name and email (e.g. {"name":"Support","email":"support@myco.com"})',
                },
                to: {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Array of recipients with email and optional name (e.g. [{"email":"user@example.com","name":"User"}])',
                },
                subject: {
                    type: 'string',
                    description: 'Email subject line (required unless using a template with a preset subject)',
                },
                htmlContent: {
                    type: 'string',
                    description: 'HTML body content (use this or templateId)',
                },
                templateId: {
                    type: 'number',
                    description: 'Brevo transactional template ID (use this or htmlContent)',
                },
                params: {
                    type: 'object',
                    description: 'Template variable substitutions (e.g. {"firstName":"Jane","orderId":"12345"})',
                },
            },
            required: ['sender', 'to'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_sms',
        description: 'Send a transactional SMS message to a phone number.',
        inputSchema: {
            type: 'object',
            properties: {
                recipient: {
                    type: 'string',
                    description: 'Recipient phone number with country code (e.g. +14155552671)',
                },
                content: {
                    type: 'string',
                    description: 'SMS message body (max 160 chars for single SMS)',
                },
                sender: {
                    type: 'string',
                    description: 'Sender name (alphanumeric, max 11 chars, e.g. "MyBrand")',
                },
            },
            required: ['recipient', 'content', 'sender'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_smtp_stats',
        description: 'Get aggregated transactional email statistics for a date range or by number of days.',
        inputSchema: {
            type: 'object',
            properties: {
                startDate: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format',
                },
                endDate: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format',
                },
                days: {
                    type: 'number',
                    description: 'Number of past days to aggregate (use instead of startDate/endDate)',
                },
                tag: {
                    type: 'string',
                    description: 'Filter stats by a specific email tag',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_email_templates',
        description: 'List transactional email templates in Brevo.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['opt-in', 'confirmation', 'unsubscription', 'landing'],
                    description: 'Filter templates by type',
                },
                status: {
                    type: 'string',
                    enum: ['active', 'inactive'],
                    description: 'Filter by template status',
                },
                limit: {
                    type: 'number',
                    description: 'Number of templates to return (default 50)',
                },
                offset: {
                    type: 'number',
                    description: 'Pagination offset (default 0)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Lists (4 tools) ─────────────────────────────────────────────

    {
        name: 'list_lists',
        description: 'List all contact lists in your Brevo account.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of lists to return (default 10)',
                },
                offset: {
                    type: 'number',
                    description: 'Pagination offset (default 0)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_list',
        description: 'Create a new contact list in Brevo.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'List name (required)',
                },
                folderId: {
                    type: 'number',
                    description: 'Folder ID to create the list inside (optional)',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'add_contacts_to_list',
        description: 'Add one or more contacts (by email) to a contact list.',
        inputSchema: {
            type: 'object',
            properties: {
                listId: {
                    type: 'number',
                    description: 'Brevo list ID to add contacts to',
                },
                emails: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of email addresses to add',
                },
            },
            required: ['listId', 'emails'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'remove_contacts_from_list',
        description: 'Remove one or more contacts (by email) from a contact list.',
        inputSchema: {
            type: 'object',
            properties: {
                listId: {
                    type: 'number',
                    description: 'Brevo list ID to remove contacts from',
                },
                emails: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of email addresses to remove',
                },
            },
            required: ['listId', 'emails'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 5 — Events & Webhooks (3 tools) ─────────────────────────────────

    {
        name: 'create_event',
        description: 'Track a custom event for a contact. Used for behavioral automation and segmentation.',
        inputSchema: {
            type: 'object',
            properties: {
                event_name: {
                    type: 'string',
                    description: 'Name of the event (e.g. "purchase", "page_view", "trial_started")',
                },
                email: {
                    type: 'string',
                    description: 'Contact email address to associate the event with',
                },
                event_date: {
                    type: 'string',
                    description: 'ISO8601 event timestamp (e.g. 2026-03-28T12:00:00Z). Defaults to now if omitted.',
                },
                properties: {
                    type: 'object',
                    description: 'Additional event properties as key-value pairs (e.g. {"amount":99.99,"plan":"pro"})',
                },
            },
            required: ['event_name', 'email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_webhooks',
        description: 'List all webhooks configured in your Brevo account.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['transactional', 'marketing'],
                    description: 'Filter webhooks by type',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_webhook',
        description: 'Create a new webhook to receive real-time Brevo event notifications.',
        inputSchema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'HTTPS URL to POST events to (required)',
                },
                description: {
                    type: 'string',
                    description: 'Internal description for this webhook',
                },
                events: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of event types to subscribe to (e.g. ["sent","opened","clicked","unsubscribed","bounced","spam"])',
                },
                type: {
                    type: 'string',
                    enum: ['transactional', 'marketing'],
                    description: 'Webhook type (default: transactional)',
                },
            },
            required: ['url', 'events'],
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
        // ── Contacts ────────────────────────────────────────────────────────────

        case 'list_contacts': {
            const params = new URLSearchParams();
            if (args.limit !== undefined) params.set('limit', String(args.limit));
            if (args.offset !== undefined) params.set('offset', String(args.offset));
            if (args.modifiedSince) params.set('modifiedSince', args.modifiedSince as string);
            const qs = params.toString() ? `?${params}` : '';
            return brevoFetch(`/contacts${qs}`, apiKey);
        }

        case 'get_contact': {
            validateRequired(args, ['identifier']);
            return brevoFetch(`/contacts/${encodeURIComponent(args.identifier as string)}`, apiKey);
        }

        case 'create_contact': {
            validateRequired(args, ['email']);
            const body: Record<string, unknown> = { email: args.email };
            if (args.attributes !== undefined) body.attributes = args.attributes;
            if (args.listIds !== undefined) body.listIds = args.listIds;
            if (args.updateEnabled !== undefined) body.updateEnabled = args.updateEnabled;
            return brevoFetch('/contacts', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_contact': {
            validateRequired(args, ['identifier']);
            const body: Record<string, unknown> = {};
            if (args.attributes !== undefined) body.attributes = args.attributes;
            if (args.listIds !== undefined) body.listIds = args.listIds;
            if (args.unlinkListIds !== undefined) body.unlinkListIds = args.unlinkListIds;
            return brevoFetch(`/contacts/${encodeURIComponent(args.identifier as string)}`, apiKey, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'delete_contact': {
            validateRequired(args, ['identifier']);
            return brevoFetch(`/contacts/${encodeURIComponent(args.identifier as string)}`, apiKey, {
                method: 'DELETE',
            });
        }

        // ── Email Campaigns ─────────────────────────────────────────────────────

        case 'list_campaigns': {
            const params = new URLSearchParams();
            if (args.type) params.set('type', args.type as string);
            if (args.status) params.set('status', args.status as string);
            if (args.limit !== undefined) params.set('limit', String(args.limit));
            if (args.offset !== undefined) params.set('offset', String(args.offset));
            const qs = params.toString() ? `?${params}` : '';
            return brevoFetch(`/emailCampaigns${qs}`, apiKey);
        }

        case 'get_campaign': {
            validateRequired(args, ['campaignId']);
            return brevoFetch(`/emailCampaigns/${args.campaignId}`, apiKey);
        }

        case 'create_campaign': {
            validateRequired(args, ['name', 'subject', 'sender']);
            const body: Record<string, unknown> = {
                name: args.name,
                subject: args.subject,
                sender: args.sender,
            };
            if (args.htmlContent !== undefined) body.htmlContent = args.htmlContent;
            if (args.templateId !== undefined) body.templateId = args.templateId;
            if (args.scheduledAt !== undefined) body.scheduledAt = args.scheduledAt;
            if (args.recipients !== undefined) body.recipients = args.recipients;
            return brevoFetch('/emailCampaigns', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'send_test_email': {
            validateRequired(args, ['campaignId', 'emailTo']);
            return brevoFetch(`/emailCampaigns/${args.campaignId}/sendTest`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ emailTo: args.emailTo }),
            });
        }

        case 'get_campaign_stats': {
            validateRequired(args, ['campaignId']);
            return brevoFetch(`/emailCampaigns/${args.campaignId}?statistics=true`, apiKey);
        }

        // ── Transactional ───────────────────────────────────────────────────────

        case 'send_email': {
            validateRequired(args, ['sender', 'to']);
            const body: Record<string, unknown> = {
                sender: args.sender,
                to: args.to,
            };
            if (args.subject !== undefined) body.subject = args.subject;
            if (args.htmlContent !== undefined) body.htmlContent = args.htmlContent;
            if (args.templateId !== undefined) body.templateId = args.templateId;
            if (args.params !== undefined) body.params = args.params;
            return brevoFetch('/smtp/email', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'send_sms': {
            validateRequired(args, ['recipient', 'content', 'sender']);
            return brevoFetch('/transactionalSMS/sms', apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    recipient: args.recipient,
                    content: args.content,
                    sender: args.sender,
                }),
            });
        }

        case 'get_smtp_stats': {
            const params = new URLSearchParams();
            if (args.startDate) params.set('startDate', args.startDate as string);
            if (args.endDate) params.set('endDate', args.endDate as string);
            if (args.days !== undefined) params.set('days', String(args.days));
            if (args.tag) params.set('tag', args.tag as string);
            const qs = params.toString() ? `?${params}` : '';
            return brevoFetch(`/smtp/statistics/aggregatedReport${qs}`, apiKey);
        }

        case 'list_email_templates': {
            const params = new URLSearchParams();
            if (args.type) params.set('type', args.type as string);
            if (args.status !== undefined) {
                params.set('enabled', args.status === 'active' ? 'true' : 'false');
            }
            if (args.limit !== undefined) params.set('limit', String(args.limit));
            if (args.offset !== undefined) params.set('offset', String(args.offset));
            const qs = params.toString() ? `?${params}` : '';
            return brevoFetch(`/smtp/templates${qs}`, apiKey);
        }

        // ── Lists ───────────────────────────────────────────────────────────────

        case 'list_lists': {
            const params = new URLSearchParams();
            if (args.limit !== undefined) params.set('limit', String(args.limit));
            if (args.offset !== undefined) params.set('offset', String(args.offset));
            const qs = params.toString() ? `?${params}` : '';
            return brevoFetch(`/contacts/lists${qs}`, apiKey);
        }

        case 'create_list': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.folderId !== undefined) body.folderId = args.folderId;
            return brevoFetch('/contacts/lists', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'add_contacts_to_list': {
            validateRequired(args, ['listId', 'emails']);
            return brevoFetch(`/contacts/lists/${args.listId}/contacts/add`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ emails: args.emails }),
            });
        }

        case 'remove_contacts_from_list': {
            validateRequired(args, ['listId', 'emails']);
            return brevoFetch(`/contacts/lists/${args.listId}/contacts/remove`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ emails: args.emails }),
            });
        }

        // ── Events & Webhooks ───────────────────────────────────────────────────

        case 'create_event': {
            validateRequired(args, ['event_name', 'email']);
            const body: Record<string, unknown> = {
                event_name: args.event_name,
                email: args.email,
            };
            if (args.event_date) body.event_date = args.event_date;
            if (args.properties) body.properties = args.properties;
            return brevoFetch('/events', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_webhooks': {
            const params = new URLSearchParams();
            if (args.type) params.set('type', args.type as string);
            const qs = params.toString() ? `?${params}` : '';
            return brevoFetch(`/webhooks${qs}`, apiKey);
        }

        case 'create_webhook': {
            validateRequired(args, ['url', 'events']);
            const body: Record<string, unknown> = {
                url: args.url,
                events: args.events,
            };
            if (args.description) body.description = args.description;
            if (args.type) body.type = args.type;
            return brevoFetch('/webhooks', apiKey, {
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
                JSON.stringify({ status: 'ok', server: 'mcp-brevo', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-brevo', version: '1.0.0' },
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
                return rpcErr(id, -32001, 'Missing required secret: BREVO_API_KEY (header: X-Mcp-Secret-BREVO-API-KEY)');
            }

            // _ping — account health check
            if (toolName === '_ping') {
                try {
                    const result = await brevoFetch('/account', apiKey);
                    return rpcOk(id, toolOk(result));
                } catch (err: unknown) {
                    if (err && typeof err === 'object' && 'code' in err) {
                        const e = err as { code: number; message: string };
                        return rpcErr(id, e.code, e.message);
                    }
                    return rpcErr(id, -32603, 'Ping failed');
                }
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
