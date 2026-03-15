import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Helper to build a POST request
function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('https://mcp.example.com/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

const AUTH_HEADER = { 'X-Mcp-Secret-WEBFLOW-API-TOKEN': 'test_webflow_token' };

// --- Mock fetch ---
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockJsonResponse(data: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
        })
    );
}

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol Tests ───────────────────────────────────────────────────────────

describe('Protocol', () => {
    it('GET /health returns status ok', async () => {
        const req = new Request('https://mcp.example.com/health', { method: 'GET' });
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const json = await res.json() as any;
        expect(json.status).toBe('ok');
        expect(json.server).toBe('webflow-mcp');
    });

    it('non-POST methods return 405', async () => {
        const req = new Request('https://mcp.example.com/', { method: 'DELETE' });
        const res = await worker.fetch(req);
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error', async () => {
        const req = new Request('https://mcp.example.com/', {
            method: 'POST',
            body: '{bad json',
        });
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.error.code).toBe(-32700);
    });

    it('initialize returns server info', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.result.protocolVersion).toBe('2024-11-05');
        expect(json.result.serverInfo.name).toBe('webflow-mcp');
    });

    it('tools/list returns all 10 tools', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.result.tools).toHaveLength(10);
        const names = json.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_sites');
        expect(names).toContain('get_site');
        expect(names).toContain('publish_site');
        expect(names).toContain('list_collections');
        expect(names).toContain('get_collection');
        expect(names).toContain('list_items');
        expect(names).toContain('get_item');
        expect(names).toContain('create_item');
        expect(names).toContain('update_item');
        expect(names).toContain('delete_item');
    });

    it('unknown method returns -32601', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 3, method: 'tools/unknown' });
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.error.code).toBe(-32601);
    });

    it('missing secret returns -32001 error', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'list_sites', arguments: {} },
        });
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.error.code).toBe(-32001);
        expect(json.error.message).toContain('WEBFLOW_API_TOKEN');
    });
});

// ── Tool Tests ───────────────────────────────────────────────────────────────

describe('Tool: list_sites', () => {
    it('returns mapped sites array', async () => {
        mockFetch.mockResolvedValueOnce(mockJsonResponse({
            sites: [
                { id: 'site1', displayName: 'Acme Corp', shortName: 'acme', lastPublished: '2024-01-01T00:00:00Z', createdOn: '2023-01-01T00:00:00Z', previewUrl: 'https://acme.webflow.io' },
            ],
        }));

        const req = makeRequest({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_sites', arguments: {} } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].displayName).toBe('Acme Corp');
        expect(result[0].id).toBe('site1');
    });

    it('sends Authorization header', async () => {
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ sites: [] }));

        const req = makeRequest({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'list_sites', arguments: {} } }, AUTH_HEADER);
        await worker.fetch(req);

        const calledOpts = mockFetch.mock.calls[0][1] as RequestInit;
        expect((calledOpts.headers as any)['Authorization']).toBe('Bearer test_webflow_token');
        expect((calledOpts.headers as any)['Accept-Version']).toBe('1.0.0');
    });
});

describe('Tool: get_site', () => {
    it('returns full site data', async () => {
        const site = { id: 'site1', displayName: 'Acme', shortName: 'acme', timezone: 'UTC', createdOn: '2023-01-01T00:00:00Z' };
        mockFetch.mockResolvedValueOnce(mockJsonResponse(site));

        const req = makeRequest({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'get_site', arguments: { site_id: 'site1' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.timezone).toBe('UTC');

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/sites/site1');
    });
});

describe('Tool: publish_site', () => {
    it('publishes to all domains', async () => {
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ queued: true }));

        const req = makeRequest({ jsonrpc: '2.0', id: 30, method: 'tools/call', params: { name: 'publish_site', arguments: { site_id: 'site1' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.queued).toBe(true);
    });

    it('publishes to specific domains', async () => {
        mockFetch.mockResolvedValueOnce(mockJsonResponse({}));

        const req = makeRequest({ jsonrpc: '2.0', id: 31, method: 'tools/call', params: { name: 'publish_site', arguments: { site_id: 'site1', domains: ['acme.com', 'www.acme.com'] } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.result).toBeDefined();

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(sentBody.domains).toEqual(['acme.com', 'www.acme.com']);
    });
});

describe('Tool: list_collections', () => {
    it('returns mapped collections', async () => {
        mockFetch.mockResolvedValueOnce(mockJsonResponse({
            collections: [
                { id: 'col1', displayName: 'Blog Posts', slug: 'blog-posts', singularName: 'Blog Post', createdOn: '2023-01-01T00:00:00Z', lastUpdated: '2024-01-01T00:00:00Z', itemCount: 42 },
            ],
        }));

        const req = makeRequest({ jsonrpc: '2.0', id: 40, method: 'tools/call', params: { name: 'list_collections', arguments: { site_id: 'site1' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result[0].displayName).toBe('Blog Posts');
        expect(result[0].itemCount).toBe(42);
    });
});

describe('Tool: get_collection', () => {
    it('returns collection with fields', async () => {
        const col = { id: 'col1', displayName: 'Blog Posts', slug: 'blog-posts', fields: [{ slug: 'title', displayName: 'Title', type: 'PlainText' }] };
        mockFetch.mockResolvedValueOnce(mockJsonResponse(col));

        const req = makeRequest({ jsonrpc: '2.0', id: 50, method: 'tools/call', params: { name: 'get_collection', arguments: { collection_id: 'col1' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.slug).toBe('blog-posts');
        expect(result.fields).toHaveLength(1);

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/collections/col1');
    });
});

describe('Tool: list_items', () => {
    it('returns items with field data', async () => {
        mockFetch.mockResolvedValueOnce(mockJsonResponse({
            items: [
                { id: 'item1', fieldData: { name: 'Hello World', slug: 'hello-world' }, isArchived: false, isDraft: false, createdOn: '2024-01-01T00:00:00Z', lastUpdated: '2024-01-02T00:00:00Z' },
            ],
        }));

        const req = makeRequest({ jsonrpc: '2.0', id: 60, method: 'tools/call', params: { name: 'list_items', arguments: { collection_id: 'col1' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result[0].fieldData.name).toBe('Hello World');
        expect(result[0].isArchived).toBe(false);
    });

    it('passes live param when specified', async () => {
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

        const req = makeRequest({ jsonrpc: '2.0', id: 61, method: 'tools/call', params: { name: 'list_items', arguments: { collection_id: 'col1', live: true } } }, AUTH_HEADER);
        await worker.fetch(req);

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('live=true');
    });

    it('passes limit and offset params', async () => {
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ items: [] }));

        const req = makeRequest({ jsonrpc: '2.0', id: 62, method: 'tools/call', params: { name: 'list_items', arguments: { collection_id: 'col1', limit: 5, offset: 10 } } }, AUTH_HEADER);
        await worker.fetch(req);

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('limit=5');
        expect(calledUrl).toContain('offset=10');
    });
});

describe('Tool: get_item', () => {
    it('returns full item data', async () => {
        const item = { id: 'item1', fieldData: { name: 'Test Post', body: 'Content here' }, isDraft: false };
        mockFetch.mockResolvedValueOnce(mockJsonResponse(item));

        const req = makeRequest({ jsonrpc: '2.0', id: 70, method: 'tools/call', params: { name: 'get_item', arguments: { collection_id: 'col1', item_id: 'item1' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.fieldData.body).toBe('Content here');

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/collections/col1/items/item1');
    });
});

describe('Tool: create_item', () => {
    it('creates an item with fieldData', async () => {
        const created = { id: 'item2', fieldData: { name: 'New Post' }, isDraft: false };
        mockFetch.mockResolvedValueOnce(mockJsonResponse(created));

        const req = makeRequest({ jsonrpc: '2.0', id: 80, method: 'tools/call', params: { name: 'create_item', arguments: { collection_id: 'col1', fields: { name: 'New Post', slug: 'new-post' } } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.id).toBe('item2');

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(sentBody.fieldData).toEqual({ name: 'New Post', slug: 'new-post' });
        expect(sentBody.isDraft).toBe(false);
    });

    it('creates a draft item when is_draft is true', async () => {
        const created = { id: 'item3', isDraft: true };
        mockFetch.mockResolvedValueOnce(mockJsonResponse(created));

        const req = makeRequest({ jsonrpc: '2.0', id: 81, method: 'tools/call', params: { name: 'create_item', arguments: { collection_id: 'col1', fields: { name: 'Draft Post' }, is_draft: true } } }, AUTH_HEADER);
        await worker.fetch(req);

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(sentBody.isDraft).toBe(true);
    });
});

describe('Tool: update_item', () => {
    it('updates item fieldData', async () => {
        const updated = { id: 'item1', fieldData: { name: 'Updated Post' }, lastUpdated: '2024-06-01T00:00:00Z' };
        mockFetch.mockResolvedValueOnce(mockJsonResponse(updated));

        const req = makeRequest({ jsonrpc: '2.0', id: 90, method: 'tools/call', params: { name: 'update_item', arguments: { collection_id: 'col1', item_id: 'item1', fields: { name: 'Updated Post' } } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.fieldData.name).toBe('Updated Post');

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/collections/col1/items/item1');
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');

        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(sentBody.fieldData).toEqual({ name: 'Updated Post' });
    });
});

describe('Tool: delete_item', () => {
    it('deletes an item', async () => {
        // vitest node env does not support status 204 in Response constructor; use 200 with empty body
        mockFetch.mockResolvedValueOnce(new Response('', { status: 200 }));

        const req = makeRequest({ jsonrpc: '2.0', id: 100, method: 'tools/call', params: { name: 'delete_item', arguments: { collection_id: 'col1', item_id: 'item1' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.deleted).toBe(true);
        expect(result.item_id).toBe('item1');

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('/collections/col1/items/item1');
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });
});

describe('Error handling', () => {
    it('returns -32603 when Webflow API returns error', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{"code": 401, "message": "Unauthorized"}', { status: 401, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 200, method: 'tools/call', params: { name: 'list_sites', arguments: {} } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.error.code).toBe(-32603);
        expect(json.error.message).toContain('401');
    });

    it('returns -32603 for unknown tool', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 201, method: 'tools/call', params: { name: 'nonexistent', arguments: {} } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.error.code).toBe(-32603);
        expect(json.error.message).toContain('Unknown tool');
    });
});
