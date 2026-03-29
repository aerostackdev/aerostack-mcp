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
    'X-Mcp-Secret-SANITY-API-TOKEN': 'test-token',
    'X-Mcp-Secret-SANITY-PROJECT-ID': 'abc123proj',
    'X-Mcp-Secret-SANITY-DATASET': 'production',
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
        expect(body.server).toBe('sanity-mcp');
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
            body: 'invalid{',
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
    });
});

describe('initialize', () => {
    it('returns serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('sanity-mcp');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 12 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(12);
    });
    it('includes expected tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('query');
        expect(names).toContain('create_document');
        expect(names).toContain('patch_document');
        expect(names).toContain('list_schemas');
        expect(names).toContain('count_documents');
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
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_projects', arguments: {} }, {}));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('unknownRpcMethod'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('unknown tool', () => {
    it('returns -32603', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'not_a_tool', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('query', () => {
    it('executes a GROQ query', async () => {
        mockFetch.mockResolvedValue(apiOk({ result: [{ _id: 'post-1', _type: 'post', title: 'Hello' }] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'query',
            arguments: { groqQuery: '*[_type == "post"][0..5]' },
        }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data[0]._id).toBe('post-1');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('abc123proj'),
            expect.any(Object)
        );
    });
    it('requires groqQuery', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'query', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_document', () => {
    it('fetches a document by ID', async () => {
        mockFetch.mockResolvedValue(apiOk({ result: { _id: 'doc-1', _type: 'post' } }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_document', arguments: { documentId: 'doc-1' } }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data._id).toBe('doc-1');
    });
});

describe('create_document', () => {
    it('creates a document via mutations', async () => {
        mockFetch.mockResolvedValue(apiOk({ transactionId: 'tx1', results: [{ id: 'new-doc', operation: 'create' }] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_document',
            arguments: { _type: 'post', fields: { title: 'New Post' } },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('mutate'),
            expect.objectContaining({ method: 'POST' })
        );
    });
});

describe('patch_document', () => {
    it('patches a document', async () => {
        mockFetch.mockResolvedValue(apiOk({ transactionId: 'tx2', results: [{ id: 'doc-1', operation: 'update' }] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'patch_document',
            arguments: { id: 'doc-1', fields: { title: 'Updated Title' } },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});

describe('delete_document', () => {
    it('deletes a document', async () => {
        mockFetch.mockResolvedValue(apiOk({ transactionId: 'tx3', results: [{ id: 'doc-1', operation: 'delete' }] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'delete_document', arguments: { id: 'doc-1' } }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('mutate'),
            expect.objectContaining({ method: 'POST' })
        );
    });
});

describe('list_projects', () => {
    it('returns project list', async () => {
        mockFetch.mockResolvedValue(apiOk([{ id: 'proj1', displayName: 'My Project' }]));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_projects', arguments: {} }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data[0].id).toBe('proj1');
    });
});

describe('count_documents', () => {
    it('counts documents by type', async () => {
        mockFetch.mockResolvedValue(apiOk({ result: 42 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'count_documents', arguments: { docType: 'post' } }));
        const body = await res.json() as any;
        const data = JSON.parse(body.result.content[0].text);
        expect(data).toBe(42);
    });
});

describe('list_recent_documents', () => {
    it('returns recent documents', async () => {
        mockFetch.mockResolvedValue(apiOk({ result: [{ _id: 'd1', _updatedAt: '2024-01-01' }] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_recent_documents',
            arguments: { docType: 'post', limit: 5 },
        }));
        const body = await res.json() as any;
        expect(body.result).toBeDefined();
    });
});
