import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'ls-test-key-abc123';

const mockProject = {
    id: 'proj_abc123',
    repo_handle: 'my-chatbot',
    description: 'Production chatbot project',
    created_at: '2024-01-01T00:00:00Z',
};

const mockProjectsList = { repos: [mockProject] };

const mockRun = {
    id: 'run_abc123',
    name: 'ChatOpenAI',
    run_type: 'llm',
    inputs: { messages: [{ role: 'user', content: 'Hello' }] },
    outputs: { generations: [{ text: 'Hi there!' }] },
    start_time: '2024-01-01T00:00:00Z',
    end_time: '2024-01-01T00:00:01Z',
    total_tokens: 50,
};

const mockRunsList = [mockRun];

const mockDataset = {
    id: 'ds_abc123',
    name: 'My Test Dataset',
    description: 'For evaluating chatbot',
    data_type: 'kv',
    created_at: '2024-01-01T00:00:00Z',
};

const mockDatasetsList = [mockDataset];

const mockExample = {
    id: 'ex_abc123',
    dataset_id: 'ds_abc123',
    inputs: { question: 'What is 2+2?' },
    outputs: { answer: '4' },
    created_at: '2024-01-01T00:00:00Z',
};

const mockExamplesList = [mockExample];

function apiOk(data: unknown) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiErr(detail: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ detail }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, missingAuth = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingAuth) headers['X-Mcp-Secret-LANGSMITH-API-KEY'] = API_KEY;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(toolName: string, args: Record<string, unknown> = {}, missingAuth = false) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingAuth);
}

async function callTool(toolName: string, args: Record<string, unknown> = {}, missingAuth = false) {
    const req = makeToolReq(toolName, args, missingAuth);
    const res = await worker.fetch(req);
    return res.json() as Promise<{
        jsonrpc: string;
        id: number;
        result?: { content: [{ type: string; text: string }] };
        error?: { code: number; message: string };
    }>;
}

async function getToolResult(toolName: string, args: Record<string, unknown> = {}) {
    const body = await callTool(toolName, args);
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    return JSON.parse(body.result!.content[0].text);
}

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-langsmith and tools 8', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-langsmith');
        expect(body.tools).toBe(8);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{{bad}}',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-langsmith');
    });

    it('tools/list returns exactly 8 tools', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string }> } };
        expect(body.result.tools).toHaveLength(8);
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq('bad/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('notifications/initialized returns ok', async () => {
        const req = makeReq('notifications/initialized');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: unknown };
        expect(body.result).toBeDefined();
    });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Authentication', () => {
    it('missing LANGSMITH_API_KEY returns -32001', async () => {
        const body = await callTool('list_projects', {}, true);
        expect(body.error?.code).toBe(-32001);
        expect(body.error?.message).toContain('LANGSMITH_API_KEY');
    });

    it('passes x-api-key header on API calls', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockProjectsList));
        await callTool('list_projects');
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect((options.headers as Record<string, string>)['x-api-key']).toBe(API_KEY);
    });
});

// ── Projects ──────────────────────────────────────────────────────────────────

describe('list_projects', () => {
    it('GETs /api/v1/repos with limit and returns projects', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockProjectsList));
        const result = await getToolResult('list_projects');
        expect(result.repos).toHaveLength(1);
        expect(result.repos[0].repo_handle).toBe('my-chatbot');

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/api/v1/repos');
        expect(url).toContain('limit=');
    });
});

describe('create_project', () => {
    it('POSTs to /api/v1/repos with repo_handle', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockProject));
        const result = await getToolResult('create_project', {
            repo_handle: 'my-chatbot',
            description: 'Production chatbot project',
        });
        expect(result.id).toBe('proj_abc123');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/api/v1/repos');
        expect(options.method).toBe('POST');
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.repo_handle).toBe('my-chatbot');
        expect(sent.description).toBe('Production chatbot project');
    });

    it('missing repo_handle returns error', async () => {
        const body = await callTool('create_project', {});
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('repo_handle');
    });
});

// ── Runs ──────────────────────────────────────────────────────────────────────

describe('list_runs', () => {
    it('GETs /api/v1/runs with project_id and returns runs', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockRunsList));
        const result = await getToolResult('list_runs', { project_id: 'proj_abc123' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe('run_abc123');

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/api/v1/runs');
        expect(url).toContain('session_id=proj_abc123');
    });

    it('missing project_id returns error', async () => {
        const body = await callTool('list_runs', {});
        expect(body.error).toBeDefined();
    });
});

describe('get_run', () => {
    it('GETs /api/v1/runs/{run_id} and returns run with inputs/outputs', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockRun));
        const result = await getToolResult('get_run', { run_id: 'run_abc123' });
        expect(result.id).toBe('run_abc123');
        expect(result.run_type).toBe('llm');

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/api/v1/runs/run_abc123');
    });
});

// ── Datasets ──────────────────────────────────────────────────────────────────

describe('list_datasets', () => {
    it('GETs /api/v1/datasets and returns dataset list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockDatasetsList));
        const result = await getToolResult('list_datasets');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].name).toBe('My Test Dataset');
    });
});

describe('create_dataset', () => {
    it('POSTs to /api/v1/datasets with name', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockDataset));
        const result = await getToolResult('create_dataset', { name: 'My Test Dataset', data_type: 'kv' });
        expect(result.id).toBe('ds_abc123');

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.name).toBe('My Test Dataset');
        expect(sent.data_type).toBe('kv');
    });
});

// ── Examples ──────────────────────────────────────────────────────────────────

describe('list_examples', () => {
    it('GETs /api/v1/examples with dataset_id and returns examples', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockExamplesList));
        const result = await getToolResult('list_examples', { dataset_id: 'ds_abc123' });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe('ex_abc123');

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('dataset_id=ds_abc123');
    });
});

describe('create_example', () => {
    it('POSTs to /api/v1/examples with dataset_id and inputs', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockExample));
        const result = await getToolResult('create_example', {
            dataset_id: 'ds_abc123',
            inputs: { question: 'What is 2+2?' },
            outputs: { answer: '4' },
        });
        expect(result.id).toBe('ex_abc123');

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.dataset_id).toBe('ds_abc123');
        expect((sent.inputs as { question: string }).question).toBe('What is 2+2?');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('LangSmith 401 error propagates as -32603', async () => {
        mockFetch.mockResolvedValueOnce(apiErr('Unauthorized', 401));
        const body = await callTool('list_projects');
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('401');
    });

    it('unknown tool returns error', async () => {
        const body = await callTool('nonexistent_tool');
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('Unknown tool');
    });
});
