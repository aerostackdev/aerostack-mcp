import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = 'test_gusto_access_token_abc123';
const COMPANY_ID = 'company-uuid-12345678';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockEmployee = {
    uuid: 'emp-uuid-001',
    first_name: 'Alice',
    last_name: 'Johnson',
    email: 'alice.johnson@example.com',
    date_of_birth: '1990-05-15',
    start_date: '2023-01-15',
    department: 'Engineering',
    jobs: [{ title: 'Software Engineer', primary: true, compensations: [{ rate: '120000.00', payment_unit: 'Year' }] }],
};

const mockEmployee2 = {
    uuid: 'emp-uuid-002',
    first_name: 'Bob',
    last_name: 'Smith',
    email: 'bob.smith@example.com',
    date_of_birth: '1985-03-22',
    start_date: '2021-06-01',
    department: 'Sales',
};

const mockPayroll = {
    payroll_uuid: 'payroll-uuid-001',
    company_uuid: COMPANY_ID,
    pay_period: { start_date: '2026-03-01', end_date: '2026-03-15' },
    check_date: '2026-03-20',
    processed: true,
    totals: { gross_pay: '25000.00', net_pay: '18750.00', employer_taxes: '1912.50' },
    employee_compensations: [
        {
            employee_uuid: 'emp-uuid-001',
            gross_pay: '5000.00',
            net_pay: '3750.00',
            earnings: [{ name: 'Regular Hours', hours: '80.000', amount: '5000.00' }],
        },
    ],
};

const mockPaySchedule = {
    uuid: 'sched-uuid-001',
    frequency: 'Biweekly',
    anchor_pay_date: '2026-01-10',
    day_1: 1,
    name: 'Biweekly Pay Schedule',
};

const mockCompany = {
    id: 12345,
    uuid: COMPANY_ID,
    name: 'Acme Tech Inc',
    ein: '12-3456789',
    entity_type: 'S-Corporation',
    primary_signatory: { first_name: 'Jane', last_name: 'CEO' },
    primary_location: {
        street_1: '100 Main St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94105',
    },
};

const mockLocation = {
    id: 1001,
    street_1: '100 Main St',
    street_2: 'Suite 200',
    city: 'San Francisco',
    state: 'CA',
    zip: '94105',
    country: 'US',
};

const mockDepartment = {
    uuid: 'dept-uuid-eng',
    name: 'Engineering',
    company_uuid: COMPANY_ID,
    employees: [{ uuid: 'emp-uuid-001' }],
    contractors: [],
};

const mockBenefit = {
    id: 1,
    name: 'Medical Insurance',
    description: 'Comprehensive medical coverage',
    supports_employee_deduction: true,
    supports_company_contribution: true,
};

const mockCompanyBenefit = {
    uuid: 'cb-uuid-001',
    company_uuid: COMPANY_ID,
    benefit_type: 1,
    active: true,
    description: 'Acme Medical Plan',
    employee_deduction: '250.00',
    company_contribution: '500.00',
};

const mockCurrentUser = {
    email: 'admin@acme.com',
    first_name: 'Jane',
    last_name: 'Admin',
    companies: [{ id: 12345, uuid: COMPANY_ID, name: 'Acme Tech Inc', tier: 'simple' }],
};

const mockContractor = {
    uuid: 'contractor-uuid-001',
    version: 'v1',
    company_uuid: COMPANY_ID,
    first_name: 'Contractor',
    last_name: 'One',
    type: 'Individual',
    start_date: '2026-01-01',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function gustoOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function gustoOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function gustoErr(message: string, status = 422, errors?: Record<string, string[]>) {
    const body: Record<string, unknown> = { message };
    if (errors) body.errors = errors;
    return Promise.resolve(new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function gusto429() {
    return Promise.resolve(new Response(JSON.stringify({ message: 'Too Many Requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
    }));
}

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('token')) {
        headers['X-Mcp-Secret-GUSTO-ACCESS-TOKEN'] = ACCESS_TOKEN;
    }
    if (!missingSecrets.includes('companyId')) {
        headers['X-Mcp-Secret-GUSTO-COMPANY-ID'] = COMPANY_ID;
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
    it('GET / returns status ok with server mcp-gusto and tools 23', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-gusto');
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
        expect(body.result.serverInfo.name).toBe('mcp-gusto');
    });

    it('tools/list returns all 23 tools with name, description, inputSchema', async () => {
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
    it('missing token returns -32001 with GUSTO_ACCESS_TOKEN in message', async () => {
        const body = await callTool('get_company', {}, ['token']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('GUSTO_ACCESS_TOKEN');
    });

    it('missing companyId returns -32001 with GUSTO_COMPANY_ID in message', async () => {
        const body = await callTool('get_company', {}, ['companyId']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('GUSTO_COMPANY_ID');
    });

    it('missing both secrets returns -32001', async () => {
        const body = await callTool('get_company', {}, ['token', 'companyId']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
    });

    it('Authorization header uses Bearer token format', async () => {
        mockFetch.mockReturnValueOnce(gustoOk(mockCompany));
        await callTool('get_company');
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns current user info with companies list', async () => {
        mockFetch.mockReturnValueOnce(gustoOk(mockCurrentUser));
        const result = await getToolResult('_ping');
        expect(result.email).toBe('admin@acme.com');
        expect(result.companies).toHaveLength(1);
        expect(result.companies[0].uuid).toBe(COMPANY_ID);
    });

    it('calls GET /v1/me', async () => {
        mockFetch.mockReturnValueOnce(gustoOk(mockCurrentUser));
        await callTool('_ping');
        expect(mockFetch.mock.calls[0][0]).toContain('/v1/me');
    });
});

// ── Employees ─────────────────────────────────────────────────────────────────

describe('list_employees', () => {
    it('returns array of employees', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([mockEmployee, mockEmployee2]));
        const result = await getToolResult('list_employees');
        expect(result).toHaveLength(2);
        expect(result[0].first_name).toBe('Alice');
        expect(result[1].first_name).toBe('Bob');
    });

    it('uses /{companyId}/employees endpoint', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([]));
        await callTool('list_employees');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`/companies/${COMPANY_ID}/employees`);
    });

    it('passes include param when provided', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([mockEmployee]));
        await callTool('list_employees', { include: ['jobs', 'compensations'] });
        const url = mockFetch.mock.calls[0][0] as string;
        // URLSearchParams encodes commas as %2C
        expect(url).toMatch(/include=jobs(%2C|,)compensations/);
    });

    it('passes terminated=true when specified', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([]));
        await callTool('list_employees', { terminated: true });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('terminated=true');
    });
});

describe('get_employee', () => {
    it('returns full employee profile', async () => {
        mockFetch.mockReturnValueOnce(gustoOk(mockEmployee));
        const result = await getToolResult('get_employee', { employee_id: 'emp-uuid-001' });
        expect(result.uuid).toBe('emp-uuid-001');
        expect(result.first_name).toBe('Alice');
        expect(result.email).toBe('alice.johnson@example.com');
    });

    it('missing employee_id returns validation error', async () => {
        const body = await callTool('get_employee', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('employee_id');
    });
});

describe('create_employee', () => {
    it('returns created employee', async () => {
        mockFetch.mockReturnValueOnce(gustoOk({ ...mockEmployee, uuid: 'emp-new-uuid' }));
        const result = await getToolResult('create_employee', {
            first_name: 'Alice',
            last_name: 'Johnson',
            email: 'alice@example.com',
            date_of_birth: '1990-05-15',
            start_date: '2026-04-01',
            job_title: 'Engineer',
            rate: '120000.00',
            payment_unit: 'Year',
        });
        expect(result.uuid).toBe('emp-new-uuid');
    });

    it('sends POST to /{companyId}/employees with job nested', async () => {
        mockFetch.mockReturnValueOnce(gustoOk(mockEmployee));
        await callTool('create_employee', {
            first_name: 'Bob',
            last_name: 'Smith',
            email: 'bob@example.com',
            date_of_birth: '1985-01-01',
            start_date: '2026-04-01',
            job_title: 'Designer',
            rate: '80000.00',
            payment_unit: 'Year',
        });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain(`/companies/${COMPANY_ID}/employees`);
        expect(call[1].method).toBe('POST');
        const sentBody = JSON.parse(call[1].body as string);
        expect(sentBody.first_name).toBe('Bob');
        expect(sentBody.jobs).toHaveLength(1);
        expect(sentBody.jobs[0].title).toBe('Designer');
        expect(sentBody.jobs[0].compensations[0].rate).toBe('80000.00');
    });

    it('missing first_name returns validation error', async () => {
        const body = await callTool('create_employee', {
            last_name: 'X', email: 'x@x.com', date_of_birth: '1990-01-01',
            start_date: '2026-01-01', job_title: 'Dev', rate: '100000', payment_unit: 'Year',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('first_name');
    });

    it('missing rate returns validation error', async () => {
        const body = await callTool('create_employee', {
            first_name: 'A', last_name: 'B', email: 'ab@test.com', date_of_birth: '1990-01-01',
            start_date: '2026-01-01', job_title: 'Dev', payment_unit: 'Year',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('rate');
    });
});

describe('update_employee', () => {
    it('sends PUT with updated fields only', async () => {
        mockFetch.mockReturnValueOnce(gustoOk({ ...mockEmployee, last_name: 'Updated' }));
        await callTool('update_employee', { employee_id: 'emp-uuid-001', last_name: 'Updated' });
        const call = mockFetch.mock.calls[0];
        expect(call[0]).toContain('/employees/emp-uuid-001');
        expect(call[1].method).toBe('PUT');
        const sentBody = JSON.parse(call[1].body as string);
        expect(sentBody.last_name).toBe('Updated');
        expect(sentBody.first_name).toBeUndefined();
    });

    it('missing employee_id returns validation error', async () => {
        const body = await callTool('update_employee', { last_name: 'Smith' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('employee_id');
    });
});

describe('list_employee_time_off', () => {
    it('returns time off activities for employee', async () => {
        const timeOff = [{ type: 'vacation', accrual_rate: '1.5', balance: '40.0', used: '16.0' }];
        mockFetch.mockReturnValueOnce(gustoOk(timeOff));
        const result = await getToolResult('list_employee_time_off', { employee_id: 'emp-uuid-001' });
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('vacation');
    });

    it('calls /{employee_id}/time_off_activities endpoint', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([]));
        await callTool('list_employee_time_off', { employee_id: 'emp-uuid-001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/employees/emp-uuid-001/time_off_activities');
    });

    it('missing employee_id returns validation error', async () => {
        const body = await callTool('list_employee_time_off', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('employee_id');
    });
});

describe('get_employee_pay_stubs', () => {
    it('returns pay stubs for employee', async () => {
        const stubs = [{ check_date: '2026-03-20', gross_pay: '5000.00', net_pay: '3750.00' }];
        mockFetch.mockReturnValueOnce(gustoOk(stubs));
        const result = await getToolResult('get_employee_pay_stubs', { employee_id: 'emp-uuid-001' });
        expect(result).toHaveLength(1);
        expect(result[0].check_date).toBe('2026-03-20');
    });

    it('passes year filter when provided', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([]));
        await callTool('get_employee_pay_stubs', { employee_id: 'emp-uuid-001', year: 2026 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('year=2026');
    });

    it('missing employee_id returns validation error', async () => {
        const body = await callTool('get_employee_pay_stubs', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('employee_id');
    });
});

// ── Payroll ───────────────────────────────────────────────────────────────────

describe('list_payrolls', () => {
    it('returns list of payrolls', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([mockPayroll]));
        const result = await getToolResult('list_payrolls');
        expect(result).toHaveLength(1);
        expect(result[0].payroll_uuid).toBe('payroll-uuid-001');
    });

    it('passes processed filter', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([]));
        await callTool('list_payrolls', { processed: true, start_date: '2026-01-01', end_date: '2026-03-31' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('processed=true');
        expect(url).toContain('start_date=2026-01-01');
        expect(url).toContain('end_date=2026-03-31');
    });
});

describe('get_payroll', () => {
    it('returns payroll with employee compensations', async () => {
        mockFetch.mockReturnValueOnce(gustoOk(mockPayroll));
        const result = await getToolResult('get_payroll', { payroll_id: 'payroll-uuid-001' });
        expect(result.payroll_uuid).toBe('payroll-uuid-001');
        expect(result.employee_compensations).toHaveLength(1);
    });

    it('includes employee_compensations in query', async () => {
        mockFetch.mockReturnValueOnce(gustoOk(mockPayroll));
        await callTool('get_payroll', { payroll_id: 'payroll-uuid-001' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('include=employee_compensations');
    });

    it('missing payroll_id returns validation error', async () => {
        const body = await callTool('get_payroll', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('payroll_id');
    });
});

describe('get_payroll_summary', () => {
    it('returns payroll summary data', async () => {
        const summary = { total_gross_pay: '50000.00', total_net_pay: '37500.00', payrolls: [] };
        mockFetch.mockReturnValueOnce(gustoOk(summary));
        const result = await getToolResult('get_payroll_summary', { start_date: '2026-01-01', end_date: '2026-03-31' });
        expect(result.total_gross_pay).toBe('50000.00');
    });

    it('includes date range in URL', async () => {
        mockFetch.mockReturnValueOnce(gustoOk({}));
        await callTool('get_payroll_summary', { start_date: '2026-01-01', end_date: '2026-03-31' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('start_date=2026-01-01');
        expect(url).toContain('end_date=2026-03-31');
    });

    it('missing start_date returns validation error', async () => {
        const body = await callTool('get_payroll_summary', { end_date: '2026-03-31' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('start_date');
    });

    it('missing end_date returns validation error', async () => {
        const body = await callTool('get_payroll_summary', { start_date: '2026-01-01' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('end_date');
    });
});

describe('list_pay_schedules', () => {
    it('returns pay schedules list', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([mockPaySchedule]));
        const result = await getToolResult('list_pay_schedules');
        expect(result).toHaveLength(1);
        expect(result[0].frequency).toBe('Biweekly');
    });

    it('calls /{companyId}/pay_schedules', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([]));
        await callTool('list_pay_schedules');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`/companies/${COMPANY_ID}/pay_schedules`);
    });
});

describe('get_tax_liabilities', () => {
    it('returns tax liabilities data', async () => {
        const taxes = { federal: [{ liability_type: 'Social Security', amount: '3100.00' }], state: [] };
        mockFetch.mockReturnValueOnce(gustoOk(taxes));
        const result = await getToolResult('get_tax_liabilities');
        expect(result.federal).toHaveLength(1);
    });

    it('calls /{companyId}/tax_liabilities', async () => {
        mockFetch.mockReturnValueOnce(gustoOk({}));
        await callTool('get_tax_liabilities');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`/companies/${COMPANY_ID}/tax_liabilities`);
    });
});

// ── Company ───────────────────────────────────────────────────────────────────

describe('get_company', () => {
    it('returns company details', async () => {
        mockFetch.mockReturnValueOnce(gustoOk(mockCompany));
        const result = await getToolResult('get_company');
        expect(result.uuid).toBe(COMPANY_ID);
        expect(result.name).toBe('Acme Tech Inc');
        expect(result.ein).toBe('12-3456789');
    });

    it('calls /companies/{companyId}', async () => {
        mockFetch.mockReturnValueOnce(gustoOk(mockCompany));
        await callTool('get_company');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`/companies/${COMPANY_ID}`);
    });

    it('propagates API error as -32603', async () => {
        mockFetch.mockReturnValueOnce(gustoErr('Company not found', 404));
        const body = await callTool('get_company');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('Company not found');
    });
});

describe('list_locations', () => {
    it('returns locations array', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([mockLocation]));
        const result = await getToolResult('list_locations');
        expect(result).toHaveLength(1);
        expect(result[0].city).toBe('San Francisco');
        expect(result[0].state).toBe('CA');
    });
});

describe('list_departments', () => {
    it('returns departments with employee counts', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([mockDepartment]));
        const result = await getToolResult('list_departments');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Engineering');
        expect(result[0].employees).toHaveLength(1);
    });
});

describe('list_company_bank_accounts', () => {
    it('returns bank accounts list', async () => {
        const accounts = [{ id: 'ba-001', account_type: 'Checking', routing_number: '****1234', account_number: '****5678' }];
        mockFetch.mockReturnValueOnce(gustoOk(accounts));
        const result = await getToolResult('list_company_bank_accounts');
        expect(result).toHaveLength(1);
        expect(result[0].account_type).toBe('Checking');
    });
});

// ── Benefits ──────────────────────────────────────────────────────────────────

describe('list_benefits', () => {
    it('returns all supported benefit types', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([mockBenefit]));
        const result = await getToolResult('list_benefits');
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Medical Insurance');
    });

    it('calls /v1/benefits (global, no company ID)', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([]));
        await callTool('list_benefits');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v1/benefits');
        expect(url).not.toContain('/companies/');
    });
});

describe('list_company_benefits', () => {
    it('returns company benefits list', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([mockCompanyBenefit]));
        const result = await getToolResult('list_company_benefits');
        expect(result).toHaveLength(1);
        expect(result[0].description).toBe('Acme Medical Plan');
        expect(result[0].employee_deduction).toBe('250.00');
    });
});

describe('get_company_benefit', () => {
    it('returns specific benefit plan details', async () => {
        mockFetch.mockReturnValueOnce(gustoOk(mockCompanyBenefit));
        const result = await getToolResult('get_company_benefit', { company_benefit_id: 'cb-uuid-001' });
        expect(result.uuid).toBe('cb-uuid-001');
        expect(result.company_contribution).toBe('500.00');
    });

    it('missing company_benefit_id returns validation error', async () => {
        const body = await callTool('get_company_benefit', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('company_benefit_id');
    });
});

describe('list_employee_benefits', () => {
    it('returns benefits enrolled by employee', async () => {
        const empBenefits = [{ uuid: 'eb-001', employee_uuid: 'emp-uuid-001', company_benefit_uuid: 'cb-uuid-001', active: true }];
        mockFetch.mockReturnValueOnce(gustoOk(empBenefits));
        const result = await getToolResult('list_employee_benefits', { employee_id: 'emp-uuid-001' });
        expect(result).toHaveLength(1);
        expect(result[0].active).toBe(true);
    });

    it('missing employee_id returns validation error', async () => {
        const body = await callTool('list_employee_benefits', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('employee_id');
    });
});

// ── Reports & Misc ────────────────────────────────────────────────────────────

describe('list_contractors', () => {
    it('returns contractors list', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([mockContractor]));
        const result = await getToolResult('list_contractors');
        expect(result).toHaveLength(1);
        expect(result[0].first_name).toBe('Contractor');
    });

    it('passes include param when provided', async () => {
        mockFetch.mockReturnValueOnce(gustoOk([mockContractor]));
        await callTool('list_contractors', { include: ['compensations'] });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toMatch(/include=compensations/);
    });
});

describe('list_earning_types', () => {
    it('returns earning types list', async () => {
        const earningTypes = {
            default: [{ uuid: 'et-001', name: 'Regular Hours', category: 'time_and_attendance' }],
            custom: [{ uuid: 'et-002', name: 'Performance Bonus', category: 'supplemental' }],
        };
        mockFetch.mockReturnValueOnce(gustoOk(earningTypes));
        const result = await getToolResult('list_earning_types');
        expect(result.default).toHaveLength(1);
        expect(result.custom).toHaveLength(1);
    });
});

describe('get_current_user', () => {
    it('returns current user with company access list', async () => {
        mockFetch.mockReturnValueOnce(gustoOk(mockCurrentUser));
        const result = await getToolResult('get_current_user');
        expect(result.email).toBe('admin@acme.com');
        expect(result.companies[0].uuid).toBe(COMPANY_ID);
    });

    it('calls /v1/me endpoint', async () => {
        mockFetch.mockReturnValueOnce(gustoOk(mockCurrentUser));
        await callTool('get_current_user');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/v1/me');
    });
});

// ── API error handling ────────────────────────────────────────────────────────

describe('API error handling', () => {
    it('429 rate limit returns -32603 with retry info', async () => {
        mockFetch.mockReturnValueOnce(gusto429());
        const body = await callTool('get_company');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('rate limit');
        expect(body.error!.message).toContain('30');
    });

    it('422 validation error from Gusto returns -32603 with field message', async () => {
        mockFetch.mockReturnValueOnce(gustoErr('Unprocessable Entity', 422, {
            email: ['has already been taken'],
        }));
        const body = await callTool('create_employee', {
            first_name: 'A', last_name: 'B', email: 'existing@test.com', date_of_birth: '1990-01-01',
            start_date: '2026-01-01', job_title: 'Dev', rate: '100000', payment_unit: 'Year',
        });
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('email');
        expect(body.error!.message).toContain('has already been taken');
    });

    it('204 No Content returns empty object', async () => {
        mockFetch.mockReturnValueOnce(gustoOk204());
        const result = await getToolResult('get_company');
        expect(result).toEqual({});
    });

    it('non-JSON response throws -32603', async () => {
        mockFetch.mockReturnValueOnce(Promise.resolve(new Response('Internal Server Error', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' },
        })));
        const body = await callTool('get_company');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });

    it('unknown tool name returns -32601', async () => {
        const body = await callTool('nonexistent_tool');
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
        expect(body.error!.message).toContain('Unknown tool');
    });
});
