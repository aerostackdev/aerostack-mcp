/**
 * Pipedrive MCP Worker
 * Implements MCP protocol over HTTP for Pipedrive CRM operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   PIPEDRIVE_API_TOKEN → X-Mcp-Secret-PIPEDRIVE-API-TOKEN
 *
 * Auth format: ?api_token={token} appended to every URL
 *
 * Covers: Persons (5), Deals (5), Organizations (4), Activities (4),
 *         Pipelines & Stages (2) = 20 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const PIPEDRIVE_API_BASE = 'https://api.pipedrive.com/v1';

// ── TypeScript interfaces ─────────────────────────────────────────────────────

interface PDPerson {
    id: number;
    name: string;
    email: Array<{ value: string; primary: boolean; label: string }>;
    phone: Array<{ value: string; primary: boolean; label: string }>;
    org_id: { value: number; name: string } | null;
    add_time: string;
    update_time: string;
    visible_to: string;
    active_flag: boolean;
}

interface PDDeal {
    id: number;
    title: string;
    value: number;
    currency: string;
    status: string;
    stage_id: number;
    pipeline_id: number;
    person_id: { value: number; name: string } | null;
    org_id: { value: number; name: string } | null;
    expected_close_date: string | null;
    add_time: string;
    update_time: string;
    lost_reason: string | null;
    won_time: string | null;
    lost_time: string | null;
}

interface PDOrganization {
    id: number;
    name: string;
    address: string | null;
    visible_to: string;
    add_time: string;
    update_time: string;
    active_flag: boolean;
    open_deals_count: number;
}

interface PDActivity {
    id: number;
    subject: string;
    type: string;
    due_date: string | null;
    due_time: string | null;
    duration: string | null;
    done: boolean;
    deal_id: number | null;
    person_id: number | null;
    org_id: number | null;
    note: string | null;
    add_time: string;
    update_time: string;
}

interface PDPipeline {
    id: number;
    name: string;
    active: boolean;
    order_nr: number;
    add_time: string;
    update_time: string;
}

interface PDStage {
    id: number;
    name: string;
    pipeline_id: number;
    pipeline_name: string;
    order_nr: number;
    active_flag: boolean;
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

function getToken(request: Request): string | null {
    return request.headers.get('X-Mcp-Secret-PIPEDRIVE-API-TOKEN');
}

async function pipedriveFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const separator = path.includes('?') ? '&' : '?';
    const res = await fetch(`${PIPEDRIVE_API_BASE}${path}${separator}api_token=${token}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...((options.headers as Record<string, string>) || {}),
        },
    });

    const data = await res.json() as Record<string, unknown>;

    if (!res.ok) {
        const errMsg = typeof data.error === 'string'
            ? data.error
            : typeof data.message === 'string'
                ? data.message
                : res.statusText;

        switch (res.status) {
            case 401:
                throw new Error('Authentication failed — verify PIPEDRIVE_API_TOKEN is correct');
            case 403:
                throw new Error('Permission denied — your Pipedrive API token lacks access to this resource');
            case 404:
                throw new Error(`Not found — check the ID is correct: ${errMsg}`);
            case 422:
                throw new Error(`Validation error: ${errMsg}`);
            case 429:
                throw new Error('Rate limited — Pipedrive API rate limit exceeded, please retry later');
            default:
                throw new Error(`Pipedrive API error ${res.status}: ${errMsg}`);
        }
    }

    // Pipedrive returns { success: true, data: {...} } — check for API-level errors
    if (data.success === false) {
        const errMsg = typeof data.error === 'string' ? data.error : 'Unknown Pipedrive error';
        throw { code: -32603, message: `Pipedrive API error: ${errMsg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Persons / Contacts (5 tools) ───────────────────────────────

    {
        name: 'search_persons',
        description: 'Search for persons (contacts) in Pipedrive by name, email, or phone. Returns matching contacts with their deal counts and organization.',
        inputSchema: {
            type: 'object',
            properties: {
                term: {
                    type: 'string',
                    description: 'Search term — name, email address, or phone number',
                },
                limit: {
                    type: 'number',
                    description: 'Number of results to return (default 20, max 100)',
                },
            },
            required: ['term'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_person',
        description: 'Get full details of a specific person by ID — name, emails, phones, organization, and timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Pipedrive person ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_person',
        description: 'Create a new person (contact) in Pipedrive with name, email, phone, and optional organization link.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Full name of the person',
                },
                email: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of email addresses (e.g. ["john@acme.com", "john.doe@gmail.com"])',
                },
                phone: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of phone numbers (e.g. ["+14155551234"])',
                },
                org_id: {
                    type: 'number',
                    description: 'Organization ID to link this person to',
                },
                visible_to: {
                    type: 'string',
                    enum: ['1', '3', '5', '7'],
                    description: 'Visibility: 1=owner only, 3=owner\'s visibility group, 5=entire company, 7=everyone',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_person',
        description: 'Update an existing person — name, email, phone, or organization link. Only provided fields are updated.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Pipedrive person ID to update',
                },
                name: { type: 'string', description: 'Updated full name' },
                email: {
                    type: 'string',
                    description: 'Updated primary email address',
                },
                phone: {
                    type: 'string',
                    description: 'Updated primary phone number',
                },
                org_id: {
                    type: 'number',
                    description: 'Updated organization ID to link this person to',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_person_deals',
        description: 'List all deals associated with a specific person. Useful for seeing a contact\'s full sales history.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Pipedrive person ID',
                },
                limit: {
                    type: 'number',
                    description: 'Number of deals to return (default 20)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Deals (5 tools) ─────────────────────────────────────────────

    {
        name: 'list_deals',
        description: 'List deals with optional status filter. Returns deals sorted by update time.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['open', 'won', 'lost', 'deleted', 'all_not_deleted'],
                    description: 'Filter by deal status (default: open)',
                },
                limit: {
                    type: 'number',
                    description: 'Number of deals to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_deal',
        description: 'Get full details of a specific deal by ID — title, value, stage, pipeline, person, organization, expected close date.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Pipedrive deal ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_deal',
        description: 'Create a new deal in Pipedrive with title, value, associated person/organization, pipeline, and stage.',
        inputSchema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Deal title (e.g. "Acme Corp - Enterprise Plan")',
                },
                person_id: {
                    type: 'number',
                    description: 'Person ID to associate with this deal',
                },
                org_id: {
                    type: 'number',
                    description: 'Organization ID to associate with this deal',
                },
                value: {
                    type: 'number',
                    description: 'Deal value/amount',
                },
                currency: {
                    type: 'string',
                    description: 'Currency code (e.g. "USD", "EUR"). Defaults to account currency.',
                },
                pipeline_id: {
                    type: 'number',
                    description: 'Pipeline ID to place this deal in',
                },
                stage_id: {
                    type: 'number',
                    description: 'Stage ID within the pipeline',
                },
                expected_close_date: {
                    type: 'string',
                    description: 'Expected close date in YYYY-MM-DD format',
                },
            },
            required: ['title'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_deal',
        description: 'Update an existing deal — title, value, stage, status, or lost reason. Only provided fields are updated.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Pipedrive deal ID to update',
                },
                title: { type: 'string', description: 'Updated deal title' },
                value: { type: 'number', description: 'Updated deal value' },
                stage_id: { type: 'number', description: 'Updated stage ID' },
                status: {
                    type: 'string',
                    enum: ['open', 'won', 'lost', 'deleted'],
                    description: 'Updated deal status',
                },
                lost_reason: {
                    type: 'string',
                    description: 'Reason for losing the deal (required when status is "lost")',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_deal_stage',
        description: 'Convenience tool to move a deal to a new stage. Use list_stages to find valid stage IDs for the pipeline.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Pipedrive deal ID',
                },
                stage_id: {
                    type: 'number',
                    description: 'New stage ID to move the deal to',
                },
            },
            required: ['id', 'stage_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 3 — Organizations (4 tools) ─────────────────────────────────────

    {
        name: 'search_organizations',
        description: 'Search for organizations in Pipedrive by name. Returns matching companies with their deal counts.',
        inputSchema: {
            type: 'object',
            properties: {
                term: {
                    type: 'string',
                    description: 'Search term — organization name or part of it',
                },
                limit: {
                    type: 'number',
                    description: 'Number of results to return (default 20)',
                },
            },
            required: ['term'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_organization',
        description: 'Get full details of a specific organization by ID — name, address, deal counts, and timestamps.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Pipedrive organization ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_organization',
        description: 'Create a new organization (company) in Pipedrive with name, address, and visibility settings.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Organization name',
                },
                address: {
                    type: 'string',
                    description: 'Organization address (full street address)',
                },
                visible_to: {
                    type: 'string',
                    enum: ['1', '3', '5', '7'],
                    description: 'Visibility: 1=owner only, 3=owner\'s visibility group, 5=entire company, 7=everyone',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_organization_deals',
        description: 'List all deals associated with a specific organization. Useful for seeing a company\'s full sales history.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Pipedrive organization ID',
                },
                limit: {
                    type: 'number',
                    description: 'Number of deals to return (default 20)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Activities (4 tools) ────────────────────────────────────────

    {
        name: 'list_activities',
        description: 'List activities with optional type and date filters. Returns calls, meetings, emails, and other CRM activities.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    description: 'Filter by activity type (e.g. "call", "meeting", "email", "lunch", "deadline", "task"). Leave empty for all types.',
                },
                due_date: {
                    type: 'string',
                    description: 'Filter by due date in YYYY-MM-DD format. Returns activities due on this date.',
                },
                limit: {
                    type: 'number',
                    description: 'Number of activities to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_activity',
        description: 'Get full details of a specific activity by ID — subject, type, due date, deal/person/org associations, and notes.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Pipedrive activity ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_activity',
        description: 'Create a new activity (call, meeting, email, task, etc.) and optionally link it to a deal, person, or organization.',
        inputSchema: {
            type: 'object',
            properties: {
                subject: {
                    type: 'string',
                    description: 'Activity subject/title (e.g. "Follow-up call with Acme Corp")',
                },
                type: {
                    type: 'string',
                    description: 'Activity type: "call", "meeting", "email", "lunch", "deadline", "task", "note"',
                },
                due_date: {
                    type: 'string',
                    description: 'Due date in YYYY-MM-DD format',
                },
                due_time: {
                    type: 'string',
                    description: 'Due time in HH:MM format (24-hour, e.g. "14:30")',
                },
                duration: {
                    type: 'string',
                    description: 'Duration in HH:MM format (e.g. "01:00" for 1 hour)',
                },
                deal_id: {
                    type: 'number',
                    description: 'Deal ID to link this activity to',
                },
                person_id: {
                    type: 'number',
                    description: 'Person ID to link this activity to',
                },
                org_id: {
                    type: 'number',
                    description: 'Organization ID to link this activity to',
                },
                note: {
                    type: 'string',
                    description: 'Activity notes or description',
                },
                done: {
                    type: 'boolean',
                    description: 'Whether the activity is already done (default false)',
                },
            },
            required: ['subject', 'type'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'complete_activity',
        description: 'Mark an activity as done/completed. Use after a call or meeting has taken place.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'number',
                    description: 'Pipedrive activity ID to mark as done',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 5 — Pipeline & Stages (2 tools) ─────────────────────────────────

    {
        name: 'list_pipelines',
        description: 'List all pipelines in your Pipedrive account. Returns pipeline IDs and names needed for creating deals.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_stages',
        description: 'List all stages within a specific pipeline. Returns stage IDs and names needed for deal stage management.',
        inputSchema: {
            type: 'object',
            properties: {
                pipeline_id: {
                    type: 'number',
                    description: 'Pipeline ID to list stages for. Use list_pipelines to find pipeline IDs.',
                },
            },
            required: ['pipeline_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool implementation ───────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
): Promise<unknown> {
    switch (name) {
        // ── Persons ───────────────────────────────────────────────────────────

        case 'search_persons': {
            validateRequired(args, ['term']);
            const limit = (args.limit as number) ?? 20;
            const data = await pipedriveFetch(
                `/persons/search?term=${encodeURIComponent(args.term as string)}&limit=${limit}&fields=email,phone,name`,
                token,
            ) as { data: { items: Array<{ item: PDPerson }> } | null };
            const items = data.data?.items ?? [];
            return items.map(({ item: p }) => ({
                id: p.id,
                name: p.name,
                email: p.email?.[0]?.value ?? null,
                phone: p.phone?.[0]?.value ?? null,
                org_id: p.org_id?.value ?? null,
                org_name: p.org_id?.name ?? null,
            }));
        }

        case 'get_person': {
            validateRequired(args, ['id']);
            const data = await pipedriveFetch(`/persons/${args.id as number}`, token) as { data: PDPerson };
            const p = data.data;
            return {
                id: p.id,
                name: p.name,
                email: p.email ?? [],
                phone: p.phone ?? [],
                org_id: p.org_id?.value ?? null,
                org_name: p.org_id?.name ?? null,
                add_time: p.add_time,
                update_time: p.update_time,
                active_flag: p.active_flag,
            };
        }

        case 'create_person': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.email) {
                body.email = (args.email as string[]).map(e => ({ value: e, primary: true, label: 'work' }));
            }
            if (args.phone) {
                body.phone = (args.phone as string[]).map(p => ({ value: p, primary: true, label: 'work' }));
            }
            if (args.org_id) body.org_id = args.org_id;
            if (args.visible_to) body.visible_to = args.visible_to;

            const data = await pipedriveFetch('/persons', token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as { data: PDPerson };
            const p = data.data;
            return {
                id: p.id,
                name: p.name,
                email: p.email ?? [],
                phone: p.phone ?? [],
                org_id: p.org_id?.value ?? null,
                add_time: p.add_time,
            };
        }

        case 'update_person': {
            validateRequired(args, ['id']);
            const body: Record<string, unknown> = {};
            if (args.name !== undefined) body.name = args.name;
            if (args.email !== undefined) body.email = [{ value: args.email, primary: true, label: 'work' }];
            if (args.phone !== undefined) body.phone = [{ value: args.phone, primary: true, label: 'work' }];
            if (args.org_id !== undefined) body.org_id = args.org_id;

            const data = await pipedriveFetch(`/persons/${args.id as number}`, token, {
                method: 'PUT',
                body: JSON.stringify(body),
            }) as { data: PDPerson };
            const p = data.data;
            return {
                id: p.id,
                name: p.name,
                email: p.email ?? [],
                phone: p.phone ?? [],
                org_id: p.org_id?.value ?? null,
                update_time: p.update_time,
            };
        }

        case 'list_person_deals': {
            validateRequired(args, ['id']);
            const limit = (args.limit as number) ?? 20;
            const data = await pipedriveFetch(
                `/persons/${args.id as number}/deals?status=all&limit=${limit}`,
                token,
            ) as { data: PDDeal[] | null };
            return (data.data ?? []).map(d => ({
                id: d.id,
                title: d.title,
                value: d.value,
                currency: d.currency,
                status: d.status,
                stage_id: d.stage_id,
                pipeline_id: d.pipeline_id,
                expected_close_date: d.expected_close_date,
                add_time: d.add_time,
                update_time: d.update_time,
            }));
        }

        // ── Deals ─────────────────────────────────────────────────────────────

        case 'list_deals': {
            const status = (args.status as string) ?? 'open';
            const limit = (args.limit as number) ?? 20;
            const data = await pipedriveFetch(
                `/deals?status=${status}&limit=${limit}&start=0`,
                token,
            ) as { data: PDDeal[] | null };
            return (data.data ?? []).map(d => ({
                id: d.id,
                title: d.title,
                value: d.value,
                currency: d.currency,
                status: d.status,
                stage_id: d.stage_id,
                pipeline_id: d.pipeline_id,
                person_id: d.person_id?.value ?? null,
                person_name: d.person_id?.name ?? null,
                org_id: d.org_id?.value ?? null,
                org_name: d.org_id?.name ?? null,
                expected_close_date: d.expected_close_date,
                update_time: d.update_time,
            }));
        }

        case 'get_deal': {
            validateRequired(args, ['id']);
            const data = await pipedriveFetch(`/deals/${args.id as number}`, token) as { data: PDDeal };
            const d = data.data;
            return {
                id: d.id,
                title: d.title,
                value: d.value,
                currency: d.currency,
                status: d.status,
                stage_id: d.stage_id,
                pipeline_id: d.pipeline_id,
                person_id: d.person_id?.value ?? null,
                person_name: d.person_id?.name ?? null,
                org_id: d.org_id?.value ?? null,
                org_name: d.org_id?.name ?? null,
                expected_close_date: d.expected_close_date,
                lost_reason: d.lost_reason,
                won_time: d.won_time,
                lost_time: d.lost_time,
                add_time: d.add_time,
                update_time: d.update_time,
            };
        }

        case 'create_deal': {
            validateRequired(args, ['title']);
            const body: Record<string, unknown> = { title: args.title };
            if (args.person_id !== undefined) body.person_id = args.person_id;
            if (args.org_id !== undefined) body.org_id = args.org_id;
            if (args.value !== undefined) body.value = args.value;
            if (args.currency !== undefined) body.currency = args.currency;
            if (args.pipeline_id !== undefined) body.pipeline_id = args.pipeline_id;
            if (args.stage_id !== undefined) body.stage_id = args.stage_id;
            if (args.expected_close_date !== undefined) body.expected_close_date = args.expected_close_date;

            const data = await pipedriveFetch('/deals', token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as { data: PDDeal };
            const d = data.data;
            return {
                id: d.id,
                title: d.title,
                value: d.value,
                currency: d.currency,
                status: d.status,
                stage_id: d.stage_id,
                pipeline_id: d.pipeline_id,
                person_id: d.person_id?.value ?? null,
                org_id: d.org_id?.value ?? null,
                add_time: d.add_time,
            };
        }

        case 'update_deal': {
            validateRequired(args, ['id']);
            const body: Record<string, unknown> = {};
            if (args.title !== undefined) body.title = args.title;
            if (args.value !== undefined) body.value = args.value;
            if (args.stage_id !== undefined) body.stage_id = args.stage_id;
            if (args.status !== undefined) body.status = args.status;
            if (args.lost_reason !== undefined) body.lost_reason = args.lost_reason;

            const data = await pipedriveFetch(`/deals/${args.id as number}`, token, {
                method: 'PUT',
                body: JSON.stringify(body),
            }) as { data: PDDeal };
            const d = data.data;
            return {
                id: d.id,
                title: d.title,
                value: d.value,
                status: d.status,
                stage_id: d.stage_id,
                update_time: d.update_time,
            };
        }

        case 'update_deal_stage': {
            validateRequired(args, ['id', 'stage_id']);
            const data = await pipedriveFetch(`/deals/${args.id as number}`, token, {
                method: 'PUT',
                body: JSON.stringify({ stage_id: args.stage_id }),
            }) as { data: PDDeal };
            const d = data.data;
            return {
                id: d.id,
                title: d.title,
                stage_id: d.stage_id,
                pipeline_id: d.pipeline_id,
                status: d.status,
                update_time: d.update_time,
            };
        }

        // ── Organizations ─────────────────────────────────────────────────────

        case 'search_organizations': {
            validateRequired(args, ['term']);
            const limit = (args.limit as number) ?? 20;
            const data = await pipedriveFetch(
                `/organizations/search?term=${encodeURIComponent(args.term as string)}&limit=${limit}`,
                token,
            ) as { data: { items: Array<{ item: PDOrganization }> } | null };
            const items = data.data?.items ?? [];
            return items.map(({ item: o }) => ({
                id: o.id,
                name: o.name,
                address: o.address,
                open_deals_count: o.open_deals_count,
            }));
        }

        case 'get_organization': {
            validateRequired(args, ['id']);
            const data = await pipedriveFetch(`/organizations/${args.id as number}`, token) as { data: PDOrganization };
            const o = data.data;
            return {
                id: o.id,
                name: o.name,
                address: o.address,
                visible_to: o.visible_to,
                open_deals_count: o.open_deals_count,
                active_flag: o.active_flag,
                add_time: o.add_time,
                update_time: o.update_time,
            };
        }

        case 'create_organization': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = { name: args.name };
            if (args.address !== undefined) body.address = args.address;
            if (args.visible_to !== undefined) body.visible_to = args.visible_to;

            const data = await pipedriveFetch('/organizations', token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as { data: PDOrganization };
            const o = data.data;
            return {
                id: o.id,
                name: o.name,
                address: o.address,
                add_time: o.add_time,
            };
        }

        case 'list_organization_deals': {
            validateRequired(args, ['id']);
            const limit = (args.limit as number) ?? 20;
            const data = await pipedriveFetch(
                `/organizations/${args.id as number}/deals?status=all&limit=${limit}`,
                token,
            ) as { data: PDDeal[] | null };
            return (data.data ?? []).map(d => ({
                id: d.id,
                title: d.title,
                value: d.value,
                currency: d.currency,
                status: d.status,
                stage_id: d.stage_id,
                pipeline_id: d.pipeline_id,
                person_id: d.person_id?.value ?? null,
                person_name: d.person_id?.name ?? null,
                expected_close_date: d.expected_close_date,
                update_time: d.update_time,
            }));
        }

        // ── Activities ────────────────────────────────────────────────────────

        case 'list_activities': {
            const limit = (args.limit as number) ?? 20;
            let path = `/activities?limit=${limit}`;
            if (args.type) path += `&type=${encodeURIComponent(args.type as string)}`;
            if (args.due_date) path += `&due_date=${encodeURIComponent(args.due_date as string)}`;

            const data = await pipedriveFetch(path, token) as { data: PDActivity[] | null };
            return (data.data ?? []).map(a => ({
                id: a.id,
                subject: a.subject,
                type: a.type,
                due_date: a.due_date,
                due_time: a.due_time,
                done: a.done,
                deal_id: a.deal_id,
                person_id: a.person_id,
                org_id: a.org_id,
                add_time: a.add_time,
            }));
        }

        case 'get_activity': {
            validateRequired(args, ['id']);
            const data = await pipedriveFetch(`/activities/${args.id as number}`, token) as { data: PDActivity };
            const a = data.data;
            return {
                id: a.id,
                subject: a.subject,
                type: a.type,
                due_date: a.due_date,
                due_time: a.due_time,
                duration: a.duration,
                done: a.done,
                deal_id: a.deal_id,
                person_id: a.person_id,
                org_id: a.org_id,
                note: a.note,
                add_time: a.add_time,
                update_time: a.update_time,
            };
        }

        case 'create_activity': {
            validateRequired(args, ['subject', 'type']);
            const body: Record<string, unknown> = {
                subject: args.subject,
                type: args.type,
            };
            if (args.due_date !== undefined) body.due_date = args.due_date;
            if (args.due_time !== undefined) body.due_time = args.due_time;
            if (args.duration !== undefined) body.duration = args.duration;
            if (args.deal_id !== undefined) body.deal_id = args.deal_id;
            if (args.person_id !== undefined) body.person_id = args.person_id;
            if (args.org_id !== undefined) body.org_id = args.org_id;
            if (args.note !== undefined) body.note = args.note;
            if (args.done !== undefined) body.done = args.done ? 1 : 0;

            const data = await pipedriveFetch('/activities', token, {
                method: 'POST',
                body: JSON.stringify(body),
            }) as { data: PDActivity };
            const a = data.data;
            return {
                id: a.id,
                subject: a.subject,
                type: a.type,
                due_date: a.due_date,
                due_time: a.due_time,
                done: a.done,
                deal_id: a.deal_id,
                person_id: a.person_id,
                org_id: a.org_id,
                add_time: a.add_time,
            };
        }

        case 'complete_activity': {
            validateRequired(args, ['id']);
            const data = await pipedriveFetch(`/activities/${args.id as number}`, token, {
                method: 'PUT',
                body: JSON.stringify({ done: 1 }),
            }) as { data: PDActivity };
            const a = data.data;
            return {
                id: a.id,
                subject: a.subject,
                type: a.type,
                done: a.done,
                update_time: a.update_time,
            };
        }

        // ── Pipeline & Stages ─────────────────────────────────────────────────

        case 'list_pipelines': {
            const data = await pipedriveFetch('/pipelines', token) as { data: PDPipeline[] | null };
            return (data.data ?? []).map(p => ({
                id: p.id,
                name: p.name,
                active: p.active,
                order_nr: p.order_nr,
                add_time: p.add_time,
            }));
        }

        case 'list_stages': {
            validateRequired(args, ['pipeline_id']);
            const data = await pipedriveFetch(
                `/stages?pipeline_id=${args.pipeline_id as number}`,
                token,
            ) as { data: PDStage[] | null };
            return (data.data ?? []).map(s => ({
                id: s.id,
                name: s.name,
                pipeline_id: s.pipeline_id,
                pipeline_name: s.pipeline_name,
                order_nr: s.order_nr,
                active_flag: s.active_flag,
            }));
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
                JSON.stringify({ status: 'ok', server: 'mcp-pipedrive', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-pipedrive', version: '1.0.0' },
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

        // Extract secret from header
        const token = getToken(request);

        if (!token) {
            return rpcErr(
                id,
                -32001,
                'Missing required secret — add PIPEDRIVE_API_TOKEN to workspace secrets',
            );
        }

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        try {
            const result = await callTool(toolName, args, token);
            return rpcOk(id, toolOk(result));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return rpcErr(id, -32603, msg);
        }
    },
};
