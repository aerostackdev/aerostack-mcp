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
    'X-Mcp-Secret-LEVER-API-KEY': 'test_lever_key',
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
        expect(body.server).toBe('mcp-lever');
        expect(body.version).toBe('1.0.0');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────
describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-lever');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 18 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(18);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_postings');
        expect(names).toContain('create_opportunity');
        expect(names).toContain('archive_opportunity');
        expect(names).toContain('list_archive_reasons');
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
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_postings', arguments: {} }));
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

// ── list_postings ─────────────────────────────────────────────────────────────
describe('list_postings', () => {
    it('returns postings with hasNext', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ id: 'p1', text: 'Software Engineer', state: 'published' }],
            hasNext: false,
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_postings', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.postings).toHaveLength(1);
        expect(result.hasNext).toBe(false);
    });

    it('defaults state to published', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [], hasNext: false }));
        await worker.fetch(makeReq('tools/call', { name: 'list_postings', arguments: {} }));
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('state=published');
    });

    it('uses Basic auth with colon suffix', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_postings', arguments: {} }));
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers.Authorization).toMatch(/^Basic /);
        const decoded = Buffer.from(headers.Authorization.replace('Basic ', ''), 'base64').toString();
        expect(decoded).toBe('test_lever_key:');
    });
});

// ── get_posting ───────────────────────────────────────────────────────────────
describe('get_posting', () => {
    it('returns posting data', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { id: 'p1', text: 'Engineer' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_posting', arguments: { id: 'p1' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.text).toBe('Engineer');
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_posting', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── create_opportunity ────────────────────────────────────────────────────────
describe('create_opportunity', () => {
    it('creates opportunity', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { id: 'opp1', name: 'Jane Doe' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_opportunity',
            arguments: { name: 'Jane Doe', email: 'jane@example.com', posting_id: 'p1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('opp1');
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_opportunity',
            arguments: { name: 'Jane' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_opportunity',
            arguments: { email: 'x@x.com' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── update_opportunity_stage ──────────────────────────────────────────────────
describe('update_opportunity_stage', () => {
    it('updates stage', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { id: 'opp1', stage: 'stage2' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_opportunity_stage',
            arguments: { id: 'opp1', stage_id: 'stage2' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('opp1');
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('/opportunities/opp1/stage');
    });

    it('returns -32603 when stage_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_opportunity_stage',
            arguments: { id: 'opp1' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── add_opportunity_note ──────────────────────────────────────────────────────
describe('add_opportunity_note', () => {
    it('adds note', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { id: 'note1', value: 'Great candidate' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'add_opportunity_note',
            arguments: { id: 'opp1', value: 'Great candidate', score: 'thumbsup' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.value).toBe('Great candidate');
    });

    it('returns -32603 when value missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'add_opportunity_note',
            arguments: { id: 'opp1' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_stages ───────────────────────────────────────────────────────────────
describe('list_stages', () => {
    it('returns stages', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [{ id: 's1', text: 'Phone Screen' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_stages', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.stages).toHaveLength(1);
    });
});

// ── list_pipeline_stages ──────────────────────────────────────────────────────
describe('list_pipeline_stages', () => {
    it('returns same as list_stages', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [{ id: 's1', text: 'Onsite' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_pipeline_stages', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.stages).toHaveLength(1);
        const url = mockFetch.mock.calls[0][0];
        expect(url).toContain('/stages');
    });
});

// ── add_tag_to_opportunity ────────────────────────────────────────────────────
describe('add_tag_to_opportunity', () => {
    it('adds tags', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { tags: ['senior', 'remote'] } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'add_tag_to_opportunity',
            arguments: { id: 'opp1', tags: ['senior', 'remote'] },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.tags).toContain('senior');
    });
});

// ── archive_opportunity ───────────────────────────────────────────────────────
describe('archive_opportunity', () => {
    it('archives opportunity', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { id: 'opp1', archived: true } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'archive_opportunity',
            arguments: { id: 'opp1', reason_id: 'r1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.archived).toBe(true);
    });

    it('returns -32603 when reason_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'archive_opportunity',
            arguments: { id: 'opp1' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
