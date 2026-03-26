/**
 * Zendesk MCP Worker
 * Implements MCP protocol over HTTP for Zendesk Support operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   ZENDESK_SUBDOMAIN  → X-Mcp-Secret-ZENDESK-SUBDOMAIN  (e.g. "acme" from acme.zendesk.com)
 *   ZENDESK_EMAIL      → X-Mcp-Secret-ZENDESK-EMAIL      (admin email)
 *   ZENDESK_API_TOKEN  → X-Mcp-Secret-ZENDESK-API-TOKEN  (API token from Admin Center)
 *
 * Auth format: Basic btoa("{email}/token:{api_token}")
 * — Zendesk requires "/token" appended to the email as username.
 *
 * Covers: Tickets (9), Users (6), Organizations (4), Knowledge Base (4),
 *         Views & Macros (3), Analytics (2) = 26 tools total
 */

// ── TypeScript interfaces ─────────────────────────────────────────────────────

interface ZDTicket {
    id: number; subject: string; description: string;
    status: string; priority: string | null; type: string | null;
    requester_id: number; assignee_id: number | null; group_id: number | null;
    organization_id: number | null; tags: string[];
    created_at: string; updated_at: string; due_at: string | null;
    via: { channel: string };
    custom_fields: Array<{ id: number; value: unknown }>;
}

interface ZDUser {
    id: number; name: string; email: string; phone: string | null;
    role: string; organization_id: number | null; tags: string[];
    notes: string | null; time_zone: string | null;
    created_at: string; updated_at: string; active: boolean;
}

interface ZDComment {
    id: number; type: string; author_id: number;
    body: string; html_body: string; plain_body: string;
    public: boolean; created_at: string;
}

interface ZDOrganization {
    id: number; name: string; domain_names: string[];
    tags: string[]; notes: string | null; group_id: number | null;
    created_at: string; updated_at: string;
}

interface ZDArticle {
    id: number; title: string; body: string; snippet?: string;
    html_url: string; vote_sum: number; label_names: string[];
    created_at: string; updated_at: string;
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

async function zdApi(
    path: string,
    authHeader: string,
    baseUrl: string,
    method = 'GET',
    body?: unknown,
): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Handle 204 No Content (DELETE)
    if (res.status === 204) {
        return null;
    }

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`Zendesk HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        // Parse Zendesk error shapes
        let detail = '';

        // Shape 1: { error: "RecordNotFound", description: "Not found" }
        if (typeof data.description === 'string') {
            detail = data.description;
        }
        // Shape 2: { details: { base: [{ description: "..." }] } } or { details: { field: [{ description: "..." }] } }
        else if (data.details && typeof data.details === 'object') {
            const details = data.details as Record<string, Array<{ description: string }>>;
            const allDescs: string[] = [];
            for (const fieldDescs of Object.values(details)) {
                if (Array.isArray(fieldDescs)) {
                    for (const item of fieldDescs) {
                        if (item.description) allDescs.push(item.description);
                    }
                }
            }
            detail = allDescs.join('; ');
        }
        // Shape 3: { errors: [...] }
        else if (Array.isArray(data.errors)) {
            detail = (data.errors as string[]).join('; ');
        }
        // Fallback: { error: "SomeErrorCode" }
        else if (typeof data.error === 'string') {
            detail = data.error;
        }

        const retryAfter = res.headers.get('retry-after') ?? res.headers.get('Retry-After') ?? '60';

        switch (res.status) {
            case 401:
                throw new Error(
                    'Authentication failed — verify ZENDESK_EMAIL is the admin email and ZENDESK_API_TOKEN is correct. Tip: token auth uses email/token format internally.',
                );
            case 403:
                throw new Error(
                    'Permission denied — your Zendesk agent role lacks access to this resource',
                );
            case 404:
                throw new Error(
                    `Not found — check the ID is correct and belongs to your Zendesk account`,
                );
            case 422:
                throw new Error(`Validation error: ${detail}`);
            case 429:
                throw new Error(
                    `Rate limited — Zendesk allows 700 requests/min. Retry after ${retryAfter}s`,
                );
            case 503:
                throw new Error('Zendesk maintenance — check status.zendesk.com');
            default:
                throw new Error(`Zendesk HTTP ${res.status}: ${detail || text}`);
        }
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Tickets (9 tools) ──────────────────────────────────────────

    {
        name: 'list_tickets',
        description: 'List recent tickets with optional filters for status, priority, and assignee. Returns last 100 by default sorted by updated_at. For status filtering uses Zendesk search endpoint for accuracy.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['open', 'pending', 'hold', 'solved', 'closed'],
                    description: 'Filter by ticket status. open=in progress, pending=waiting on customer, hold=waiting on third party, solved=resolved, closed=locked/archived',
                },
                priority: {
                    type: 'string',
                    enum: ['low', 'normal', 'high', 'urgent'],
                    description: 'Filter by ticket priority. urgent=critical outages/legal/payment issues',
                },
                assignee_id: {
                    type: 'number',
                    description: 'Zendesk numeric ID of agent (e.g. 12345). Filter tickets assigned to this agent.',
                },
                limit: {
                    type: 'number',
                    description: 'Number of tickets to return (default 20, max 100)',
                },
                sort_by: {
                    type: 'string',
                    description: 'Field to sort by (default "updated_at"). Options: created_at, updated_at, priority, status',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_tickets',
        description: 'Search tickets using Zendesk search syntax. Supports complex queries including status, priority, requester, tags, date ranges, and free text.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Zendesk search syntax. Examples: \'status:open priority:urgent\', \'requester:sarah@acme.com\', \'tag:billing created>2024-01-01\', \'refund payment\'. Use free text for subject/description search.',
                },
                sort_by: {
                    type: 'string',
                    enum: ['created_at', 'updated_at', 'priority', 'status'],
                    description: 'Sort field (default: updated_at)',
                },
                sort_order: {
                    type: 'string',
                    enum: ['asc', 'desc'],
                    description: 'Sort direction (default: desc)',
                },
                limit: {
                    type: 'number',
                    description: 'Number of results to return (default 10, max 100)',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_ticket',
        description: 'Get full details of a specific ticket by ID — subject, description, status, priority, tags, assignee, requester, channel, timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                ticket_id: {
                    type: 'number',
                    description: 'Zendesk numeric ticket ID (e.g. 12345)',
                },
            },
            required: ['ticket_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_ticket',
        description: 'Create a new support ticket. Core tool for AI bot escalation — use internal_note to pass AI conversation summary to agents. The channel param (e.g. "whatsapp") is automatically added as a tag.',
        inputSchema: {
            type: 'object',
            properties: {
                subject: {
                    type: 'string',
                    description: 'Ticket subject/title',
                },
                body: {
                    type: 'string',
                    description: 'Initial ticket description (plain text or HTML). Visible to the customer.',
                },
                requester_email: {
                    type: 'string',
                    description: 'Customer email — links ticket to their user profile. Creates new user if not found.',
                },
                requester_name: {
                    type: 'string',
                    description: 'Customer name (used with requester_email, creates new user if email not found)',
                },
                priority: {
                    type: 'string',
                    enum: ['low', 'normal', 'high', 'urgent'],
                    description: 'Ticket priority (default: normal). Use \'urgent\' for outages/legal/payment issues.',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for routing and filtering (e.g. ["billing", "bot-escalation", "whatsapp"])',
                },
                channel: {
                    type: 'string',
                    description: 'Source channel for tracking (e.g. "whatsapp", "telegram", "discord"). Stored as tag automatically.',
                },
                internal_note: {
                    type: 'string',
                    description: 'Private agent note added on creation — NOT visible to customer. Use to pass AI conversation summary, customer sentiment, and context to human agents.',
                },
                assignee_id: {
                    type: 'number',
                    description: 'Zendesk numeric agent ID to assign the ticket to (optional)',
                },
                group_id: {
                    type: 'number',
                    description: 'Zendesk numeric team/group ID to assign the ticket to (optional)',
                },
            },
            required: ['subject', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_ticket',
        description: 'Update a ticket — change status, priority, assignee, tags. Optionally add a comment in the same API call. Use add_tags to append tags without removing existing ones.',
        inputSchema: {
            type: 'object',
            properties: {
                ticket_id: {
                    type: 'number',
                    description: 'Zendesk numeric ticket ID (e.g. 12345)',
                },
                status: {
                    type: 'string',
                    enum: ['open', 'pending', 'hold', 'solved', 'closed'],
                    description: 'open=in progress, pending=waiting on customer reply, hold=waiting on third party, solved=resolved, closed=locked',
                },
                priority: {
                    type: 'string',
                    enum: ['low', 'normal', 'high', 'urgent'],
                    description: 'Ticket priority',
                },
                assignee_id: {
                    type: 'number',
                    description: 'Zendesk numeric ID of agent to reassign to',
                },
                group_id: {
                    type: 'number',
                    description: 'Zendesk numeric group/team ID to assign to',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Replaces ALL existing tags — include current tags if you want to keep them. Prefer add_tags for additive updates.',
                },
                add_tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Add these tags without removing existing ones (fetches current tags first then merges). Preferred for additive tag updates.',
                },
                comment: {
                    type: 'string',
                    description: 'Add a comment in the same API call as the update',
                },
                comment_public: {
                    type: 'boolean',
                    description: 'Whether the comment is public (visible to customer). Default false = internal note.',
                },
            },
            required: ['ticket_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_ticket',
        description: 'Soft-delete a ticket (moves to trash). Recoverable within 30 days from Admin Center → Trash.',
        inputSchema: {
            type: 'object',
            properties: {
                ticket_id: {
                    type: 'number',
                    description: 'Zendesk numeric ticket ID to delete (e.g. 12345)',
                },
            },
            required: ['ticket_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'list_ticket_comments',
        description: 'List all comments on a ticket — both public replies (visible to customer) and internal notes (agents only). Each comment shows author, body, public flag, and timestamp.',
        inputSchema: {
            type: 'object',
            properties: {
                ticket_id: {
                    type: 'number',
                    description: 'Zendesk numeric ticket ID (e.g. 12345)',
                },
                limit: {
                    type: 'number',
                    description: 'Number of comments to return (default 20)',
                },
            },
            required: ['ticket_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_comment',
        description: '⚠️ Add a comment to a ticket. DEFAULTS TO INTERNAL NOTE (public: false). Set public: true explicitly only when you want the customer to see it. Internal notes are only visible to agents.',
        inputSchema: {
            type: 'object',
            properties: {
                ticket_id: {
                    type: 'number',
                    description: 'Zendesk numeric ticket ID to comment on (e.g. 12345)',
                },
                body: {
                    type: 'string',
                    description: 'Comment text (plain text or HTML)',
                },
                public: {
                    type: 'boolean',
                    description: '⚠️ true = public reply VISIBLE TO CUSTOMER. false = internal note visible to agents only (DEFAULT false — safer). Always double-check before setting true.',
                },
                author_id: {
                    type: 'number',
                    description: 'Zendesk numeric agent ID posting the comment. Optional — uses API token owner if omitted.',
                },
            },
            required: ['ticket_id', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'merge_tickets',
        description: 'Merge one ticket into another. The source ticket is closed and its history is linked to the target ticket. Useful for deduplication.',
        inputSchema: {
            type: 'object',
            properties: {
                ticket_id: {
                    type: 'number',
                    description: 'Zendesk numeric ID of the ticket to merge INTO (target — stays open)',
                },
                source_ticket_id: {
                    type: 'number',
                    description: 'Zendesk numeric ID of the ticket being merged (source — will be closed)',
                },
                target_comment: {
                    type: 'string',
                    description: 'Optional message added to the target ticket after merge',
                },
                source_comment: {
                    type: 'string',
                    description: 'Optional message added to the source ticket before it is closed',
                },
            },
            required: ['ticket_id', 'source_ticket_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 2 — Users (6 tools) ─────────────────────────────────────────────

    {
        name: 'search_users',
        description: 'Search for users by email, name, phone, or free text. Returns role (end-user/agent/admin), organization, tags, and account status.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query — can be email address, name, phone number, or free text. Examples: "sarah@acme.com", "Sarah Chen", "+447911123456", "billing manager"',
                },
                role: {
                    type: 'string',
                    enum: ['end-user', 'agent', 'admin'],
                    description: 'Filter by user role (optional)',
                },
                limit: {
                    type: 'number',
                    description: 'Number of users to return (default 10)',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user',
        description: 'Get full profile of a Zendesk user — name, email, phone, organization, role, tags, notes, time zone, created date.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'number',
                    description: 'Zendesk numeric user ID (e.g. 12345)',
                },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user_tickets',
        description: 'Get all tickets submitted by a specific user. Useful for "what is their support history?" context.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'number',
                    description: 'Zendesk numeric user ID (e.g. 12345)',
                },
                limit: {
                    type: 'number',
                    description: 'Number of tickets to return (default 10)',
                },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_user',
        description: 'Create a new Zendesk user (end-user by default). Use for new customers contacting via bot channels.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'User full name',
                },
                email: {
                    type: 'string',
                    description: 'User email address (optional but recommended)',
                },
                phone: {
                    type: 'string',
                    description: 'User phone number in E.164 format (e.g. "+447911123456")',
                },
                organization_id: {
                    type: 'number',
                    description: 'Zendesk numeric organization ID to associate user with',
                },
                role: {
                    type: 'string',
                    enum: ['end-user', 'agent', 'admin'],
                    description: 'User role (default: end-user)',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags to assign to this user (e.g. ["whatsapp", "new-customer"])',
                },
                notes: {
                    type: 'string',
                    description: 'Internal notes about this user (not visible to user)',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_user',
        description: 'Update a Zendesk user profile — name, email, phone, organization, tags, or notes. Only provided fields are updated.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'number',
                    description: 'Zendesk numeric user ID (e.g. 12345)',
                },
                name: { type: 'string', description: 'Updated user name' },
                email: { type: 'string', description: 'Updated email address' },
                phone: { type: 'string', description: 'Updated phone number in E.164 format' },
                organization_id: { type: 'number', description: 'Updated organization ID' },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Replaces all existing user tags',
                },
                notes: { type: 'string', description: 'Updated internal notes' },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_user_identities',
        description: 'Get all verified identities for a user — email addresses, phone numbers, social logins. Shows which is primary and which are verified.',
        inputSchema: {
            type: 'object',
            properties: {
                user_id: {
                    type: 'number',
                    description: 'Zendesk numeric user ID (e.g. 12345)',
                },
            },
            required: ['user_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Organizations (4 tools) ────────────────────────────────────

    {
        name: 'search_organizations',
        description: 'Search organizations by name, domain name, or external ID. Returns organization list with domains and tags.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query — organization name, domain (e.g. "acme.com"), or external ID',
                },
                limit: {
                    type: 'number',
                    description: 'Number of results to return (default 10)',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_organization',
        description: 'Get full details of a Zendesk organization — name, domain names, tags, notes, group assignment.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: {
                    type: 'number',
                    description: 'Zendesk numeric organization ID (e.g. 12345)',
                },
            },
            required: ['organization_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_organization',
        description: 'Create a new Zendesk organization (company/account). Associates users and tickets under a company umbrella.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Organization name (e.g. "Acme Corp")',
                },
                domain_names: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Email domains associated with this org (e.g. ["acme.com", "acme.co.uk"]). Users with matching email domains auto-join.',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for this organization',
                },
                notes: {
                    type: 'string',
                    description: 'Internal notes about this organization',
                },
                group_id: {
                    type: 'number',
                    description: 'Default group/team to handle this org\'s tickets',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_organization',
        description: 'Update a Zendesk organization — name, domains, tags, notes, or default group. Only provided fields are updated.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: {
                    type: 'number',
                    description: 'Zendesk numeric organization ID (e.g. 12345)',
                },
                name: { type: 'string', description: 'Updated organization name' },
                domain_names: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Updated domain names (replaces existing)',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Updated tags (replaces existing)',
                },
                notes: { type: 'string', description: 'Updated internal notes' },
                group_id: { type: 'number', description: 'Updated default group ID' },
            },
            required: ['organization_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Knowledge Base (4 tools) ───────────────────────────────────

    {
        name: 'search_articles',
        description: 'Full-text search across all published Help Center articles. Returns title, snippet, URL, and vote score. Use this FIRST before creating a ticket — most customer questions have KB answers.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query — free text matching article titles and bodies (e.g. "export data", "reset password", "refund policy")',
                },
                locale: {
                    type: 'string',
                    description: 'Language locale (default: en-us). Examples: en-us, fr, de, es, pt-br',
                },
                limit: {
                    type: 'number',
                    description: 'Number of articles to return (default 5, max 20)',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_articles',
        description: 'List all published Help Center articles, sorted by most recently updated. Optionally filter by locale or labels.',
        inputSchema: {
            type: 'object',
            properties: {
                locale: {
                    type: 'string',
                    description: 'Language locale (default: en-us)',
                },
                label_names: {
                    type: 'string',
                    description: 'Comma-separated label names to filter by (e.g. "billing,payments")',
                },
                limit: {
                    type: 'number',
                    description: 'Number of articles to return (default 10)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_article',
        description: 'Get the full content of a Help Center article. HTML tags are stripped for readable plain text output.',
        inputSchema: {
            type: 'object',
            properties: {
                article_id: {
                    type: 'number',
                    description: 'Zendesk numeric article ID (e.g. 12345)',
                },
            },
            required: ['article_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_article',
        description: 'Create a new Help Center article in a specific section. Useful for converting resolved tickets into KB articles.',
        inputSchema: {
            type: 'object',
            properties: {
                section_id: {
                    type: 'number',
                    description: 'Zendesk numeric Help Center section ID to create the article in. Find section IDs from list_articles or your Help Center admin.',
                },
                title: {
                    type: 'string',
                    description: 'Article title',
                },
                body: {
                    type: 'string',
                    description: 'Article body as HTML content. Can include <p>, <ul>, <li>, <h2>, <code>, <a> tags.',
                },
                locale: {
                    type: 'string',
                    description: 'Article language locale (default: en-us)',
                },
                labels: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Label names for this article (e.g. ["billing", "payments"])',
                },
            },
            required: ['section_id', 'title', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 5 — Views & Macros (3 tools) ───────────────────────────────────

    {
        name: 'list_views',
        description: 'List all active ticket views (saved filters). Views represent pre-configured ticket queues like "All Open Tickets", "Urgent Tickets", "Unassigned". Use get_view_tickets to see tickets in a view.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of views to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_view_tickets',
        description: 'Get tickets in a specific view. Views are saved filters — use list_views to find view IDs first.',
        inputSchema: {
            type: 'object',
            properties: {
                view_id: {
                    type: 'number',
                    description: 'Zendesk numeric view ID (e.g. 12345). Use list_views to find IDs.',
                },
                limit: {
                    type: 'number',
                    description: 'Number of tickets to return (default 20)',
                },
            },
            required: ['view_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_macros',
        description: 'List available macros (automated actions/templates). Macros can change ticket status, add tags, send canned responses, and more.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of macros to return (default 20)',
                },
                query: {
                    type: 'string',
                    description: 'Filter macros by title keyword (optional)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 6 — Analytics (2 tools) ────────────────────────────────────────

    {
        name: 'get_satisfaction_ratings',
        description: 'Get CSAT (customer satisfaction) ratings. Returns score (good/bad), comment, linked ticket and agent. Filter by score or time range for analysis.',
        inputSchema: {
            type: 'object',
            properties: {
                score: {
                    type: 'string',
                    enum: ['good', 'bad', 'unoffered'],
                    description: 'Filter by CSAT score. good=positive, bad=negative, unoffered=survey not yet sent',
                },
                limit: {
                    type: 'number',
                    description: 'Number of ratings to return (default 10)',
                },
                start_time: {
                    type: 'string',
                    description: 'ISO date string to filter ratings after this date (e.g. "2024-01-01T00:00:00Z")',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_ticket_metrics',
        description: 'Get SLA and performance metrics for a specific ticket — reply times, resolution times, reopen count, reply count. Both calendar and business hours reported.',
        inputSchema: {
            type: 'object',
            properties: {
                ticket_id: {
                    type: 'number',
                    description: 'Zendesk numeric ticket ID (e.g. 12345)',
                },
            },
            required: ['ticket_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    authHeader: string,
    baseUrl: string,
    subdomain: string,
): Promise<unknown> {
    switch (name) {

        // ── Tickets ───────────────────────────────────────────────────────────

        case 'list_tickets': {
            const limit = (args.limit as number) ?? 20;
            const sortBy = (args.sort_by as string) ?? 'updated_at';

            let tickets: ZDTicket[];

            if (args.status) {
                // Use search endpoint for status filtering
                let query = `type:ticket status:${args.status as string}`;
                if (args.priority) query += ` priority:${args.priority as string}`;
                if (args.assignee_id) query += ` assignee:${args.assignee_id as number}`;
                const data = await zdApi(
                    `/search?query=${encodeURIComponent(query)}&sort_by=${sortBy}&sort_order=desc&per_page=${limit}`,
                    authHeader, baseUrl,
                ) as { results: ZDTicket[] };
                tickets = data.results ?? [];
            } else {
                const data = await zdApi(
                    `/tickets?per_page=${limit}&sort_by=${sortBy}&sort_order=desc`,
                    authHeader, baseUrl,
                ) as { tickets: ZDTicket[] };
                tickets = data.tickets ?? [];

                // Client-side filter for priority and assignee if status not used
                if (args.priority) {
                    tickets = tickets.filter(t => t.priority === args.priority);
                }
                if (args.assignee_id) {
                    tickets = tickets.filter(t => t.assignee_id === args.assignee_id);
                }
            }

            return tickets.map(t => ({
                id: t.id,
                subject: t.subject,
                status: t.status,
                priority: t.priority,
                requester_id: t.requester_id,
                assignee_id: t.assignee_id,
                created_at: t.created_at,
                updated_at: t.updated_at,
                tags: t.tags,
            }));
        }

        case 'search_tickets': {
            validateRequired(args, ['query']);
            const limit = (args.limit as number) ?? 10;
            const sortBy = (args.sort_by as string) ?? 'updated_at';
            const sortOrder = (args.sort_order as string) ?? 'desc';
            const query = `type:ticket ${args.query as string}`;
            const data = await zdApi(
                `/search?query=${encodeURIComponent(query)}&sort_by=${sortBy}&sort_order=${sortOrder}&per_page=${limit}`,
                authHeader, baseUrl,
            ) as { results: ZDTicket[]; count: number };
            return {
                total: data.count ?? 0,
                tickets: (data.results ?? []).map(t => ({
                    id: t.id,
                    subject: t.subject,
                    status: t.status,
                    priority: t.priority,
                    requester_id: t.requester_id,
                    created_at: t.created_at,
                    updated_at: t.updated_at,
                    tags: t.tags,
                })),
            };
        }

        case 'get_ticket': {
            validateRequired(args, ['ticket_id']);
            const data = await zdApi(`/tickets/${args.ticket_id as number}`, authHeader, baseUrl) as { ticket: ZDTicket };
            const t = data.ticket;
            return {
                id: t.id,
                subject: t.subject,
                description: t.description,
                status: t.status,
                priority: t.priority,
                type: t.type,
                tags: t.tags,
                requester_id: t.requester_id,
                assignee_id: t.assignee_id,
                group_id: t.group_id,
                organization_id: t.organization_id,
                channel: t.via?.channel,
                created_at: t.created_at,
                updated_at: t.updated_at,
                due_at: t.due_at,
            };
        }

        case 'create_ticket': {
            validateRequired(args, ['subject', 'body']);
            const ticket: Record<string, unknown> = {
                subject: args.subject,
                comment: { body: args.body },
                priority: (args.priority as string) ?? 'normal',
            };
            if (args.requester_email) {
                ticket.requester = { email: args.requester_email, name: args.requester_name };
            }
            const allTags = [...((args.tags as string[]) ?? [])];
            if (args.channel) allTags.push(args.channel as string);
            if (allTags.length) ticket.tags = allTags;
            if (args.assignee_id) ticket.assignee_id = args.assignee_id;
            if (args.group_id) ticket.group_id = args.group_id;

            const data = await zdApi('/tickets', authHeader, baseUrl, 'POST', { ticket }) as { ticket: ZDTicket };
            const created = data.ticket;

            // If internal_note provided, add it as internal comment
            if (args.internal_note) {
                await zdApi(
                    `/tickets/${created.id}`,
                    authHeader,
                    baseUrl,
                    'PUT',
                    { ticket: { comment: { body: args.internal_note as string, public: false } } },
                );
            }

            return {
                ticket_id: created.id,
                subject: created.subject,
                status: created.status,
                priority: created.priority,
                tags: created.tags,
                channel: created.via?.channel,
                url: `https://${subdomain}.zendesk.com/tickets/${created.id}`,
            };
        }

        case 'update_ticket': {
            validateRequired(args, ['ticket_id']);
            const ticketId = args.ticket_id as number;
            const update: Record<string, unknown> = {};

            if (args.status !== undefined) update.status = args.status;
            if (args.priority !== undefined) update.priority = args.priority;
            if (args.assignee_id !== undefined) update.assignee_id = args.assignee_id;
            if (args.group_id !== undefined) update.group_id = args.group_id;

            // Handle tags
            if (args.add_tags) {
                // Fetch current tags first, then merge
                const existing = await zdApi(`/tickets/${ticketId}`, authHeader, baseUrl) as { ticket: ZDTicket };
                const currentTags = existing.ticket.tags ?? [];
                const newTags = args.add_tags as string[];
                const merged = [...new Set([...currentTags, ...newTags])];
                update.tags = merged;
            } else if (args.tags !== undefined) {
                update.tags = args.tags;
            }

            if (args.comment !== undefined) {
                update.comment = {
                    body: args.comment,
                    public: (args.comment_public as boolean) ?? false,
                };
            }

            const data = await zdApi(
                `/tickets/${ticketId}`,
                authHeader,
                baseUrl,
                'PUT',
                { ticket: update },
            ) as { ticket: ZDTicket };
            const t = data.ticket;
            return {
                ticket_id: t.id,
                status: t.status,
                priority: t.priority,
                tags: t.tags,
                updated_at: t.updated_at,
            };
        }

        case 'delete_ticket': {
            validateRequired(args, ['ticket_id']);
            await zdApi(`/tickets/${args.ticket_id as number}`, authHeader, baseUrl, 'DELETE');
            return {
                success: true,
                deleted_ticket_id: args.ticket_id,
                note: 'Ticket moved to trash — recoverable within 30 days from Admin',
            };
        }

        case 'list_ticket_comments': {
            validateRequired(args, ['ticket_id']);
            const limit = (args.limit as number) ?? 20;
            const data = await zdApi(
                `/tickets/${args.ticket_id as number}/comments?per_page=${limit}`,
                authHeader,
                baseUrl,
            ) as { comments: ZDComment[] };
            return (data.comments ?? []).map(c => ({
                id: c.id,
                author_id: c.author_id,
                body: c.plain_body,
                public: c.public,
                created_at: c.created_at,
                type: c.type,
            }));
        }

        case 'add_comment': {
            validateRequired(args, ['ticket_id', 'body']);
            const isPublic = (args.public as boolean) ?? false;
            const commentBody: Record<string, unknown> = {
                body: args.body,
                public: isPublic,
            };
            if (args.author_id) commentBody.author_id = args.author_id;

            await zdApi(
                `/tickets/${args.ticket_id as number}`,
                authHeader,
                baseUrl,
                'PUT',
                { ticket: { comment: commentBody } },
            );
            return {
                ticket_id: args.ticket_id,
                comment_public: isPublic,
                added: true,
                note: isPublic
                    ? 'Visible to customer'
                    : 'Internal note — agents only',
            };
        }

        case 'merge_tickets': {
            validateRequired(args, ['ticket_id', 'source_ticket_id']);
            const mergeBody: Record<string, unknown> = {
                ids: [args.source_ticket_id as number],
            };
            if (args.target_comment) mergeBody.target_comment = args.target_comment;
            if (args.source_comment) mergeBody.source_comment = args.source_comment;

            await zdApi(
                `/tickets/${args.ticket_id as number}/merge`,
                authHeader,
                baseUrl,
                'POST',
                mergeBody,
            );
            return {
                success: true,
                merged_into: args.ticket_id,
                closed: args.source_ticket_id,
            };
        }

        // ── Users ─────────────────────────────────────────────────────────────

        case 'search_users': {
            validateRequired(args, ['query']);
            const limit = (args.limit as number) ?? 10;
            const data = await zdApi(
                `/users/search?query=${encodeURIComponent(args.query as string)}&per_page=${limit}`,
                authHeader,
                baseUrl,
            ) as { users: ZDUser[] };

            let users = data.users ?? [];
            if (args.role) {
                users = users.filter(u => u.role === args.role);
            }

            return users.map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                phone: u.phone,
                role: u.role,
                organization_id: u.organization_id,
                tags: u.tags,
                created_at: u.created_at,
                active: u.active,
            }));
        }

        case 'get_user': {
            validateRequired(args, ['user_id']);
            const data = await zdApi(`/users/${args.user_id as number}`, authHeader, baseUrl) as { user: ZDUser };
            const u = data.user;
            return {
                id: u.id,
                name: u.name,
                email: u.email,
                phone: u.phone,
                role: u.role,
                organization_id: u.organization_id,
                tags: u.tags,
                notes: u.notes,
                time_zone: u.time_zone,
                created_at: u.created_at,
                active: u.active,
            };
        }

        case 'get_user_tickets': {
            validateRequired(args, ['user_id']);
            const limit = (args.limit as number) ?? 10;
            const data = await zdApi(
                `/users/${args.user_id as number}/tickets/requested?per_page=${limit}&sort_by=updated_at&sort_order=desc`,
                authHeader,
                baseUrl,
            ) as { tickets: ZDTicket[] };
            return (data.tickets ?? []).map(t => ({
                id: t.id,
                subject: t.subject,
                status: t.status,
                priority: t.priority,
                created_at: t.created_at,
                updated_at: t.updated_at,
            }));
        }

        case 'create_user': {
            validateRequired(args, ['name']);
            const userBody: Record<string, unknown> = {
                name: args.name,
                role: (args.role as string) ?? 'end-user',
            };
            if (args.email) userBody.email = args.email;
            if (args.phone) userBody.phone = args.phone;
            if (args.organization_id) userBody.organization_id = args.organization_id;
            if (args.tags) userBody.tags = args.tags;
            if (args.notes) userBody.notes = args.notes;

            const data = await zdApi('/users', authHeader, baseUrl, 'POST', { user: userBody }) as { user: ZDUser };
            const u = data.user;
            return {
                user_id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                created_at: u.created_at,
            };
        }

        case 'update_user': {
            validateRequired(args, ['user_id']);
            const userId = args.user_id as number;
            const userUpdate: Record<string, unknown> = {};
            const updatedFields: string[] = [];

            if (args.name !== undefined) { userUpdate.name = args.name; updatedFields.push('name'); }
            if (args.email !== undefined) { userUpdate.email = args.email; updatedFields.push('email'); }
            if (args.phone !== undefined) { userUpdate.phone = args.phone; updatedFields.push('phone'); }
            if (args.organization_id !== undefined) { userUpdate.organization_id = args.organization_id; updatedFields.push('organization_id'); }
            if (args.tags !== undefined) { userUpdate.tags = args.tags; updatedFields.push('tags'); }
            if (args.notes !== undefined) { userUpdate.notes = args.notes; updatedFields.push('notes'); }

            const data = await zdApi(
                `/users/${userId}`,
                authHeader,
                baseUrl,
                'PUT',
                { user: userUpdate },
            ) as { user: ZDUser };
            return {
                user_id: userId,
                updated_fields: updatedFields,
                updated_at: data.user.updated_at,
            };
        }

        case 'get_user_identities': {
            validateRequired(args, ['user_id']);
            const data = await zdApi(
                `/users/${args.user_id as number}/identities`,
                authHeader,
                baseUrl,
            ) as { identities: Array<{ id: number; type: string; value: string; verified: boolean; primary: boolean }> };
            return (data.identities ?? []).map(i => ({
                id: i.id,
                type: i.type,
                value: i.value,
                verified: i.verified,
                primary: i.primary,
            }));
        }

        // ── Organizations ─────────────────────────────────────────────────────

        case 'search_organizations': {
            validateRequired(args, ['query']);
            const limit = (args.limit as number) ?? 10;
            const data = await zdApi(
                `/organizations/search?query=${encodeURIComponent(args.query as string)}&per_page=${limit}`,
                authHeader,
                baseUrl,
            ) as { organizations: ZDOrganization[] };
            return (data.organizations ?? []).map(o => ({
                id: o.id,
                name: o.name,
                domain_names: o.domain_names,
                tags: o.tags,
                created_at: o.created_at,
            }));
        }

        case 'get_organization': {
            validateRequired(args, ['organization_id']);
            const data = await zdApi(
                `/organizations/${args.organization_id as number}`,
                authHeader,
                baseUrl,
            ) as { organization: ZDOrganization };
            const o = data.organization;
            return {
                id: o.id,
                name: o.name,
                domain_names: o.domain_names,
                tags: o.tags,
                notes: o.notes,
                group_id: o.group_id,
                created_at: o.created_at,
                updated_at: o.updated_at,
            };
        }

        case 'create_organization': {
            validateRequired(args, ['name']);
            const orgBody: Record<string, unknown> = { name: args.name };
            if (args.domain_names) orgBody.domain_names = args.domain_names;
            if (args.tags) orgBody.tags = args.tags;
            if (args.notes) orgBody.notes = args.notes;
            if (args.group_id) orgBody.group_id = args.group_id;

            const data = await zdApi(
                '/organizations',
                authHeader,
                baseUrl,
                'POST',
                { organization: orgBody },
            ) as { organization: ZDOrganization };
            const o = data.organization;
            return {
                organization_id: o.id,
                name: o.name,
                domain_names: o.domain_names,
                created_at: o.created_at,
            };
        }

        case 'update_organization': {
            validateRequired(args, ['organization_id']);
            const orgId = args.organization_id as number;
            const orgUpdate: Record<string, unknown> = {};
            const updatedFields: string[] = [];

            if (args.name !== undefined) { orgUpdate.name = args.name; updatedFields.push('name'); }
            if (args.domain_names !== undefined) { orgUpdate.domain_names = args.domain_names; updatedFields.push('domain_names'); }
            if (args.tags !== undefined) { orgUpdate.tags = args.tags; updatedFields.push('tags'); }
            if (args.notes !== undefined) { orgUpdate.notes = args.notes; updatedFields.push('notes'); }
            if (args.group_id !== undefined) { orgUpdate.group_id = args.group_id; updatedFields.push('group_id'); }

            const data = await zdApi(
                `/organizations/${orgId}`,
                authHeader,
                baseUrl,
                'PUT',
                { organization: orgUpdate },
            ) as { organization: ZDOrganization };
            return {
                organization_id: orgId,
                updated_fields: updatedFields,
                updated_at: data.organization.updated_at,
            };
        }

        // ── Knowledge Base ────────────────────────────────────────────────────

        case 'search_articles': {
            validateRequired(args, ['query']);
            const locale = (args.locale as string) ?? 'en-us';
            const limit = (args.limit as number) ?? 5;
            const data = await zdApi(
                `/help_center/articles/search?query=${encodeURIComponent(args.query as string)}&locale=${locale}&per_page=${limit}`,
                authHeader,
                baseUrl,
            ) as { results: ZDArticle[] };
            return (data.results ?? []).map(a => ({
                id: a.id,
                title: a.title,
                snippet: a.snippet,
                html_url: a.html_url,
                vote_sum: a.vote_sum,
                label_names: a.label_names,
                updated_at: a.updated_at,
            }));
        }

        case 'list_articles': {
            const locale = (args.locale as string) ?? 'en-us';
            const limit = (args.limit as number) ?? 10;
            let path = `/help_center/articles?locale=${locale}&per_page=${limit}&sort_by=updated_at&sort_order=desc`;
            if (args.label_names) {
                path += `&label_names=${encodeURIComponent(args.label_names as string)}`;
            }
            const data = await zdApi(path, authHeader, baseUrl) as { articles: ZDArticle[] };
            return (data.articles ?? []).map(a => ({
                id: a.id,
                title: a.title,
                html_url: a.html_url,
                vote_sum: a.vote_sum,
                label_names: a.label_names,
                created_at: a.created_at,
                updated_at: a.updated_at,
            }));
        }

        case 'get_article': {
            validateRequired(args, ['article_id']);
            const data = await zdApi(
                `/help_center/articles/${args.article_id as number}`,
                authHeader,
                baseUrl,
            ) as { article: ZDArticle };
            const a = data.article;
            const plainBody = (a.body ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            return {
                id: a.id,
                title: a.title,
                body: plainBody,
                html_url: a.html_url,
                vote_sum: a.vote_sum,
                label_names: a.label_names,
                created_at: a.created_at,
                updated_at: a.updated_at,
            };
        }

        case 'create_article': {
            validateRequired(args, ['section_id', 'title', 'body']);
            const articleBody: Record<string, unknown> = {
                title: args.title,
                body: args.body,
                locale: (args.locale as string) ?? 'en-us',
            };
            if (args.labels) articleBody.label_names = args.labels;

            const data = await zdApi(
                `/help_center/sections/${args.section_id as number}/articles`,
                authHeader,
                baseUrl,
                'POST',
                { article: articleBody },
            ) as { article: ZDArticle };
            const a = data.article;
            return {
                article_id: a.id,
                title: a.title,
                html_url: a.html_url,
                status: 'published',
            };
        }

        // ── Views & Macros ────────────────────────────────────────────────────

        case 'list_views': {
            const limit = (args.limit as number) ?? 20;
            const data = await zdApi(
                `/views/active?per_page=${limit}`,
                authHeader,
                baseUrl,
            ) as { views: Array<{ id: number; title: string; active: boolean; position: number }> };
            return (data.views ?? []).map(v => ({
                id: v.id,
                title: v.title,
                active: v.active,
                position: v.position,
            }));
        }

        case 'get_view_tickets': {
            validateRequired(args, ['view_id']);
            const limit = (args.limit as number) ?? 20;
            const data = await zdApi(
                `/views/${args.view_id as number}/tickets?per_page=${limit}`,
                authHeader,
                baseUrl,
            ) as { tickets: ZDTicket[] };
            return (data.tickets ?? []).map(t => ({
                id: t.id,
                subject: t.subject,
                status: t.status,
                priority: t.priority,
                requester_id: t.requester_id,
                assignee_id: t.assignee_id,
                updated_at: t.updated_at,
            }));
        }

        case 'list_macros': {
            const limit = (args.limit as number) ?? 20;
            let path: string;
            if (args.query) {
                path = `/macros/search?query=${encodeURIComponent(args.query as string)}&per_page=${limit}`;
            } else {
                path = `/macros/active?per_page=${limit}`;
            }
            const data = await zdApi(path, authHeader, baseUrl) as {
                macros: Array<{
                    id: number; title: string; active: boolean;
                    actions: Array<{ field: string; value: unknown }>
                }>
            };
            return (data.macros ?? []).map(m => ({
                id: m.id,
                title: m.title,
                active: m.active,
                actions: m.actions,
            }));
        }

        // ── Analytics ─────────────────────────────────────────────────────────

        case 'get_satisfaction_ratings': {
            const limit = (args.limit as number) ?? 10;
            let path = `/satisfaction_ratings?per_page=${limit}`;
            if (args.score) path += `&score=${args.score as string}`;
            if (args.start_time) {
                const ts = Math.floor(new Date(args.start_time as string).getTime() / 1000);
                path += `&start_time=${ts}`;
            }
            const data = await zdApi(path, authHeader, baseUrl) as {
                satisfaction_ratings: Array<{
                    id: number; score: string; comment: string;
                    ticket_id: number; requester_id: number; assignee_id: number;
                    created_at: string;
                }>
            };
            return (data.satisfaction_ratings ?? []).map(r => ({
                id: r.id,
                score: r.score,
                comment: r.comment,
                ticket_id: r.ticket_id,
                requester_id: r.requester_id,
                assignee_id: r.assignee_id,
                created_at: r.created_at,
            }));
        }

        case 'get_ticket_metrics': {
            validateRequired(args, ['ticket_id']);
            const data = await zdApi(
                `/tickets/${args.ticket_id as number}/metrics`,
                authHeader,
                baseUrl,
            ) as {
                ticket_metric: {
                    reply_time_in_minutes: { calendar: number; business: number };
                    first_resolution_time_in_minutes: { calendar: number; business: number };
                    full_resolution_time_in_minutes: { calendar: number; business: number };
                    reopens: number;
                    replies: number;
                    solved_at: string | null;
                    created_at: string;
                }
            };
            const m = data.ticket_metric;
            return {
                ticket_id: args.ticket_id,
                reply_time_in_minutes: m.reply_time_in_minutes,
                first_resolution_time_in_minutes: m.first_resolution_time_in_minutes,
                full_resolution_time_in_minutes: m.full_resolution_time_in_minutes,
                reopens: m.reopens,
                replies: m.replies,
                solved_at: m.solved_at,
                created_at: m.created_at,
            };
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
                JSON.stringify({ status: 'ok', server: 'mcp-zendesk', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-zendesk', version: '1.0.0' },
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
        const subdomain = request.headers.get('X-Mcp-Secret-ZENDESK-SUBDOMAIN');
        const email = request.headers.get('X-Mcp-Secret-ZENDESK-EMAIL');
        const apiToken = request.headers.get('X-Mcp-Secret-ZENDESK-API-TOKEN');

        if (!subdomain || !email || !apiToken) {
            return rpcErr(
                id,
                -32001,
                'Missing required secrets — add ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, and ZENDESK_API_TOKEN to workspace secrets',
            );
        }

        const baseUrl = `https://${subdomain}.zendesk.com/api/v2`;
        const authHeader = `Basic ${btoa(`${email}/token:${apiToken}`)}`;

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        try {
            const result = await callTool(toolName, args, authHeader, baseUrl, subdomain);
            return rpcOk(id, toolOk(result));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.startsWith('Missing required parameter:')) {
                return rpcErr(id, -32603, msg);
            }
            return rpcErr(id, -32603, msg);
        }
    },
};
