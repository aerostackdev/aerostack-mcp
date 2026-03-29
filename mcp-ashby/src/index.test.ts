import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.stubGlobal('btoa', (str: string) => Buffer.from(str).toString('base64'));

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-ASHBY-API-KEY': 'test_ashby_key',
};

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: TEST_HEADERS,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeReqNoAuth(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

// ── Health ────────────────────────────────────────────────────────────────────
describe('GET /health', () => {
    it('returns status ok', async () => {
        const req = new Request('http://localhost/health');
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-ashby');
        expect(body.version).toBe('1.0.0');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────
describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-ashby');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 18 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(18);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_job_postings');
        expect(names).toContain('create_candidate');
        expect(names).toContain('change_application_stage');
        expect(names).toContain('list_users');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('unknown/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('missing auth', () => {
    it('returns -32001', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_job_postings', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

describe('invalid JSON', () => {
    it('returns -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-json',
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
    });
});

// ── list_job_postings ─────────────────────────────────────────────────────────
describe('list_job_postings', () => {
    it('returns postings with nextCursor', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: [{ id: 'jp1', title: 'Senior Engineer', status: 'Published' }],
            nextCursor: null,
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_job_postings', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.results).toHaveLength(1);
        expect(result.results[0].title).toBe('Senior Engineer');
    });

    it('uses Basic auth with colon suffix', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_job_postings', arguments: {} }));
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers.Authorization).toMatch(/^Basic /);
        const decoded = Buffer.from(headers.Authorization.replace('Basic ', ''), 'base64').toString();
        expect(decoded).toBe('test_ashby_key:');
    });

    it('sends POST to /jobPosting.list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_job_postings', arguments: {} }));
        const url = mockFetch.mock.calls[0][0];
        const method = mockFetch.mock.calls[0][1].method;
        expect(url).toContain('/jobPosting.list');
        expect(method).toBe('POST');
    });

    it('passes isListed filter', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_job_postings', arguments: { is_listed: true } }));
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.isListed).toBe(true);
    });
});

// ── get_job_posting ───────────────────────────────────────────────────────────
describe('get_job_posting', () => {
    it('returns posting by id', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: { id: 'jp1', title: 'Engineer' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_job_posting', arguments: { id: 'jp1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.title).toBe('Engineer');
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.jobPostingId).toBe('jp1');
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_job_posting', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── create_candidate ──────────────────────────────────────────────────────────
describe('create_candidate', () => {
    it('creates candidate', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: { id: 'c1', name: 'Alice', email: 'alice@example.com' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_candidate',
            arguments: { name: 'Alice', email: 'alice@example.com', phone: '555-1234' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('c1');
        expect(result.name).toBe('Alice');
    });

    it('maps phone to phoneNumber in body', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: { id: 'c1' } }));
        await worker.fetch(makeReq('tools/call', {
            name: 'create_candidate',
            arguments: { name: 'Bob', email: 'bob@example.com', phone: '555-9999' },
        }));
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.phoneNumber).toBe('555-9999');
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_candidate',
            arguments: { name: 'Alice' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_candidate',
            arguments: { email: 'x@x.com' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── search_candidates ─────────────────────────────────────────────────────────
describe('search_candidates', () => {
    it('searches by email', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: [{ id: 'c1', email: 'found@example.com' }] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_candidates',
            arguments: { email: 'found@example.com' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.results).toHaveLength(1);
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.email).toBe('found@example.com');
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'search_candidates', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── create_application ────────────────────────────────────────────────────────
describe('create_application', () => {
    it('creates application', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: { id: 'app1', status: 'Active' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_application',
            arguments: { job_posting_id: 'jp1', candidate_id: 'c1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('app1');
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.jobPostingId).toBe('jp1');
        expect(reqBody.candidateId).toBe('c1');
    });

    it('returns -32603 when candidate_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_application',
            arguments: { job_posting_id: 'jp1' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── change_application_stage ──────────────────────────────────────────────────
describe('change_application_stage', () => {
    it('changes stage', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: { id: 'app1', stage: 'Phone Screen' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'change_application_stage',
            arguments: { application_id: 'app1', interview_stage_id: 'stage1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('app1');
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.applicationId).toBe('app1');
        expect(reqBody.interviewStageId).toBe('stage1');
    });

    it('returns -32603 when interview_stage_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'change_application_stage',
            arguments: { application_id: 'app1' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── add_note ──────────────────────────────────────────────────────────────────
describe('add_note', () => {
    it('adds note with default type', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: { id: 'n1', note: 'Great fit' } }));
        await worker.fetch(makeReq('tools/call', {
            name: 'add_note',
            arguments: { candidate_id: 'c1', note: 'Great fit' },
        }));
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.noteType).toBe('general');
        expect(reqBody.candidateId).toBe('c1');
    });

    it('returns -32603 when note missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'add_note',
            arguments: { candidate_id: 'c1' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_interview_stages ─────────────────────────────────────────────────────
describe('list_interview_stages', () => {
    it('returns stages for job', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: [{ id: 's1', name: 'Phone Screen', type: 'interview' }] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_interview_stages',
            arguments: { job_id: 'job1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.stages).toHaveLength(1);
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.jobId).toBe('job1');
    });

    it('returns -32603 when job_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_interview_stages', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
