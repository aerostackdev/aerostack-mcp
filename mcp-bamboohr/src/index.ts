/**
 * BambooHR MCP Worker
 * Implements MCP protocol over HTTP for BambooHR HR operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   BAMBOOHR_API_KEY    → X-Mcp-Secret-BAMBOOHR-API-KEY    (BambooHR API key)
 *   BAMBOOHR_SUBDOMAIN  → X-Mcp-Secret-BAMBOOHR-SUBDOMAIN  (Company subdomain, e.g. "mycompany")
 *
 * Auth format: Authorization: Basic base64(apiKey:x)
 *              Accept: application/json
 *
 * Covers: Employees (7), Time Off (5), Jobs & Org (5),
 *         Reports & Custom Fields (5) = 22 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBDOMAIN_PATTERN = /^[a-zA-Z0-9-]+$/;

function bhrBase(subdomain: string): string {
    if (!SUBDOMAIN_PATTERN.test(subdomain)) {
        throw { code: -32600, message: 'BAMBOOHR_SUBDOMAIN must contain only alphanumeric characters and hyphens' };
    }
    return `https://api.bamboohr.com/api/gateway.php/${subdomain}/v1`;
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

function getSecrets(request: Request): { apiKey: string | null; subdomain: string | null } {
    return {
        apiKey: request.headers.get('X-Mcp-Secret-BAMBOOHR-API-KEY'),
        subdomain: request.headers.get('X-Mcp-Secret-BAMBOOHR-SUBDOMAIN'),
    };
}

function basicAuth(apiKey: string): string {
    // BambooHR uses apiKey as username, 'x' as password
    const credentials = `${apiKey}:x`;
    return `Basic ${btoa(credentials)}`;
}

async function bhrFetch(
    subdomain: string,
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${bhrBase(subdomain)}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': basicAuth(apiKey),
            'Accept': 'application/json',
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
        throw { code: -32603, message: `BambooHR HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object') {
            const errData = data as { errors?: Array<{ error?: string }>; error?: string; message?: string };
            if (errData.errors?.[0]?.error) msg = errData.errors[0].error;
            else if (errData.error) msg = errData.error;
            else if (errData.message) msg = errData.message;
        }
        throw { code: -32603, message: `BambooHR API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Employees (7 tools) ─────────────────────────────────────────

    {
        name: 'list_employees',
        description: 'List all employees in BambooHR with key fields: id, firstName, lastName, jobTitle, department, workEmail, status, hireDate, location.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['Active', 'Inactive'],
                    description: 'Filter by employment status (omit for all employees)',
                },
                department: {
                    type: 'string',
                    description: 'Filter by department name (partial match supported)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_employee',
        description: 'Get full details of a specific employee by ID. Returns all fields or a specific set of fields if requested.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'BambooHR employee ID (required)',
                },
                fields: {
                    type: 'string',
                    description: 'Comma-separated list of fields to return (e.g. "firstName,lastName,jobTitle,department,workEmail,hireDate,location,supervisor"). Omit for all fields.',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_employee',
        description: 'Create a new employee record in BambooHR. firstName and lastName are required.',
        inputSchema: {
            type: 'object',
            properties: {
                first_name: { type: 'string', description: 'Employee first name (required)' },
                last_name: { type: 'string', description: 'Employee last name (required)' },
                work_email: { type: 'string', description: 'Work email address' },
                hire_date: { type: 'string', description: 'Hire date in YYYY-MM-DD format' },
                department: { type: 'string', description: 'Department name' },
                job_title: { type: 'string', description: 'Job title' },
                location: { type: 'string', description: 'Office location' },
            },
            required: ['first_name', 'last_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_employee',
        description: 'Update fields on an existing employee record. Provide only the fields to change.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'BambooHR employee ID (required)' },
                job_title: { type: 'string', description: 'Updated job title' },
                department: { type: 'string', description: 'Updated department' },
                supervisor_id: { type: 'string', description: 'Updated supervisor employee ID' },
                location: { type: 'string', description: 'Updated office location' },
                work_email: { type: 'string', description: 'Updated work email address' },
                mobile_phone: { type: 'string', description: 'Updated mobile phone number' },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_employee_photo',
        description: 'Get the profile photo URL for a specific employee.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'BambooHR employee ID (required)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_employees',
        description: 'Search employees by name (first or last) or department. Returns matching employee records.',
        inputSchema: {
            type: 'object',
            properties: {
                search: {
                    type: 'string',
                    description: 'Search term — matched against employee names and department (required)',
                },
            },
            required: ['search'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_employee_files',
        description: 'List files uploaded for a specific employee (performance reviews, contracts, etc.).',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'BambooHR employee ID (required)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Time Off (5 tools) ──────────────────────────────────────────

    {
        name: 'list_time_off_requests',
        description: 'List time off requests, optionally filtered by status, date range, or employee ID.',
        inputSchema: {
            type: 'object',
            properties: {
                employee_id: {
                    type: 'string',
                    description: 'Filter by employee ID (optional — omit for all employees)',
                },
                status: {
                    type: 'string',
                    enum: ['approved', 'denied', 'requested', 'canceled'],
                    description: 'Filter by request status',
                },
                start: {
                    type: 'string',
                    description: 'Filter requests starting on or after this date (YYYY-MM-DD)',
                },
                end: {
                    type: 'string',
                    description: 'Filter requests ending on or before this date (YYYY-MM-DD)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_time_off_request',
        description: 'Get details of a specific time off request by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Time off request ID (required)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_time_off_request',
        description: 'Create a time off request for an employee. employeeId, type, start, and end are required.',
        inputSchema: {
            type: 'object',
            properties: {
                employee_id: {
                    type: 'string',
                    description: 'BambooHR employee ID (required)',
                },
                time_off_type_id: {
                    type: 'number',
                    description: 'Time off type ID from BambooHR (required)',
                },
                start: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format (required)',
                },
                end: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format (required)',
                },
                note: {
                    type: 'string',
                    description: 'Optional note or reason for the time off request',
                },
                status: {
                    type: 'string',
                    enum: ['requested', 'approved'],
                    description: 'Initial status of the request (default: requested)',
                },
            },
            required: ['employee_id', 'time_off_type_id', 'start', 'end'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'approve_time_off',
        description: 'Approve a pending time off request.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Time off request ID to approve (required)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'deny_time_off',
        description: 'Deny a time off request with an optional note explaining the reason.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Time off request ID to deny (required)',
                },
                note: {
                    type: 'string',
                    description: 'Reason for denial (optional but recommended)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 3 — Jobs & Org (5 tools) ────────────────────────────────────────

    {
        name: 'list_job_openings',
        description: 'List open job requisitions/postings in BambooHR.',
        inputSchema: {
            type: 'object',
            properties: {
                status_groups: {
                    type: 'string',
                    description: 'Filter by status group (e.g. "Open", "On Hold", "Filled"). Omit for all.',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_org_chart',
        description: 'Get the organizational chart data showing the manager/direct-report hierarchy.',
        inputSchema: {
            type: 'object',
            properties: {
                employee_id: {
                    type: 'string',
                    description: 'Root employee ID to retrieve hierarchy from (optional — omit for full org chart)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_departments',
        description: 'List all departments defined in BambooHR.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_locations',
        description: 'List all office locations defined in BambooHR.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_who_is_out',
        description: 'Get a list of employees who are out of the office today or during a specified date range.',
        inputSchema: {
            type: 'object',
            properties: {
                start: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format (defaults to today)',
                },
                end: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format (defaults to today)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Reports & Custom Fields (5 tools) ───────────────────────────

    {
        name: 'get_company_report',
        description: 'Run a standard BambooHR report by report ID. Returns the report data in JSON format.',
        inputSchema: {
            type: 'object',
            properties: {
                report_id: {
                    type: 'string',
                    description: 'BambooHR report ID (required). Use "custom" for custom reports.',
                },
                fields: {
                    type: 'string',
                    description: 'Comma-separated list of fields to include in the report',
                },
                filters: {
                    type: 'object',
                    description: 'Key-value filter pairs (e.g. { "lastChanged": "2026-01-01" })',
                },
            },
            required: ['report_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_custom_fields',
        description: 'List all custom fields defined in BambooHR for employee records.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_employee_custom_field',
        description: 'Get the value of a specific custom field for an employee.',
        inputSchema: {
            type: 'object',
            properties: {
                employee_id: {
                    type: 'string',
                    description: 'BambooHR employee ID (required)',
                },
                field_id: {
                    type: 'string',
                    description: 'Custom field ID (required)',
                },
            },
            required: ['employee_id', 'field_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_custom_field',
        description: 'Update a custom field value for an employee.',
        inputSchema: {
            type: 'object',
            properties: {
                employee_id: {
                    type: 'string',
                    description: 'BambooHR employee ID (required)',
                },
                field_id: {
                    type: 'string',
                    description: 'Custom field ID (required)',
                },
                value: {
                    type: 'string',
                    description: 'New value for the custom field (required)',
                },
            },
            required: ['employee_id', 'field_id', 'value'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_benefits_summary',
        description: 'Get a benefits enrollment summary for the company, showing plan enrollments and coverage.',
        inputSchema: {
            type: 'object',
            properties: {
                year: {
                    type: 'number',
                    description: 'Plan year to retrieve (defaults to current year)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ──────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Verify BambooHR credentials are valid. Calls GET /meta/users/ with Basic auth.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Default employee fields ────────────────────────────────────────────────────

const DEFAULT_EMPLOYEE_FIELDS = [
    'id', 'firstName', 'lastName', 'jobTitle', 'department',
    'workEmail', 'status', 'hireDate', 'location', 'supervisor',
    'mobilePhone', 'workPhone', 'gender', 'dateOfBirth',
].join(',');

// ── Tool execution ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
    subdomain: string,
): Promise<unknown> {
    switch (name) {
        // ── Employees ────────────────────────────────────────────────────────────

        case 'list_employees': {
            const fields = DEFAULT_EMPLOYEE_FIELDS;
            const params = new URLSearchParams({ fields });
            if (args.status) params.set('status', args.status as string);
            const result = await bhrFetch(subdomain, `/employees/directory?${params}`, apiKey) as {
                employees: Array<Record<string, unknown>>;
                fields: unknown[];
            };

            // Apply department filter client-side if provided (BambooHR directory doesn't support it natively)
            if (args.department && result.employees) {
                const deptFilter = (args.department as string).toLowerCase();
                result.employees = result.employees.filter(
                    (e) => typeof e.department === 'string' && e.department.toLowerCase().includes(deptFilter),
                );
            }
            return result;
        }

        case 'get_employee': {
            validateRequired(args, ['id']);
            const fields = (args.fields as string) || DEFAULT_EMPLOYEE_FIELDS;
            const params = new URLSearchParams({ fields });
            return bhrFetch(subdomain, `/employees/${args.id}?${params}`, apiKey);
        }

        case 'create_employee': {
            validateRequired(args, ['first_name', 'last_name']);
            const body: Record<string, string> = {
                firstName: args.first_name as string,
                lastName: args.last_name as string,
            };
            if (args.work_email) body.workEmail = args.work_email as string;
            if (args.hire_date) body.hireDate = args.hire_date as string;
            if (args.department) body.department = args.department as string;
            if (args.job_title) body.jobTitle = args.job_title as string;
            if (args.location) body.location = args.location as string;
            return bhrFetch(subdomain, '/employees/', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'update_employee': {
            validateRequired(args, ['id']);
            const body: Record<string, string> = {};
            if (args.job_title) body.jobTitle = args.job_title as string;
            if (args.department) body.department = args.department as string;
            if (args.supervisor_id) body.supervisorId = args.supervisor_id as string;
            if (args.location) body.location = args.location as string;
            if (args.work_email) body.workEmail = args.work_email as string;
            if (args.mobile_phone) body.mobilePhone = args.mobile_phone as string;
            return bhrFetch(subdomain, `/employees/${args.id}`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_employee_photo': {
            validateRequired(args, ['id']);
            // Returns the photo URL metadata
            return {
                employee_id: args.id,
                photo_url: `${bhrBase(subdomain)}/employees/${args.id}/photo/original`,
                thumbnail_url: `${bhrBase(subdomain)}/employees/${args.id}/photo/small`,
            };
        }

        case 'search_employees': {
            validateRequired(args, ['search']);
            const searchTerm = (args.search as string).toLowerCase();
            // BambooHR doesn't have a native search endpoint — use directory and filter
            const result = await bhrFetch(subdomain, `/employees/directory?fields=${DEFAULT_EMPLOYEE_FIELDS}`, apiKey) as {
                employees: Array<Record<string, unknown>>;
            };
            if (result.employees) {
                result.employees = result.employees.filter((e) => {
                    const fullName = `${e.firstName ?? ''} ${e.lastName ?? ''}`.toLowerCase();
                    const dept = typeof e.department === 'string' ? e.department.toLowerCase() : '';
                    return fullName.includes(searchTerm) || dept.includes(searchTerm);
                });
            }
            return result;
        }

        case 'get_employee_files': {
            validateRequired(args, ['id']);
            return bhrFetch(subdomain, `/employees/${args.id}/files/view/`, apiKey);
        }

        // ── Time Off ─────────────────────────────────────────────────────────────

        case 'list_time_off_requests': {
            const params = new URLSearchParams();
            if (args.start) params.set('start', args.start as string);
            if (args.end) params.set('end', args.end as string);
            if (args.status) params.set('status', args.status as string);
            if (args.employee_id) {
                // Use employee-specific endpoint
                const qs = params.toString() ? `?${params}` : '';
                return bhrFetch(subdomain, `/employees/${args.employee_id}/timeoff/requests/${qs}`, apiKey);
            }
            const qs = params.toString() ? `?${params}` : '';
            return bhrFetch(subdomain, `/time_off/requests/${qs}`, apiKey);
        }

        case 'get_time_off_request': {
            validateRequired(args, ['id']);
            return bhrFetch(subdomain, `/time_off/requests/?id=${args.id}`, apiKey);
        }

        case 'create_time_off_request': {
            validateRequired(args, ['employee_id', 'time_off_type_id', 'start', 'end']);
            const body: Record<string, unknown> = {
                status: (args.status as string) || 'requested',
                start: args.start,
                end: args.end,
                timeOffTypeId: args.time_off_type_id,
                ...(args.note ? { note: args.note } : {}),
            };
            return bhrFetch(subdomain, `/employees/${args.employee_id}/timeoff/request`, apiKey, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'approve_time_off': {
            validateRequired(args, ['id']);
            return bhrFetch(subdomain, `/time_off/requests/${args.id}/status`, apiKey, {
                method: 'PUT',
                body: JSON.stringify({ status: 'approved', note: '' }),
            });
        }

        case 'deny_time_off': {
            validateRequired(args, ['id']);
            return bhrFetch(subdomain, `/time_off/requests/${args.id}/status`, apiKey, {
                method: 'PUT',
                body: JSON.stringify({ status: 'denied', note: (args.note as string) || '' }),
            });
        }

        // ── Jobs & Org ───────────────────────────────────────────────────────────

        case 'list_job_openings': {
            const params = new URLSearchParams();
            if (args.status_groups) params.set('statusGroups', args.status_groups as string);
            const qs = params.toString() ? `?${params}` : '';
            return bhrFetch(subdomain, `/applicant_tracking/jobs${qs}`, apiKey);
        }

        case 'get_org_chart': {
            // BambooHR returns org chart data via the employee hierarchy
            if (args.employee_id) {
                const params = new URLSearchParams({
                    fields: 'id,firstName,lastName,jobTitle,department,supervisorId',
                });
                // Get all employees and build hierarchy client-side
                const result = await bhrFetch(subdomain, `/employees/directory?${params}`, apiKey) as {
                    employees: Array<{ id: string; supervisorId?: string }>;
                };
                // Find direct reports for the root employee
                const rootId = args.employee_id as string;
                const buildTree = (id: string, employees: Array<{ id: string; supervisorId?: string }>): unknown => {
                    const emp = employees.find((e) => e.id === id);
                    if (!emp) return null;
                    const reports = employees.filter((e) => e.supervisorId === id);
                    return { ...emp, directReports: reports.map((r) => buildTree(r.id, employees)) };
                };
                return { orgChart: buildTree(rootId, result.employees || []) };
            }
            const params = new URLSearchParams({
                fields: 'id,firstName,lastName,jobTitle,department,supervisorId',
            });
            return bhrFetch(subdomain, `/employees/directory?${params}`, apiKey);
        }

        case 'list_departments': {
            return bhrFetch(subdomain, '/meta/lists/department', apiKey);
        }

        case 'list_locations': {
            return bhrFetch(subdomain, '/meta/lists/location', apiKey);
        }

        case 'get_who_is_out': {
            const today = new Date().toISOString().split('T')[0];
            const start = (args.start as string) || today;
            const end = (args.end as string) || today;
            const params = new URLSearchParams({ start, end });
            return bhrFetch(subdomain, `/time_off/whos_out?${params}`, apiKey);
        }

        // ── Reports & Custom Fields ──────────────────────────────────────────────

        case 'get_company_report': {
            validateRequired(args, ['report_id']);
            let path = `/reports/${args.report_id}?format=json`;
            if (args.fields) path += `&fields=${encodeURIComponent(args.fields as string)}`;
            if (args.filters && typeof args.filters === 'object') {
                const filters = args.filters as Record<string, string>;
                for (const [key, value] of Object.entries(filters)) {
                    path += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
                }
            }
            return bhrFetch(subdomain, path, apiKey);
        }

        case 'list_custom_fields': {
            return bhrFetch(subdomain, '/meta/fields/', apiKey);
        }

        case 'get_employee_custom_field': {
            validateRequired(args, ['employee_id', 'field_id']);
            const params = new URLSearchParams({ fields: args.field_id as string });
            return bhrFetch(subdomain, `/employees/${args.employee_id}?${params}`, apiKey);
        }

        case 'update_custom_field': {
            validateRequired(args, ['employee_id', 'field_id', 'value']);
            const body: Record<string, unknown> = {
                [args.field_id as string]: args.value,
            };
            return bhrFetch(subdomain, `/employees/${args.employee_id}`, apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            });
        }

        case 'get_benefits_summary': {
            const year = (args.year as number) || new Date().getFullYear();
            return bhrFetch(subdomain, `/benefits/plan_coverages?benefitYear=${year}`, apiKey);
        }

        // ── _ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            return bhrFetch(subdomain, '/meta/users/', apiKey);
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
                JSON.stringify({ status: 'ok', server: 'mcp-bamboohr', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-bamboohr', version: '1.0.0' },
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
            const { apiKey, subdomain } = getSecrets(request);
            if (!apiKey || !subdomain) {
                const missing = [];
                if (!apiKey) missing.push('BAMBOOHR_API_KEY (header: X-Mcp-Secret-BAMBOOHR-API-KEY)');
                if (!subdomain) missing.push('BAMBOOHR_SUBDOMAIN (header: X-Mcp-Secret-BAMBOOHR-SUBDOMAIN)');
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                const result = await callTool(toolName, args, apiKey, subdomain);
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
