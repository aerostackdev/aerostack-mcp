import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'wandb-test-key-abc123';
const ENTITY = 'my-org';

const mockProjectsGraphQL = {
    data: {
        projects: {
            edges: [
                { node: { id: 'proj_1', name: 'mnist-classifier', description: 'MNIST image classifier', createdAt: '2024-01-01', runCount: 25 } },
                { node: { id: 'proj_2', name: 'gpt-finetune', description: 'GPT fine-tuning experiments', createdAt: '2024-01-02', runCount: 10 } },
            ],
        },
    },
};

const mockRun = {
    id: 'run_abc123',
    name: 'twilight-wind-42',
    state: 'finished',
    config: { learning_rate: 0.001, batch_size: 32 },
    summary: { loss: 0.12, accuracy: 0.95 },
    createdAt: '2024-01-01T00:00:00Z',
};

const mockRunsList = {
    runs: [mockRun],
};

const mockRunHistory = [
    { _step: 0, loss: 2.5, accuracy: 0.1 },
    { _step: 10, loss: 1.2, accuracy: 0.6 },
    { _step: 20, loss: 0.12, accuracy: 0.95 },
];

const mockArtifactsList = {
    artifacts: [{ id: 'art_1', name: 'mnist-model', type: 'model', createdAt: '2024-01-01' }],
};

const mockArtifact = {
    id: 'art_1',
    name: 'mnist-model',
    type: 'model',
    version: 'v1',
    size: 102400,
    createdAt: '2024-01-01T00:00:00Z',
};

function apiOk(data: unknown) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiErr(error: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ error }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, opts: { missingKey?: boolean; missingEntity?: boolean } = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!opts.missingKey) headers['X-Mcp-Secret-WANDB-API-KEY'] = API_KEY;
    if (!opts.missingEntity) headers['X-Mcp-Secret-WANDB-ENTITY'] = ENTITY;
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(toolName: string, args: Record<string, unknown> = {}, opts: { missingKey?: boolean; missingEntity?: boolean } = {}) {
    return makeReq('tools/call', { name: toolName, arguments: args }, opts);
}

async function callTool(toolName: string, args: Record<string, unknown> = {}, opts: { missingKey?: boolean; missingEntity?: boolean } = {}) {
    const req = makeToolReq(toolName, args, opts);
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
    it('GET / returns status ok with server mcp-wandb and tools 6', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-wandb');
        expect(body.tools).toBe(6);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'PUT' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-wandb');
    });

    it('tools/list returns exactly 6 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(6);
        for (const tool of body.result.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
        }
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
    it('missing WANDB_API_KEY returns -32001', async () => {
        const body = await callTool('list_projects', {}, { missingKey: true });
        expect(body.error?.code).toBe(-32001);
        expect(body.error?.message).toContain('WANDB_API_KEY');
    });

    it('missing WANDB_ENTITY returns -32001', async () => {
        const body = await callTool('list_projects', {}, { missingEntity: true });
        expect(body.error?.code).toBe(-32001);
        expect(body.error?.message).toContain('WANDB_ENTITY');
    });

    it('passes Bearer token in Authorization header', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockProjectsGraphQL));
        await callTool('list_projects');
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect((options.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_projects', () => {
    it('POSTs GraphQL to /graphql with entity variable', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockProjectsGraphQL));
        const result = await getToolResult('list_projects');
        expect(result.data.projects.edges).toHaveLength(2);
        expect(result.data.projects.edges[0].node.name).toBe('mnist-classifier');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/graphql');
        expect(options.method).toBe('POST');
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect((sent.variables as { entityName: string }).entityName).toBe(ENTITY);
    });
});

describe('list_runs', () => {
    it('GETs /{entity}/{project}/runs with limit', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockRunsList));
        const result = await getToolResult('list_runs', { project: 'mnist-classifier' });
        expect(result.runs).toHaveLength(1);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain(`/${ENTITY}/mnist-classifier/runs`);
    });

    it('missing project returns error', async () => {
        const body = await callTool('list_runs', {});
        expect(body.error).toBeDefined();
    });
});

describe('get_run', () => {
    it('GETs /{entity}/{project}/runs/{run_id}', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockRun));
        const result = await getToolResult('get_run', { project: 'mnist-classifier', run_id: 'run_abc123' });
        expect(result.id).toBe('run_abc123');
        expect(result.state).toBe('finished');

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain(`/${ENTITY}/mnist-classifier/runs/run_abc123`);
    });

    it('missing run_id returns error', async () => {
        const body = await callTool('get_run', { project: 'test' });
        expect(body.error).toBeDefined();
    });
});

describe('get_run_summary', () => {
    it('GETs run history with samples parameter', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockRunHistory));
        const result = await getToolResult('get_run_summary', {
            project: 'mnist-classifier',
            run_id: 'run_abc123',
            samples: 50,
        });
        expect(Array.isArray(result)).toBe(true);
        expect(result[0]._step).toBe(0);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/history');
        expect(url).toContain('samples=50');
    });
});

describe('list_artifacts', () => {
    it('GETs /{entity}/{project}/artifacts and returns list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockArtifactsList));
        const result = await getToolResult('list_artifacts', { project: 'mnist-classifier' });
        expect(result.artifacts).toHaveLength(1);
        expect(result.artifacts[0].name).toBe('mnist-model');
    });
});

describe('get_artifact', () => {
    it('GETs /{entity}/{project}/artifact/{name}:{version}', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockArtifact));
        const result = await getToolResult('get_artifact', {
            project: 'mnist-classifier',
            artifact_name: 'mnist-model',
            version: 'v1',
        });
        expect(result.name).toBe('mnist-model');
        expect(result.version).toBe('v1');

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/artifact/mnist-model:v1');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('W&B API error propagates as -32603', async () => {
        mockFetch.mockResolvedValueOnce(apiErr('Unauthorized', 401));
        const body = await callTool('list_projects');
        expect(body.error?.code).toBe(-32603);
    });

    it('unknown tool returns error', async () => {
        const body = await callTool('nonexistent_tool');
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('Unknown tool');
    });
});
