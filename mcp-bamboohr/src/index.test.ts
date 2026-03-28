import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_KEY = 'test_bamboohr_api_key_abc123';
const SUBDOMAIN = 'testcompany';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockEmployee = {
    id: '123',
    firstName: 'Jane',
    lastName: 'Smith',
    jobTitle: 'Software Engineer',
    department: 'Engineering',
    workEmail: 'jane.smith@company.com',
    status: 'Active',
    hireDate: '2023-01-15',
    location: 'San Francisco',
    supervisor: 'Bob Manager',
    mobilePhone: '+1-555-100-2000',
};

const mockEmployee2 = {
    id: '124',
    firstName: 'John',
    lastName: 'Doe',
    jobTitle: 'Product Manager',
    department: 'Product',
    workEmail: 'john.doe@company.com',
    status: 'Active',
    hireDate: '2022-06-01',
    location: 'New York',
    supervisor: 'Jane Smith',
};

const mockEmployeeDirectory = {
    fields: [
        { id: 'id', name: 'Employee #' },
        { id: 'firstName', name: 'First Name' },
        { id: 'lastName', name: 'Last Name' },
    ],
    employees: [mockEmployee, mockEmployee2],
};

const mockTimeOffRequest = {
    id: '500',
    employeeId: '123',
    status: { id: 'approved', lastChanged: '2026-03-20', lastChangedByUserId: '1' },
    name: 'Jane Smith',
    start: '2026-04-01',
    end: '2026-04-05',
    created: '2026-03-15',
    type: { id: '1', name: 'Vacation' },
    amount: { unit: 'days', amount: '5' },
    notes: { employee: 'Family vacation', manager: '' },
};

const mockJobOpening = {
    id: '10',
    title: 'Senior Software Engineer',
    status: 'Open',
    department: { id: '1', label: 'Engineering' },
    location: { id: '1', label: 'San Francisco' },
    employmentStatus: { id: '1', label: 'Full-Time' },
    openDate: '2026-03-01',
    applicationCount: 12,
};

const mockDepartments = {
    fieldId: 'department',
    manageable: 'yes',
    multiple: 'no',
    options: [
        { id: '1', archived: 'no', createdDate: '2020-01-01', archivedDate: '', name: 'Engineering' },
        { id: '2', archived: 'no', createdDate: '2020-01-01', archivedDate: '', name: 'Product' },
        { id: '3', archived: 'no', createdDate: '2020-01-01', archivedDate: '', name: 'Sales' },
    ],
};

const mockLocations = {
    fieldId: 'location',
    manageable: 'yes',
    multiple: 'no',
    options: [
        { id: '1', archived: 'no', name: 'San Francisco' },
        { id: '2', archived: 'no', name: 'New York' },
        { id: '3', archived: 'no', name: 'Remote' },
    ],
};

const mockWhoIsOut = [
    {
        id: '500',
        type: 'timeOff',
        employeeId: '123',
        name: 'Jane Smith',
        start: '2026-04-01',
        end: '2026-04-05',
    },
];

const mockMetaFields = [
    { id: '1234', name: 'Custom Text Field', type: 'text', alias: '' },
    { id: '1235', name: 'T-Shirt Size', type: 'list', alias: '' },
];

const mockUsers = [
    { id: '1', email: 'admin@company.com', role: 'Admin', firstName: 'Admin', lastName: 'User' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function bhrOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function bhrErr(data: unknown, status = 400) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function bhrOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('apiKey')) {
        headers['X-Mcp-Secret-BAMBOOHR-API-KEY'] = API_KEY;
    }
    if (!missingSecrets.includes('subdomain')) {
        headers['X-Mcp-Secret-BAMBOOHR-SUBDOMAIN'] = SUBDOMAIN;
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
    it('GET / returns status ok with server mcp-bamboohr and tools 23', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-bamboohr');
        expect(body.tools).toBe(23);
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
        expect(body.result.serverInfo.name).toBe('mcp-bamboohr');
    });

    it('tools/list returns exactly 23 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools).toHaveLength(23);
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
    it('missing apiKey returns -32001 with BAMBOOHR_API_KEY in message', async () => {
        const body = await callTool('list_employees', {}, ['apiKey']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('BAMBOOHR_API_KEY');
    });

    it('missing subdomain returns -32001 with BAMBOOHR_SUBDOMAIN in message', async () => {
        const body = await callTool('list_employees', {}, ['subdomain']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('BAMBOOHR_SUBDOMAIN');
    });

    it('missing both secrets returns -32001', async () => {
        const body = await callTool('list_employees', {}, ['apiKey', 'subdomain']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('Authorization header uses Basic auth format with apiKey:x', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployeeDirectory));
        await callTool('list_employees', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        const expectedBase64 = btoa(`${API_KEY}:x`);
        expect(headers['Authorization']).toBe(`Basic ${expectedBase64}`);
    });

    it('Accept header is application/json', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployeeDirectory));
        await callTool('list_employees', {});
        const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
        expect(headers['Accept']).toBe('application/json');
    });

    it('URL includes the subdomain', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployeeDirectory));
        await callTool('list_employees', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(SUBDOMAIN);
    });
});

// ── Employees ─────────────────────────────────────────────────────────────────

describe('list_employees', () => {
    it('returns employee directory with employees array', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployeeDirectory));
        const result = await getToolResult('list_employees', {});
        expect(result.employees).toHaveLength(2);
        expect(result.employees[0].firstName).toBe('Jane');
    });

    it('fetches from /employees/directory endpoint', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployeeDirectory));
        await callTool('list_employees', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/employees/directory');
    });

    it('filters by department client-side when department provided', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployeeDirectory));
        const result = await getToolResult('list_employees', { department: 'Engineering' });
        expect(result.employees).toHaveLength(1);
        expect(result.employees[0].department).toBe('Engineering');
    });

    it('applies status filter in query params', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployeeDirectory));
        await callTool('list_employees', { status: 'Active' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=Active');
    });
});

describe('get_employee', () => {
    it('returns employee object with all fields', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployee));
        const result = await getToolResult('get_employee', { id: '123' });
        expect(result.id).toBe('123');
        expect(result.firstName).toBe('Jane');
        expect(result.jobTitle).toBe('Software Engineer');
    });

    it('fetches from /employees/{id} with fields param', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployee));
        await callTool('get_employee', { id: '123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/employees/123');
        expect(url).toContain('fields=');
    });

    it('uses custom fields when provided', async () => {
        mockFetch.mockReturnValueOnce(bhrOk({ id: '123', firstName: 'Jane', department: 'Engineering' }));
        await callTool('get_employee', { id: '123', fields: 'firstName,department' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('fields=firstName%2Cdepartment');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_employee', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_employee', () => {
    it('returns created employee with id', async () => {
        mockFetch.mockReturnValueOnce(bhrOk({ id: '125' }, 201));
        const result = await getToolResult('create_employee', {
            first_name: 'Alice',
            last_name: 'Johnson',
            work_email: 'alice.johnson@company.com',
        });
        expect(result.id).toBe('125');
    });

    it('sends POST to /employees/ with firstName and lastName', async () => {
        mockFetch.mockReturnValueOnce(bhrOk({ id: '126' }));
        await callTool('create_employee', {
            first_name: 'Bob',
            last_name: 'Williams',
            job_title: 'Designer',
            department: 'Design',
            hire_date: '2026-04-01',
        });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/employees/');
        const body = JSON.parse(call[1].body as string) as Record<string, string>;
        expect(body.firstName).toBe('Bob');
        expect(body.lastName).toBe('Williams');
        expect(body.jobTitle).toBe('Designer');
        expect(body.hireDate).toBe('2026-04-01');
    });

    it('missing first_name returns validation error', async () => {
        const body = await callTool('create_employee', { last_name: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('first_name');
    });

    it('missing last_name returns validation error', async () => {
        const body = await callTool('create_employee', { first_name: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('last_name');
    });
});

describe('update_employee', () => {
    it('sends POST to /employees/{id} with provided fields', async () => {
        mockFetch.mockReturnValueOnce(bhrOk204());
        const result = await getToolResult('update_employee', {
            id: '123',
            job_title: 'Senior Software Engineer',
            department: 'Engineering',
        });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/employees/123');
        const body = JSON.parse(call[1].body as string) as Record<string, string>;
        expect(body.jobTitle).toBe('Senior Software Engineer');
        expect(body.department).toBe('Engineering');
    });

    it('only sends provided fields', async () => {
        mockFetch.mockReturnValueOnce(bhrOk204());
        await callTool('update_employee', { id: '123', job_title: 'Lead Engineer' });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
        expect(body.jobTitle).toBe('Lead Engineer');
        expect(body.department).toBeUndefined();
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('update_employee', { job_title: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('get_employee_photo', () => {
    it('returns photo and thumbnail URLs for employee', async () => {
        const result = await getToolResult('get_employee_photo', { id: '123' });
        expect(result.employee_id).toBe('123');
        expect(result.photo_url).toContain('/employees/123/photo/original');
        expect(result.thumbnail_url).toContain('/employees/123/photo/small');
        expect(result.photo_url).toContain(SUBDOMAIN);
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_employee_photo', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('search_employees', () => {
    it('filters employees by name match', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployeeDirectory));
        const result = await getToolResult('search_employees', { search: 'jane' });
        expect(result.employees).toHaveLength(1);
        expect(result.employees[0].firstName).toBe('Jane');
    });

    it('filters employees by department match', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployeeDirectory));
        const result = await getToolResult('search_employees', { search: 'product' });
        expect(result.employees).toHaveLength(1);
        expect(result.employees[0].department).toBe('Product');
    });

    it('returns empty array when no matches', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployeeDirectory));
        const result = await getToolResult('search_employees', { search: 'nonexistent' });
        expect(result.employees).toHaveLength(0);
    });

    it('missing search returns validation error', async () => {
        const body = await callTool('search_employees', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('search');
    });
});

describe('get_employee_files', () => {
    it('fetches from /employees/{id}/files/view/', async () => {
        const mockFiles = { employee: { id: '123', displayName: 'Jane Smith' }, categories: [] };
        mockFetch.mockReturnValueOnce(bhrOk(mockFiles));
        const result = await getToolResult('get_employee_files', { id: '123' });
        expect(result.employee.id).toBe('123');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/employees/123/files/view/');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_employee_files', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Time Off ──────────────────────────────────────────────────────────────────

describe('list_time_off_requests', () => {
    it('returns time off requests array', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([mockTimeOffRequest]));
        const result = await getToolResult('list_time_off_requests', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe('500');
    });

    it('uses employee-specific endpoint when employee_id provided', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([mockTimeOffRequest]));
        await callTool('list_time_off_requests', { employee_id: '123' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/employees/123/timeoff/requests/');
    });

    it('uses general endpoint without employee_id', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([mockTimeOffRequest]));
        await callTool('list_time_off_requests', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/time_off/requests/');
    });

    it('applies status filter in query string', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([]));
        await callTool('list_time_off_requests', { status: 'approved' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=approved');
    });

    it('applies date range filters', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([]));
        await callTool('list_time_off_requests', { start: '2026-04-01', end: '2026-04-30' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('start=2026-04-01');
        expect(url).toContain('end=2026-04-30');
    });
});

describe('get_time_off_request', () => {
    it('returns time off request by id', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([mockTimeOffRequest]));
        const result = await getToolResult('get_time_off_request', { id: '500' });
        expect(Array.isArray(result)).toBe(true);
    });

    it('fetches with id query param', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([mockTimeOffRequest]));
        await callTool('get_time_off_request', { id: '500' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('id=500');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('get_time_off_request', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('create_time_off_request', () => {
    it('returns created time off request', async () => {
        mockFetch.mockReturnValueOnce(bhrOk({ id: '501' }));
        const result = await getToolResult('create_time_off_request', {
            employee_id: '123',
            time_off_type_id: 1,
            start: '2026-05-01',
            end: '2026-05-05',
            note: 'Vacation',
        });
        expect(result.id).toBe('501');
    });

    it('sends PUT to /employees/{id}/timeoff/request', async () => {
        mockFetch.mockReturnValueOnce(bhrOk({ id: '502' }));
        await callTool('create_time_off_request', {
            employee_id: '123',
            time_off_type_id: 1,
            start: '2026-05-01',
            end: '2026-05-05',
        });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
        expect(call[0] as string).toContain('/employees/123/timeoff/request');
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(body.timeOffTypeId).toBe(1);
        expect(body.start).toBe('2026-05-01');
        expect(body.status).toBe('requested');
    });

    it('missing employee_id returns validation error', async () => {
        const body = await callTool('create_time_off_request', {
            time_off_type_id: 1,
            start: '2026-05-01',
            end: '2026-05-05',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('employee_id');
    });

    it('missing time_off_type_id returns validation error', async () => {
        const body = await callTool('create_time_off_request', {
            employee_id: '123',
            start: '2026-05-01',
            end: '2026-05-05',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('time_off_type_id');
    });
});

describe('approve_time_off', () => {
    it('sends PUT with approved status to /time_off/requests/{id}/status', async () => {
        mockFetch.mockReturnValueOnce(bhrOk204());
        const result = await getToolResult('approve_time_off', { id: '500' });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
        expect(call[0] as string).toContain('/time_off/requests/500/status');
        const body = JSON.parse(call[1].body as string) as { status: string };
        expect(body.status).toBe('approved');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('approve_time_off', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

describe('deny_time_off', () => {
    it('sends PUT with denied status and note', async () => {
        mockFetch.mockReturnValueOnce(bhrOk204());
        await callTool('deny_time_off', { id: '500', note: 'Team at capacity during that week' });
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('PUT');
        expect(call[0] as string).toContain('/time_off/requests/500/status');
        const body = JSON.parse(call[1].body as string) as { status: string; note: string };
        expect(body.status).toBe('denied');
        expect(body.note).toBe('Team at capacity during that week');
    });

    it('sends empty note when not provided', async () => {
        mockFetch.mockReturnValueOnce(bhrOk204());
        await callTool('deny_time_off', { id: '500' });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { note: string };
        expect(body.note).toBe('');
    });

    it('missing id returns validation error', async () => {
        const body = await callTool('deny_time_off', { note: 'Reason' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('id');
    });
});

// ── Jobs & Org ────────────────────────────────────────────────────────────────

describe('list_job_openings', () => {
    it('returns job openings array', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([mockJobOpening]));
        const result = await getToolResult('list_job_openings', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].title).toBe('Senior Software Engineer');
    });

    it('fetches from /applicant_tracking/jobs', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([]));
        await callTool('list_job_openings', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/applicant_tracking/jobs');
    });

    it('appends statusGroups filter when provided', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([]));
        await callTool('list_job_openings', { status_groups: 'Open' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('statusGroups=Open');
    });
});

describe('get_org_chart', () => {
    it('returns directory data when no employee_id', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockEmployeeDirectory));
        const result = await getToolResult('get_org_chart', {});
        expect(result.employees).toBeDefined();
    });

    it('builds hierarchical org chart when employee_id provided', async () => {
        const hierarchyData = {
            employees: [
                { id: '123', firstName: 'Jane', lastName: 'Smith', supervisorId: '' },
                { id: '124', firstName: 'John', lastName: 'Doe', supervisorId: '123' },
                { id: '125', firstName: 'Bob', lastName: 'Brown', supervisorId: '123' },
            ],
        };
        mockFetch.mockReturnValueOnce(bhrOk(hierarchyData));
        const result = await getToolResult('get_org_chart', { employee_id: '123' });
        expect(result.orgChart).toBeDefined();
        expect(result.orgChart.id).toBe('123');
        expect(result.orgChart.directReports).toHaveLength(2);
    });
});

describe('list_departments', () => {
    it('returns departments list', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockDepartments));
        const result = await getToolResult('list_departments', {});
        expect(result.options).toHaveLength(3);
        expect(result.options[0].name).toBe('Engineering');
    });

    it('fetches from /meta/lists/department', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockDepartments));
        await callTool('list_departments', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/meta/lists/department');
    });
});

describe('list_locations', () => {
    it('returns locations list', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockLocations));
        const result = await getToolResult('list_locations', {});
        expect(result.options).toHaveLength(3);
        expect(result.options[0].name).toBe('San Francisco');
    });

    it('fetches from /meta/lists/location', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockLocations));
        await callTool('list_locations', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/meta/lists/location');
    });
});

describe('get_who_is_out', () => {
    it('returns who is out list', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockWhoIsOut));
        const result = await getToolResult('get_who_is_out', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].name).toBe('Jane Smith');
    });

    it('uses provided date range in query params', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([]));
        await callTool('get_who_is_out', { start: '2026-04-01', end: '2026-04-30' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('start=2026-04-01');
        expect(url).toContain('end=2026-04-30');
    });

    it('fetches from /time_off/whos_out', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([]));
        await callTool('get_who_is_out', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/time_off/whos_out');
    });
});

// ── Reports & Custom Fields ───────────────────────────────────────────────────

describe('get_company_report', () => {
    it('returns report data', async () => {
        const mockReport = { title: 'Employee Report', fields: [], employees: [] };
        mockFetch.mockReturnValueOnce(bhrOk(mockReport));
        const result = await getToolResult('get_company_report', { report_id: '1' });
        expect(result.title).toBe('Employee Report');
    });

    it('fetches from /reports/{id} with format=json', async () => {
        mockFetch.mockReturnValueOnce(bhrOk({}));
        await callTool('get_company_report', { report_id: '5' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/reports/5');
        expect(url).toContain('format=json');
    });

    it('appends fields param when provided', async () => {
        mockFetch.mockReturnValueOnce(bhrOk({}));
        await callTool('get_company_report', { report_id: '5', fields: 'firstName,lastName,department' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('fields=');
    });

    it('missing report_id returns validation error', async () => {
        const body = await callTool('get_company_report', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('report_id');
    });
});

describe('list_custom_fields', () => {
    it('returns custom fields list', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockMetaFields));
        const result = await getToolResult('list_custom_fields', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].name).toBe('Custom Text Field');
    });

    it('fetches from /meta/fields/', async () => {
        mockFetch.mockReturnValueOnce(bhrOk([]));
        await callTool('list_custom_fields', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/meta/fields/');
    });
});

describe('get_employee_custom_field', () => {
    it('returns custom field value for employee', async () => {
        mockFetch.mockReturnValueOnce(bhrOk({ id: '123', '1234': 'Large' }));
        const result = await getToolResult('get_employee_custom_field', {
            employee_id: '123',
            field_id: '1234',
        });
        expect(result['1234']).toBe('Large');
    });

    it('fetches /employees/{id} with field_id as fields param', async () => {
        mockFetch.mockReturnValueOnce(bhrOk({ id: '123', '1234': 'Large' }));
        await callTool('get_employee_custom_field', { employee_id: '123', field_id: '1234' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/employees/123');
        expect(url).toContain('fields=1234');
    });

    it('missing employee_id returns validation error', async () => {
        const body = await callTool('get_employee_custom_field', { field_id: '1234' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('employee_id');
    });

    it('missing field_id returns validation error', async () => {
        const body = await callTool('get_employee_custom_field', { employee_id: '123' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('field_id');
    });
});

describe('update_custom_field', () => {
    it('sends POST to /employees/{id} with field_id as key', async () => {
        mockFetch.mockReturnValueOnce(bhrOk204());
        const result = await getToolResult('update_custom_field', {
            employee_id: '123',
            field_id: '1234',
            value: 'XL',
        });
        expect(result).toEqual({});
        const call = mockFetch.mock.calls[0];
        expect((call[1] as { method: string }).method).toBe('POST');
        expect(call[0] as string).toContain('/employees/123');
        const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
        expect(body['1234']).toBe('XL');
    });

    it('missing value returns validation error', async () => {
        const body = await callTool('update_custom_field', {
            employee_id: '123',
            field_id: '1234',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('value');
    });
});

describe('get_benefits_summary', () => {
    it('returns benefits summary for current year', async () => {
        const mockBenefits = { plans: [{ id: '1', name: 'Health Insurance', enrollments: 45 }] };
        mockFetch.mockReturnValueOnce(bhrOk(mockBenefits));
        const result = await getToolResult('get_benefits_summary', {});
        expect(result.plans).toBeDefined();
    });

    it('fetches from /benefits/plan_coverages with year param', async () => {
        mockFetch.mockReturnValueOnce(bhrOk({}));
        await callTool('get_benefits_summary', { year: 2026 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/benefits/plan_coverages');
        expect(url).toContain('benefitYear=2026');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns users list on successful credentials', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockUsers));
        const result = await getToolResult('_ping', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].email).toBe('admin@company.com');
    });

    it('fetches from /meta/users/', async () => {
        mockFetch.mockReturnValueOnce(bhrOk(mockUsers));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/meta/users/');
    });

    it('returns API error when credentials are invalid', async () => {
        mockFetch.mockReturnValueOnce(bhrErr({ message: 'Invalid API Key' }, 403));
        const body = await callTool('_ping', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });
});

// ── API error handling ────────────────────────────────────────────────────────

describe('API error handling', () => {
    it('BambooHR error message is surfaced', async () => {
        mockFetch.mockReturnValueOnce(bhrErr(
            { errors: [{ error: 'Employee not found' }] },
            404,
        ));
        const body = await callTool('get_employee', { id: '9999' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('Employee not found');
    });

    it('unknown tool returns -32601', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
    });
});
