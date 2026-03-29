/**
 * Attio MCP Worker
 * Implements MCP protocol over HTTP for Attio CRM operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   ATTIO_ACCESS_TOKEN  → X-Mcp-Secret-ATTIO-ACCESS-TOKEN  (Bearer token from Attio workspace settings)
 *
 * Auth format: Authorization: Bearer {access_token}
 *
 * Covers: People (5), Companies (5), Deals (5), Records (4),
 *         Tasks & Members (3) = 22 tools total + _ping
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const ATTIO_BASE_URL = 'https://api.attio.com/v2';

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

function getSecrets(request: Request): { token: string | null } {
    return {
        token: request.headers.get('X-Mcp-Secret-ATTIO-ACCESS-TOKEN'),
    };
}

async function attioFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${ATTIO_BASE_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Attio HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object') {
            const d = data as { message?: string; error?: string };
            msg = d.message || d.error || msg;
        }
        throw { code: -32603, message: `Attio API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — People (5 tools) ────────────────────────────────────────────

    {
        name: 'list_people',
        description: 'List people records in Attio with cursor-based pagination. Returns record IDs, names, emails, and phone numbers.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of records to return (max 500, default 20)',
                },
                offset: {
                    type: 'number',
                    description: 'Offset for pagination (default 0)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_person',
        description: 'Get a person record by record_id. Returns attributes: name, email_addresses, phone_numbers, company.',
        inputSchema: {
            type: 'object',
            properties: {
                record_id: {
                    type: 'string',
                    description: 'Attio person record ID (UUID)',
                },
            },
            required: ['record_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_person',
        description: 'Create a new person record in Attio. Provide name, email_addresses, and/or phone_numbers.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'array',
                    description: 'Name values array, e.g. [{"first_name": "Jane", "last_name": "Smith"}]',
                    items: {
                        type: 'object',
                        properties: {
                            first_name: { type: 'string', description: 'First name' },
                            last_name: { type: 'string', description: 'Last name' },
                        },
                    },
                },
                email_addresses: {
                    type: 'array',
                    description: 'Email address values array, e.g. [{"email_address": "jane@example.com"}]',
                    items: {
                        type: 'object',
                        properties: {
                            email_address: { type: 'string', description: 'Email address' },
                        },
                    },
                },
                phone_numbers: {
                    type: 'array',
                    description: 'Phone number values array, e.g. [{"phone_number": "+15550001234"}]',
                    items: {
                        type: 'object',
                        properties: {
                            phone_number: { type: 'string', description: 'Phone number' },
                        },
                    },
                },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_person',
        description: 'Update attributes on an existing person record. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                record_id: {
                    type: 'string',
                    description: 'Attio person record ID (UUID)',
                },
                name: {
                    type: 'array',
                    description: 'Updated name values, e.g. [{"first_name": "Jane", "last_name": "Smith"}]',
                    items: { type: 'object' },
                },
                email_addresses: {
                    type: 'array',
                    description: 'Updated email address values',
                    items: { type: 'object' },
                },
                phone_numbers: {
                    type: 'array',
                    description: 'Updated phone number values',
                    items: { type: 'object' },
                },
            },
            required: ['record_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_person',
        description: 'Delete a person record from Attio by record_id.',
        inputSchema: {
            type: 'object',
            properties: {
                record_id: {
                    type: 'string',
                    description: 'Attio person record ID (UUID)',
                },
            },
            required: ['record_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 2 — Companies (5 tools) ─────────────────────────────────────────

    {
        name: 'list_companies',
        description: 'List company records in Attio with cursor-based pagination. Returns name, domains, and basic attributes.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of records to return (max 500, default 20)',
                },
                offset: {
                    type: 'number',
                    description: 'Offset for pagination (default 0)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_company',
        description: 'Get a company record by record_id. Returns name, domains, description, and employee_count.',
        inputSchema: {
            type: 'object',
            properties: {
                record_id: {
                    type: 'string',
                    description: 'Attio company record ID (UUID)',
                },
            },
            required: ['record_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_company',
        description: 'Create a new company record in Attio. Provide name, domains, description, and/or employee_range.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'array',
                    description: 'Company name values, e.g. [{"value": "Acme Corp"}]',
                    items: {
                        type: 'object',
                        properties: {
                            value: { type: 'string', description: 'Company name' },
                        },
                    },
                },
                domains: {
                    type: 'array',
                    description: 'Domain values, e.g. [{"domain": "acme.com"}]',
                    items: {
                        type: 'object',
                        properties: {
                            domain: { type: 'string', description: 'Domain name without protocol' },
                        },
                    },
                },
                description: {
                    type: 'string',
                    description: 'Company description',
                },
                employee_range: {
                    type: 'string',
                    description: 'Employee range (e.g. "1-10", "11-50", "51-200", "201-500", "501-1000", "1001+")',
                    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'],
                },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_company',
        description: 'Update attributes on an existing company record. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                record_id: {
                    type: 'string',
                    description: 'Attio company record ID (UUID)',
                },
                name: {
                    type: 'array',
                    description: 'Updated company name values',
                    items: { type: 'object' },
                },
                domains: {
                    type: 'array',
                    description: 'Updated domain values',
                    items: { type: 'object' },
                },
                description: {
                    type: 'string',
                    description: 'Updated company description',
                },
                employee_range: {
                    type: 'string',
                    description: 'Updated employee range',
                    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'],
                },
            },
            required: ['record_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_company',
        description: 'Delete a company record from Attio by record_id.',
        inputSchema: {
            type: 'object',
            properties: {
                record_id: {
                    type: 'string',
                    description: 'Attio company record ID (UUID)',
                },
            },
            required: ['record_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 3 — Deals (5 tools) ─────────────────────────────────────────────

    {
        name: 'list_deals',
        description: 'List deal records in Attio with cursor-based pagination. Returns name, stage, value, and associations.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of records to return (max 500, default 20)',
                },
                offset: {
                    type: 'number',
                    description: 'Offset for pagination (default 0)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_deal',
        description: 'Get a deal record by record_id. Returns name, stage, value, associated_people, and associated_companies.',
        inputSchema: {
            type: 'object',
            properties: {
                record_id: {
                    type: 'string',
                    description: 'Attio deal record ID (UUID)',
                },
            },
            required: ['record_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_deal',
        description: 'Create a new deal record in Attio. Provide name, stage, and optionally a monetary value.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'array',
                    description: 'Deal name values, e.g. [{"value": "Acme Q1 Deal"}]',
                    items: {
                        type: 'object',
                        properties: {
                            value: { type: 'string', description: 'Deal name' },
                        },
                    },
                },
                stage: {
                    type: 'array',
                    description: 'Deal stage values, e.g. [{"status": "Qualification"}]',
                    items: {
                        type: 'object',
                        properties: {
                            status: { type: 'string', description: 'Stage status name' },
                        },
                    },
                },
                value: {
                    type: 'array',
                    description: 'Monetary value, e.g. [{"currency_value": 50000, "currency_code": "USD"}]',
                    items: {
                        type: 'object',
                        properties: {
                            currency_value: { type: 'number', description: 'Numeric amount' },
                            currency_code: { type: 'string', description: 'ISO 4217 currency code (e.g. USD, EUR, GBP)' },
                        },
                    },
                },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_deal',
        description: 'Update fields on an existing deal (stage, value, close_date). Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                record_id: {
                    type: 'string',
                    description: 'Attio deal record ID (UUID)',
                },
                stage: {
                    type: 'array',
                    description: 'Updated stage values, e.g. [{"status": "Closed Won"}]',
                    items: { type: 'object' },
                },
                value: {
                    type: 'array',
                    description: 'Updated monetary value',
                    items: { type: 'object' },
                },
                close_date: {
                    type: 'string',
                    description: 'Expected close date in ISO 8601 format (e.g. 2026-06-30)',
                },
            },
            required: ['record_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_deal',
        description: 'Delete a deal record from Attio by record_id.',
        inputSchema: {
            type: 'object',
            properties: {
                record_id: {
                    type: 'string',
                    description: 'Attio deal record ID (UUID)',
                },
            },
            required: ['record_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 4 — Records (4 tools) ───────────────────────────────────────────

    {
        name: 'search_records',
        description: 'Search records across an Attio object using a filter query. Supports people, companies, and deals.',
        inputSchema: {
            type: 'object',
            properties: {
                object_slug: {
                    type: 'string',
                    description: 'Object type to search (people, companies, deals)',
                    enum: ['people', 'companies', 'deals'],
                },
                filter: {
                    type: 'object',
                    description: 'Attio filter query object. Example: {"name": {"$str_contains": "Acme"}}',
                },
                limit: {
                    type: 'number',
                    description: 'Max results to return (default 20, max 500)',
                },
            },
            required: ['object_slug'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_record_entries',
        description: 'List all entries (timeline activity) on a record. Returns interactions, notes, and task entries.',
        inputSchema: {
            type: 'object',
            properties: {
                object_slug: {
                    type: 'string',
                    description: 'Object type (people, companies, deals)',
                    enum: ['people', 'companies', 'deals'],
                },
                record_id: {
                    type: 'string',
                    description: 'Attio record ID (UUID)',
                },
            },
            required: ['object_slug', 'record_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_note',
        description: 'Create a note entry on an Attio record. Notes are attached to the record timeline.',
        inputSchema: {
            type: 'object',
            properties: {
                object_slug: {
                    type: 'string',
                    description: 'Object type (people, companies, deals)',
                    enum: ['people', 'companies', 'deals'],
                },
                record_id: {
                    type: 'string',
                    description: 'Attio record ID (UUID)',
                },
                title: {
                    type: 'string',
                    description: 'Note title',
                },
                text: {
                    type: 'string',
                    description: 'Note body/content',
                },
            },
            required: ['object_slug', 'record_id', 'title', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_notes',
        description: 'List notes for a specific Attio record.',
        inputSchema: {
            type: 'object',
            properties: {
                object_slug: {
                    type: 'string',
                    description: 'Object type (people, companies, deals)',
                    enum: ['people', 'companies', 'deals'],
                },
                record_id: {
                    type: 'string',
                    description: 'Attio record ID (UUID)',
                },
                limit: {
                    type: 'number',
                    description: 'Max notes to return (default 20)',
                },
            },
            required: ['object_slug', 'record_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 5 — Tasks & Members (3 tools) ───────────────────────────────────

    {
        name: 'list_tasks',
        description: 'List tasks in Attio workspace. Optionally filter by linked record or completion status.',
        inputSchema: {
            type: 'object',
            properties: {
                record_id: {
                    type: 'string',
                    description: 'Filter tasks linked to a specific record ID (optional)',
                },
                is_completed: {
                    type: 'boolean',
                    description: 'Filter by completion status (true = completed, false = incomplete, omit for all)',
                },
                limit: {
                    type: 'number',
                    description: 'Max tasks to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_task',
        description: 'Create a task in Attio. Tasks can be linked to people, companies, or deal records.',
        inputSchema: {
            type: 'object',
            properties: {
                content: {
                    type: 'string',
                    description: 'Task content/description',
                },
                deadline_at: {
                    type: 'string',
                    description: 'Task deadline in ISO 8601 format (e.g. 2026-06-30T17:00:00.000Z)',
                },
                linked_records: {
                    type: 'array',
                    description: 'Records to link the task to, e.g. [{"target_object": "people", "target_record_id": "uuid"}]',
                    items: {
                        type: 'object',
                        properties: {
                            target_object: {
                                type: 'string',
                                description: 'Object type (people, companies, deals)',
                                enum: ['people', 'companies', 'deals'],
                            },
                            target_record_id: {
                                type: 'string',
                                description: 'Record ID to link to',
                            },
                        },
                        required: ['target_object', 'target_record_id'],
                    },
                },
            },
            required: ['content'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_workspace_members',
        description: 'List all members in the current Attio workspace with their IDs, names, and email addresses.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ─────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify connectivity and authentication. Calls GET /v2/self and returns current user/workspace info.',
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
): Promise<unknown> {
    switch (name) {
        // ── People ──────────────────────────────────────────────────────────────

        case 'list_people': {
            const limit = (args.limit as number) || 20;
            const offset = (args.offset as number) || 0;
            return attioFetch(
                `/objects/people/records?limit=${limit}&offset=${offset}`,
                token,
            );
        }

        case 'get_person': {
            validateRequired(args, ['record_id']);
            return attioFetch(`/objects/people/records/${args.record_id}`, token);
        }

        case 'create_person': {
            const values: Record<string, unknown> = {};
            if (args.name !== undefined) values.name = args.name;
            if (args.email_addresses !== undefined) values.email_addresses = args.email_addresses;
            if (args.phone_numbers !== undefined) values.phone_numbers = args.phone_numbers;
            return attioFetch('/objects/people/records', token, {
                method: 'POST',
                body: JSON.stringify({ data: { values } }),
            });
        }

        case 'update_person': {
            validateRequired(args, ['record_id']);
            const { record_id, ...rest } = args;
            const values: Record<string, unknown> = {};
            if (rest.name !== undefined) values.name = rest.name;
            if (rest.email_addresses !== undefined) values.email_addresses = rest.email_addresses;
            if (rest.phone_numbers !== undefined) values.phone_numbers = rest.phone_numbers;
            return attioFetch(`/objects/people/records/${record_id}`, token, {
                method: 'PATCH',
                body: JSON.stringify({ data: { values } }),
            });
        }

        case 'delete_person': {
            validateRequired(args, ['record_id']);
            return attioFetch(`/objects/people/records/${args.record_id}`, token, {
                method: 'DELETE',
            });
        }

        // ── Companies ────────────────────────────────────────────────────────────

        case 'list_companies': {
            const limit = (args.limit as number) || 20;
            const offset = (args.offset as number) || 0;
            return attioFetch(
                `/objects/companies/records?limit=${limit}&offset=${offset}`,
                token,
            );
        }

        case 'get_company': {
            validateRequired(args, ['record_id']);
            return attioFetch(`/objects/companies/records/${args.record_id}`, token);
        }

        case 'create_company': {
            const values: Record<string, unknown> = {};
            if (args.name !== undefined) values.name = args.name;
            if (args.domains !== undefined) values.domains = args.domains;
            if (args.description !== undefined) values.description = args.description;
            if (args.employee_range !== undefined) values.employee_range = args.employee_range;
            return attioFetch('/objects/companies/records', token, {
                method: 'POST',
                body: JSON.stringify({ data: { values } }),
            });
        }

        case 'update_company': {
            validateRequired(args, ['record_id']);
            const { record_id, ...rest } = args;
            const values: Record<string, unknown> = {};
            if (rest.name !== undefined) values.name = rest.name;
            if (rest.domains !== undefined) values.domains = rest.domains;
            if (rest.description !== undefined) values.description = rest.description;
            if (rest.employee_range !== undefined) values.employee_range = rest.employee_range;
            return attioFetch(`/objects/companies/records/${record_id}`, token, {
                method: 'PATCH',
                body: JSON.stringify({ data: { values } }),
            });
        }

        case 'delete_company': {
            validateRequired(args, ['record_id']);
            return attioFetch(`/objects/companies/records/${args.record_id}`, token, {
                method: 'DELETE',
            });
        }

        // ── Deals ────────────────────────────────────────────────────────────────

        case 'list_deals': {
            const limit = (args.limit as number) || 20;
            const offset = (args.offset as number) || 0;
            return attioFetch(
                `/objects/deals/records?limit=${limit}&offset=${offset}`,
                token,
            );
        }

        case 'get_deal': {
            validateRequired(args, ['record_id']);
            return attioFetch(`/objects/deals/records/${args.record_id}`, token);
        }

        case 'create_deal': {
            const values: Record<string, unknown> = {};
            if (args.name !== undefined) values.name = args.name;
            if (args.stage !== undefined) values.stage = args.stage;
            if (args.value !== undefined) values.value = args.value;
            return attioFetch('/objects/deals/records', token, {
                method: 'POST',
                body: JSON.stringify({ data: { values } }),
            });
        }

        case 'update_deal': {
            validateRequired(args, ['record_id']);
            const { record_id, ...rest } = args;
            const values: Record<string, unknown> = {};
            if (rest.stage !== undefined) values.stage = rest.stage;
            if (rest.value !== undefined) values.value = rest.value;
            if (rest.close_date !== undefined) values.close_date = rest.close_date;
            return attioFetch(`/objects/deals/records/${record_id}`, token, {
                method: 'PATCH',
                body: JSON.stringify({ data: { values } }),
            });
        }

        case 'delete_deal': {
            validateRequired(args, ['record_id']);
            return attioFetch(`/objects/deals/records/${args.record_id}`, token, {
                method: 'DELETE',
            });
        }

        // ── Records ──────────────────────────────────────────────────────────────

        case 'search_records': {
            validateRequired(args, ['object_slug']);
            const body: Record<string, unknown> = {};
            if (args.filter !== undefined) body.filter = args.filter;
            if (args.limit !== undefined) body.limit = args.limit;
            return attioFetch(`/objects/${args.object_slug}/records/query`, token, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'list_record_entries': {
            validateRequired(args, ['object_slug', 'record_id']);
            return attioFetch(
                `/objects/${args.object_slug}/records/${args.record_id}/entries`,
                token,
            );
        }

        case 'create_note': {
            validateRequired(args, ['object_slug', 'record_id', 'title', 'text']);
            return attioFetch('/notes', token, {
                method: 'POST',
                body: JSON.stringify({
                    data: {
                        parent_object: args.object_slug,
                        parent_record_id: args.record_id,
                        title: args.title,
                        content: args.text,
                        format: 'plaintext',
                    },
                }),
            });
        }

        case 'list_notes': {
            validateRequired(args, ['object_slug', 'record_id']);
            const limit = (args.limit as number) || 20;
            return attioFetch(
                `/notes?parent_object=${args.object_slug}&parent_record_id=${args.record_id}&limit=${limit}`,
                token,
            );
        }

        // ── Tasks & Members ──────────────────────────────────────────────────────

        case 'list_tasks': {
            const params = new URLSearchParams();
            if (args.record_id !== undefined) params.set('linked_record_id', args.record_id as string);
            if (args.is_completed !== undefined) params.set('is_completed', String(args.is_completed));
            if (args.limit !== undefined) params.set('limit', String(args.limit));
            const qs = params.toString();
            return attioFetch(`/tasks${qs ? `?${qs}` : ''}`, token);
        }

        case 'create_task': {
            validateRequired(args, ['content']);
            const body: Record<string, unknown> = {
                content: args.content,
            };
            if (args.deadline_at !== undefined) body.deadline_at = args.deadline_at;
            if (args.linked_records !== undefined) body.linked_records = args.linked_records;
            return attioFetch('/tasks', token, {
                method: 'POST',
                body: JSON.stringify({ data: body }),
            });
        }

        case 'list_workspace_members': {
            return attioFetch('/workspace_members', token);
        }

        // ── _ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            return attioFetch('/self', token);
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
                JSON.stringify({ status: 'ok', server: 'mcp-attio', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-attio', version: '1.0.0' },
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
            const { token } = getSecrets(request);
            if (!token) {
                return rpcErr(id, -32001, 'Missing required secret: ATTIO_ACCESS_TOKEN (header: X-Mcp-Secret-ATTIO-ACCESS-TOKEN)');
            }

            try {
                const result = await callTool(toolName, args, token);
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
