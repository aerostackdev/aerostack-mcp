import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock Web Crypto API for JWT signing
const mockCryptoKey = {} as CryptoKey;
const mockSign = vi.fn().mockResolvedValue(new Uint8Array(32).fill(1));
const mockImportKey = vi.fn().mockResolvedValue(mockCryptoKey);

vi.stubGlobal('crypto', {
    subtle: {
        importKey: mockImportKey,
        sign: mockSign,
    },
});

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => {
    mockFetch.mockReset();
    mockSign.mockResolvedValue(new Uint8Array(32).fill(1));
    mockImportKey.mockResolvedValue(mockCryptoKey);
});

// Ghost Admin API key format: {id}:{hexSecret}
// Use a valid hex string for the secret
const TEST_GHOST_URL = 'https://myblog.ghost.io';
const TEST_ADMIN_KEY = 'abc123def456:' + '0a1b2c3d4e5f6789abcdef0123456789abcdef01'; // id:hexsecret

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-GHOST-URL': TEST_GHOST_URL,
    'X-Mcp-Secret-GHOST-ADMIN-API-KEY': TEST_ADMIN_KEY,
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

// ── Health check ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
    it('returns status ok', async () => {
        const req = new Request('http://localhost/health');
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('ghost-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('ghost-mcp');
        expect(body.result.serverInfo.version).toBe('1.0.0');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns exactly 9 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(9);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_posts');
        expect(names).toContain('get_post');
        expect(names).toContain('create_post');
        expect(names).toContain('update_post');
        expect(names).toContain('delete_post');
        expect(names).toContain('publish_post');
        expect(names).toContain('list_pages');
        expect(names).toContain('list_members');
        expect(names).toContain('create_member');
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
    it('returns -32001 when no secrets present', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_posts',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_posts', () => {
    it('returns mapped posts', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            posts: [
                {
                    id: 'post_1',
                    title: 'Hello World',
                    slug: 'hello-world',
                    status: 'published',
                    published_at: '2024-01-01T00:00:00Z',
                    custom_excerpt: 'A great post',
                    url: 'https://myblog.ghost.io/hello-world/',
                    reading_time: 3,
                },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_posts',
            arguments: { limit: 5 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('post_1');
        expect(result[0].title).toBe('Hello World');
        expect(result[0].reading_time).toBe(3);
    });

    it('uses Ghost Authorization header', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ posts: [] }));
        await worker.fetch(makeReq('tools/call', {
            name: 'list_posts',
            arguments: {},
        }));
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].headers['Authorization']).toMatch(/^Ghost /);
    });

    it('calls Ghost URL with correct base path', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ posts: [] }));
        await worker.fetch(makeReq('tools/call', {
            name: 'list_posts',
            arguments: {},
        }));
        const fetchUrl = mockFetch.mock.calls[0][0] as string;
        expect(fetchUrl).toContain(`${TEST_GHOST_URL}/ghost/api/admin/posts/`);
    });
});

describe('get_post', () => {
    it('returns full post details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            posts: [{
                id: 'post_1',
                title: 'Hello World',
                slug: 'hello-world',
                status: 'published',
                html: '<p>Content here</p>',
                published_at: '2024-01-01T00:00:00Z',
            }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_post',
            arguments: { post_id: 'post_1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('post_1');
        expect(result.html).toBe('<p>Content here</p>');
    });

    it('returns -32603 when post_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_post',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_post', () => {
    it('creates a draft post', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            posts: [{
                id: 'post_new',
                title: 'My New Post',
                slug: 'my-new-post',
                status: 'draft',
                created_at: '2024-01-01T00:00:00Z',
            }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_post',
            arguments: {
                title: 'My New Post',
                html: '<p>Hello!</p>',
                tags: ['Tech', 'News'],
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('post_new');
        expect(result.status).toBe('draft');
    });

    it('sends tags as objects with name property', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ posts: [{ id: 'p1', title: 'T', status: 'draft' }] }));
        await worker.fetch(makeReq('tools/call', {
            name: 'create_post',
            arguments: { title: 'Test', tags: ['Tag1', 'Tag2'] },
        }));
        const fetchCall = mockFetch.mock.calls[0];
        const fetchBody = JSON.parse(fetchCall[1].body);
        expect(fetchBody.posts[0].tags).toEqual([{ name: 'Tag1' }, { name: 'Tag2' }]);
    });

    it('returns -32603 when title missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_post',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_members', () => {
    it('returns mapped members', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            members: [
                {
                    id: 'member_1',
                    name: 'Alice',
                    email: 'alice@example.com',
                    status: 'free',
                    created_at: '2024-01-01T00:00:00Z',
                    subscribed: true,
                },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_members',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('member_1');
        expect(result[0].email).toBe('alice@example.com');
        expect(result[0].status).toBe('free');
    });

    it('returns empty array when no members', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ members: [] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_members',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toEqual([]);
    });
});

describe('create_member', () => {
    it('creates a member successfully', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            members: [{
                id: 'member_new',
                name: 'Bob',
                email: 'bob@example.com',
                status: 'free',
                created_at: '2024-01-01T00:00:00Z',
                subscribed: false,
            }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_member',
            arguments: {
                email: 'bob@example.com',
                name: 'Bob',
                labels: ['VIP'],
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('member_new');
        expect(result.email).toBe('bob@example.com');
    });

    it('sends labels as objects with name property', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ members: [{ id: 'm1', email: 'x@y.com' }] }));
        await worker.fetch(makeReq('tools/call', {
            name: 'create_member',
            arguments: { email: 'x@y.com', labels: ['VIP', 'Beta'] },
        }));
        const fetchCall = mockFetch.mock.calls[0];
        const fetchBody = JSON.parse(fetchCall[1].body);
        expect(fetchBody.members[0].labels).toEqual([{ name: 'VIP' }, { name: 'Beta' }]);
    });

    it('returns -32603 when email missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_member',
            arguments: { name: 'Bob' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 on Ghost API error', async () => {
        mockFetch.mockResolvedValueOnce(new Response(
            JSON.stringify({ errors: [{ message: 'Member already exists' }] }),
            { status: 422, headers: { 'Content-Type': 'application/json' } }
        ));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_member',
            arguments: { email: 'existing@example.com' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('Member already exists');
    });
});

describe('delete_post', () => {
    it('deletes post and returns confirmation', async () => {
        mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'delete_post',
            arguments: { post_id: 'post_1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.deleted).toBe(true);
        expect(result.post_id).toBe('post_1');
    });
});

describe('publish_post', () => {
    it('publishes a draft post', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            posts: [{ id: 'post_1', title: 'Hello', status: 'published' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'publish_post',
            arguments: { post_id: 'post_1', updated_at: '2024-01-01T00:00:00.000Z' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.status).toBe('published');
    });
});
