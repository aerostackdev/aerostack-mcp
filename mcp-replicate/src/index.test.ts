import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-REPLICATE-API-TOKEN': 'test_replicate_token',
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

// ── Health ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
    it('returns status ok', async () => {
        const req = new Request('http://localhost/health');
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-replicate');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-replicate');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns exactly 12 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(12);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('run_model');
        expect(names).toContain('get_prediction');
        expect(names).toContain('cancel_prediction');
        expect(names).toContain('list_predictions');
        expect(names).toContain('get_model');
        expect(names).toContain('list_model_versions');
        expect(names).toContain('get_model_version');
        expect(names).toContain('search_models');
        expect(names).toContain('list_deployments');
        expect(names).toContain('create_deployment_prediction');
        expect(names).toContain('get_account');
        expect(names).toContain('create_model');
    });
});

describe('missing auth', () => {
    it('returns -32001 when token is absent', async () => {
        const res = await worker.fetch(
            makeReqNoAuth('tools/call', { name: 'get_account', arguments: {} }),
        );
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('REPLICATE_API_TOKEN');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('unknown/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

// ── run_model ─────────────────────────────────────────────────────────────────

describe('run_model', () => {
    it('creates prediction via model-specific endpoint when no version given', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'pred_abc123',
            status: 'starting',
            model: 'stability-ai/stable-diffusion',
            version: null,
            urls: { get: 'https://api.replicate.com/v1/predictions/pred_abc123' },
            output: null,
            error: null,
            created_at: '2024-01-01T00:00:00Z',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'run_model',
            arguments: {
                model: 'stability-ai/stable-diffusion',
                input: { prompt: 'a red fox in a forest' },
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.prediction_id).toBe('pred_abc123');
        expect(result.status).toBe('starting');
        expect(result.output).toBeNull();

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/models/stability-ai/stable-diffusion/predictions');
    });

    it('creates prediction via /predictions when version is provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'pred_def456',
            status: 'starting',
            version: 'abc123def456',
            urls: {},
            output: null,
            error: null,
            created_at: '2024-01-01T00:00:00Z',
        }));

        await worker.fetch(makeReq('tools/call', {
            name: 'run_model',
            arguments: {
                model: 'stability-ai/stable-diffusion',
                version: 'abc123def456',
                input: { prompt: 'a sunset' },
            },
        }));
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/predictions');
        expect(url).not.toContain('/models/');
    });

    it('returns -32603 when model is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'run_model',
            arguments: { input: { prompt: 'test' } },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when model format is invalid', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'run_model',
            arguments: { model: 'invalid-format', input: {} },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('owner/model-name');
    });

    it('uses Authorization: Token header', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'pred_1',
            status: 'starting',
            urls: {},
            output: null,
            error: null,
            created_at: '2024-01-01T00:00:00Z',
        }));
        await worker.fetch(makeReq('tools/call', {
            name: 'run_model',
            arguments: { model: 'owner/model', input: {} },
        }));
        const [, options] = mockFetch.mock.calls[0];
        expect(options.headers['Authorization']).toBe('Token test_replicate_token');
    });
});

// ── get_prediction ────────────────────────────────────────────────────────────

describe('get_prediction', () => {
    it('returns full prediction details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'pred_abc123',
            status: 'succeeded',
            model: 'stability-ai/stable-diffusion',
            version: 'sha256abc',
            input: { prompt: 'a red fox' },
            output: ['https://replicate.delivery/output.png'],
            error: null,
            logs: 'Using seed: 42\nGeneration complete',
            metrics: { predict_time: 4.2 },
            urls: { get: 'https://api.replicate.com/v1/predictions/pred_abc123' },
            created_at: '2024-01-01T00:00:00Z',
            started_at: '2024-01-01T00:00:01Z',
            completed_at: '2024-01-01T00:00:05Z',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_prediction',
            arguments: { prediction_id: 'pred_abc123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.prediction_id).toBe('pred_abc123');
        expect(result.status).toBe('succeeded');
        expect(result.output).toEqual(['https://replicate.delivery/output.png']);
        expect(result.metrics.predict_time).toBe(4.2);
    });

    it('returns -32603 when prediction_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_prediction',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── cancel_prediction ─────────────────────────────────────────────────────────

describe('cancel_prediction', () => {
    it('cancels prediction and returns status', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'pred_abc123',
            status: 'canceled',
            completed_at: '2024-01-01T00:00:03Z',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'cancel_prediction',
            arguments: { prediction_id: 'pred_abc123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.prediction_id).toBe('pred_abc123');
        expect(result.status).toBe('canceled');
    });

    it('returns -32603 when prediction_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'cancel_prediction',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_predictions ──────────────────────────────────────────────────────────

describe('list_predictions', () => {
    it('returns mapped predictions list with pagination', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: [
                {
                    id: 'pred_1',
                    model: 'owner/model',
                    version: 'v1',
                    status: 'succeeded',
                    created_at: '2024-01-01T00:00:00Z',
                    completed_at: '2024-01-01T00:00:05Z',
                    urls: { get: 'https://api.replicate.com/v1/predictions/pred_1' },
                },
                {
                    id: 'pred_2',
                    model: 'owner/other-model',
                    version: 'v2',
                    status: 'processing',
                    created_at: '2024-01-02T00:00:00Z',
                    urls: {},
                },
            ],
            next: 'cursor_page2',
            previous: null,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_predictions',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.predictions).toHaveLength(2);
        expect(result.predictions[0].prediction_id).toBe('pred_1');
        expect(result.next_cursor).toBe('cursor_page2');
    });

    it('passes cursor to API when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: [], next: null, previous: null }));
        await worker.fetch(makeReq('tools/call', {
            name: 'list_predictions',
            arguments: { cursor: 'cursor_page2' },
        }));
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('cursor=cursor_page2');
    });
});

// ── get_model ─────────────────────────────────────────────────────────────────

describe('get_model', () => {
    it('returns model details with latest version', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            url: 'https://replicate.com/stability-ai/stable-diffusion',
            owner: 'stability-ai',
            name: 'stable-diffusion',
            description: 'A latent text-to-image diffusion model',
            visibility: 'public',
            github_url: 'https://github.com/Stability-AI/stablediffusion',
            run_count: 150000000,
            latest_version: {
                id: 'db21e45d3f7023abc',
                created_at: '2024-01-01T00:00:00Z',
                cog_version: '0.9.0',
            },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_model',
            arguments: { model_owner: 'stability-ai', model_name: 'stable-diffusion' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.owner).toBe('stability-ai');
        expect(result.name).toBe('stable-diffusion');
        expect(result.run_count).toBe(150000000);
        expect(result.latest_version.id).toBe('db21e45d3f7023abc');
    });

    it('returns -32603 when model_owner or model_name is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_model',
            arguments: { model_owner: 'stability-ai' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_model_versions ───────────────────────────────────────────────────────

describe('list_model_versions', () => {
    it('returns list of versions', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: [
                { id: 'v2sha256', created_at: '2024-01-02T00:00:00Z', cog_version: '0.9.1', openapi_schema: { openapi: '3.0' } },
                { id: 'v1sha256', created_at: '2024-01-01T00:00:00Z', cog_version: '0.9.0', openapi_schema: null },
            ],
            next: null,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_model_versions',
            arguments: { model_owner: 'stability-ai', model_name: 'stable-diffusion' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.versions).toHaveLength(2);
        expect(result.versions[0].id).toBe('v2sha256');
    });

    it('returns -32603 when required params are missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_model_versions',
            arguments: { model_owner: 'stability-ai' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── search_models ─────────────────────────────────────────────────────────────

describe('search_models', () => {
    it('returns searched models', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: [
                {
                    owner: 'stability-ai',
                    name: 'stable-diffusion',
                    description: 'Text to image',
                    visibility: 'public',
                    run_count: 100000000,
                    url: 'https://replicate.com/stability-ai/stable-diffusion',
                    latest_version: { id: 'sha256abc' },
                },
            ],
            next: null,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_models',
            arguments: { query: 'stable diffusion' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.models).toHaveLength(1);
        expect(result.models[0].owner).toBe('stability-ai');
        expect(result.models[0].latest_version_id).toBe('sha256abc');
    });

    it('passes query param to API', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: [], next: null }));
        await worker.fetch(makeReq('tools/call', {
            name: 'search_models',
            arguments: { query: 'image upscaling' },
        }));
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('query=image+upscaling');
    });

    it('returns -32603 when query is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── get_account ───────────────────────────────────────────────────────────────

describe('get_account', () => {
    it('returns account info', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            username: 'testuser',
            name: 'Test User',
            type: 'organization',
            github_url: 'https://github.com/testuser',
        }));

        const res = await worker.fetch(makeReq('tools/call', { name: 'get_account', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.username).toBe('testuser');
        expect(result.type).toBe('organization');
    });
});

// ── list_deployments ──────────────────────────────────────────────────────────

describe('list_deployments', () => {
    it('returns mapped deployments', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: [
                {
                    owner: 'my-org',
                    name: 'my-sd-deployment',
                    current_release: {
                        number: 3,
                        model: 'stability-ai/stable-diffusion',
                        version: 'sha256abc',
                        created_at: '2024-01-01T00:00:00Z',
                        configuration: {
                            hardware: 'gpu-a40-large',
                            min_instances: 0,
                            max_instances: 5,
                        },
                    },
                },
            ],
            next: null,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_deployments',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.deployments).toHaveLength(1);
        expect(result.deployments[0].name).toBe('my-sd-deployment');
        expect(result.deployments[0].current_release.configuration.hardware).toBe('gpu-a40-large');
    });
});

// ── create_deployment_prediction ─────────────────────────────────────────────

describe('create_deployment_prediction', () => {
    it('creates prediction against a deployment', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'pred_deploy_1',
            status: 'starting',
            urls: { get: 'https://api.replicate.com/v1/predictions/pred_deploy_1' },
            output: null,
            created_at: '2024-01-01T00:00:00Z',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_deployment_prediction',
            arguments: {
                deployment_owner: 'my-org',
                deployment_name: 'my-sd-deployment',
                input: { prompt: 'a mountain at dusk' },
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.prediction_id).toBe('pred_deploy_1');
        expect(result.deployment).toBe('my-org/my-sd-deployment');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/deployments/my-org/my-sd-deployment/predictions');
    });

    it('returns -32603 when required params are missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_deployment_prediction',
            arguments: { deployment_owner: 'my-org', input: {} },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── create_model ──────────────────────────────────────────────────────────────

describe('create_model', () => {
    it('creates a new model', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            url: 'https://replicate.com/my-org/my-new-model',
            owner: 'my-org',
            name: 'my-new-model',
            visibility: 'private',
            description: 'A custom model',
            created_at: '2024-01-01T00:00:00Z',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_model',
            arguments: {
                owner: 'my-org',
                name: 'my-new-model',
                visibility: 'private',
                hardware: 'gpu-a40-small',
                description: 'A custom model',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.owner).toBe('my-org');
        expect(result.name).toBe('my-new-model');
        expect(result.visibility).toBe('private');
    });

    it('returns -32603 when required params are missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_model',
            arguments: { owner: 'my-org', name: 'model' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
