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
function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ error: { message } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-DUB-API-KEY': 'dub_test_key',
        },
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

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('GET /', () => {
    it('returns status ok with 8 tools', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-dub');
        expect(body.tools).toBe(8);
    });
});

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-dub');
    });
});

describe('tools/list', () => {
    it('returns exactly 8 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(8);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('create_link');
        expect(names).toContain('get_link_analytics');
        expect(names).toContain('get_workspace');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('noop'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('missing auth', () => {
    it('returns -32001 when no DUB-API-KEY header', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_links',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('create_link', () => {
    it('returns new link with shortLink', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'link_abc',
            url: 'https://example.com',
            shortLink: 'https://dub.sh/abc',
            key: 'abc',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_link',
            arguments: { url: 'https://example.com', key: 'abc' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('link_abc');
        expect(result.shortLink).toBe('https://dub.sh/abc');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(422, 'Slug already taken'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_link',
            arguments: { url: 'https://example.com', key: 'taken' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_links', () => {
    it('returns links list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            { id: 'link_1', url: 'https://one.com', shortLink: 'https://dub.sh/one' },
            { id: 'link_2', url: 'https://two.com', shortLink: 'https://dub.sh/two' },
        ]));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_links',
            arguments: { limit: 20 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('link_1');
    });
});

describe('get_link', () => {
    it('returns link details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'link_abc',
            url: 'https://example.com',
            clicks: 42,
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_link',
            arguments: { link_id: 'link_abc' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('link_abc');
        expect(result.clicks).toBe(42);
    });
});

describe('update_link', () => {
    it('returns updated link', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'link_abc',
            url: 'https://updated.com',
            title: 'Updated Title',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_link',
            arguments: { link_id: 'link_abc', url: 'https://updated.com', title: 'Updated Title' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.url).toBe('https://updated.com');
        expect(result.title).toBe('Updated Title');
    });
});

describe('get_link_analytics', () => {
    it('returns timeseries analytics', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            { start: '2024-01-01', clicks: 100 },
            { start: '2024-01-02', clicks: 150 },
        ]));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_link_analytics',
            arguments: { link_id: 'link_abc', interval: '7d' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(2);
        expect(result[0].clicks).toBe(100);
    });
});

describe('list_domains', () => {
    it('returns domains list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            { id: 'dom_1', slug: 'go.mycompany.com', verified: true },
        ]));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_domains',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].slug).toBe('go.mycompany.com');
    });
});

describe('get_workspace', () => {
    it('returns workspace info', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            { id: 'ws_abc', name: 'My Workspace', slug: 'my-workspace' },
        ]));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_workspace',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(Array.isArray(result) ? result[0].slug : result.slug).toBeTruthy();
    });
});
