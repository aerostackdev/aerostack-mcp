/**
 * Greenhouse MCP Worker
 * Implements MCP protocol over HTTP for Greenhouse ATS (Applicant Tracking System) operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   GREENHOUSE_API_KEY  → X-Mcp-Secret-GREENHOUSE-API-KEY  (Harvest API key)
 *
 * Auth format: Authorization: Basic base64(apiKey:) — key as username, empty password
 *
 * Covers: Jobs (5), Candidates (7), Applications & Pipeline (6), Offers & Reports (4) = 22 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const GH_BASE_URL = 'https://harvest.greenhouse.io/v1';

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
        apiKey: request.headers.get('X-Mcp-Secret-GREENHOUSE-API-KEY'),
    };
}

function basicAuthHeader(apiKey: string): string {
    const encoded = btoa(`${apiKey}:`);
    return `Basic ${encoded}`;
}

async function ghFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
    onBehalfOf?: string,
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${GH_BASE_URL}${path}`;
    const headers: Record<string, string> = {
        'Authorization': basicAuthHeader(apiKey),
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };
    if (onBehalfOf) {
        headers['On-Behalf-Of'] = onBehalfOf;
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
        throw { code: -32603, message: `Greenhouse HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'message' in data) {
            msg = (data as { message: string }).message || msg;
        } else if (data && typeof data === 'object' && 'errors' in data) {
            const errors = (data as { errors: Array<{ message: string }> }).errors;
            if (Array.isArray(errors) && errors.length > 0) {
                msg = errors.map(e => e.message).join(', ');
            }
        }
        throw { code: -32603, message: `Greenhouse API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Jobs (5 tools) ──────────────────────────────────────────────

    {
        name: 'list_jobs',
        description: 'List all jobs in Greenhouse, optionally filtered by status, department, or office. Returns id, name, status, departments, offices, and opening counts.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['open', 'closed', 'draft'],
                    description: 'Filter by job status: open, closed, or draft',
                },
                department_id: {
                    type: 'number',
                    description: 'Filter by department ID',
                },
                office_id: {
                    type: 'number',
                    description: 'Filter by office ID',
                },
                per_page: {
                    type: 'number',
                    description: 'Number of results per page (default 100, max 500)',
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
        name: 'get_job',
        description: 'Get full details of a specific job including title, status, departments, offices, hiring managers, and job posts.',
        inputSchema: {
            type: 'object',
            properties: {
                job_id: {
                    type: 'number',
                    description: 'Greenhouse job ID',
                },
            },
            required: ['job_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_job',
        description: 'Create a new job in Greenhouse. Template or name is required.',
        inputSchema: {
            type: 'object',
            properties: {
                template_job_id: {
                    type: 'number',
                    description: 'ID of a job template to copy settings from (recommended)',
                },
                name: {
                    type: 'string',
                    description: 'Job name/title',
                },
                department_id: {
                    type: 'number',
                    description: 'Department ID to assign this job to',
                },
                office_ids: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'List of office IDs for this job',
                },
                opening_count: {
                    type: 'number',
                    description: 'Number of openings for this job (default 1)',
                },
                employment_type: {
                    type: 'string',
                    enum: ['full_time', 'part_time', 'contract', 'intern'],
                    description: 'Employment type for the job',
                },
                on_behalf_of: {
                    type: 'string',
                    description: 'Greenhouse user ID to act on behalf of (required for write operations in some orgs)',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_job',
        description: 'Update fields on an existing job such as name, status, notes, and team responsibilities.',
        inputSchema: {
            type: 'object',
            properties: {
                job_id: {
                    type: 'number',
                    description: 'Greenhouse job ID to update',
                },
                name: {
                    type: 'string',
                    description: 'Updated job title/name',
                },
                status: {
                    type: 'string',
                    enum: ['open', 'closed'],
                    description: 'Updated job status',
                },
                notes: {
                    type: 'string',
                    description: 'Internal notes about this job',
                },
                team_and_responsibilities: {
                    type: 'string',
                    description: 'Team description and role responsibilities',
                },
                on_behalf_of: {
                    type: 'string',
                    description: 'Greenhouse user ID to act on behalf of',
                },
            },
            required: ['job_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_job_posts',
        description: 'Get public job posts for a specific job, including live and offline posts with their external URLs.',
        inputSchema: {
            type: 'object',
            properties: {
                job_id: {
                    type: 'number',
                    description: 'Greenhouse job ID',
                },
                live: {
                    type: 'boolean',
                    description: 'Filter to only live (published) posts (true) or offline posts (false). Omit for all.',
                },
            },
            required: ['job_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Candidates (7 tools) ────────────────────────────────────────

    {
        name: 'list_candidates',
        description: 'List candidates with optional filters. Returns name, email, applications, tags, and last activity.',
        inputSchema: {
            type: 'object',
            properties: {
                job_id: {
                    type: 'number',
                    description: 'Filter candidates by job ID',
                },
                email: {
                    type: 'string',
                    description: 'Filter candidates by email address',
                },
                created_after: {
                    type: 'string',
                    description: 'Filter candidates created after this ISO 8601 datetime (e.g. 2026-01-01T00:00:00Z)',
                },
                updated_after: {
                    type: 'string',
                    description: 'Filter candidates updated after this ISO 8601 datetime',
                },
                per_page: {
                    type: 'number',
                    description: 'Number of results per page (default 100, max 500)',
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
        name: 'get_candidate',
        description: 'Get full details of a specific candidate including name, email, phone, applications, tags, notes, and social links.',
        inputSchema: {
            type: 'object',
            properties: {
                candidate_id: {
                    type: 'number',
                    description: 'Greenhouse candidate ID',
                },
            },
            required: ['candidate_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_candidate',
        description: 'Create a new candidate in Greenhouse. First name and last name are required. Optionally apply them to a job.',
        inputSchema: {
            type: 'object',
            properties: {
                first_name: {
                    type: 'string',
                    description: 'Candidate first name (required)',
                },
                last_name: {
                    type: 'string',
                    description: 'Candidate last name (required)',
                },
                email: {
                    type: 'string',
                    description: 'Candidate email address',
                },
                phone: {
                    type: 'string',
                    description: 'Candidate phone number',
                },
                company: {
                    type: 'string',
                    description: 'Current company/employer',
                },
                title: {
                    type: 'string',
                    description: 'Current job title',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags to apply to the candidate',
                },
                social_media_addresses: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            value: { type: 'string', description: 'URL or username' },
                        },
                    },
                    description: 'Social media profile URLs (LinkedIn, Twitter, GitHub, etc.)',
                },
                job_id: {
                    type: 'number',
                    description: 'Job ID to apply this candidate to immediately',
                },
                on_behalf_of: {
                    type: 'string',
                    description: 'Greenhouse user ID to act on behalf of',
                },
            },
            required: ['first_name', 'last_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_candidate',
        description: 'Update fields on an existing candidate such as name, email, phone, company, or title.',
        inputSchema: {
            type: 'object',
            properties: {
                candidate_id: {
                    type: 'number',
                    description: 'Greenhouse candidate ID to update',
                },
                first_name: { type: 'string', description: 'Updated first name' },
                last_name: { type: 'string', description: 'Updated last name' },
                email: { type: 'string', description: 'Updated email address' },
                phone: { type: 'string', description: 'Updated phone number' },
                company: { type: 'string', description: 'Updated current company' },
                title: { type: 'string', description: 'Updated current job title' },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Updated tags list (replaces existing tags)',
                },
                on_behalf_of: {
                    type: 'string',
                    description: 'Greenhouse user ID to act on behalf of',
                },
            },
            required: ['candidate_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'add_note_to_candidate',
        description: 'Add a note to a candidate record with configurable visibility.',
        inputSchema: {
            type: 'object',
            properties: {
                candidate_id: {
                    type: 'number',
                    description: 'Greenhouse candidate ID',
                },
                body: {
                    type: 'string',
                    description: 'Text content of the note',
                },
                visibility: {
                    type: 'string',
                    enum: ['public', 'private', 'admin_only'],
                    description: 'Note visibility: public (all users), private (only note creator), admin_only',
                },
                user_id: {
                    type: 'number',
                    description: 'Greenhouse user ID of the note author',
                },
            },
            required: ['candidate_id', 'body', 'user_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'search_candidates',
        description: 'Search candidates by name or email address. Returns matching candidates with their applications.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Name or email to search for',
                },
                per_page: {
                    type: 'number',
                    description: 'Number of results per page (default 100)',
                },
            },
            required: ['query'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'merge_candidates',
        description: 'Merge duplicate candidate records. The primary candidate is kept; the duplicate is deleted after merging.',
        inputSchema: {
            type: 'object',
            properties: {
                primary_candidate_id: {
                    type: 'number',
                    description: 'ID of the candidate record to keep (primary)',
                },
                duplicate_candidate_id: {
                    type: 'number',
                    description: 'ID of the duplicate candidate record to merge and delete',
                },
                on_behalf_of: {
                    type: 'string',
                    description: 'Greenhouse user ID to act on behalf of',
                },
            },
            required: ['primary_candidate_id', 'duplicate_candidate_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 3 — Applications & Pipeline (6 tools) ───────────────────────────

    {
        name: 'list_applications',
        description: 'List applications with optional filters by job, candidate, status, or activity date.',
        inputSchema: {
            type: 'object',
            properties: {
                job_id: {
                    type: 'number',
                    description: 'Filter by job ID',
                },
                candidate_id: {
                    type: 'number',
                    description: 'Filter by candidate ID',
                },
                status: {
                    type: 'string',
                    enum: ['active', 'rejected', 'hired'],
                    description: 'Filter by application status',
                },
                last_activity_after: {
                    type: 'string',
                    description: 'Filter applications with activity after this ISO 8601 datetime',
                },
                per_page: {
                    type: 'number',
                    description: 'Number of results per page (default 100, max 500)',
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
        name: 'get_application',
        description: 'Get full details of a specific application including status, current stage, credited_to user, and associated jobs.',
        inputSchema: {
            type: 'object',
            properties: {
                application_id: {
                    type: 'number',
                    description: 'Greenhouse application ID',
                },
            },
            required: ['application_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'advance_application',
        description: 'Move an application to the next stage in the pipeline.',
        inputSchema: {
            type: 'object',
            properties: {
                application_id: {
                    type: 'number',
                    description: 'Greenhouse application ID to advance',
                },
                from_stage_id: {
                    type: 'number',
                    description: 'Current stage ID the application is in',
                },
                on_behalf_of: {
                    type: 'string',
                    description: 'Greenhouse user ID to act on behalf of',
                },
            },
            required: ['application_id', 'from_stage_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'reject_application',
        description: 'Reject an application with a rejection reason and optional notes.',
        inputSchema: {
            type: 'object',
            properties: {
                application_id: {
                    type: 'number',
                    description: 'Greenhouse application ID to reject',
                },
                rejection_reason_id: {
                    type: 'number',
                    description: 'ID of the rejection reason (get list from Greenhouse admin)',
                },
                notes: {
                    type: 'string',
                    description: 'Optional notes about the rejection decision',
                },
                on_behalf_of: {
                    type: 'string',
                    description: 'Greenhouse user ID to act on behalf of',
                },
            },
            required: ['application_id', 'rejection_reason_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'schedule_interview',
        description: 'Schedule an interview for an application, assigning interviewers and a time slot.',
        inputSchema: {
            type: 'object',
            properties: {
                application_id: {
                    type: 'number',
                    description: 'Greenhouse application ID',
                },
                interview_id: {
                    type: 'number',
                    description: 'Interview stage ID to schedule',
                },
                interviewers: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            user_id: { type: 'number', description: 'Greenhouse user ID of the interviewer' },
                        },
                        required: ['user_id'],
                    },
                    description: 'List of interviewers (array of objects with user_id)',
                },
                start: {
                    type: 'object',
                    properties: {
                        date_time: { type: 'string', description: 'Start datetime in ISO 8601 format (e.g. 2026-04-15T10:00:00Z)' },
                    },
                    required: ['date_time'],
                    description: 'Interview start time',
                },
                end: {
                    type: 'object',
                    properties: {
                        date_time: { type: 'string', description: 'End datetime in ISO 8601 format' },
                    },
                    required: ['date_time'],
                    description: 'Interview end time',
                },
                location: {
                    type: 'string',
                    description: 'Interview location or video call link',
                },
                on_behalf_of: {
                    type: 'string',
                    description: 'Greenhouse user ID to act on behalf of',
                },
            },
            required: ['application_id', 'interview_id', 'interviewers', 'start', 'end'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_scorecards',
        description: 'Get all interview scorecards submitted for a specific application.',
        inputSchema: {
            type: 'object',
            properties: {
                application_id: {
                    type: 'number',
                    description: 'Greenhouse application ID',
                },
            },
            required: ['application_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Offers & Reports (4 tools) ──────────────────────────────────

    {
        name: 'list_offers',
        description: 'List all offers for a specific application, including salary, start date, and status.',
        inputSchema: {
            type: 'object',
            properties: {
                application_id: {
                    type: 'number',
                    description: 'Greenhouse application ID',
                },
            },
            required: ['application_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_offer',
        description: 'Create an offer for an application.',
        inputSchema: {
            type: 'object',
            properties: {
                application_id: {
                    type: 'number',
                    description: 'Greenhouse application ID to create the offer for',
                },
                start_date: {
                    type: 'string',
                    description: 'Proposed start date in YYYY-MM-DD format',
                },
                salary: {
                    type: 'number',
                    description: 'Offered salary amount',
                },
                currency: {
                    type: 'string',
                    description: 'Currency code (e.g. USD, EUR, GBP)',
                },
                on_behalf_of: {
                    type: 'string',
                    description: 'Greenhouse user ID to act on behalf of',
                },
            },
            required: ['application_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'approve_offer',
        description: 'Mark an existing offer as approved in Greenhouse.',
        inputSchema: {
            type: 'object',
            properties: {
                offer_id: {
                    type: 'number',
                    description: 'Greenhouse offer ID to approve',
                },
                on_behalf_of: {
                    type: 'string',
                    description: 'Greenhouse user ID to act on behalf of',
                },
            },
            required: ['offer_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_hiring_report',
        description: 'Get a hiring activity summary report for a date range, optionally filtered by department.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: {
                    type: 'string',
                    description: 'Report start date in YYYY-MM-DD format',
                },
                end_date: {
                    type: 'string',
                    description: 'Report end date in YYYY-MM-DD format',
                },
                department_id: {
                    type: 'number',
                    description: 'Filter report by department ID',
                },
            },
            required: ['start_date', 'end_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ─────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify Greenhouse credentials by calling a lightweight read endpoint. Returns a success message if the API key is valid.',
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
        // ── Jobs ────────────────────────────────────────────────────────────────

        case 'list_jobs': {
            const params = new URLSearchParams();
            if (args.status) params.set('status', args.status as string);
            if (args.department_id) params.set('department_id', String(args.department_id));
            if (args.office_id) params.set('office_id', String(args.office_id));
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            const qs = params.toString();
            return ghFetch(`/jobs${qs ? '?' + qs : ''}`, apiKey);
        }

        case 'get_job': {
            validateRequired(args, ['job_id']);
            return ghFetch(`/jobs/${args.job_id}`, apiKey);
        }

        case 'create_job': {
            validateRequired(args, ['name']);
            const body: Record<string, unknown> = {};
            if (args.template_job_id !== undefined) body.template_job_id = args.template_job_id;
            if (args.name !== undefined) body.name = args.name;
            if (args.department_id !== undefined) body.department_id = args.department_id;
            if (args.office_ids !== undefined) body.office_ids = args.office_ids;
            if (args.opening_count !== undefined) body.opening_count = args.opening_count;
            if (args.employment_type !== undefined) body.employment_type = args.employment_type;
            return ghFetch('/jobs', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            }, args.on_behalf_of as string | undefined);
        }

        case 'update_job': {
            validateRequired(args, ['job_id']);
            const { job_id, on_behalf_of, ...rest } = args;
            const body: Record<string, unknown> = {};
            for (const key of ['name', 'status', 'notes', 'team_and_responsibilities']) {
                if (rest[key] !== undefined) body[key] = rest[key];
            }
            return ghFetch(`/jobs/${job_id}`, apiKey, {
                method: 'PATCH',
                body: JSON.stringify(body),
            }, on_behalf_of as string | undefined);
        }

        case 'list_job_posts': {
            validateRequired(args, ['job_id']);
            const params = new URLSearchParams();
            if (args.live !== undefined) params.set('live', String(args.live));
            const qs = params.toString();
            return ghFetch(`/jobs/${args.job_id}/job_posts${qs ? '?' + qs : ''}`, apiKey);
        }

        // ── Candidates ──────────────────────────────────────────────────────────

        case 'list_candidates': {
            const params = new URLSearchParams();
            if (args.job_id) params.set('job_id', String(args.job_id));
            if (args.email) params.set('email', args.email as string);
            if (args.created_after) params.set('created_after', args.created_after as string);
            if (args.updated_after) params.set('updated_after', args.updated_after as string);
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            const qs = params.toString();
            return ghFetch(`/candidates${qs ? '?' + qs : ''}`, apiKey);
        }

        case 'get_candidate': {
            validateRequired(args, ['candidate_id']);
            return ghFetch(`/candidates/${args.candidate_id}`, apiKey);
        }

        case 'create_candidate': {
            validateRequired(args, ['first_name', 'last_name']);
            const body: Record<string, unknown> = {
                first_name: args.first_name,
                last_name: args.last_name,
            };
            if (args.email !== undefined) body.email_addresses = [{ value: args.email, type: 'personal' }];
            if (args.phone !== undefined) body.phone_numbers = [{ value: args.phone, type: 'mobile' }];
            if (args.company !== undefined) body.company = args.company;
            if (args.title !== undefined) body.title = args.title;
            if (args.tags !== undefined) body.tags = args.tags;
            if (args.social_media_addresses !== undefined) body.social_media_addresses = args.social_media_addresses;
            if (args.job_id !== undefined) {
                body.applications = [{ job_id: args.job_id }];
            }
            return ghFetch('/candidates', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            }, args.on_behalf_of as string | undefined);
        }

        case 'update_candidate': {
            validateRequired(args, ['candidate_id']);
            const { candidate_id, on_behalf_of, ...rest } = args;
            const body: Record<string, unknown> = {};
            if (rest.first_name !== undefined) body.first_name = rest.first_name;
            if (rest.last_name !== undefined) body.last_name = rest.last_name;
            if (rest.email !== undefined) body.email_addresses = [{ value: rest.email, type: 'personal' }];
            if (rest.phone !== undefined) body.phone_numbers = [{ value: rest.phone, type: 'mobile' }];
            if (rest.company !== undefined) body.company = rest.company;
            if (rest.title !== undefined) body.title = rest.title;
            if (rest.tags !== undefined) body.tags = rest.tags;
            return ghFetch(`/candidates/${candidate_id}`, apiKey, {
                method: 'PATCH',
                body: JSON.stringify(body),
            }, on_behalf_of as string | undefined);
        }

        case 'add_note_to_candidate': {
            validateRequired(args, ['candidate_id', 'body', 'user_id']);
            const noteBody: Record<string, unknown> = {
                user_id: args.user_id,
                body: args.body,
                visibility: args.visibility || 'public',
            };
            return ghFetch(`/candidates/${args.candidate_id}/activity_feed/notes`, apiKey, {
                method: 'POST',
                body: JSON.stringify(noteBody),
            });
        }

        case 'search_candidates': {
            validateRequired(args, ['query']);
            const params = new URLSearchParams();
            params.set('query', args.query as string);
            if (args.per_page) params.set('per_page', String(args.per_page));
            return ghFetch(`/candidates?${params.toString()}`, apiKey);
        }

        case 'merge_candidates': {
            validateRequired(args, ['primary_candidate_id', 'duplicate_candidate_id']);
            return ghFetch(`/candidates/${args.primary_candidate_id}/merge`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ duplicate_candidate_id: args.duplicate_candidate_id }),
            }, args.on_behalf_of as string | undefined);
        }

        // ── Applications & Pipeline ─────────────────────────────────────────────

        case 'list_applications': {
            const params = new URLSearchParams();
            if (args.job_id) params.set('job_id', String(args.job_id));
            if (args.candidate_id) params.set('candidate_id', String(args.candidate_id));
            if (args.status) params.set('status', args.status as string);
            if (args.last_activity_after) params.set('last_activity_after', args.last_activity_after as string);
            if (args.per_page) params.set('per_page', String(args.per_page));
            if (args.page) params.set('page', String(args.page));
            const qs = params.toString();
            return ghFetch(`/applications${qs ? '?' + qs : ''}`, apiKey);
        }

        case 'get_application': {
            validateRequired(args, ['application_id']);
            return ghFetch(`/applications/${args.application_id}`, apiKey);
        }

        case 'advance_application': {
            validateRequired(args, ['application_id', 'from_stage_id']);
            return ghFetch(`/applications/${args.application_id}/advance`, apiKey, {
                method: 'POST',
                body: JSON.stringify({ from_stage_id: args.from_stage_id }),
            }, args.on_behalf_of as string | undefined);
        }

        case 'reject_application': {
            validateRequired(args, ['application_id', 'rejection_reason_id']);
            const body: Record<string, unknown> = {
                rejection_reason_id: args.rejection_reason_id,
            };
            if (args.notes !== undefined) body.notes = args.notes;
            return ghFetch(`/applications/${args.application_id}/reject`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            }, args.on_behalf_of as string | undefined);
        }

        case 'schedule_interview': {
            validateRequired(args, ['application_id', 'interview_id', 'interviewers', 'start', 'end']);
            const body: Record<string, unknown> = {
                interview_id: args.interview_id,
                interviewers: args.interviewers,
                start: args.start,
                end: args.end,
            };
            if (args.location !== undefined) body.location = args.location;
            return ghFetch(`/applications/${args.application_id}/interviews`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            }, args.on_behalf_of as string | undefined);
        }

        case 'get_scorecards': {
            validateRequired(args, ['application_id']);
            return ghFetch(`/applications/${args.application_id}/scorecards`, apiKey);
        }

        // ── Offers & Reports ────────────────────────────────────────────────────

        case 'list_offers': {
            validateRequired(args, ['application_id']);
            return ghFetch(`/applications/${args.application_id}/offers`, apiKey);
        }

        case 'create_offer': {
            validateRequired(args, ['application_id']);
            const body: Record<string, unknown> = {};
            if (args.start_date !== undefined) body.start_date = args.start_date;
            if (args.salary !== undefined) body.salary = args.salary;
            if (args.currency !== undefined) body.currency = args.currency;
            return ghFetch(`/applications/${args.application_id}/offers`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            }, args.on_behalf_of as string | undefined);
        }

        case 'approve_offer': {
            validateRequired(args, ['offer_id']);
            return ghFetch(`/offers/${args.offer_id}`, apiKey, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'approved' }),
            }, args.on_behalf_of as string | undefined);
        }

        case 'get_hiring_report': {
            validateRequired(args, ['start_date', 'end_date']);
            const params = new URLSearchParams();
            params.set('start_date', args.start_date as string);
            params.set('end_date', args.end_date as string);
            if (args.department_id) params.set('department_id', String(args.department_id));
            return ghFetch(`/reports/offers_extended_and_accepted?${params.toString()}`, apiKey);
        }

        // ── Ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            const data = await ghFetch('/users?per_page=1', apiKey);
            return { ok: true, message: 'Greenhouse credentials valid', sample: data };
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
                JSON.stringify({ status: 'ok', server: 'mcp-greenhouse', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-greenhouse', version: '1.0.0' },
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
                return rpcErr(id, -32001, 'Missing required secret: GREENHOUSE_API_KEY (header: X-Mcp-Secret-GREENHOUSE-API-KEY)');
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
