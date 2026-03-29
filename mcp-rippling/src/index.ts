/**
 * Rippling MCP Worker
 * Implements MCP protocol over HTTP for Rippling HR/IT/Finance operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   RIPPLING_API_TOKEN  → X-Mcp-Secret-RIPPLING-API-TOKEN  (Bearer token)
 *
 * Auth format: Authorization: Bearer {API_TOKEN}
 *
 * Covers: Employees (6), Organization (5), Compensation & Location (4),
 *         Users (3), Summary (2) = 20 tools total + _ping
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const RIPPLING_BASE = 'https://rest.ripplingapis.com';

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
        token: request.headers.get('X-Mcp-Secret-RIPPLING-API-TOKEN'),
    };
}

async function ripplingFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${RIPPLING_BASE}${path}`;
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
        throw { code: -32603, message: `Rippling HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        let msg = res.statusText;
        if (data && typeof data === 'object' && 'detail' in data) {
            msg = (data as { detail: string }).detail || msg;
        } else if (data && typeof data === 'object' && 'message' in data) {
            msg = (data as { message: string }).message || msg;
        }
        throw { code: -32603, message: `Rippling API error ${res.status}: ${msg}` };
    }

    return data;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
            parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
        }
    }
    return parts.length ? `?${parts.join('&')}` : '';
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Employees (6 tools) ────────────────────────────────────────

    {
        name: 'list_employees',
        description: 'List employees in Rippling. Optionally filter by employment status and expand nested fields like department and manager. Supports limit and offset pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                employment_status: {
                    type: 'string',
                    enum: ['ACTIVE', 'INACTIVE', 'TERMINATED'],
                    description: 'Filter employees by employment status (ACTIVE, INACTIVE, or TERMINATED)',
                },
                expand: {
                    type: 'string',
                    description: 'Comma-separated fields to expand (e.g. department,manager,compensation,work_location)',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of employees to return (default 20, max 100)',
                },
                offset: {
                    type: 'number',
                    description: 'Number of employees to skip for pagination (default 0)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_employee',
        description: 'Get full details of a specific employee by ID. Supports expanding nested objects like department, manager, compensation, and work_location.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Rippling employee ID',
                },
                expand: {
                    type: 'string',
                    description: 'Comma-separated fields to expand (e.g. department,manager,compensation,work_location)',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_employee_by_email',
        description: 'Find an employee by their work email address. Returns the matching employee record.',
        inputSchema: {
            type: 'object',
            properties: {
                work_email: {
                    type: 'string',
                    description: 'Employee work email address (exact match)',
                },
            },
            required: ['work_email'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_employees',
        description: 'Search employees by name keyword. Returns all employees whose name matches the search term.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name keyword to search for (first name, last name, or full name)',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results to return (default 20)',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_terminated_employees',
        description: 'List terminated employees, optionally filtered by a termination date range.',
        inputSchema: {
            type: 'object',
            properties: {
                termination_date_after: {
                    type: 'string',
                    description: 'Filter employees terminated after this date (ISO 8601, e.g. 2025-01-01)',
                },
                termination_date_before: {
                    type: 'string',
                    description: 'Filter employees terminated before this date (ISO 8601, e.g. 2025-12-31)',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results to return (default 20)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_employment_history',
        description: 'Get the full employment status history for a specific employee, including all status changes and effective dates.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Rippling employee ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Organization (5 tools) ─────────────────────────────────────

    {
        name: 'list_departments',
        description: 'List all departments in the company. Returns department id, name, and parent_department_id for building the org hierarchy.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_department',
        description: 'Get a specific department by ID including its current members list.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Rippling department ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_legal_entities',
        description: 'List all legal entities (companies/subsidiaries) registered in Rippling.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_manager_chain',
        description: 'Get the full management chain for an employee, tracing up the hierarchy to the root (CEO). Returns each manager in order.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Rippling employee ID to trace the manager chain for',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_org_chart',
        description: 'Get the full org structure — all employees with their manager IDs — for building an org chart tree. Uses expand=manager to include manager relationships.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Compensation & Location (4 tools) ───────────────────────────

    {
        name: 'get_compensation',
        description: 'Get compensation details for a specific employee including salary, currency, effective date, and payment type.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Rippling employee ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_employment_types',
        description: 'List all employment types configured in the company (e.g. FULL_TIME, PART_TIME, CONTRACTOR).',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_work_locations',
        description: 'List all company work locations including office addresses and remote location configurations.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_work_location',
        description: 'Get the work location assigned to a specific employee.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Rippling employee ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Users (3 tools) ─────────────────────────────────────────────

    {
        name: 'list_users',
        description: 'List all Rippling users (system accounts). Returns id, email, role, and status for each user.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum number of users to return (default 20)',
                },
                offset: {
                    type: 'number',
                    description: 'Number of users to skip for pagination (default 0)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user',
        description: 'Get a specific Rippling user by their user ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Rippling user ID',
                },
            },
            required: ['id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_current_user',
        description: 'Get the currently authenticated user account information. Useful for confirming auth and identifying the calling user.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 5 — Summary (2 tools) ───────────────────────────────────────────

    {
        name: 'list_apps',
        description: 'List all apps and integrations currently managed through Rippling IT (e.g. Google Workspace, Slack, GitHub).',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_headcount_by_department',
        description: 'Get a headcount breakdown by department — returns department name and the number of active employees in each department.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Ping ──────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Check connectivity and authentication by fetching the current user. Returns the current user info on success.',
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
        // ── Employees ───────────────────────────────────────────────────────────

        case 'list_employees': {
            const params: Record<string, string | number | undefined> = {
                limit: (args.limit as number) || 20,
                offset: (args.offset as number) || 0,
            };
            if (args.employment_status) params.employment_status = args.employment_status as string;
            if (args.expand) params.expand = args.expand as string;
            return ripplingFetch(`/platform/api/employees${buildQuery(params)}`, token);
        }

        case 'get_employee': {
            validateRequired(args, ['id']);
            const params: Record<string, string | number | undefined> = {};
            if (args.expand) params.expand = args.expand as string;
            return ripplingFetch(`/platform/api/employees/${args.id}${buildQuery(params)}`, token);
        }

        case 'get_employee_by_email': {
            validateRequired(args, ['work_email']);
            return ripplingFetch(
                `/platform/api/employees${buildQuery({ work_email: args.work_email as string })}`,
                token,
            );
        }

        case 'search_employees': {
            validateRequired(args, ['name']);
            const limit = (args.limit as number) || 20;
            const data = await ripplingFetch(
                `/platform/api/employees${buildQuery({ limit: 200 })}`,
                token,
            ) as { results?: unknown[]; [key: string]: unknown };
            const employees: unknown[] = Array.isArray(data)
                ? data
                : (data.results ?? []) as unknown[];
            const keyword = (args.name as string).toLowerCase();
            const filtered = employees.filter((emp: unknown) => {
                const e = emp as Record<string, unknown>;
                const fullName = [e.firstName, e.lastName, e.name].filter(Boolean).join(' ').toLowerCase();
                return fullName.includes(keyword);
            }).slice(0, limit);
            return { results: filtered, totalSize: filtered.length };
        }

        case 'list_terminated_employees': {
            const params: Record<string, string | number | undefined> = {
                employment_status: 'TERMINATED',
                limit: (args.limit as number) || 20,
            };
            if (args.termination_date_after) params.termination_date_after = args.termination_date_after as string;
            if (args.termination_date_before) params.termination_date_before = args.termination_date_before as string;
            return ripplingFetch(`/platform/api/employees${buildQuery(params)}`, token);
        }

        case 'get_employment_history': {
            validateRequired(args, ['id']);
            return ripplingFetch(`/platform/api/employees/${args.id}/employmentHistory`, token);
        }

        // ── Organization ────────────────────────────────────────────────────────

        case 'list_departments': {
            return ripplingFetch('/platform/api/departments', token);
        }

        case 'get_department': {
            validateRequired(args, ['id']);
            // Fetch department with members
            const [dept, members] = await Promise.all([
                ripplingFetch(`/platform/api/departments/${args.id}`, token),
                ripplingFetch(
                    `/platform/api/employees${buildQuery({ department: args.id as string, limit: 100 })}`,
                    token,
                ),
            ]);
            return { ...(dept as object), members };
        }

        case 'list_legal_entities': {
            return ripplingFetch('/platform/api/legal_entities', token);
        }

        case 'get_manager_chain': {
            validateRequired(args, ['id']);
            // Walk up the manager chain by repeatedly fetching manager
            const chain: unknown[] = [];
            let currentId: string = args.id as string;
            const visited = new Set<string>();
            while (currentId && !visited.has(currentId)) {
                visited.add(currentId);
                const emp = await ripplingFetch(
                    `/platform/api/employees/${currentId}${buildQuery({ expand: 'manager' })}`,
                    token,
                ) as Record<string, unknown>;
                chain.push(emp);
                const manager = emp.manager as Record<string, unknown> | undefined;
                const managerId = manager?.id as string | undefined;
                if (!managerId || managerId === currentId) break;
                currentId = managerId;
            }
            return { chain, depth: chain.length };
        }

        case 'get_org_chart': {
            return ripplingFetch(
                `/platform/api/employees${buildQuery({ expand: 'manager', limit: 500 })}`,
                token,
            );
        }

        // ── Compensation & Location ─────────────────────────────────────────────

        case 'get_compensation': {
            validateRequired(args, ['id']);
            return ripplingFetch(
                `/platform/api/employees/${args.id}${buildQuery({ expand: 'compensation' })}`,
                token,
            );
        }

        case 'list_employment_types': {
            return ripplingFetch('/platform/api/employment_types', token);
        }

        case 'list_work_locations': {
            return ripplingFetch('/platform/api/work_locations', token);
        }

        case 'get_work_location': {
            validateRequired(args, ['id']);
            return ripplingFetch(
                `/platform/api/employees/${args.id}${buildQuery({ expand: 'work_location' })}`,
                token,
            );
        }

        // ── Users ───────────────────────────────────────────────────────────────

        case 'list_users': {
            const params: Record<string, string | number | undefined> = {
                limit: (args.limit as number) || 20,
                offset: (args.offset as number) || 0,
            };
            return ripplingFetch(`/platform/api/users${buildQuery(params)}`, token);
        }

        case 'get_user': {
            validateRequired(args, ['id']);
            return ripplingFetch(`/platform/api/users/${args.id}`, token);
        }

        case 'get_current_user': {
            return ripplingFetch('/me', token);
        }

        // ── Summary ─────────────────────────────────────────────────────────────

        case 'list_apps': {
            return ripplingFetch('/platform/api/apps', token);
        }

        case 'get_headcount_by_department': {
            // Fetch all departments and active employees, then compute counts
            const [departments, employees] = await Promise.all([
                ripplingFetch('/platform/api/departments', token),
                ripplingFetch(
                    `/platform/api/employees${buildQuery({ employment_status: 'ACTIVE', limit: 500, expand: 'department' })}`,
                    token,
                ),
            ]);

            const deptList = (Array.isArray(departments) ? departments : (departments as { results?: unknown[] }).results ?? []) as Array<{
                id: string;
                name: string;
            }>;
            const empList = (Array.isArray(employees) ? employees : (employees as { results?: unknown[] }).results ?? []) as Array<
                Record<string, unknown>
            >;

            const counts = new Map<string, number>();
            for (const emp of empList) {
                const dept = emp.department as { id?: string; name?: string } | string | undefined;
                const deptId = typeof dept === 'object' ? dept?.id : dept;
                if (deptId) {
                    counts.set(deptId, (counts.get(deptId) ?? 0) + 1);
                }
            }

            const breakdown = deptList.map(d => ({
                department_id: d.id,
                department_name: d.name,
                headcount: counts.get(d.id) ?? 0,
            }));

            return { breakdown, total_active_employees: empList.length };
        }

        // ── Ping ─────────────────────────────────────────────────────────────────

        case '_ping': {
            return ripplingFetch('/me', token);
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
                JSON.stringify({ status: 'ok', server: 'mcp-rippling', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-rippling', version: '1.0.0' },
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
                return rpcErr(id, -32001, 'Missing required secret: RIPPLING_API_TOKEN (header: X-Mcp-Secret-RIPPLING-API-TOKEN)');
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
