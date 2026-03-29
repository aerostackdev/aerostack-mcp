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
    'X-Mcp-Secret-WORDPRESS-USERNAME': 'admin',
    'X-Mcp-Secret-WORDPRESS-APP-PASSWORD': 'xxxx yyyy zzzz',
    'X-Mcp-Secret-WORDPRESS-DOMAIN': 'myblog.example.com',
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
        expect(body.server).toBe('wordpress-mcp');
    });
});

describe('method not allowed', () => {
    it('returns 405 for GET', async () => {
        const res = await worker.fetch(new Request('https://worker.test/'));
        expect(res.status).toBe(405);
    });
});

describe('parse error', () => {
    it('returns -32700 for bad JSON', async () => {
        const res = await worker.fetch(new Request('https://worker.test/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'bad{json',
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
    });
});

describe('initialize', () => {
    it('returns serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('wordpress-mcp');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 14 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(14);
    });
    it('includes expected tool names', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_posts');
        expect(names).toContain('create_post');
        expect(names).toContain('list_categories');
        expect(names).toContain('get_site_settings');
        expect(names).toContain('list_comments');
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
    it('returns -32001 when all secrets missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_posts', arguments: {} }, {}));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
    it('returns -32001 when only username provided', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_posts', arguments: {} }, {
            'X-Mcp-Secret-WORDPRESS-USERNAME': 'admin',
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('unknown/rpc'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('unknown tool', () => {
    it('returns -32603', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'not_real', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_posts', () => {
    it('returns posts list', async () => {
        mockFetch.mockResolvedValue(apiOk([{ id: 1, title: { rendered: 'Hello World' }, status: 'publish' }]));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_posts', arguments: {} }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data[0].title.rendered).toBe('Hello World');
    });
    it('uses Basic auth', async () => {
        mockFetch.mockResolvedValue(apiOk([]));
        await worker.fetch(makeReq('tools/call', { name: 'list_posts', arguments: {} }));
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('myblog.example.com'),
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: expect.stringContaining('Basic ') }),
            })
        );
    });
});

describe('get_post', () => {
    it('returns a post', async () => {
        mockFetch.mockResolvedValue(apiOk({ id: 5, title: { rendered: 'My Post' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_post', arguments: { postId: 5 } }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.id).toBe(5);
    });
    it('requires postId', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_post', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_post', () => {
    it('creates a post via POST', async () => {
        mockFetch.mockResolvedValue(apiOk({ id: 10, title: { rendered: 'New Post' }, status: 'draft' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_post',
            arguments: { title: 'New Post', content: '<p>Hello</p>', status: 'draft' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/posts'),
            expect.objectContaining({ method: 'POST' })
        );
    });
});

describe('update_post', () => {
    it('updates a post', async () => {
        mockFetch.mockResolvedValue(apiOk({ id: 5, title: { rendered: 'Updated Title' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_post',
            arguments: { postId: 5, title: 'Updated Title' },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('delete_post', () => {
    it('deletes a post', async () => {
        mockFetch.mockResolvedValue(apiOk({ deleted: true, previous: { id: 5 } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'delete_post', arguments: { postId: 5 } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('force=true'),
            expect.objectContaining({ method: 'DELETE' })
        );
    });
});

describe('list_categories', () => {
    it('returns categories', async () => {
        mockFetch.mockResolvedValue(apiOk([{ id: 1, name: 'Tech', count: 5 }]));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_categories', arguments: {} }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data[0].name).toBe('Tech');
    });
});

describe('list_comments', () => {
    it('lists comments for a post', async () => {
        mockFetch.mockResolvedValue(apiOk([{ id: 1, content: { rendered: 'Great post!' } }]));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_comments', arguments: { postId: 5 } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('post=5'),
            expect.any(Object)
        );
    });
});

describe('get_site_settings', () => {
    it('returns site settings', async () => {
        mockFetch.mockResolvedValue(apiOk({ title: 'My WordPress Site', url: 'https://myblog.example.com' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_site_settings', arguments: {} }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data.title).toBe('My WordPress Site');
    });
});
