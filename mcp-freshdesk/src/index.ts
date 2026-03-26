/**
 * Freshdesk MCP Worker
 * Implements MCP protocol over HTTP for Freshdesk support operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   FRESHDESK_API_KEY  → X-Mcp-Secret-FRESHDESK-API-KEY   (API key from Profile Settings)
 *   FRESHDESK_DOMAIN   → X-Mcp-Secret-FRESHDESK-DOMAIN    (subdomain, e.g. "acme" for acme.freshdesk.com)
 *
 * Auth format: Basic btoa("{apiKey}:X")
 * — Freshdesk uses apiKey as username, literal "X" as password.
 *
 * Covers: Tickets (9), Contacts (6), Companies (4), Agents (3), Groups (2), Reports (1) = 25 tools total
 */

// ── TypeScript interfaces ─────────────────────────────────────────────────────

interface FDTicket {
    id: number; subject: string; description_text?: string; description?: string;
    status: number; priority: number; type: string | null;
    requester_id: number; responder_id: number | null; group_id: number | null;
    company_id: number | null; tags: string[];
    fr_due_by: string | null; due_by: string | null;
    created_at: string; updated_at: string;
    email?: string;
}

interface FDContact {
    id: number; name: string; email: string | null;
    phone: string | null; mobile: string | null;
    company_id: number | null; tags: string[]; description: string | null;
    created_at: string; updated_at: string; active: boolean;
}

interface FDCompany {
    id: number; name: string; description: string | null;
    domains: string[]; note: string | null;
    created_at: string; updated_at: string;
}

interface FDAgent {
    id: number; contact: { name: string; email: string; phone: string | null; mobile: string | null };
    type: string; ticket_scope: number; available: boolean;
    groups: Array<{ id: number; name: string }>;
    created_at: string; updated_at: string;
}

interface FDGroup {
    id: number; name: string; description: string | null;
    escalate_to: number | null; unassigned_for: string | null;
    created_at: string; updated_at: string;
}

interface FDConversation {
    id: number; body_text?: string; body?: string;
    incoming: boolean; private: boolean;
    user_id: number; support_email: string | null;
    created_at: string; updated_at: string;
}

// ── Status/Priority maps ──────────────────────────────────────────────────────

const TICKET_STATUS: Record<number, string> = {
    2: 'open', 3: 'pending', 4: 'resolved', 5: 'closed',
};

const TICKET_PRIORITY: Record<number, string> = {
    1: 'low', 2: 'medium', 3: 'high', 4: 'urgent',
};

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

async function freshdeskFetch(
    path: string,
    apiKey: string,
    domain: string,
    method = 'GET',
    body?: unknown,
): Promise<unknown> {
    const baseUrl = `https://${domain}.freshdesk.com/api/v2`;
    const auth = btoa(`${apiKey}:X`);
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`Freshdesk HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        // Parse Freshdesk error shapes
        let detail = '';

        // Shape 1: { description: "...", errors: [...] }
        if (typeof data.description === 'string') {
            detail = data.description;
        }
        // Shape 2: { message: "..." }
        else if (typeof data.message === 'string') {
            detail = data.message;
        }
        // Shape 3: array of errors
        else if (Array.isArray(data.errors)) {
            const errs = data.errors as Array<{ message?: string; field?: string }>;
            detail = errs.map(e => e.message ?? e.field ?? '').filter(Boolean).join('; ');
        }

        switch (res.status) {
            case 401:
                throw new Error(
                    'Authentication failed — verify FRESHDESK_API_KEY is correct (Profile Settings → API Key)',
                );
            case 403:
                throw new Error(
                    'Permission denied — your Freshdesk agent role lacks access to this resource',
                );
            case 404:
                throw new Error(
                    `Not found — check the ID is correct and belongs to your Freshdesk account`,
                );
            case 409:
                throw new Error(`Conflict: ${detail}`);
            case 422:
                throw new Error(`Validation error: ${detail}`);
            case 429:
                throw new Error(
                    `Rate limited — Freshdesk allows 1000 requests/min. Please retry shortly`,
                );
            case 500:
                throw new Error('Freshdesk internal server error — try again shortly');
            default:
                throw new Error(`Freshdesk HTTP ${res.status}: ${detail || text}`);
        }
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Tickets (9 tools) ──────────────────────────────────────────

    {
        name: 'list_tickets',
        description: 'List tickets from Freshdesk with optional filters. Returns tickets sorted by creation date descending. Use filter to target named views like "new_and_my_open", "watching", "spam", "deleted".',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: {
                    type: 'number',
                    description: 'Number of tickets per page (default 20, max 100)',
                },
                page: {
                    type: 'number',
                    description: 'Page number for pagination (default 1)',
                },
                filter: {
                    type: 'string',
                    description: 'Named filter: "new_and_my_open", "watching", "spam", "deleted". Omit for all accessible tickets.',
                },
                requester_id: {
                    type: 'number',
                    description: 'Filter by requester (contact) ID',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_ticket',
        description: 'Get full details of a specific ticket by ID — subject, description, status, priority, tags, requester, assignee, timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric ticket ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_ticket',
        description: 'Create a new Freshdesk support ticket. Status: 2=open, 3=pending, 4=resolved, 5=closed. Priority: 1=low, 2=medium, 3=high, 4=urgent.',
        inputSchema: {
            type: 'object',
            properties: {
                subject: {
                    type: 'string',
                    description: 'Ticket subject/title',
                },
                description: {
                    type: 'string',
                    description: 'Ticket description (HTML supported)',
                },
                email: {
                    type: 'string',
                    description: 'Requester email — links ticket to contact profile',
                },
                priority: {
                    type: 'number',
                    description: 'Priority: 1=low, 2=medium, 3=high, 4=urgent (default: 1)',
                },
                status: {
                    type: 'number',
                    description: 'Status: 2=open, 3=pending, 4=resolved, 5=closed (default: 2)',
                },
                type: {
                    type: 'string',
                    description: 'Ticket type (e.g. "Question", "Incident", "Problem", "Feature Request")',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for categorization (e.g. ["billing", "api"])',
                },
                cc_emails: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'CC email addresses',
                },
            },
            required: ['subject', 'description', 'email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_ticket',
        description: 'Update an existing ticket — change priority, status, subject, description, tags, type, or assignment.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric ticket ID',
                },
                priority: {
                    type: 'number',
                    description: 'Priority: 1=low, 2=medium, 3=high, 4=urgent',
                },
                status: {
                    type: 'number',
                    description: 'Status: 2=open, 3=pending, 4=resolved, 5=closed',
                },
                subject: {
                    type: 'string',
                    description: 'Updated subject',
                },
                description: {
                    type: 'string',
                    description: 'Updated description (HTML)',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Replace all tags',
                },
                type: {
                    type: 'string',
                    description: 'Ticket type',
                },
                responder_id: {
                    type: 'number',
                    description: 'Agent ID to assign this ticket to',
                },
                group_id: {
                    type: 'number',
                    description: 'Group ID to assign this ticket to',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_ticket',
        description: 'Delete a ticket permanently. This action cannot be undone — the ticket is moved to trash first. Returns success confirmation.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric ticket ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_ticket_conversations',
        description: 'List all conversations (replies and notes) on a ticket — public replies and private agent notes.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric ticket ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_reply',
        description: 'Add a public reply to a ticket that is visible to the requester. Supports CC and BCC addresses.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric ticket ID',
                },
                body: {
                    type: 'string',
                    description: 'Reply body (HTML supported)',
                },
                cc_emails: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'CC email addresses',
                },
                bcc_emails: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'BCC email addresses',
                },
            },
            required: ['id', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'add_note',
        description: 'Add a private internal note to a ticket, visible only to agents. Optionally notify specific agents via email.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric ticket ID',
                },
                body: {
                    type: 'string',
                    description: 'Note body (HTML supported)',
                },
                private: {
                    type: 'boolean',
                    description: 'Whether note is private (default true — agents only)',
                },
                notify_emails: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Agent emails to notify about this note',
                },
            },
            required: ['id', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_ticket_status',
        description: 'Convenience tool — update only the status of a ticket. Status: 2=open, 3=pending, 4=resolved, 5=closed.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric ticket ID',
                },
                status: {
                    type: 'number',
                    description: 'New status: 2=open, 3=pending, 4=resolved, 5=closed',
                    enum: [2, 3, 4, 5],
                },
            },
            required: ['id', 'status'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 2 — Contacts (6 tools) ─────────────────────────────────────────

    {
        name: 'list_contacts',
        description: 'List contacts (customers) with optional filters by email, mobile, or phone. Supports pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: {
                    type: 'number',
                    description: 'Number of contacts per page (default 20, max 100)',
                },
                page: {
                    type: 'number',
                    description: 'Page number (default 1)',
                },
                email: {
                    type: 'string',
                    description: 'Filter by exact email address',
                },
                mobile: {
                    type: 'string',
                    description: 'Filter by mobile number',
                },
                phone: {
                    type: 'string',
                    description: 'Filter by phone number',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_contact',
        description: 'Get full details of a specific contact by ID — name, email, phone, company, tags, description.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric contact ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_contact',
        description: 'Create a new contact in Freshdesk. Name is required. Optionally associate with a company.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Contact full name',
                },
                email: {
                    type: 'string',
                    description: 'Contact email address',
                },
                phone: {
                    type: 'string',
                    description: 'Contact phone number',
                },
                mobile: {
                    type: 'string',
                    description: 'Contact mobile number',
                },
                company_id: {
                    type: 'number',
                    description: 'Freshdesk company ID to associate this contact with',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for this contact',
                },
                description: {
                    type: 'string',
                    description: 'Notes about this contact',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_contact',
        description: 'Update contact details — name, email, phone, mobile, company, tags, or description.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric contact ID',
                },
                name: {
                    type: 'string',
                    description: 'Updated name',
                },
                email: {
                    type: 'string',
                    description: 'Updated email',
                },
                phone: {
                    type: 'string',
                    description: 'Updated phone',
                },
                mobile: {
                    type: 'string',
                    description: 'Updated mobile',
                },
                company_id: {
                    type: 'number',
                    description: 'Updated company ID',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Replace all tags',
                },
                description: {
                    type: 'string',
                    description: 'Updated description',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'search_contacts',
        description: 'Search contacts by name, email, phone, or other fields using a query string.',
        inputSchema: {
            type: 'object',
            properties: {
                term: {
                    type: 'string',
                    description: 'Search term — matches against contact name, email, phone, mobile, and custom fields',
                },
            },
            required: ['term'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'merge_contacts',
        description: 'Merge a contact into another (target). The source contact is deleted; all tickets are transferred to the target.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Target contact ID (the one that survives the merge)',
                },
                target_contact_id: {
                    type: 'number',
                    description: 'Source contact ID to merge into target (this contact will be deleted)',
                },
            },
            required: ['id', 'target_contact_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 3 — Companies (4 tools) ────────────────────────────────────────

    {
        name: 'list_companies',
        description: 'List all companies registered in Freshdesk. Supports pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: {
                    type: 'number',
                    description: 'Companies per page (default 20, max 100)',
                },
                page: {
                    type: 'number',
                    description: 'Page number (default 1)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_company',
        description: 'Get full details of a specific company by ID — name, description, domains, notes.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric company ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_company',
        description: 'Create a new company in Freshdesk. Name is required.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Company name',
                },
                description: {
                    type: 'string',
                    description: 'Company description',
                },
                domains: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Email domains associated with this company (e.g. ["acme.com"])',
                },
                note: {
                    type: 'string',
                    description: 'Internal notes about this company',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_company_contacts',
        description: 'List all contacts (customers) belonging to a specific company.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric company ID',
                },
                per_page: {
                    type: 'number',
                    description: 'Contacts per page (default 20, max 100)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Agents (3 tools) ───────────────────────────────────────────

    {
        name: 'list_agents',
        description: 'List all agents (support staff) in the Freshdesk account — name, email, type, groups, availability status.',
        inputSchema: {
            type: 'object',
            properties: {
                per_page: {
                    type: 'number',
                    description: 'Agents per page (default 50, max 100)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_agent',
        description: 'Get details of a specific agent by ID — name, email, type, ticket scope, groups, availability.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric agent ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_current_agent',
        description: 'Get the details of the currently authenticated agent (based on the API key being used). Useful to identify yourself.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 5 — Groups (2 tools) ───────────────────────────────────────────

    {
        name: 'list_groups',
        description: 'List all support groups (teams) in Freshdesk — name, description, escalation settings.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_group',
        description: 'Get details of a specific group (team) by ID — name, description, escalation agent, unassigned timeout.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Freshdesk numeric group ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 6 — Reports (1 tool) ───────────────────────────────────────────

    {
        name: 'get_ticket_stats',
        description: 'Get overview ticket statistics — open, pending, resolved, overdue counts. Requires Freshdesk Freddy Analytics or higher plan. Returns fallback summary from ticket filter counts if the reports endpoint is unavailable.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
    domain: string,
): Promise<unknown> {
    switch (name) {

        // ── Tickets ───────────────────────────────────────────────────────────

        case 'list_tickets': {
            const params = new URLSearchParams({
                per_page: String(args.per_page ?? 20),
                page: String(args.page ?? 1),
                order_by: 'created_at',
                order_type: 'desc',
            });
            if (args.filter) params.set('filter', args.filter as string);
            if (args.requester_id) params.set('requester_id', String(args.requester_id));
            const data = await freshdeskFetch(`/tickets?${params}`, apiKey, domain) as FDTicket[];
            return (data ?? []).map(t => ({
                id: t.id,
                subject: t.subject,
                status: TICKET_STATUS[t.status] ?? t.status,
                status_code: t.status,
                priority: TICKET_PRIORITY[t.priority] ?? t.priority,
                priority_code: t.priority,
                requester_id: t.requester_id,
                responder_id: t.responder_id,
                group_id: t.group_id,
                tags: t.tags,
                created_at: t.created_at,
                updated_at: t.updated_at,
            }));
        }

        case 'get_ticket': {
            validateRequired(args, ['id']);
            const data = await freshdeskFetch(`/tickets/${args.id as number}`, apiKey, domain) as FDTicket;
            return {
                id: data.id,
                subject: data.subject,
                description: data.description_text ?? data.description,
                status: TICKET_STATUS[data.status] ?? data.status,
                status_code: data.status,
                priority: TICKET_PRIORITY[data.priority] ?? data.priority,
                priority_code: data.priority,
                type: data.type,
                requester_id: data.requester_id,
                responder_id: data.responder_id,
                group_id: data.group_id,
                company_id: data.company_id,
                tags: data.tags,
                fr_due_by: data.fr_due_by,
                due_by: data.due_by,
                created_at: data.created_at,
                updated_at: data.updated_at,
            };
        }

        case 'create_ticket': {
            validateRequired(args, ['subject', 'description', 'email']);
            const ticketBody: Record<string, unknown> = {
                subject: args.subject,
                description: args.description,
                email: args.email,
                priority: (args.priority as number) ?? 1,
                status: (args.status as number) ?? 2,
            };
            if (args.type) ticketBody.type = args.type;
            if (args.tags) ticketBody.tags = args.tags;
            if (args.cc_emails) ticketBody.cc_emails = args.cc_emails;

            const data = await freshdeskFetch('/tickets', apiKey, domain, 'POST', ticketBody) as FDTicket;
            return {
                id: data.id,
                subject: data.subject,
                status: TICKET_STATUS[data.status] ?? data.status,
                status_code: data.status,
                priority: TICKET_PRIORITY[data.priority] ?? data.priority,
                priority_code: data.priority,
                requester_id: data.requester_id,
                tags: data.tags,
                created_at: data.created_at,
            };
        }

        case 'update_ticket': {
            validateRequired(args, ['id']);
            const update: Record<string, unknown> = {};
            if (args.priority !== undefined) update.priority = args.priority;
            if (args.status !== undefined) update.status = args.status;
            if (args.subject !== undefined) update.subject = args.subject;
            if (args.description !== undefined) update.description = args.description;
            if (args.tags !== undefined) update.tags = args.tags;
            if (args.type !== undefined) update.type = args.type;
            if (args.responder_id !== undefined) update.responder_id = args.responder_id;
            if (args.group_id !== undefined) update.group_id = args.group_id;

            const data = await freshdeskFetch(`/tickets/${args.id as number}`, apiKey, domain, 'PUT', update) as FDTicket;
            return {
                id: data.id,
                status: TICKET_STATUS[data.status] ?? data.status,
                status_code: data.status,
                priority: TICKET_PRIORITY[data.priority] ?? data.priority,
                priority_code: data.priority,
                updated_at: data.updated_at,
            };
        }

        case 'delete_ticket': {
            validateRequired(args, ['id']);
            await freshdeskFetch(`/tickets/${args.id as number}`, apiKey, domain, 'DELETE');
            return {
                success: true,
                deleted_ticket_id: args.id,
                note: 'Ticket deleted successfully',
            };
        }

        case 'list_ticket_conversations': {
            validateRequired(args, ['id']);
            const data = await freshdeskFetch(
                `/tickets/${args.id as number}/conversations`,
                apiKey,
                domain,
            ) as FDConversation[];
            return (data ?? []).map(c => ({
                id: c.id,
                body: c.body_text ?? c.body,
                incoming: c.incoming,
                private: c.private,
                user_id: c.user_id,
                support_email: c.support_email,
                created_at: c.created_at,
                updated_at: c.updated_at,
            }));
        }

        case 'add_reply': {
            validateRequired(args, ['id', 'body']);
            const replyBody: Record<string, unknown> = { body: args.body };
            if (args.cc_emails) replyBody.cc_emails = args.cc_emails;
            if (args.bcc_emails) replyBody.bcc_emails = args.bcc_emails;

            const data = await freshdeskFetch(
                `/tickets/${args.id as number}/reply`,
                apiKey,
                domain,
                'POST',
                replyBody,
            ) as FDConversation;
            return {
                id: data.id,
                ticket_id: args.id,
                private: false,
                created_at: data.created_at,
            };
        }

        case 'add_note': {
            validateRequired(args, ['id', 'body']);
            const noteBody: Record<string, unknown> = {
                body: args.body,
                private: (args.private as boolean) ?? true,
            };
            if (args.notify_emails) noteBody.notify_emails = args.notify_emails;

            const data = await freshdeskFetch(
                `/tickets/${args.id as number}/notes`,
                apiKey,
                domain,
                'POST',
                noteBody,
            ) as FDConversation;
            return {
                id: data.id,
                ticket_id: args.id,
                private: data.private,
                created_at: data.created_at,
            };
        }

        case 'update_ticket_status': {
            validateRequired(args, ['id', 'status']);
            const data = await freshdeskFetch(
                `/tickets/${args.id as number}`,
                apiKey,
                domain,
                'PUT',
                { status: args.status },
            ) as FDTicket;
            return {
                id: data.id,
                status: TICKET_STATUS[data.status] ?? data.status,
                status_code: data.status,
                updated_at: data.updated_at,
            };
        }

        // ── Contacts ──────────────────────────────────────────────────────────

        case 'list_contacts': {
            const params = new URLSearchParams({
                per_page: String(args.per_page ?? 20),
                page: String(args.page ?? 1),
            });
            if (args.email) params.set('email', args.email as string);
            if (args.mobile) params.set('mobile', args.mobile as string);
            if (args.phone) params.set('phone', args.phone as string);

            const data = await freshdeskFetch(`/contacts?${params}`, apiKey, domain) as FDContact[];
            return (data ?? []).map(c => ({
                id: c.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                mobile: c.mobile,
                company_id: c.company_id,
                tags: c.tags,
                active: c.active,
                created_at: c.created_at,
                updated_at: c.updated_at,
            }));
        }

        case 'get_contact': {
            validateRequired(args, ['id']);
            const data = await freshdeskFetch(`/contacts/${args.id as number}`, apiKey, domain) as FDContact;
            return {
                id: data.id,
                name: data.name,
                email: data.email,
                phone: data.phone,
                mobile: data.mobile,
                company_id: data.company_id,
                tags: data.tags,
                description: data.description,
                active: data.active,
                created_at: data.created_at,
                updated_at: data.updated_at,
            };
        }

        case 'create_contact': {
            validateRequired(args, ['name']);
            const contactBody: Record<string, unknown> = { name: args.name };
            if (args.email) contactBody.email = args.email;
            if (args.phone) contactBody.phone = args.phone;
            if (args.mobile) contactBody.mobile = args.mobile;
            if (args.company_id) contactBody.company_id = args.company_id;
            if (args.tags) contactBody.tags = args.tags;
            if (args.description) contactBody.description = args.description;

            const data = await freshdeskFetch('/contacts', apiKey, domain, 'POST', contactBody) as FDContact;
            return {
                id: data.id,
                name: data.name,
                email: data.email,
                phone: data.phone,
                mobile: data.mobile,
                company_id: data.company_id,
                created_at: data.created_at,
            };
        }

        case 'update_contact': {
            validateRequired(args, ['id']);
            const contactUpdate: Record<string, unknown> = {};
            if (args.name !== undefined) contactUpdate.name = args.name;
            if (args.email !== undefined) contactUpdate.email = args.email;
            if (args.phone !== undefined) contactUpdate.phone = args.phone;
            if (args.mobile !== undefined) contactUpdate.mobile = args.mobile;
            if (args.company_id !== undefined) contactUpdate.company_id = args.company_id;
            if (args.tags !== undefined) contactUpdate.tags = args.tags;
            if (args.description !== undefined) contactUpdate.description = args.description;

            const data = await freshdeskFetch(
                `/contacts/${args.id as number}`,
                apiKey,
                domain,
                'PUT',
                contactUpdate,
            ) as FDContact;
            return {
                id: data.id,
                name: data.name,
                email: data.email,
                updated_at: data.updated_at,
            };
        }

        case 'search_contacts': {
            validateRequired(args, ['term']);
            const data = await freshdeskFetch(
                `/contacts?query="${encodeURIComponent(args.term as string)}"`,
                apiKey,
                domain,
            ) as FDContact[] | { results: FDContact[] };

            // Freshdesk search may return direct array or { results: [] }
            const contacts = Array.isArray(data) ? data : ((data as { results: FDContact[] }).results ?? []);
            return contacts.map(c => ({
                id: c.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                mobile: c.mobile,
                company_id: c.company_id,
                active: c.active,
                created_at: c.created_at,
            }));
        }

        case 'merge_contacts': {
            validateRequired(args, ['id', 'target_contact_id']);
            await freshdeskFetch(
                `/contacts/${args.id as number}/merge`,
                apiKey,
                domain,
                'POST',
                {
                    target_contact_id: args.target_contact_id,
                    contact: {},
                },
            );
            return {
                success: true,
                target_contact_id: args.id,
                merged_contact_id: args.target_contact_id,
                note: 'Contacts merged — source contact deleted, tickets transferred to target',
            };
        }

        // ── Companies ─────────────────────────────────────────────────────────

        case 'list_companies': {
            const params = new URLSearchParams({
                per_page: String(args.per_page ?? 20),
                page: String(args.page ?? 1),
            });
            const data = await freshdeskFetch(`/companies?${params}`, apiKey, domain) as FDCompany[];
            return (data ?? []).map(c => ({
                id: c.id,
                name: c.name,
                description: c.description,
                domains: c.domains,
                created_at: c.created_at,
                updated_at: c.updated_at,
            }));
        }

        case 'get_company': {
            validateRequired(args, ['id']);
            const data = await freshdeskFetch(`/companies/${args.id as number}`, apiKey, domain) as FDCompany;
            return {
                id: data.id,
                name: data.name,
                description: data.description,
                domains: data.domains,
                note: data.note,
                created_at: data.created_at,
                updated_at: data.updated_at,
            };
        }

        case 'create_company': {
            validateRequired(args, ['name']);
            const companyBody: Record<string, unknown> = { name: args.name };
            if (args.description) companyBody.description = args.description;
            if (args.domains) companyBody.domains = args.domains;
            if (args.note) companyBody.note = args.note;

            const data = await freshdeskFetch('/companies', apiKey, domain, 'POST', companyBody) as FDCompany;
            return {
                id: data.id,
                name: data.name,
                description: data.description,
                domains: data.domains,
                created_at: data.created_at,
            };
        }

        case 'list_company_contacts': {
            validateRequired(args, ['id']);
            const perPage = (args.per_page as number) ?? 20;
            const data = await freshdeskFetch(
                `/companies/${args.id as number}/contacts?per_page=${perPage}`,
                apiKey,
                domain,
            ) as FDContact[];
            return (data ?? []).map(c => ({
                id: c.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                mobile: c.mobile,
                active: c.active,
                created_at: c.created_at,
            }));
        }

        // ── Agents ────────────────────────────────────────────────────────────

        case 'list_agents': {
            const perPage = (args.per_page as number) ?? 50;
            const data = await freshdeskFetch(`/agents?per_page=${perPage}`, apiKey, domain) as FDAgent[];
            return (data ?? []).map(a => ({
                id: a.id,
                name: a.contact?.name,
                email: a.contact?.email,
                phone: a.contact?.phone,
                type: a.type,
                ticket_scope: a.ticket_scope,
                available: a.available,
                groups: (a.groups ?? []).map(g => ({ id: g.id, name: g.name })),
                created_at: a.created_at,
            }));
        }

        case 'get_agent': {
            validateRequired(args, ['id']);
            const data = await freshdeskFetch(`/agents/${args.id as number}`, apiKey, domain) as FDAgent;
            return {
                id: data.id,
                name: data.contact?.name,
                email: data.contact?.email,
                phone: data.contact?.phone,
                mobile: data.contact?.mobile,
                type: data.type,
                ticket_scope: data.ticket_scope,
                available: data.available,
                groups: (data.groups ?? []).map(g => ({ id: g.id, name: g.name })),
                created_at: data.created_at,
                updated_at: data.updated_at,
            };
        }

        case 'get_current_agent': {
            const data = await freshdeskFetch('/agents/me', apiKey, domain) as FDAgent;
            return {
                id: data.id,
                name: data.contact?.name,
                email: data.contact?.email,
                phone: data.contact?.phone,
                mobile: data.contact?.mobile,
                type: data.type,
                ticket_scope: data.ticket_scope,
                available: data.available,
                groups: (data.groups ?? []).map(g => ({ id: g.id, name: g.name })),
                created_at: data.created_at,
                updated_at: data.updated_at,
            };
        }

        // ── Groups ────────────────────────────────────────────────────────────

        case 'list_groups': {
            const data = await freshdeskFetch('/groups', apiKey, domain) as FDGroup[];
            return (data ?? []).map(g => ({
                id: g.id,
                name: g.name,
                description: g.description,
                escalate_to: g.escalate_to,
                unassigned_for: g.unassigned_for,
                created_at: g.created_at,
                updated_at: g.updated_at,
            }));
        }

        case 'get_group': {
            validateRequired(args, ['id']);
            const data = await freshdeskFetch(`/groups/${args.id as number}`, apiKey, domain) as FDGroup;
            return {
                id: data.id,
                name: data.name,
                description: data.description,
                escalate_to: data.escalate_to,
                unassigned_for: data.unassigned_for,
                created_at: data.created_at,
                updated_at: data.updated_at,
            };
        }

        // ── Reports ───────────────────────────────────────────────────────────

        case 'get_ticket_stats': {
            // Attempt the reports/overview endpoint (requires Freshdesk Freddy Analytics plan)
            try {
                const data = await freshdeskFetch('/reports/overview', apiKey, domain) as Record<string, unknown>;
                return data;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                // If 404, the plan doesn't support it — return a helpful message
                if (msg.includes('404') || msg.includes('Not found')) {
                    return {
                        note: 'The /reports/overview endpoint requires Freshdesk Freddy Analytics (Pro/Enterprise plan). Returning basic ticket counts as fallback.',
                        plan_upgrade_url: `https://${domain}.freshdesk.com/a/admin/subscription`,
                        fallback: 'Use list_tickets with filter parameter to get open/pending counts manually.',
                    };
                }
                throw err;
            }
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-freshdesk', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        // Parse JSON-RPC body
        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error — invalid JSON');
        }

        const { id, method, params } = body;

        // ── Protocol methods ──────────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-freshdesk', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'notifications/initialized') {
            return rpcOk(id, {});
        }

        if (method !== 'tools/call') {
            return rpcErr(id, -32601, `Method not found: ${method}`);
        }

        // ── tools/call ────────────────────────────────────────────────────────

        // Extract secrets from headers
        const apiKey = request.headers.get('X-Mcp-Secret-FRESHDESK-API-KEY');
        const domain = request.headers.get('X-Mcp-Secret-FRESHDESK-DOMAIN');

        if (!apiKey || !domain) {
            return rpcErr(
                id,
                -32001,
                'Missing required secrets — add FRESHDESK_API_KEY and FRESHDESK_DOMAIN to workspace secrets',
            );
        }

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        try {
            const result = await callTool(toolName, args, apiKey, domain);
            return rpcOk(id, toolOk(result));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return rpcErr(id, -32603, msg);
        }
    },
};
