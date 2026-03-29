/**
 * Close CRM MCP Worker
 * Implements MCP protocol over HTTP for Close CRM operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   CLOSE_API_KEY  → X-Mcp-Secret-CLOSE-API-KEY  (Close CRM API key)
 *
 * Auth format: HTTP Basic — Authorization: Basic base64(apiKey:)
 * Note: API key is the username; password is always empty (note the colon).
 *
 * Covers: Leads (5), Contacts (5), Opportunities (5),
 *         Activities (4), Users & Config (3), Ping (1) = 23 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const CLOSE_BASE_URL = 'https://api.close.com/api/v1';

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
        apiKey: request.headers.get('X-Mcp-Secret-CLOSE-API-KEY'),
    };
}

function makeBasicAuth(apiKey: string): string {
    // Close API: API key as username, empty password — must include trailing colon
    return `Basic ${btoa(`${apiKey}:`)}`;
}

async function closeFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${CLOSE_BASE_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': makeBasicAuth(apiKey),
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
        throw { code: -32603, message: `Close API HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object') {
            const d = data as { error?: string; 'error-json'?: { message?: string }; field_errors?: Record<string, string[]> };
            if (d['error-json']?.message) {
                msg = d['error-json'].message;
            } else if (d.error) {
                msg = d.error;
            } else if (d.field_errors) {
                const firstField = Object.keys(d.field_errors)[0];
                if (firstField) msg = `${firstField}: ${d.field_errors[firstField][0]}`;
            }
        }
        throw { code: -32603, message: `Close API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Ping ──────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify Close API credentials by fetching the current user info.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 1 — Leads (5 tools) ─────────────────────────────────────────────

    {
        name: 'list_leads',
        description: 'List leads with optional search and filters. Returns id, display_name, status_label, contacts, and custom fields.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query string (e.g. company name, email, phone)',
                },
                _limit: {
                    type: 'number',
                    description: 'Max number of results (default 25, max 200)',
                },
                _skip: {
                    type: 'number',
                    description: 'Number of results to skip for pagination',
                },
                status_id: {
                    type: 'string',
                    description: 'Filter by lead status ID',
                },
                user_id: {
                    type: 'string',
                    description: 'Filter by assigned user ID',
                },
                fields: {
                    type: 'string',
                    description: 'Comma-separated list of fields to return (e.g. id,display_name,status_label)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_lead',
        description: 'Get full details of a lead by ID, including contacts, opportunities, and recent activities.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Close lead ID (e.g. lead_abc123)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_lead',
        description: 'Create a new lead in Close CRM. Name is required.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Lead/company name (required)',
                },
                status_id: {
                    type: 'string',
                    description: 'Lead status ID (use get_lead_statuses to find valid IDs)',
                },
                description: {
                    type: 'string',
                    description: 'Lead description or notes',
                },
                contacts: {
                    type: 'array',
                    description: 'Initial contacts to add to the lead',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Contact name' },
                            title: { type: 'string', description: 'Job title' },
                            emails: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        email: { type: 'string' },
                                        type: { type: 'string', enum: ['office', 'home', 'other'] },
                                    },
                                },
                            },
                            phones: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        phone: { type: 'string' },
                                        type: { type: 'string', enum: ['office', 'home', 'mobile', 'other'] },
                                    },
                                },
                            },
                        },
                    },
                },
                addresses: {
                    type: 'array',
                    description: 'Company addresses',
                    items: {
                        type: 'object',
                        properties: {
                            label: { type: 'string', description: 'Address label (e.g. business, mailing)' },
                            address_1: { type: 'string' },
                            city: { type: 'string' },
                            state: { type: 'string' },
                            zipcode: { type: 'string' },
                            country: { type: 'string' },
                        },
                    },
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_lead',
        description: 'Update a lead. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Close lead ID (required)',
                },
                name: { type: 'string', description: 'Updated company/lead name' },
                status_id: { type: 'string', description: 'Updated lead status ID' },
                description: { type: 'string', description: 'Updated description' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_lead',
        description: 'Permanently delete a lead and all its associated data.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Close lead ID to delete',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 2 — Contacts (5 tools) ──────────────────────────────────────────

    {
        name: 'list_contacts',
        description: 'List contacts, optionally filtered by lead.',
        inputSchema: {
            type: 'object',
            properties: {
                lead_id: {
                    type: 'string',
                    description: 'Filter contacts belonging to this lead ID',
                },
                _limit: {
                    type: 'number',
                    description: 'Max number of results (default 25)',
                },
                _skip: {
                    type: 'number',
                    description: 'Number of results to skip for pagination',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_contact',
        description: 'Get full details of a contact by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Close contact ID (e.g. cont_abc123)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_contact',
        description: 'Create a new contact attached to a lead.',
        inputSchema: {
            type: 'object',
            properties: {
                lead_id: {
                    type: 'string',
                    description: 'Lead ID to attach this contact to (required)',
                },
                name: {
                    type: 'string',
                    description: 'Contact full name',
                },
                title: {
                    type: 'string',
                    description: 'Job title',
                },
                emails: {
                    type: 'array',
                    description: 'Email addresses',
                    items: {
                        type: 'object',
                        properties: {
                            email: { type: 'string' },
                            type: { type: 'string', enum: ['office', 'home', 'other'] },
                        },
                        required: ['email'],
                    },
                },
                phones: {
                    type: 'array',
                    description: 'Phone numbers',
                    items: {
                        type: 'object',
                        properties: {
                            phone: { type: 'string' },
                            type: { type: 'string', enum: ['office', 'home', 'mobile', 'other'] },
                        },
                        required: ['phone'],
                    },
                },
            },
            required: ['lead_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_contact',
        description: 'Update a contact. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Close contact ID (required)',
                },
                name: { type: 'string' },
                title: { type: 'string' },
                emails: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            email: { type: 'string' },
                            type: { type: 'string' },
                        },
                    },
                },
                phones: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            phone: { type: 'string' },
                            type: { type: 'string' },
                        },
                    },
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_contact',
        description: 'Permanently delete a contact.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Close contact ID to delete',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 3 — Opportunities (5 tools) ─────────────────────────────────────

    {
        name: 'list_opportunities',
        description: 'List opportunities with optional filters by status type, lead, user, and date range.',
        inputSchema: {
            type: 'object',
            properties: {
                _limit: {
                    type: 'number',
                    description: 'Max number of results (default 25)',
                },
                _skip: {
                    type: 'number',
                    description: 'Number of results to skip',
                },
                status_type: {
                    type: 'string',
                    description: 'Filter by status type',
                    enum: ['active', 'won', 'lost'],
                },
                lead_id: {
                    type: 'string',
                    description: 'Filter by lead ID',
                },
                user_id: {
                    type: 'string',
                    description: 'Filter by assigned user ID',
                },
                date_won_start: {
                    type: 'string',
                    description: 'Filter won opportunities from date (YYYY-MM-DD)',
                },
                date_won_end: {
                    type: 'string',
                    description: 'Filter won opportunities up to date (YYYY-MM-DD)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_opportunity',
        description: 'Get full details of an opportunity by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Close opportunity ID (e.g. oppo_abc123)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_opportunity',
        description: 'Create a new opportunity on a lead. lead_id and status_id are required.',
        inputSchema: {
            type: 'object',
            properties: {
                lead_id: {
                    type: 'string',
                    description: 'Lead ID to attach this opportunity to (required)',
                },
                status_id: {
                    type: 'string',
                    description: 'Opportunity status ID (required — use list_pipelines to find valid IDs)',
                },
                value: {
                    type: 'number',
                    description: 'Opportunity value (in cents for USD, e.g. 10000 = $100)',
                },
                value_currency: {
                    type: 'string',
                    description: 'Currency code (e.g. USD, EUR)',
                },
                value_period: {
                    type: 'string',
                    description: 'Value period',
                    enum: ['one_time', 'monthly', 'annual'],
                },
                confidence: {
                    type: 'number',
                    description: 'Win probability 0-100',
                },
                note: {
                    type: 'string',
                    description: 'Opportunity note',
                },
                expected_date: {
                    type: 'string',
                    description: 'Expected close date (YYYY-MM-DD)',
                },
            },
            required: ['lead_id', 'status_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_opportunity',
        description: 'Update an opportunity. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Close opportunity ID (required)',
                },
                status_id: {
                    type: 'string',
                    description: 'Updated status ID',
                },
                value: {
                    type: 'number',
                    description: 'Updated value (in cents)',
                },
                note: {
                    type: 'string',
                    description: 'Updated note',
                },
                expected_date: {
                    type: 'string',
                    description: 'Updated expected close date (YYYY-MM-DD)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'search_opportunities',
        description: 'Search opportunities using a Close query string.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query string',
                },
                _limit: {
                    type: 'number',
                    description: 'Max number of results (default 25)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Activities (4 tools) ────────────────────────────────────────

    {
        name: 'list_activities',
        description: 'List activities (notes, tasks, emails, calls) with optional filters.',
        inputSchema: {
            type: 'object',
            properties: {
                lead_id: {
                    type: 'string',
                    description: 'Filter by lead ID',
                },
                user_id: {
                    type: 'string',
                    description: 'Filter by user ID',
                },
                _type: {
                    type: 'string',
                    description: 'Activity type filter',
                    enum: ['Note', 'Task', 'Email', 'Call', 'EmailThread', 'Meeting', 'SMS'],
                },
                date_created_start: {
                    type: 'string',
                    description: 'Filter activities created from date (ISO 8601)',
                },
                _limit: {
                    type: 'number',
                    description: 'Max number of results (default 25)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_note',
        description: 'Create a note activity on a lead.',
        inputSchema: {
            type: 'object',
            properties: {
                lead_id: {
                    type: 'string',
                    description: 'Lead ID to attach the note to (required)',
                },
                note: {
                    type: 'string',
                    description: 'Note content (required)',
                },
            },
            required: ['lead_id', 'note'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_task',
        description: 'Create a task (to-do) attached to a lead.',
        inputSchema: {
            type: 'object',
            properties: {
                lead_id: {
                    type: 'string',
                    description: 'Lead ID to attach the task to (required)',
                },
                text: {
                    type: 'string',
                    description: 'Task description (required)',
                },
                due_date: {
                    type: 'string',
                    description: 'Task due date (YYYY-MM-DD)',
                },
                is_complete: {
                    type: 'boolean',
                    description: 'Whether the task is already completed (default false)',
                },
                assigned_to: {
                    type: 'string',
                    description: 'User ID to assign this task to',
                },
            },
            required: ['lead_id', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_tasks',
        description: 'List tasks with optional filters.',
        inputSchema: {
            type: 'object',
            properties: {
                assigned_to: {
                    type: 'string',
                    description: 'Filter by assigned user ID',
                },
                is_complete: {
                    type: 'boolean',
                    description: 'Filter by completion status',
                },
                lead_id: {
                    type: 'string',
                    description: 'Filter by lead ID',
                },
                due_date_start: {
                    type: 'string',
                    description: 'Filter tasks due from this date (YYYY-MM-DD)',
                },
                due_date_end: {
                    type: 'string',
                    description: 'Filter tasks due up to this date (YYYY-MM-DD)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 5 — Users & Config (3 tools) ────────────────────────────────────

    {
        name: 'list_users',
        description: 'List all users in the Close organisation.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_pipelines',
        description: 'List all pipelines with their stages and status IDs. Use this to find valid status_id values for opportunities.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_lead_statuses',
        description: 'Get all lead statuses for the organisation. Use this to find valid status_id values for leads.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        // ── Ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            return closeFetch('/me/', apiKey);
        }

        // ── Leads ───────────────────────────────────────────────────────────────

        case 'list_leads': {
            const params = new URLSearchParams();
            if (args.query) params.set('query', args.query as string);
            if (args._limit) params.set('_limit', String(args._limit));
            if (args._skip) params.set('_skip', String(args._skip));
            if (args.status_id) params.set('status_id', args.status_id as string);
            if (args.user_id) params.set('user_id', args.user_id as string);
            if (args.fields) params.set('_fields', args.fields as string);
            const qs = params.toString();
            return closeFetch(`/lead/${qs ? `?${qs}` : ''}`, apiKey);
        }

        case 'get_lead': {
            validateRequired(args, ['id']);
            return closeFetch(`/lead/${args.id}/`, apiKey);
        }

        case 'create_lead': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.status_id !== undefined) body.status_id = args.status_id;
            if (args.description !== undefined) body.description = args.description;
            if (args.contacts !== undefined) body.contacts = args.contacts;
            if (args.addresses !== undefined) body.addresses = args.addresses;
            return closeFetch('/lead/', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_lead': {
            validateRequired(args, ['id']);
            const { id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['name', 'status_id', 'description']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return closeFetch(`/lead/${id}/`, apiKey, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'delete_lead': {
            validateRequired(args, ['id']);
            return closeFetch(`/lead/${args.id}/`, apiKey, { method: 'DELETE' });
        }

        // ── Contacts ────────────────────────────────────────────────────────────

        case 'list_contacts': {
            const params = new URLSearchParams();
            if (args.lead_id) params.set('lead_id', args.lead_id as string);
            if (args._limit) params.set('_limit', String(args._limit));
            if (args._skip) params.set('_skip', String(args._skip));
            const qs = params.toString();
            return closeFetch(`/contact/${qs ? `?${qs}` : ''}`, apiKey);
        }

        case 'get_contact': {
            validateRequired(args, ['id']);
            return closeFetch(`/contact/${args.id}/`, apiKey);
        }

        case 'create_contact': {
            validateRequired(args, ['lead_id']);
            const body: Record<string, unknown> = { lead_id: args.lead_id };
            if (args.name !== undefined) body.name = args.name;
            if (args.title !== undefined) body.title = args.title;
            if (args.emails !== undefined) body.emails = args.emails;
            if (args.phones !== undefined) body.phones = args.phones;
            return closeFetch('/contact/', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_contact': {
            validateRequired(args, ['id']);
            const { id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['name', 'title', 'emails', 'phones']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return closeFetch(`/contact/${id}/`, apiKey, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'delete_contact': {
            validateRequired(args, ['id']);
            return closeFetch(`/contact/${args.id}/`, apiKey, { method: 'DELETE' });
        }

        // ── Opportunities ───────────────────────────────────────────────────────

        case 'list_opportunities': {
            const params = new URLSearchParams();
            if (args._limit) params.set('_limit', String(args._limit));
            if (args._skip) params.set('_skip', String(args._skip));
            if (args.status_type) params.set('status_type', args.status_type as string);
            if (args.lead_id) params.set('lead_id', args.lead_id as string);
            if (args.user_id) params.set('user_id', args.user_id as string);
            if (args.date_won_start) params.set('date_won__gte', args.date_won_start as string);
            if (args.date_won_end) params.set('date_won__lte', args.date_won_end as string);
            const qs = params.toString();
            return closeFetch(`/opportunity/${qs ? `?${qs}` : ''}`, apiKey);
        }

        case 'get_opportunity': {
            validateRequired(args, ['id']);
            return closeFetch(`/opportunity/${args.id}/`, apiKey);
        }

        case 'create_opportunity': {
            validateRequired(args, ['lead_id', 'status_id']);
            const body: Record<string, unknown> = {
                lead_id: args.lead_id,
                status_id: args.status_id,
            };
            for (const key of ['value', 'value_currency', 'value_period', 'confidence', 'note', 'expected_date']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return closeFetch('/opportunity/', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_opportunity': {
            validateRequired(args, ['id']);
            const { id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['status_id', 'value', 'note', 'expected_date']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return closeFetch(`/opportunity/${id}/`, apiKey, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'search_opportunities': {
            const params = new URLSearchParams();
            if (args.query) params.set('query', args.query as string);
            if (args._limit) params.set('_limit', String(args._limit));
            const qs = params.toString();
            return closeFetch(`/opportunity/${qs ? `?${qs}` : ''}`, apiKey);
        }

        // ── Activities ──────────────────────────────────────────────────────────

        case 'list_activities': {
            const params = new URLSearchParams();
            if (args.lead_id) params.set('lead_id', args.lead_id as string);
            if (args.user_id) params.set('user_id', args.user_id as string);
            if (args._type) params.set('_type', args._type as string);
            if (args.date_created_start) params.set('date_created__gte', args.date_created_start as string);
            if (args._limit) params.set('_limit', String(args._limit));
            const qs = params.toString();
            return closeFetch(`/activity/${qs ? `?${qs}` : ''}`, apiKey);
        }

        case 'create_note': {
            validateRequired(args, ['lead_id', 'note']);
            return closeFetch('/activity/note/', apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    lead_id: args.lead_id,
                    note: args.note,
                }),
            });
        }

        case 'create_task': {
            validateRequired(args, ['lead_id', 'text']);
            const body: Record<string, unknown> = {
                lead_id: args.lead_id,
                text: args.text,
                is_complete: args.is_complete ?? false,
            };
            if (args.due_date !== undefined) body.due_date = args.due_date;
            if (args.assigned_to !== undefined) body.assigned_to = args.assigned_to;
            return closeFetch('/task/', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_tasks': {
            const params = new URLSearchParams();
            if (args.assigned_to) params.set('assigned_to', args.assigned_to as string);
            if (args.is_complete !== undefined) params.set('is_complete', String(args.is_complete));
            if (args.lead_id) params.set('lead_id', args.lead_id as string);
            if (args.due_date_start) params.set('due_date__gte', args.due_date_start as string);
            if (args.due_date_end) params.set('due_date__lte', args.due_date_end as string);
            const qs = params.toString();
            return closeFetch(`/task/${qs ? `?${qs}` : ''}`, apiKey);
        }

        // ── Users & Config ──────────────────────────────────────────────────────

        case 'list_users': {
            return closeFetch('/user/', apiKey);
        }

        case 'list_pipelines': {
            return closeFetch('/pipeline/', apiKey);
        }

        case 'get_lead_statuses': {
            return closeFetch('/status/lead/', apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-close', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-close', version: '1.0.0' },
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
                return rpcErr(id, -32001, 'Missing required secrets: CLOSE_API_KEY (header: X-Mcp-Secret-CLOSE-API-KEY)');
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
