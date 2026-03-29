import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'runpod-test-key-abc123';

const mockGpuTypes = {
    gpuTypes: [
        {
            id: 'NVIDIA GeForce RTX 3090',
            displayName: 'RTX 3090',
            memoryInGb: 24,
            secureCloud: true,
            communityCloud: true,
            lowestPrice: { minimumBidPrice: 0.1, uninterruptablePrice: 0.3 },
        },
    ],
};

const mockPods = {
    myself: {
        pods: [
            { id: 'pod_abc123', name: 'My Training Pod', desiredStatus: 'RUNNING', imageName: 'runpod/pytorch:latest', machineId: 'machine_001' },
        ],
    },
};

const mockPod = {
    pod: {
        id: 'pod_abc123',
        name: 'My Training Pod',
        desiredStatus: 'RUNNING',
        imageName: 'runpod/pytorch:latest',
        gpuCount: 1,
        logsToConsole: false,
    },
};

const mockCreatedPod = {
    podFindAndDeployOnDemand: {
        id: 'pod_new123',
        name: 'New Pod',
        desiredStatus: 'RUNNING',
    },
};

const mockStoppedPod = {
    podStop: { id: 'pod_abc123', desiredStatus: 'EXITED' },
};

const mockResumedPod = {
    podResume: { id: 'pod_abc123', desiredStatus: 'RUNNING' },
};

const mockTerminated = {
    podTerminate: null,
};

function graphqlOk(data: unknown) {
    return Promise.resolve(new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function graphqlErr(message: string) {
    return Promise.resolve(new Response(JSON.stringify({ errors: [{ message }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function httpErr(status = 401) {
    return Promise.resolve(new Response(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, missingAuth = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingAuth) headers['X-Mcp-Secret-RUNPOD-API-KEY'] = API_KEY;
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
    it('GET / returns status ok with server mcp-runpod and tools 7', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-runpod');
        expect(body.tools).toBe(7);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'invalid',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-runpod');
    });

    it('tools/list returns exactly 7 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(7);
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
    it('missing RUNPOD_API_KEY returns -32001', async () => {
        const body = await callTool('list_gpu_types', {}, true);
        expect(body.error?.code).toBe(-32001);
        expect(body.error?.message).toContain('RUNPOD_API_KEY');
    });

    it('passes api_key as query param in URL', async () => {
        mockFetch.mockResolvedValueOnce(graphqlOk(mockGpuTypes));
        await callTool('list_gpu_types');
        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain(`api_key=${API_KEY}`);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_gpu_types', () => {
    it('POSTs GraphQL to /graphql?api_key and returns GPU types', async () => {
        mockFetch.mockResolvedValueOnce(graphqlOk(mockGpuTypes));
        const result = await getToolResult('list_gpu_types');
        expect(result.gpuTypes).toHaveLength(1);
        expect(result.gpuTypes[0].displayName).toBe('RTX 3090');
        expect(result.gpuTypes[0].memoryInGb).toBe(24);

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/graphql');
        expect(options.method).toBe('POST');
    });
});

describe('list_pods', () => {
    it('POSTs GraphQL and returns pod list with status', async () => {
        mockFetch.mockResolvedValueOnce(graphqlOk(mockPods));
        const result = await getToolResult('list_pods');
        expect(result.myself.pods).toHaveLength(1);
        expect(result.myself.pods[0].id).toBe('pod_abc123');
        expect(result.myself.pods[0].desiredStatus).toBe('RUNNING');
    });
});

describe('get_pod', () => {
    it('POSTs GraphQL query with podId variable and returns pod details', async () => {
        mockFetch.mockResolvedValueOnce(graphqlOk(mockPod));
        const result = await getToolResult('get_pod', { pod_id: 'pod_abc123' });
        expect(result.pod.id).toBe('pod_abc123');
        expect(result.pod.gpuCount).toBe(1);

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect((sent.variables as { podId: string }).podId).toBe('pod_abc123');
    });

    it('missing pod_id returns error', async () => {
        const body = await callTool('get_pod', {});
        expect(body.error).toBeDefined();
    });
});

describe('create_pod', () => {
    it('POSTs GraphQL mutation and returns created pod', async () => {
        mockFetch.mockResolvedValueOnce(graphqlOk(mockCreatedPod));
        const result = await getToolResult('create_pod', {
            name: 'New Pod',
            image_name: 'runpod/pytorch:latest',
            gpu_type_id: 'NVIDIA GeForce RTX 3090',
        });
        expect(result.podFindAndDeployOnDemand.id).toBe('pod_new123');
    });

    it('missing required fields returns error', async () => {
        const body = await callTool('create_pod', { name: 'test' });
        expect(body.error).toBeDefined();
    });
});

describe('stop_pod', () => {
    it('POSTs GraphQL mutation to stop pod', async () => {
        mockFetch.mockResolvedValueOnce(graphqlOk(mockStoppedPod));
        const result = await getToolResult('stop_pod', { pod_id: 'pod_abc123' });
        expect(result.podStop.desiredStatus).toBe('EXITED');
    });
});

describe('resume_pod', () => {
    it('POSTs GraphQL mutation to resume pod', async () => {
        mockFetch.mockResolvedValueOnce(graphqlOk(mockResumedPod));
        const result = await getToolResult('resume_pod', { pod_id: 'pod_abc123' });
        expect(result.podResume.desiredStatus).toBe('RUNNING');
    });
});

describe('terminate_pod', () => {
    it('POSTs GraphQL mutation to terminate pod', async () => {
        mockFetch.mockResolvedValueOnce(graphqlOk(mockTerminated));
        const result = await getToolResult('terminate_pod', { pod_id: 'pod_abc123' });
        expect(result.podTerminate).toBeNull();
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('GraphQL errors array propagates as -32603', async () => {
        mockFetch.mockResolvedValueOnce(graphqlErr('Unauthorized'));
        const body = await callTool('list_gpu_types');
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('Unauthorized');
    });

    it('HTTP error propagates as -32603', async () => {
        mockFetch.mockResolvedValueOnce(httpErr(401));
        const body = await callTool('list_gpu_types');
        expect(body.error?.code).toBe(-32603);
    });

    it('unknown tool returns error', async () => {
        const body = await callTool('nonexistent_tool');
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('Unknown tool');
    });
});
