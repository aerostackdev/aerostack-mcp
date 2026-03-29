import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-WORKABLE-API-KEY': 'test_api_key',
    'X-Mcp-Secret-WORKABLE-SUBDOMAIN': 'mycompany',
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
        expect(body.server).toBe('mcp-workable');
        expect(body.version).toBe('1.0.0');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────
describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-workable');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 18 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(18);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_jobs');
        expect(names).toContain('create_candidate');
        expect(names).toContain('schedule_interview');
        expect(names).toContain('search_candidates');
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
    it('returns -32001 when no secrets', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_jobs', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });

    it('returns -32001 when only API key', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Mcp-Secret-WORKABLE-API-KEY': 'key' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_jobs', arguments: {} } }),
        }));
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

// ── list_jobs ─────────────────────────────────────────────────────────────────
describe('list_jobs', () => {
    it('returns jobs array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            jobs: [{ shortcode: 'ENG001', title: 'Software Engineer', state: 'published' }],
            paging: { next: null },
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_jobs', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.jobs).toHaveLength(1);
        expect(result.jobs[0].shortcode).toBe('ENG001');
    });

    it('uses subdomain in URL', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ jobs: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_jobs', arguments: {} }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('mycompany.workable.com');
    });

    it('filters by state', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ jobs: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_jobs', arguments: { state: 'closed' } }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('state=closed');
    });
});

// ── get_job ───────────────────────────────────────────────────────────────────
describe('get_job', () => {
    it('returns job details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ shortcode: 'ENG001', title: 'Engineer', full_description: 'Details...' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_job', arguments: { shortcode: 'ENG001' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.shortcode).toBe('ENG001');
    });

    it('returns -32603 when shortcode missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_job', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── create_candidate ──────────────────────────────────────────────────────────
describe('create_candidate', () => {
    it('creates candidate for job', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ candidate: { id: 'c1', name: 'Alice', stage: 'applied' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_candidate',
            arguments: { shortcode: 'ENG001', name: 'Alice', email: 'alice@example.com' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.name).toBe('Alice');
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('/jobs/ENG001/candidates');
    });

    it('wraps body in candidate key', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ candidate: { id: 'c1' } }));
        await worker.fetch(makeReq('tools/call', {
            name: 'create_candidate',
            arguments: { shortcode: 'ENG001', name: 'Bob' },
        }));
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.candidate).toBeDefined();
        expect(reqBody.candidate.name).toBe('Bob');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_candidate',
            arguments: { shortcode: 'ENG001' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── update_candidate_stage ────────────────────────────────────────────────────
describe('update_candidate_stage', () => {
    it('updates stage using PATCH', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ candidate: { id: 'c1', stage: 'interview' } }));
        await worker.fetch(makeReq('tools/call', {
            name: 'update_candidate_stage',
            arguments: { id: 'c1', stage: 'interview' },
        }));
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    });

    it('returns -32603 when stage missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_candidate_stage',
            arguments: { id: 'c1' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── post_comment ──────────────────────────────────────────────────────────────
describe('post_comment', () => {
    it('posts comment with default policy', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ comment: { id: 'cm1', comment: 'Strong candidate' } }));
        await worker.fetch(makeReq('tools/call', {
            name: 'post_comment',
            arguments: { id: 'c1', comment: 'Strong candidate' },
        }));
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.policy).toBe('simple');
        expect(reqBody.comment).toBe('Strong candidate');
    });

    it('returns -32603 when comment missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'post_comment',
            arguments: { id: 'c1' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── rate_candidate ────────────────────────────────────────────────────────────
describe('rate_candidate', () => {
    it('rates candidate', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ rating: { id: 'r1', rating: 4 } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'rate_candidate',
            arguments: { id: 'c1', rating: 4, comment: 'Good technical skills' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.rating).toBe(4);
    });

    it('returns -32603 when rating missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'rate_candidate',
            arguments: { id: 'c1' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── archive_candidate ─────────────────────────────────────────────────────────
describe('archive_candidate', () => {
    it('archives candidate', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({}, 200));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'archive_candidate',
            arguments: { id: 'c1', reason: 'Not a fit' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
    });
});

// ── search_candidates ─────────────────────────────────────────────────────────
describe('search_candidates', () => {
    it('searches candidates', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            candidates: [{ id: 'c1', name: 'Alice' }],
            paging: {},
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_candidates',
            arguments: { query: 'Alice' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.candidates).toHaveLength(1);
    });

    it('returns -32603 when query missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'search_candidates', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
