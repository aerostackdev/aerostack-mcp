/**
 * Apollo.io MCP Worker
 * Implements MCP protocol over HTTP for Apollo.io sales intelligence operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   APOLLO_API_KEY  → X-Mcp-Secret-APOLLO-API-KEY  (API key from Apollo.io settings)
 *
 * Auth format: X-Api-Key: {api_key} header on every request
 *
 * Covers: People Search & Enrichment (6), Accounts/Organizations (5),
 *         Sequences (4), Contacts Management (4), Usage & Labels (2) = 21 tools total + _ping
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

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
        apiKey: request.headers.get('X-Mcp-Secret-APOLLO-API-KEY'),
    };
}

async function apolloFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${APOLLO_BASE_URL}${path}`;
    const isPost = options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH' || options.method === 'DELETE';

    const headers: Record<string, string> = {
        'X-Api-Key': apiKey,
        ...(options.headers as Record<string, string> || {}),
    };

    if (isPost) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
        ...options,
        headers,
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Apollo HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object') {
            const d = data as { message?: string; error?: string; errors?: string[] };
            if (d.message) msg = d.message;
            else if (d.error) msg = d.error;
            else if (Array.isArray(d.errors) && d.errors.length > 0) msg = d.errors[0];
        }
        throw { code: -32603, message: `Apollo API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — People Search & Enrichment (6 tools) ───────────────────────

    {
        name: 'search_people',
        description: 'Search for people by keywords, job title, location, or company domain. Returns name, title, email, organization, and LinkedIn URL.',
        inputSchema: {
            type: 'object',
            properties: {
                q_keywords: {
                    type: 'string',
                    description: 'Keyword search query (e.g. "VP of Engineering")',
                },
                person_titles: {
                    type: 'array',
                    description: 'Filter by job titles (e.g. ["CTO", "VP Engineering"])',
                    items: { type: 'string' },
                },
                person_locations: {
                    type: 'array',
                    description: 'Filter by person location (e.g. ["San Francisco, CA", "New York, NY"])',
                    items: { type: 'string' },
                },
                q_organization_domains: {
                    type: 'array',
                    description: 'Filter by company domain (e.g. ["acme.com", "example.com"])',
                    items: { type: 'string' },
                },
                page: {
                    type: 'number',
                    description: 'Page number for pagination (default 1)',
                },
                per_page: {
                    type: 'number',
                    description: 'Results per page (max 100, default 25)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_person',
        description: 'Get a person/contact by ID. Returns name, title, email, phone, organization, LinkedIn URL, and employment history.',
        inputSchema: {
            type: 'object',
            properties: {
                person_id: {
                    type: 'string',
                    description: 'Apollo person/contact ID',
                },
            },
            required: ['person_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'enrich_person',
        description: 'Enrich a person by email address. Returns full profile with phone numbers, social links, employment history, and company data.',
        inputSchema: {
            type: 'object',
            properties: {
                email: {
                    type: 'string',
                    description: 'Email address to enrich (required)',
                },
            },
            required: ['email'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_people',
        description: 'List people/contacts in the Apollo account with pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                page: {
                    type: 'number',
                    description: 'Page number (default 1)',
                },
                per_page: {
                    type: 'number',
                    description: 'Results per page (max 100, default 25)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_person',
        description: 'Create a new contact/person in Apollo. Returns the created person record.',
        inputSchema: {
            type: 'object',
            properties: {
                first_name: {
                    type: 'string',
                    description: 'First name',
                },
                last_name: {
                    type: 'string',
                    description: 'Last name (required)',
                },
                email: {
                    type: 'string',
                    description: 'Email address',
                },
                title: {
                    type: 'string',
                    description: 'Job title (e.g. "Director of Engineering")',
                },
                organization_name: {
                    type: 'string',
                    description: 'Company/organization name',
                },
                phone: {
                    type: 'string',
                    description: 'Phone number',
                },
            },
            required: ['last_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_person',
        description: 'Update an existing person/contact in Apollo. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                person_id: {
                    type: 'string',
                    description: 'Apollo person/contact ID',
                },
                first_name: { type: 'string', description: 'Updated first name' },
                last_name: { type: 'string', description: 'Updated last name' },
                email: { type: 'string', description: 'Updated email address' },
                title: { type: 'string', description: 'Updated job title' },
                organization_name: { type: 'string', description: 'Updated company name' },
                phone: { type: 'string', description: 'Updated phone number' },
            },
            required: ['person_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 2 — Accounts/Organizations (5 tools) ────────────────────────────

    {
        name: 'search_accounts',
        description: 'Search accounts/companies by name, industry tags, or keyword tags. Returns name, domain, industry, employee count, and website.',
        inputSchema: {
            type: 'object',
            properties: {
                q_organization_name: {
                    type: 'string',
                    description: 'Organization name search query',
                },
                organization_industry_tag_ids: {
                    type: 'array',
                    description: 'Filter by Apollo industry tag IDs',
                    items: { type: 'string' },
                },
                q_organization_keyword_tags: {
                    type: 'array',
                    description: 'Filter by keyword tags (e.g. ["saas", "fintech", "healthcare"])',
                    items: { type: 'string' },
                },
                page: {
                    type: 'number',
                    description: 'Page number (default 1)',
                },
                per_page: {
                    type: 'number',
                    description: 'Results per page (max 100, default 25)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_account',
        description: 'Get an account/company by ID. Returns name, domain, industry, employee count, phone, and website.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'string',
                    description: 'Apollo account ID',
                },
            },
            required: ['account_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_account',
        description: 'Create a new account/company in Apollo. Name is required.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Account/company name (required)',
                },
                domain: {
                    type: 'string',
                    description: 'Company website domain (e.g. acme.com)',
                },
                phone: {
                    type: 'string',
                    description: 'Company phone number',
                },
                industry: {
                    type: 'string',
                    description: 'Industry classification (e.g. Software, Finance, Healthcare)',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_account',
        description: 'Update an existing account/company in Apollo. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'string',
                    description: 'Apollo account ID',
                },
                name: { type: 'string', description: 'Updated account name' },
                domain: { type: 'string', description: 'Updated domain' },
                phone: { type: 'string', description: 'Updated phone number' },
                industry: { type: 'string', description: 'Updated industry' },
            },
            required: ['account_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_accounts',
        description: 'List accounts/companies in the Apollo workspace with pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                page: {
                    type: 'number',
                    description: 'Page number (default 1)',
                },
                per_page: {
                    type: 'number',
                    description: 'Results per page (max 100, default 25)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Sequences (4 tools) ─────────────────────────────────────────

    {
        name: 'list_sequences',
        description: 'List all sequences in Apollo. Returns name, status (active/paused/archived), step count, and active contact count.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    description: 'Filter by sequence status',
                    enum: ['active', 'paused', 'archived'],
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_sequence',
        description: 'Get a sequence by ID. Returns name, steps count, and active contact count.',
        inputSchema: {
            type: 'object',
            properties: {
                sequence_id: {
                    type: 'string',
                    description: 'Apollo sequence ID',
                },
            },
            required: ['sequence_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_to_sequence',
        description: 'Add a contact to an Apollo sequence. Optionally specify which email account to send from.',
        inputSchema: {
            type: 'object',
            properties: {
                contact_id: {
                    type: 'string',
                    description: 'Apollo contact/person ID to add',
                },
                sequence_id: {
                    type: 'string',
                    description: 'Apollo sequence ID to add the contact to',
                },
                send_email_from_email_account_id: {
                    type: 'string',
                    description: 'Email account ID to send sequence emails from (optional — uses default if omitted)',
                },
            },
            required: ['contact_id', 'sequence_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'remove_from_sequence',
        description: 'Remove a contact from an Apollo sequence. Stops any further outreach steps.',
        inputSchema: {
            type: 'object',
            properties: {
                contact_id: {
                    type: 'string',
                    description: 'Apollo contact/person ID to remove',
                },
                sequence_id: {
                    type: 'string',
                    description: 'Apollo sequence ID to remove the contact from',
                },
            },
            required: ['contact_id', 'sequence_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Contacts Management (4 tools) ───────────────────────────────

    {
        name: 'list_contacts',
        description: 'List contacts in Apollo with optional filters by account ID or label names.',
        inputSchema: {
            type: 'object',
            properties: {
                account_id: {
                    type: 'string',
                    description: 'Filter contacts belonging to a specific account',
                },
                label_names: {
                    type: 'array',
                    description: 'Filter contacts by label names (e.g. ["hot-lead", "trial"])',
                    items: { type: 'string' },
                },
                page: {
                    type: 'number',
                    description: 'Page number (default 1)',
                },
                per_page: {
                    type: 'number',
                    description: 'Results per page (max 100, default 25)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_contact',
        description: 'Get a contact by ID. Returns full contact details including email, phone, title, and stage.',
        inputSchema: {
            type: 'object',
            properties: {
                contact_id: {
                    type: 'string',
                    description: 'Apollo contact ID',
                },
            },
            required: ['contact_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_contact',
        description: 'Update a contact in Apollo. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                contact_id: {
                    type: 'string',
                    description: 'Apollo contact ID',
                },
                email: { type: 'string', description: 'Updated email address' },
                phone: { type: 'string', description: 'Updated phone number' },
                title: { type: 'string', description: 'Updated job title' },
                stage: {
                    type: 'string',
                    description: 'CRM stage (e.g. new, open, in-progress, closed, unresponsive)',
                    enum: ['new', 'open', 'in-progress', 'closed', 'unresponsive', 'bad-data', 'changed-job'],
                },
            },
            required: ['contact_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_contact',
        description: 'Delete a contact from Apollo permanently.',
        inputSchema: {
            type: 'object',
            properties: {
                contact_id: {
                    type: 'string',
                    description: 'Apollo contact ID to delete',
                },
            },
            required: ['contact_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 5 — Usage & Labels (2 tools) ────────────────────────────────────

    {
        name: 'get_api_usage',
        description: 'Get API usage stats for the current Apollo account. Returns requests used today, monthly limit, and remaining quota.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_labels',
        description: 'List all contact and account labels defined in the Apollo workspace.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ─────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify connectivity and authentication. Calls GET /auth/health and returns {is_logged_in: true} if valid.',
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
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        // ── People Search & Enrichment ──────────────────────────────────────────

        case 'search_people': {
            const body: Record<string, unknown> = {};
            if (args.q_keywords !== undefined) body.q_keywords = args.q_keywords;
            if (args.person_titles !== undefined) body.person_titles = args.person_titles;
            if (args.person_locations !== undefined) body.person_locations = args.person_locations;
            if (args.q_organization_domains !== undefined) body.q_organization_domains = args.q_organization_domains;
            body.page = (args.page as number) || 1;
            body.per_page = (args.per_page as number) || 25;
            return apolloFetch('/people/search', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_person': {
            validateRequired(args, ['person_id']);
            return apolloFetch(`/people/${args.person_id}`, apiKey);
        }

        case 'enrich_person': {
            validateRequired(args, ['email']);
            return apolloFetch('/people/match', apiKey, {
                method: 'POST',
                body: JSON.stringify({ email: args.email, reveal_personal_emails: true }),
            });
        }

        case 'list_people': {
            const page = (args.page as number) || 1;
            const per_page = (args.per_page as number) || 25;
            return apolloFetch(`/contacts?page=${page}&per_page=${per_page}`, apiKey);
        }

        case 'create_person': {
            validateRequired(args, ['last_name']);
            const body: Record<string, unknown> = {};
            for (const key of ['first_name', 'last_name', 'email', 'title', 'organization_name', 'phone']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return apolloFetch('/contacts', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_person': {
            validateRequired(args, ['person_id']);
            const { person_id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['first_name', 'last_name', 'email', 'title', 'organization_name', 'phone']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return apolloFetch(`/contacts/${person_id}`, apiKey, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        // ── Accounts/Organizations ───────────────────────────────────────────────

        case 'search_accounts': {
            const body: Record<string, unknown> = {};
            if (args.q_organization_name !== undefined) body.q_organization_name = args.q_organization_name;
            if (args.organization_industry_tag_ids !== undefined) body.organization_industry_tag_ids = args.organization_industry_tag_ids;
            if (args.q_organization_keyword_tags !== undefined) body.q_organization_keyword_tags = args.q_organization_keyword_tags;
            body.page = (args.page as number) || 1;
            body.per_page = (args.per_page as number) || 25;
            return apolloFetch('/accounts/search', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_account': {
            validateRequired(args, ['account_id']);
            return apolloFetch(`/accounts/${args.account_id}`, apiKey);
        }

        case 'create_account': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = {};
            for (const key of ['name', 'domain', 'phone', 'industry']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return apolloFetch('/accounts', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_account': {
            validateRequired(args, ['account_id']);
            const { account_id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['name', 'domain', 'phone', 'industry']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return apolloFetch(`/accounts/${account_id}`, apiKey, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'list_accounts': {
            const page = (args.page as number) || 1;
            const per_page = (args.per_page as number) || 25;
            return apolloFetch(`/accounts?page=${page}&per_page=${per_page}`, apiKey);
        }

        // ── Sequences ────────────────────────────────────────────────────────────

        case 'list_sequences': {
            const params = new URLSearchParams();
            if (args.status !== undefined) params.set('status', args.status as string);
            const qs = params.toString();
            return apolloFetch(`/emailer_campaigns${qs ? `?${qs}` : ''}`, apiKey);
        }

        case 'get_sequence': {
            validateRequired(args, ['sequence_id']);
            return apolloFetch(`/emailer_campaigns/${args.sequence_id}`, apiKey);
        }

        case 'add_to_sequence': {
            validateRequired(args, ['contact_id', 'sequence_id']);
            const body: Record<string, unknown> = {
                contact_ids: [args.contact_id],
                emailer_campaign_id: args.sequence_id,
            };
            if (args.send_email_from_email_account_id !== undefined) {
                body.send_email_from_email_account_id = args.send_email_from_email_account_id;
            }
            return apolloFetch('/emailer_campaigns/add_contact_ids', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'remove_from_sequence': {
            validateRequired(args, ['contact_id', 'sequence_id']);
            return apolloFetch('/emailer_campaigns/remove_contact_ids', apiKey, {
                method: 'POST',
                body: JSON.stringify({
                    contact_ids: [args.contact_id],
                    emailer_campaign_id: args.sequence_id,
                }),
            });
        }

        // ── Contacts Management ──────────────────────────────────────────────────

        case 'list_contacts': {
            const params = new URLSearchParams();
            params.set('page', String((args.page as number) || 1));
            params.set('per_page', String((args.per_page as number) || 25));
            if (args.account_id !== undefined) params.set('account_id', args.account_id as string);
            if (args.label_names !== undefined) {
                for (const label of args.label_names as string[]) {
                    params.append('label_names[]', label);
                }
            }
            return apolloFetch(`/contacts?${params.toString()}`, apiKey);
        }

        case 'get_contact': {
            validateRequired(args, ['contact_id']);
            return apolloFetch(`/contacts/${args.contact_id}`, apiKey);
        }

        case 'update_contact': {
            validateRequired(args, ['contact_id']);
            const { contact_id, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['email', 'phone', 'title', 'stage']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return apolloFetch(`/contacts/${contact_id}`, apiKey, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'delete_contact': {
            validateRequired(args, ['contact_id']);
            return apolloFetch(`/contacts/${args.contact_id}`, apiKey, {
                method: 'DELETE',
            });
        }

        // ── Usage & Labels ───────────────────────────────────────────────────────

        case 'get_api_usage': {
            return apolloFetch('/usage', apiKey);
        }

        case 'list_labels': {
            return apolloFetch('/labels', apiKey);
        }

        // ── _ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            return apolloFetch('/auth/health', apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-apollo', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-apollo', version: '1.0.0' },
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
                return rpcErr(id, -32001, 'Missing required secret: APOLLO_API_KEY (header: X-Mcp-Secret-APOLLO-API-KEY)');
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
