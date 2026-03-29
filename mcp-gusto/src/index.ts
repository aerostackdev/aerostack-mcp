/**
 * Gusto MCP Worker
 * Implements MCP protocol over HTTP for Gusto HR & Payroll operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   GUSTO_ACCESS_TOKEN  → X-Mcp-Secret-GUSTO-ACCESS-TOKEN  (OAuth 2.0 Bearer token)
 *   GUSTO_COMPANY_ID    → X-Mcp-Secret-GUSTO-COMPANY-ID    (Company UUID)
 *
 * Auth format: Authorization: Bearer {token}
 * Rate limit: 200 req/min — 429 handled gracefully
 *
 * Covers: Employees (6), Payroll (5), Company (4), Benefits (4), Reports & Misc (3) = 22 tools total
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const GUSTO_API_BASE = 'https://api.gusto.com/v1';

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

function getSecrets(request: Request): { token: string | null; companyId: string | null } {
    return {
        token: request.headers.get('X-Mcp-Secret-GUSTO-ACCESS-TOKEN'),
        companyId: request.headers.get('X-Mcp-Secret-GUSTO-COMPANY-ID'),
    };
}

async function gustoFetch(
    path: string,
    token: string,
    options: RequestInit = {},
): Promise<unknown> {
    const url = path.startsWith('http') ? path : `${GUSTO_API_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        },
    });

    // Handle 429 rate limit gracefully
    if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') || '60';
        throw { code: -32603, message: `Gusto rate limit exceeded. Retry after ${retryAfter} seconds.` };
    }

    if (res.status === 204) return {};

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw { code: -32603, message: `Gusto HTTP ${res.status}: ${text}` };
    }

    if (!res.ok) {
        const errData = data as {
            message?: string;
            errors?: Record<string, string[]>;
            error_type?: string;
        };
        let msg = errData?.message || res.statusText;
        if (errData?.errors) {
            const firstKey = Object.keys(errData.errors)[0];
            if (firstKey) msg = `${firstKey}: ${errData.errors[firstKey][0]}`;
        }
        throw { code: -32603, message: `Gusto API error ${res.status}: ${msg}` };
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Employees (6 tools) ─────────────────────────────────────────

    {
        name: 'list_employees',
        description: 'List all employees for the company. Optionally include jobs, compensations, home address, and custom fields. Excludes terminated employees by default.',
        inputSchema: {
            type: 'object',
            properties: {
                include: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['jobs', 'compensations', 'home_address', 'custom_fields'],
                    },
                    description: 'Additional data to include with each employee (optional)',
                },
                terminated: {
                    type: 'boolean',
                    description: 'Include terminated employees (default: false)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_employee',
        description: 'Get full profile of a specific employee by ID: name, email, SSN last 4, start date, department.',
        inputSchema: {
            type: 'object',
            properties: {
                employee_id: {
                    type: 'string',
                    description: 'Employee UUID',
                },
                include: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Extra relations to include (e.g. jobs, home_address, custom_fields)',
                },
            },
            required: ['employee_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_employee',
        description: 'Create a new employee in Gusto. First name, last name, email, date of birth, start date, and job details are required.',
        inputSchema: {
            type: 'object',
            properties: {
                first_name: { type: 'string', description: 'Employee first name (required)' },
                last_name: { type: 'string', description: 'Employee last name (required)' },
                email: { type: 'string', description: 'Employee personal email address (required)' },
                date_of_birth: { type: 'string', description: 'Date of birth in YYYY-MM-DD format (required)' },
                start_date: { type: 'string', description: 'Employment start date in YYYY-MM-DD format (required)' },
                job_title: { type: 'string', description: 'Job title (required)' },
                rate: { type: 'string', description: 'Compensation rate as a string number (required, e.g. "75000.00")' },
                payment_unit: {
                    type: 'string',
                    enum: ['Hour', 'Week', 'Month', 'Year', 'Paycheck'],
                    description: 'Compensation payment unit (required)',
                },
            },
            required: ['first_name', 'last_name', 'email', 'date_of_birth', 'start_date', 'job_title', 'rate', 'payment_unit'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_employee',
        description: 'Update fields on an existing employee. Provide only the fields you want to change.',
        inputSchema: {
            type: 'object',
            properties: {
                employee_id: { type: 'string', description: 'Employee UUID (required)' },
                first_name: { type: 'string', description: 'Updated first name' },
                last_name: { type: 'string', description: 'Updated last name' },
                email: { type: 'string', description: 'Updated email address' },
                date_of_birth: { type: 'string', description: 'Updated date of birth (YYYY-MM-DD)' },
            },
            required: ['employee_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_employee_time_off',
        description: 'Get time off activities (accruals, usages, adjustments) for a specific employee.',
        inputSchema: {
            type: 'object',
            properties: {
                employee_id: {
                    type: 'string',
                    description: 'Employee UUID',
                },
            },
            required: ['employee_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_employee_pay_stubs',
        description: 'Get pay stubs for a specific employee. Optionally filter by year.',
        inputSchema: {
            type: 'object',
            properties: {
                employee_id: {
                    type: 'string',
                    description: 'Employee UUID',
                },
                year: {
                    type: 'number',
                    description: 'Filter by year (e.g. 2025). Returns stubs from all years if omitted.',
                },
            },
            required: ['employee_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Payroll (5 tools) ────────────────────────────────────────────

    {
        name: 'list_payrolls',
        description: 'List payrolls for the company. Filter by processed status, off-cycle, and date range.',
        inputSchema: {
            type: 'object',
            properties: {
                processed: {
                    type: 'boolean',
                    description: 'Filter by processed status. Omit to return both processed and unprocessed.',
                },
                include_off_cycle: {
                    type: 'boolean',
                    description: 'Include off-cycle payrolls (default: false)',
                },
                start_date: {
                    type: 'string',
                    description: 'Start of date range in YYYY-MM-DD format',
                },
                end_date: {
                    type: 'string',
                    description: 'End of date range in YYYY-MM-DD format',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_payroll',
        description: 'Get a payroll by ID including employee compensations, earnings, deductions, and taxes.',
        inputSchema: {
            type: 'object',
            properties: {
                payroll_id: {
                    type: 'string',
                    description: 'Payroll UUID',
                },
            },
            required: ['payroll_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_payroll_summary',
        description: 'Get a payroll summary report for a date range showing totals for wages, taxes, and deductions.',
        inputSchema: {
            type: 'object',
            properties: {
                start_date: {
                    type: 'string',
                    description: 'Start date for the payroll report in YYYY-MM-DD format (required)',
                },
                end_date: {
                    type: 'string',
                    description: 'End date for the payroll report in YYYY-MM-DD format (required)',
                },
            },
            required: ['start_date', 'end_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_pay_schedules',
        description: 'List pay schedules for the company (weekly, biweekly, semimonthly, monthly).',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_tax_liabilities',
        description: 'Get tax liabilities for the company — federal, state, and local taxes owed.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 3 — Company (4 tools) ────────────────────────────────────────────

    {
        name: 'get_company',
        description: 'Get company details: name, EIN, entity type, primary address, and locations.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_locations',
        description: 'List all work locations for the company with address, city, state, and zip.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_departments',
        description: 'List all departments in the company with employee counts.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_company_bank_accounts',
        description: 'List company bank accounts used for payroll deposits.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 4 — Benefits (4 tools) ──────────────────────────────────────────

    {
        name: 'list_benefits',
        description: 'List all supported benefit types available in Gusto (health, dental, vision, 401k, FSA, etc.).',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_company_benefits',
        description: 'List benefits currently offered by the company including employee deduction and company contribution amounts.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_company_benefit',
        description: 'Get details of a specific company benefit plan by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                company_benefit_id: {
                    type: 'string',
                    description: 'Company benefit UUID',
                },
            },
            required: ['company_benefit_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_employee_benefits',
        description: 'List all benefits an employee is currently enrolled in.',
        inputSchema: {
            type: 'object',
            properties: {
                employee_id: {
                    type: 'string',
                    description: 'Employee UUID',
                },
            },
            required: ['employee_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 5 — Reports & Misc (3 tools) ─────────────────────────────────────

    {
        name: 'list_contractors',
        description: 'List all contractors for the company. Optionally include compensation details.',
        inputSchema: {
            type: 'object',
            properties: {
                include: {
                    type: 'array',
                    items: { type: 'string', enum: ['compensations'] },
                    description: 'Additional data to include (e.g. ["compensations"])',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_earning_types',
        description: 'List custom earning types defined for the company (e.g. bonuses, commissions, overtime).',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_current_user',
        description: 'Get the authenticated user\'s profile and the list of companies they have access to.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── _ping ──────────────────────────────────────────────────────────────────

    {
        name: '_ping',
        description: 'Validate Gusto credentials by fetching current user info. Returns companies list to confirm access.',
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
    companyId: string,
): Promise<unknown> {
    switch (name) {
        // ── Employees ───────────────────────────────────────────────────────────

        case 'list_employees': {
            const params = new URLSearchParams();
            if (args.terminated !== undefined) params.set('terminated', String(args.terminated));
            if (args.include && Array.isArray(args.include) && args.include.length > 0) {
                params.set('include', (args.include as string[]).join(','));
            }
            const qs = params.toString() ? `?${params.toString()}` : '';
            return gustoFetch(`/companies/${companyId}/employees${qs}`, token);
        }

        case 'get_employee': {
            validateRequired(args, ['employee_id']);
            const params = new URLSearchParams();
            if (args.include && Array.isArray(args.include) && args.include.length > 0) {
                params.set('include', (args.include as string[]).join(','));
            }
            const qs = params.toString() ? `?${params.toString()}` : '';
            return gustoFetch(`/employees/${args.employee_id}${qs}`, token);
        }

        case 'create_employee': {
            validateRequired(args, ['first_name', 'last_name', 'email', 'date_of_birth', 'start_date', 'job_title', 'rate', 'payment_unit']);
            return gustoFetch(`/companies/${companyId}/employees`, token, {
                method: 'POST',
                body: JSON.stringify({
                    first_name: args.first_name,
                    last_name: args.last_name,
                    email: args.email,
                    date_of_birth: args.date_of_birth,
                    start_date: args.start_date,
                    jobs: [{
                        title: args.job_title,
                        primary: true,
                        compensations: [{
                            rate: args.rate,
                            payment_unit: args.payment_unit,
                            effective_date: args.start_date,
                        }],
                    }],
                }),
            });
        }

        case 'update_employee': {
            validateRequired(args, ['employee_id']);
            const body: Record<string, unknown> = {};
            for (const key of ['first_name', 'last_name', 'email', 'date_of_birth']) {
                if (args[key] !== undefined) body[key] = args[key];
            }
            return gustoFetch(`/employees/${args.employee_id}`, token, {
                method: 'PUT',
                body: JSON.stringify(body),
            });
        }

        case 'list_employee_time_off': {
            validateRequired(args, ['employee_id']);
            return gustoFetch(`/employees/${args.employee_id}/time_off_activities`, token);
        }

        case 'get_employee_pay_stubs': {
            validateRequired(args, ['employee_id']);
            const params = new URLSearchParams();
            if (args.year !== undefined) params.set('year', String(args.year));
            const qs = params.toString() ? `?${params.toString()}` : '';
            return gustoFetch(`/employees/${args.employee_id}/pay_stubs${qs}`, token);
        }

        // ── Payroll ─────────────────────────────────────────────────────────────

        case 'list_payrolls': {
            const params = new URLSearchParams();
            if (args.processed !== undefined) params.set('processed', String(args.processed));
            if (args.include_off_cycle !== undefined) params.set('include_off_cycle', String(args.include_off_cycle));
            if (args.start_date) params.set('start_date', args.start_date as string);
            if (args.end_date) params.set('end_date', args.end_date as string);
            const qs = params.toString() ? `?${params.toString()}` : '';
            return gustoFetch(`/companies/${companyId}/payrolls${qs}`, token);
        }

        case 'get_payroll': {
            validateRequired(args, ['payroll_id']);
            return gustoFetch(
                `/companies/${companyId}/payrolls/${args.payroll_id}?include=employee_compensations`,
                token,
            );
        }

        case 'get_payroll_summary': {
            validateRequired(args, ['start_date', 'end_date']);
            return gustoFetch(
                `/companies/${companyId}/payrolls/summary?start_date=${encodeURIComponent(args.start_date as string)}&end_date=${encodeURIComponent(args.end_date as string)}`,
                token,
            );
        }

        case 'list_pay_schedules': {
            return gustoFetch(`/companies/${companyId}/pay_schedules`, token);
        }

        case 'get_tax_liabilities': {
            return gustoFetch(`/companies/${companyId}/tax_liabilities`, token);
        }

        // ── Company ─────────────────────────────────────────────────────────────

        case 'get_company': {
            return gustoFetch(`/companies/${companyId}`, token);
        }

        case 'list_locations': {
            return gustoFetch(`/companies/${companyId}/locations`, token);
        }

        case 'list_departments': {
            return gustoFetch(`/companies/${companyId}/departments`, token);
        }

        case 'list_company_bank_accounts': {
            return gustoFetch(`/companies/${companyId}/bank_accounts`, token);
        }

        // ── Benefits ────────────────────────────────────────────────────────────

        case 'list_benefits': {
            return gustoFetch('/benefits', token);
        }

        case 'list_company_benefits': {
            return gustoFetch(`/companies/${companyId}/company_benefits`, token);
        }

        case 'get_company_benefit': {
            validateRequired(args, ['company_benefit_id']);
            return gustoFetch(`/companies/${companyId}/company_benefits/${args.company_benefit_id}`, token);
        }

        case 'list_employee_benefits': {
            validateRequired(args, ['employee_id']);
            return gustoFetch(`/employees/${args.employee_id}/employee_benefits`, token);
        }

        // ── Reports & Misc ──────────────────────────────────────────────────────

        case 'list_contractors': {
            const params = new URLSearchParams();
            if (args.include && Array.isArray(args.include) && args.include.length > 0) {
                params.set('include', (args.include as string[]).join(','));
            }
            const qs = params.toString() ? `?${params.toString()}` : '';
            return gustoFetch(`/companies/${companyId}/contractors${qs}`, token);
        }

        case 'list_earning_types': {
            return gustoFetch(`/companies/${companyId}/earning_types`, token);
        }

        case 'get_current_user': {
            return gustoFetch('/me', token);
        }

        // ── Ping ────────────────────────────────────────────────────────────────

        case '_ping': {
            return gustoFetch('/me', token);
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
                JSON.stringify({ status: 'ok', server: 'mcp-gusto', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-gusto', version: '1.0.0' },
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
            const { token, companyId } = getSecrets(request);
            if (!token || !companyId) {
                const missing = [];
                if (!token) missing.push('GUSTO_ACCESS_TOKEN (header: X-Mcp-Secret-GUSTO-ACCESS-TOKEN)');
                if (!companyId) missing.push('GUSTO_COMPANY_ID (header: X-Mcp-Secret-GUSTO-COMPANY-ID)');
                return rpcErr(id, -32001, `Missing required secrets: ${missing.join(', ')}`);
            }

            try {
                const result = await callTool(toolName, args, token, companyId);
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
