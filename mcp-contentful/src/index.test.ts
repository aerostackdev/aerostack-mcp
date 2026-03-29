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

const AUTH = {
    'X-Mcp-Secret-CONTENTFUL-ACCESS-TOKEN': 'test-token',
    'X-Mcp-Secret-CONTENTFUL-SPACE-ID': 'space123',
};

function makeReq(method: string, params?: unknown, headers: Record<string, string> = AUTH) {
    return new Request('https://worker.test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('GET /health', () => {
    it('returns status ok', async () => {
        const res = await worker.fetch(new Request('https://worker.test/health'));
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('contentful-mcp');
    });
});

describe('method not allowed', () => {
    it('returns 405', async () => {
        const res = await worker.fetch(new Request('https://worker.test/'));
        expect(res.status).toBe(405);
    });
});

describe('parse error', () => {
    it('returns -32700', async () => {
        const res = await worker.fetch(new Request('https://worker.test/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'oops-json',
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
    });
});

describe('initialize', () => {
    it('returns serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('contentful-mcp');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 14 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(14);
    });
    it('includes key tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_spaces');
        expect(names).toContain('list_entries');
        expect(names).toContain('publish_entry');
        expect(names).toContain('search_entries');
    });
    it('all tools have annotations', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        for (const t of body.result.tools) {
            expect(t.annotations).toBeDefined();
        }
    });
});

describe('missing auth', () => {
    it('returns -32001 when token missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_spaces', arguments: {} }, {}));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('invalid/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('unknown tool', () => {
    it('returns -32603', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'nonexistent', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_spaces', () => {
    it('returns space list', async () => {
        mockFetch.mockResolvedValue(apiOk({ items: [{ sys: { id: 'space123' }, name: 'My Space' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_spaces', arguments: {} }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.items[0].name).toBe('My Space');
    });
});

describe('list_entries', () => {
    it('returns entries', async () => {
        mockFetch.mockResolvedValue(apiOk({ items: [{ sys: { id: 'e1' }, fields: { title: { 'en-US': 'Hello' } } }], total: 1 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_entries', arguments: {} }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.items[0].sys.id).toBe('e1');
    });
    it('uses default spaceId from header', async () => {
        mockFetch.mockResolvedValue(apiOk({ items: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_entries', arguments: {} }));
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('space123'),
            expect.any(Object)
        );
    });
});

describe('get_entry', () => {
    it('returns an entry', async () => {
        mockFetch.mockResolvedValue(apiOk({ sys: { id: 'e1' }, fields: {} }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_entry', arguments: { entryId: 'e1' } }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.sys.id).toBe('e1');
    });
    it('requires entryId', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_entry', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_entry', () => {
    it('creates entry with POST', async () => {
        mockFetch.mockResolvedValue(apiOk({ sys: { id: 'new1' }, fields: {} }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_entry',
            arguments: {
                contentTypeId: 'blogPost',
                fields: { title: { 'en-US': 'New Post' } },
            },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/entries'),
            expect.objectContaining({ method: 'POST' })
        );
    });
});

describe('publish_entry', () => {
    it('publishes an entry', async () => {
        mockFetch.mockResolvedValue(apiOk({ sys: { id: 'e1', publishedVersion: 1 } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'publish_entry',
            arguments: { entryId: 'e1', version: 1 },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/published'),
            expect.objectContaining({ method: 'PUT' })
        );
    });
});

describe('delete_entry', () => {
    it('deletes an entry', async () => {
        mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'delete_entry', arguments: { entryId: 'e1' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/entries/e1'),
            expect.objectContaining({ method: 'DELETE' })
        );
    });
});

describe('search_entries', () => {
    it('searches entries', async () => {
        mockFetch.mockResolvedValue(apiOk({ items: [{ sys: { id: 'e2' } }], total: 1 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'search_entries', arguments: { query: 'hello world' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('hello'),
            expect.any(Object)
        );
    });
});

describe('list_assets', () => {
    it('returns assets', async () => {
        mockFetch.mockResolvedValue(apiOk({ items: [{ sys: { id: 'a1' }, fields: { title: { 'en-US': 'Logo' } } }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_assets', arguments: {} }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});
