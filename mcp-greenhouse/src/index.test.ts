import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_KEY = 'test_greenhouse_api_key_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockJob = {
    id: 101,
    name: 'Senior Software Engineer',
    status: 'open',
    departments: [{ id: 10, name: 'Engineering' }],
    offices: [{ id: 20, name: 'New York' }],
    requisition_id: 'REQ-001',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
};

const mockJobPost = {
    id: 201,
    title: 'Senior Software Engineer',
    location: { name: 'New York, NY' },
    live: true,
    job_id: 101,
    external_url: 'https://boards.greenhouse.io/acme/jobs/201',
};

const mockCandidate = {
    id: 301,
    first_name: 'Alice',
    last_name: 'Johnson',
    email_addresses: [{ value: 'alice@example.com', type: 'personal' }],
    phone_numbers: [{ value: '+1-555-100-0001', type: 'mobile' }],
    applications: [{ id: 401, job_id: 101 }],
    tags: ['senior', 'backend'],
    created_at: '2026-02-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
};

const mockApplication = {
    id: 401,
    candidate_id: 301,
    job_id: 101,
    status: 'active',
    current_stage: { id: 501, name: 'Phone Screen' },
    credited_to: { id: 1, name: 'HR Manager' },
    created_at: '2026-02-01T00:00:00.000Z',
};

const mockScorecard = {
    id: 601,
    application_id: 401,
    interviewer: { id: 2, name: 'Tech Lead' },
    interview: { name: 'Technical Interview' },
    overall_recommendation: 'strong_yes',
    submitted_at: '2026-02-15T14:00:00.000Z',
};

const mockOffer = {
    id: 701,
    application_id: 401,
    status: 'pending',
    start_date: '2026-04-01',
    salary: { amount: 150000, currency: 'USD' },
    created_at: '2026-03-01T00:00:00.000Z',
};

const mockUser = {
    id: 1,
    name: 'HR Manager',
    primary_email_address: 'hr@acme.com',
    created_at: '2025-01-01T00:00:00.000Z',
};

const mockNote = {
    id: 801,
    body: 'Strong candidate, recommend advancing',
    visibility: 'public',
    created_at: '2026-03-01T00:00:00.000Z',
    user: { id: 1, name: 'HR Manager' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ghOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function ghOk204() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function ghErr(message: string, status = 422) {
    return Promise.resolve(new Response(JSON.stringify({ message, errors: [{ message }] }), {
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
    if (!missingSecrets.includes('apiKey')) {
        headers['X-Mcp-Secret-GREENHOUSE-API-KEY'] = API_KEY;
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
    it('GET / returns status ok with server mcp-greenhouse and tool count 23', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-greenhouse');
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
        expect(body.result.serverInfo.name).toBe('mcp-greenhouse');
    });

    it('tools/list returns all tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools.length).toBeGreaterThan(0);
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
    it('missing API key returns -32001 with GREENHOUSE_API_KEY in message', async () => {
        const body = await callTool('list_jobs', {}, ['apiKey']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('GREENHOUSE_API_KEY');
    });

    it('Authorization header uses Basic auth format with base64(key:)', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockJob]));
        await callTool('list_jobs', {});
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        const expected = `Basic ${btoa(API_KEY + ':')}`;
        expect(headers['Authorization']).toBe(expected);
    });

    it('unknown tool returns -32601', async () => {
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
    });
});

// ── Jobs ──────────────────────────────────────────────────────────────────────

describe('list_jobs', () => {
    it('returns list of jobs', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockJob]));
        const result = await getToolResult('list_jobs', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(101);
        expect(result[0].name).toBe('Senior Software Engineer');
    });

    it('passes status filter in query string', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockJob]));
        await callTool('list_jobs', { status: 'open' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=open');
    });

    it('passes department_id filter in query string', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockJob]));
        await callTool('list_jobs', { department_id: 10 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('department_id=10');
    });

    it('API error returns -32603', async () => {
        mockFetch.mockReturnValueOnce(ghErr('Unauthorized', 401));
        const body = await callTool('list_jobs', {});
        expect(body.error!.code).toBe(-32603);
    });
});

describe('get_job', () => {
    it('returns job details for valid job_id', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockJob));
        const result = await getToolResult('get_job', { job_id: 101 });
        expect(result.id).toBe(101);
        expect(result.status).toBe('open');
    });

    it('missing job_id returns error', async () => {
        const body = await callTool('get_job', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('job_id');
    });

    it('calls correct endpoint URL', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockJob));
        await callTool('get_job', { job_id: 101 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/jobs/101');
    });
});

describe('create_job', () => {
    it('creates a job and returns the new job object', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockJob));
        const result = await getToolResult('create_job', { name: 'Senior Software Engineer', department_id: 10 });
        expect(result.id).toBe(101);
    });

    it('missing name returns error', async () => {
        const body = await callTool('create_job', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });

    it('sets On-Behalf-Of header when on_behalf_of is provided', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockJob));
        await callTool('create_job', { name: 'Dev Role', on_behalf_of: '42' });
        const call = mockFetch.mock.calls[0];
        const headers = call[1].headers as Record<string, string>;
        expect(headers['On-Behalf-Of']).toBe('42');
    });

    it('uses POST method', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockJob));
        await callTool('create_job', { name: 'Dev Role' });
        const call = mockFetch.mock.calls[0];
        expect(call[1].method).toBe('POST');
    });
});

describe('update_job', () => {
    it('updates job and returns updated job', async () => {
        const updated = { ...mockJob, name: 'Staff Engineer' };
        mockFetch.mockReturnValueOnce(ghOk(updated));
        const result = await getToolResult('update_job', { job_id: 101, name: 'Staff Engineer' });
        expect(result.name).toBe('Staff Engineer');
    });

    it('missing job_id returns error', async () => {
        const body = await callTool('update_job', { name: 'New Name' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('job_id');
    });

    it('uses PATCH method', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockJob));
        await callTool('update_job', { job_id: 101, status: 'closed' });
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    });
});

describe('list_job_posts', () => {
    it('returns job posts for a job', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockJobPost]));
        const result = await getToolResult('list_job_posts', { job_id: 101 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(201);
        expect(result[0].live).toBe(true);
    });

    it('missing job_id returns error', async () => {
        const body = await callTool('list_job_posts', {});
        expect(body.error).toBeDefined();
    });

    it('passes live filter in query string', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockJobPost]));
        await callTool('list_job_posts', { job_id: 101, live: true });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('live=true');
    });
});

// ── Candidates ────────────────────────────────────────────────────────────────

describe('list_candidates', () => {
    it('returns list of candidates', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockCandidate]));
        const result = await getToolResult('list_candidates', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(301);
    });

    it('passes job_id filter', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockCandidate]));
        await callTool('list_candidates', { job_id: 101 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('job_id=101');
    });

    it('passes email filter', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockCandidate]));
        await callTool('list_candidates', { email: 'alice@example.com' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('alice%40example.com');
    });
});

describe('get_candidate', () => {
    it('returns candidate details', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockCandidate));
        const result = await getToolResult('get_candidate', { candidate_id: 301 });
        expect(result.id).toBe(301);
        expect(result.first_name).toBe('Alice');
    });

    it('missing candidate_id returns error', async () => {
        const body = await callTool('get_candidate', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('candidate_id');
    });
});

describe('create_candidate', () => {
    it('creates a candidate with required fields', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockCandidate));
        const result = await getToolResult('create_candidate', {
            first_name: 'Alice',
            last_name: 'Johnson',
        });
        expect(result.id).toBe(301);
    });

    it('missing first_name returns error', async () => {
        const body = await callTool('create_candidate', { last_name: 'Johnson' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('first_name');
    });

    it('missing last_name returns error', async () => {
        const body = await callTool('create_candidate', { first_name: 'Alice' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('last_name');
    });

    it('sends email as email_addresses array', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockCandidate));
        await callTool('create_candidate', { first_name: 'Alice', last_name: 'J', email: 'a@b.com' });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(body.email_addresses).toEqual([{ value: 'a@b.com', type: 'personal' }]);
    });

    it('includes job application when job_id is provided', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockCandidate));
        await callTool('create_candidate', { first_name: 'Alice', last_name: 'J', job_id: 101 });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(body.applications).toEqual([{ job_id: 101 }]);
    });
});

describe('update_candidate', () => {
    it('updates candidate fields', async () => {
        const updated = { ...mockCandidate, title: 'Principal Engineer' };
        mockFetch.mockReturnValueOnce(ghOk(updated));
        const result = await getToolResult('update_candidate', { candidate_id: 301, title: 'Principal Engineer' });
        expect(result.title).toBe('Principal Engineer');
    });

    it('missing candidate_id returns error', async () => {
        const body = await callTool('update_candidate', { first_name: 'Bob' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('candidate_id');
    });

    it('uses PATCH method', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockCandidate));
        await callTool('update_candidate', { candidate_id: 301, company: 'NewCo' });
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    });
});

describe('add_note_to_candidate', () => {
    it('adds note and returns created note', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockNote));
        const result = await getToolResult('add_note_to_candidate', {
            candidate_id: 301,
            body: 'Strong candidate',
            user_id: 1,
        });
        expect(result.id).toBe(801);
        expect(result.body).toBe('Strong candidate, recommend advancing');
    });

    it('missing body returns error', async () => {
        const body = await callTool('add_note_to_candidate', { candidate_id: 301, user_id: 1 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('body');
    });

    it('missing user_id returns error', async () => {
        const body = await callTool('add_note_to_candidate', { candidate_id: 301, body: 'note' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('user_id');
    });

    it('uses public visibility by default', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockNote));
        await callTool('add_note_to_candidate', { candidate_id: 301, body: 'note', user_id: 1 });
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.visibility).toBe('public');
    });
});

describe('search_candidates', () => {
    it('returns matching candidates', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockCandidate]));
        const result = await getToolResult('search_candidates', { query: 'Alice' });
        expect(Array.isArray(result)).toBe(true);
    });

    it('missing query returns error', async () => {
        const body = await callTool('search_candidates', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('query');
    });

    it('passes query in URL', async () => {
        mockFetch.mockReturnValueOnce(ghOk([]));
        await callTool('search_candidates', { query: 'Alice Johnson' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('query=');
        expect(url).toContain('Alice');
    });
});

describe('merge_candidates', () => {
    it('merges candidates and returns result', async () => {
        mockFetch.mockReturnValueOnce(ghOk({ message: 'Merge successful' }));
        const result = await getToolResult('merge_candidates', {
            primary_candidate_id: 301,
            duplicate_candidate_id: 302,
        });
        expect(result).toBeDefined();
    });

    it('missing primary_candidate_id returns error', async () => {
        const body = await callTool('merge_candidates', { duplicate_candidate_id: 302 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('primary_candidate_id');
    });

    it('missing duplicate_candidate_id returns error', async () => {
        const body = await callTool('merge_candidates', { primary_candidate_id: 301 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('duplicate_candidate_id');
    });
});

// ── Applications & Pipeline ───────────────────────────────────────────────────

describe('list_applications', () => {
    it('returns list of applications', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockApplication]));
        const result = await getToolResult('list_applications', {});
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(401);
    });

    it('passes job_id filter', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockApplication]));
        await callTool('list_applications', { job_id: 101 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('job_id=101');
    });

    it('passes status filter', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockApplication]));
        await callTool('list_applications', { status: 'active' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=active');
    });
});

describe('get_application', () => {
    it('returns application details', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockApplication));
        const result = await getToolResult('get_application', { application_id: 401 });
        expect(result.id).toBe(401);
        expect(result.status).toBe('active');
    });

    it('missing application_id returns error', async () => {
        const body = await callTool('get_application', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('application_id');
    });
});

describe('advance_application', () => {
    it('advances application and returns result', async () => {
        const advanced = { ...mockApplication, current_stage: { id: 502, name: 'Technical Interview' } };
        mockFetch.mockReturnValueOnce(ghOk(advanced));
        const result = await getToolResult('advance_application', {
            application_id: 401,
            from_stage_id: 501,
        });
        expect(result.current_stage.name).toBe('Technical Interview');
    });

    it('missing application_id returns error', async () => {
        const body = await callTool('advance_application', { from_stage_id: 501 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('application_id');
    });

    it('missing from_stage_id returns error', async () => {
        const body = await callTool('advance_application', { application_id: 401 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('from_stage_id');
    });
});

describe('reject_application', () => {
    it('rejects application and returns result', async () => {
        const rejected = { ...mockApplication, status: 'rejected' };
        mockFetch.mockReturnValueOnce(ghOk(rejected));
        const result = await getToolResult('reject_application', {
            application_id: 401,
            rejection_reason_id: 5,
        });
        expect(result.status).toBe('rejected');
    });

    it('missing rejection_reason_id returns error', async () => {
        const body = await callTool('reject_application', { application_id: 401 });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('rejection_reason_id');
    });

    it('sends rejection reason in request body', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockApplication));
        await callTool('reject_application', { application_id: 401, rejection_reason_id: 5 });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(body.rejection_reason_id).toBe(5);
    });
});

describe('schedule_interview', () => {
    it('schedules interview and returns result', async () => {
        const interview = { id: 901, application_id: 401, start: { date_time: '2026-04-10T10:00:00Z' } };
        mockFetch.mockReturnValueOnce(ghOk(interview));
        const result = await getToolResult('schedule_interview', {
            application_id: 401,
            interview_id: 501,
            interviewers: [{ user_id: 2 }],
            start: { date_time: '2026-04-10T10:00:00Z' },
            end: { date_time: '2026-04-10T11:00:00Z' },
        });
        expect(result.id).toBe(901);
    });

    it('missing interviewers returns error', async () => {
        const body = await callTool('schedule_interview', {
            application_id: 401,
            interview_id: 501,
            start: { date_time: '2026-04-10T10:00:00Z' },
            end: { date_time: '2026-04-10T11:00:00Z' },
        });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('interviewers');
    });

    it('includes location in request body when provided', async () => {
        mockFetch.mockReturnValueOnce(ghOk({ id: 901 }));
        await callTool('schedule_interview', {
            application_id: 401,
            interview_id: 501,
            interviewers: [{ user_id: 2 }],
            start: { date_time: '2026-04-10T10:00:00Z' },
            end: { date_time: '2026-04-10T11:00:00Z' },
            location: 'Zoom: https://zoom.us/j/123',
        });
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
        expect(reqBody.location).toBe('Zoom: https://zoom.us/j/123');
    });
});

describe('get_scorecards', () => {
    it('returns scorecards for application', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockScorecard]));
        const result = await getToolResult('get_scorecards', { application_id: 401 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].overall_recommendation).toBe('strong_yes');
    });

    it('missing application_id returns error', async () => {
        const body = await callTool('get_scorecards', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('application_id');
    });
});

// ── Offers & Reports ──────────────────────────────────────────────────────────

describe('list_offers', () => {
    it('returns offers for application', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockOffer]));
        const result = await getToolResult('list_offers', { application_id: 401 });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe(701);
    });

    it('missing application_id returns error', async () => {
        const body = await callTool('list_offers', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('application_id');
    });
});

describe('create_offer', () => {
    it('creates an offer and returns it', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockOffer));
        const result = await getToolResult('create_offer', {
            application_id: 401,
            start_date: '2026-04-01',
            salary: 150000,
            currency: 'USD',
        });
        expect(result.id).toBe(701);
    });

    it('missing application_id returns error', async () => {
        const body = await callTool('create_offer', { start_date: '2026-04-01' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('application_id');
    });

    it('uses POST method', async () => {
        mockFetch.mockReturnValueOnce(ghOk(mockOffer));
        await callTool('create_offer', { application_id: 401 });
        expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });
});

describe('approve_offer', () => {
    it('approves offer and returns result', async () => {
        const approved = { ...mockOffer, status: 'approved' };
        mockFetch.mockReturnValueOnce(ghOk(approved));
        const result = await getToolResult('approve_offer', { offer_id: 701 });
        expect(result.status).toBe('approved');
    });

    it('missing offer_id returns error', async () => {
        const body = await callTool('approve_offer', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('offer_id');
    });
});

describe('get_hiring_report', () => {
    it('returns hiring report data', async () => {
        const report = { offers_extended: 5, offers_accepted: 3, hires: 3 };
        mockFetch.mockReturnValueOnce(ghOk(report));
        const result = await getToolResult('get_hiring_report', {
            start_date: '2026-01-01',
            end_date: '2026-03-31',
        });
        expect(result.offers_extended).toBe(5);
    });

    it('missing start_date returns error', async () => {
        const body = await callTool('get_hiring_report', { end_date: '2026-03-31' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('start_date');
    });

    it('missing end_date returns error', async () => {
        const body = await callTool('get_hiring_report', { start_date: '2026-01-01' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('end_date');
    });

    it('passes date range in query string', async () => {
        mockFetch.mockReturnValueOnce(ghOk({}));
        await callTool('get_hiring_report', { start_date: '2026-01-01', end_date: '2026-03-31' });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('start_date=2026-01-01');
        expect(url).toContain('end_date=2026-03-31');
    });

    it('passes optional department_id filter', async () => {
        mockFetch.mockReturnValueOnce(ghOk({}));
        await callTool('get_hiring_report', { start_date: '2026-01-01', end_date: '2026-03-31', department_id: 10 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('department_id=10');
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('returns ok:true when credentials are valid', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockUser]));
        const result = await getToolResult('_ping', {});
        expect(result.ok).toBe(true);
        expect(result.message).toContain('valid');
    });

    it('calls /users?per_page=1 endpoint', async () => {
        mockFetch.mockReturnValueOnce(ghOk([mockUser]));
        await callTool('_ping', {});
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('/users');
        expect(url).toContain('per_page=1');
    });

    it('returns -32603 when API returns error', async () => {
        mockFetch.mockReturnValueOnce(ghErr('Invalid API Key', 401));
        const body = await callTool('_ping', {});
        expect(body.error!.code).toBe(-32603);
    });

    it('missing API key returns -32001', async () => {
        const body = await callTool('_ping', {}, ['apiKey']);
        expect(body.error!.code).toBe(-32001);
    });
});

// ── 204 No Content ────────────────────────────────────────────────────────────

describe('204 No Content handling', () => {
    it('handles 204 response gracefully (returns empty object)', async () => {
        mockFetch.mockReturnValueOnce(ghOk204());
        const result = await getToolResult('update_job', { job_id: 101, status: 'closed' });
        expect(result).toEqual({});
    });
});
