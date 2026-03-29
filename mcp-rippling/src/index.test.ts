import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_TOKEN = 'test_rippling_api_token_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockEmployee = {
    id: 'emp_001',
    firstName: 'Jane',
    lastName: 'Smith',
    workEmail: 'jane.smith@acmecorp.com',
    employmentStatus: 'ACTIVE',
    department: { id: 'dept_001', name: 'Engineering' },
    manager: { id: 'emp_002', firstName: 'Bob', lastName: 'Manager' },
};

const mockEmployee2 = {
    id: 'emp_002',
    firstName: 'Bob',
    lastName: 'Manager',
    workEmail: 'bob.manager@acmecorp.com',
    employmentStatus: 'ACTIVE',
    department: { id: 'dept_001', name: 'Engineering' },
    manager: null,
};

const mockTerminatedEmployee = {
    id: 'emp_099',
    firstName: 'Alice',
    lastName: 'Former',
    workEmail: 'alice.former@acmecorp.com',
    employmentStatus: 'TERMINATED',
    terminationDate: '2025-12-31',
};

const mockDepartment = {
    id: 'dept_001',
    name: 'Engineering',
    parent_department_id: null,
};

const mockDepartment2 = {
    id: 'dept_002',
    name: 'Sales',
    parent_department_id: null,
};

const mockUser = {
    id: 'user_001',
    email: 'jane.smith@acmecorp.com',
    role: 'ADMIN',
    status: 'ACTIVE',
};

const mockMe = {
    id: 'user_001',
    email: 'jane.smith@acmecorp.com',
    companyId: 'company_123',
};

const mockApp = {
    id: 'app_001',
    name: 'Google Workspace',
    status: 'ACTIVE',
};

const mockLegalEntity = {
    id: 'le_001',
    name: 'Acme Corp Inc.',
    ein: '12-3456789',
};

const mockWorkLocation = {
    id: 'wl_001',
    name: 'San Francisco HQ',
    type: 'OFFICE',
    address: '101 Market St, San Francisco, CA',
};

const mockCompensation = {
    id: 'comp_001',
    employeeId: 'emp_001',
    amount: 120000,
    currency: 'USD',
    paymentType: 'SALARY',
    effectiveDate: '2025-01-01',
};

const mockEmploymentHistory = [
    { status: 'ACTIVE', effectiveDate: '2024-01-01' },
    { status: 'INACTIVE', effectiveDate: '2023-06-01' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function apiErr(message: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ detail: message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('token')) {
        headers['X-Mcp-Secret-RIPPLING-API-TOKEN'] = API_TOKEN;
    }
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingSecrets);
}

async function callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    const req = makeToolReq(toolName, args, missingSecrets);
    const res = await worker.fetch(req);
    return res.json() as Promise<{
        jsonrpc: string;
        id: number;
        result?: { content: [{ type: string; text: string }] };
        error?: { code: number; message: string };
    }>;
}

async function getToolResult(toolName: string, args: Record<string, unknown> = {}) {
    const body = await callTool(toolName, args);
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    return JSON.parse(body.result!.content[0].text);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-rippling and tools count', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-rippling');
        expect(body.tools).toBe(21); // 20 tools + _ping
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json{{{',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { protocolVersion: string; serverInfo: { name: string } }
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-rippling');
    });

    it('tools/list returns 21 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools).toHaveLength(21);
        for (const tool of body.result.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
        }
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq('unknown/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing token returns -32001 with RIPPLING_API_TOKEN in message', async () => {
        const body = await callTool('list_employees', {}, ['token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('RIPPLING_API_TOKEN');
    });

    it('Authorization header uses Bearer token format', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockEmployee] }));
        await callTool('list_employees', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${API_TOKEN}`);
    });

    it('API error response surfaces error message', async () => {
        mockFetch.mockReturnValueOnce(apiErr('Unauthorized', 401));
        const body = await callTool('list_employees', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('401');
    });
});

// ── Employees ─────────────────────────────────────────────────────────────────

describe('list_employees', () => {
    it('returns list of employees with results', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockEmployee, mockEmployee2] }));
        const result = await getToolResult('list_employees', {});
        expect(result.results).toHaveLength(2);
        expect(result.results[0].id).toBe('emp_001');
    });

    it('passes employment_status filter in query', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockEmployee] }));
        await callTool('list_employees', { employment_status: 'ACTIVE' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('employment_status=ACTIVE');
    });

    it('passes expand param in query', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockEmployee] }));
        await callTool('list_employees', { expand: 'department,manager' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('expand=');
        expect(url).toContain('department');
    });

    it('passes limit and offset params', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [] }));
        await callTool('list_employees', { limit: 10, offset: 20 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('limit=10');
        expect(url).toContain('offset=20');
    });
});

describe('get_employee', () => {
    it('fetches specific employee by id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockEmployee));
        const result = await getToolResult('get_employee', { id: 'emp_001' });
        expect(result.id).toBe('emp_001');
        expect(result.firstName).toBe('Jane');
    });

    it('builds correct URL with employee id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockEmployee));
        await callTool('get_employee', { id: 'emp_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/employees/emp_001');
    });

    it('passes expand param when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockEmployee, compensation: mockCompensation }));
        await callTool('get_employee', { id: 'emp_001', expand: 'compensation' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('expand=compensation');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_employee', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('get_employee_by_email', () => {
    it('returns employees filtered by work_email', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockEmployee] }));
        const result = await getToolResult('get_employee_by_email', { work_email: 'jane.smith@acmecorp.com' });
        expect(result.results[0].workEmail).toBe('jane.smith@acmecorp.com');
    });

    it('includes work_email in query string', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockEmployee] }));
        await callTool('get_employee_by_email', { work_email: 'jane@test.com' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('work_email=');
        expect(url).toContain('jane');
    });

    it('missing work_email returns validation error', async () => {
        const body = await callTool('get_employee_by_email', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('work_email');
    });
});

describe('search_employees', () => {
    it('filters employees by name keyword', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockEmployee, mockEmployee2]));
        const result = await getToolResult('search_employees', { name: 'Jane' });
        expect(result.results).toHaveLength(1);
        expect(result.results[0].firstName).toBe('Jane');
    });

    it('returns empty results when no match', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockEmployee, mockEmployee2]));
        const result = await getToolResult('search_employees', { name: 'Zephyr' });
        expect(result.results).toHaveLength(0);
        expect(result.totalSize).toBe(0);
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('search_employees', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('list_terminated_employees', () => {
    it('includes TERMINATED status filter in URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockTerminatedEmployee] }));
        await callTool('list_terminated_employees', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('employment_status=TERMINATED');
    });

    it('passes termination date filters when provided', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockTerminatedEmployee] }));
        await callTool('list_terminated_employees', {
            termination_date_after: '2025-01-01',
            termination_date_before: '2025-12-31',
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('termination_date_after=2025-01-01');
        expect(url).toContain('termination_date_before=2025-12-31');
    });
});

describe('get_employment_history', () => {
    it('fetches employment history for employee', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockEmploymentHistory));
        const result = await getToolResult('get_employment_history', { id: 'emp_001' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].status).toBe('ACTIVE');
    });

    it('builds correct URL with employmentHistory path', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockEmploymentHistory));
        await callTool('get_employment_history', { id: 'emp_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/employees/emp_001/employmentHistory');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_employment_history', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Organization ──────────────────────────────────────────────────────────────

describe('list_departments', () => {
    it('returns all departments', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockDepartment, mockDepartment2]));
        const result = await getToolResult('list_departments', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('Engineering');
    });

    it('calls /departments endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk([]));
        await callTool('list_departments', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/departments');
    });
});

describe('get_department', () => {
    it('returns department with member list', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockDepartment));
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockEmployee] }));
        const result = await getToolResult('get_department', { id: 'dept_001' });
        expect(result.id).toBe('dept_001');
        expect(result.members).toBeDefined();
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_department', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('list_legal_entities', () => {
    it('returns legal entities', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockLegalEntity]));
        const result = await getToolResult('list_legal_entities', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].name).toBe('Acme Corp Inc.');
    });

    it('calls /legal_entities endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk([]));
        await callTool('list_legal_entities', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/legal_entities');
    });
});

describe('get_manager_chain', () => {
    it('builds manager chain walking up hierarchy', async () => {
        // emp_001 → manager is emp_002 → emp_002 has no manager
        mockFetch.mockReturnValueOnce(apiOk({ ...mockEmployee, id: 'emp_001', manager: { id: 'emp_002' } }));
        mockFetch.mockReturnValueOnce(apiOk({ ...mockEmployee2, id: 'emp_002', manager: null }));
        const result = await getToolResult('get_manager_chain', { id: 'emp_001' });
        expect(result.chain).toBeDefined();
        expect(result.chain.length).toBeGreaterThanOrEqual(1);
        expect(result.depth).toBe(result.chain.length);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_manager_chain', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('get_org_chart', () => {
    it('returns employees with manager expand', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockEmployee, mockEmployee2] }));
        const result = await getToolResult('get_org_chart', {});
        expect(result.results).toBeDefined();
        expect(result.results).toHaveLength(2);
    });

    it('includes expand=manager in URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [] }));
        await callTool('get_org_chart', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('expand=manager');
    });
});

// ── Compensation & Location ───────────────────────────────────────────────────

describe('get_compensation', () => {
    it('returns employee with compensation expanded', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockEmployee, compensation: mockCompensation }));
        const result = await getToolResult('get_compensation', { id: 'emp_001' });
        expect(result.compensation).toBeDefined();
        expect(result.compensation.amount).toBe(120000);
    });

    it('includes expand=compensation in URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockEmployee, compensation: mockCompensation }));
        await callTool('get_compensation', { id: 'emp_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('expand=compensation');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_compensation', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('list_employment_types', () => {
    it('returns employment types', async () => {
        mockFetch.mockReturnValueOnce(apiOk([{ id: 'et_001', name: 'FULL_TIME' }]));
        const result = await getToolResult('list_employment_types', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].name).toBe('FULL_TIME');
    });
});

describe('list_work_locations', () => {
    it('returns work locations', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockWorkLocation]));
        const result = await getToolResult('list_work_locations', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].name).toBe('San Francisco HQ');
    });
});

describe('get_work_location', () => {
    it('returns employee with work_location expanded', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockEmployee, work_location: mockWorkLocation }));
        const result = await getToolResult('get_work_location', { id: 'emp_001' });
        expect(result.work_location).toBeDefined();
        expect(result.work_location.name).toBe('San Francisco HQ');
    });

    it('includes expand=work_location in URL', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ ...mockEmployee, work_location: mockWorkLocation }));
        await callTool('get_work_location', { id: 'emp_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('expand=work_location');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_work_location', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Users ─────────────────────────────────────────────────────────────────────

describe('list_users', () => {
    it('returns list of users', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [mockUser] }));
        const result = await getToolResult('list_users', {});
        expect(result.results[0].email).toBe('jane.smith@acmecorp.com');
    });

    it('passes limit and offset params', async () => {
        mockFetch.mockReturnValueOnce(apiOk({ results: [] }));
        await callTool('list_users', { limit: 5, offset: 10 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('limit=5');
        expect(url).toContain('offset=10');
    });
});

describe('get_user', () => {
    it('fetches user by id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUser));
        const result = await getToolResult('get_user', { id: 'user_001' });
        expect(result.id).toBe('user_001');
        expect(result.role).toBe('ADMIN');
    });

    it('builds correct URL with user id', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockUser));
        await callTool('get_user', { id: 'user_001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/users/user_001');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_user', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('get_current_user', () => {
    it('calls /me endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMe));
        await callTool('get_current_user', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/me');
    });

    it('returns current user data', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMe));
        const result = await getToolResult('get_current_user', {});
        expect(result.id).toBe('user_001');
        expect(result.companyId).toBe('company_123');
    });
});

// ── Summary ───────────────────────────────────────────────────────────────────

describe('list_apps', () => {
    it('returns list of apps', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockApp]));
        const result = await getToolResult('list_apps', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].name).toBe('Google Workspace');
    });

    it('calls /apps endpoint', async () => {
        mockFetch.mockReturnValueOnce(apiOk([]));
        await callTool('list_apps', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/apps');
    });
});

describe('get_headcount_by_department', () => {
    it('returns headcount breakdown by department', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockDepartment, mockDepartment2]));
        mockFetch.mockReturnValueOnce(apiOk([
            { ...mockEmployee, department: { id: 'dept_001' } },
            { ...mockEmployee2, department: { id: 'dept_001' } },
        ]));
        const result = await getToolResult('get_headcount_by_department', {});
        expect(result.breakdown).toBeDefined();
        const engDept = result.breakdown.find((d: { department_id: string; headcount: number }) => d.department_id === 'dept_001');
        expect(engDept.headcount).toBe(2);
        const salesDept = result.breakdown.find((d: { department_id: string; headcount: number }) => d.department_id === 'dept_002');
        expect(salesDept.headcount).toBe(0);
    });

    it('returns total_active_employees count', async () => {
        mockFetch.mockReturnValueOnce(apiOk([mockDepartment]));
        mockFetch.mockReturnValueOnce(apiOk([mockEmployee]));
        const result = await getToolResult('get_headcount_by_department', {});
        expect(result.total_active_employees).toBe(1);
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('calls /me endpoint for ping', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMe));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/me');
    });

    it('returns current user data on success', async () => {
        mockFetch.mockReturnValueOnce(apiOk(mockMe));
        const result = await getToolResult('_ping', {});
        expect(result.id).toBeDefined();
    });
});

// ── Unknown tool ──────────────────────────────────────────────────────────────

describe('Unknown tool', () => {
    it('returns -32601 for unknown tool name', async () => {
        const body = await callTool('non_existent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
        expect(body.error!.message).toContain('non_existent_tool');
    });
});
