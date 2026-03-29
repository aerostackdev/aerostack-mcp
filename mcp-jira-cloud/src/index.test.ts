import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const EMAIL = 'user@company.com';
const TOKEN = 'jira-api-token-abc';
const DOMAIN = 'mycompany';
const AUTH_HEADERS = {
    'X-Mcp-Secret-JIRA-EMAIL': EMAIL,
    'X-Mcp-Secret-JIRA-API-TOKEN': TOKEN,
    'X-Mcp-Secret-JIRA-DOMAIN': DOMAIN,
};

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function mockApiResponse(data: unknown, status = 200) {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(data), { status }));
}

beforeEach(() => { mockFetch.mockReset(); });

describe('Infrastructure', () => {
    it('GET /health returns ok', async () => {
        const res = await worker.fetch(new Request('http://localhost/health'));
        const body = await res.json() as { status: string; mcp: string };
        expect(body.status).toBe('ok');
        expect(body.mcp).toBe('mcp-jira-cloud');
    });

    it('GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns -32700', async () => {
        const req = new Request('http://localhost/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns server info', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        const body = await res.json() as { result: { serverInfo: { name: string } } };
        expect(body.result.serverInfo.name).toBe('mcp-jira-cloud');
    });

    it('tools/list returns 16 tools', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(16);
    });

    it('unknown method returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 3, method: 'bad/method' }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('tools/call without secrets returns -32001 with all missing listed', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_projects', arguments: {} } }));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('JIRA_EMAIL');
        expect(body.error.message).toContain('JIRA_API_TOKEN');
        expect(body.error.message).toContain('JIRA_DOMAIN');
    });

    it('all tools have annotations', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 5, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
        for (const tool of body.result.tools) {
            expect(tool.annotations).toBeDefined();
        }
    });
});

describe('list_projects', () => {
    it('returns projects', async () => {
        mockApiResponse({ values: [{ id: '10001', key: 'PROJ', name: 'My Project' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_projects', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).values).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('mycompany.atlassian.net'), expect.any(Object));
    });
});

describe('get_issue', () => {
    it('returns issue', async () => {
        mockApiResponse({ id: '10100', key: 'PROJ-1', fields: { summary: 'Fix bug' } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'get_issue', arguments: { issueKey: 'PROJ-1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).key).toBe('PROJ-1');
    });

    it('errors without issueKey', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'get_issue', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_issue', () => {
    it('creates issue', async () => {
        mockApiResponse({ id: '10200', key: 'PROJ-2', self: 'https://mycompany.atlassian.net/rest/api/3/issue/10200' });
        const res = await worker.fetch(makeReq({
            jsonrpc: '2.0', id: 13, method: 'tools/call', params: {
                name: 'create_issue', arguments: { projectKey: 'PROJ', summary: 'New bug', issueType: 'Bug', description: 'Something broke' },
            },
        }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).key).toBe('PROJ-2');
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST' }));
    });

    it('errors without required fields', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'create_issue', arguments: { projectKey: 'PROJ' } } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_issues', () => {
    it('searches with JQL', async () => {
        mockApiResponse({ issues: [{ key: 'PROJ-1', fields: { summary: 'Test' } }], total: 1 });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'list_issues', arguments: { jql: 'project = PROJ' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).issues).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('jql='), expect.any(Object));
    });
});

describe('transition_issue', () => {
    it('transitions issue', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'transition_issue', arguments: { issueKey: 'PROJ-1', transitionId: '31' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).transitioned).toBe(true);
    });
});

describe('add_comment', () => {
    it('adds comment', async () => {
        mockApiResponse({ id: 'comment_1', body: { type: 'doc' } });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'add_comment', arguments: { issueKey: 'PROJ-1', text: 'This is fixed' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('comment_1');
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST' }));
    });
});

describe('delete_issue', () => {
    it('deletes issue', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 18, method: 'tools/call', params: { name: 'delete_issue', arguments: { issueKey: 'PROJ-1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).deleted).toBe(true);
    });
});

describe('list_boards', () => {
    it('returns boards', async () => {
        mockApiResponse({ values: [{ id: 1, name: 'My Board' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'list_boards', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).values).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('agile/1.0/board'), expect.any(Object));
    });
});

describe('search_users', () => {
    it('searches users', async () => {
        mockApiResponse([{ accountId: 'user_1', displayName: 'Alice' }]);
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'search_users', arguments: { query: 'alice' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text)).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('user/search?query='), expect.any(Object));
    });
});

describe('unknown tool', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'bad_tool', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});
