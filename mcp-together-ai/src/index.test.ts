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

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-TOGETHER-API-KEY': 'test_together_key',
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
    it('returns status ok with correct server name', async () => {
        const req = new Request('http://localhost/health');
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-together-ai');
        expect(body.version).toBe('1.0.0');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('non-POST request', () => {
    it('returns 405', async () => {
        const req = new Request('http://localhost/', { method: 'DELETE' });
        const res = await worker.fetch(req);
        expect(res.status).toBe(405);
    });
});

describe('parse error', () => {
    it('returns -32700 on invalid JSON', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{invalid',
        });
        const res = await worker.fetch(req);
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
    });
});

describe('invalid jsonrpc version', () => {
    it('returns -32600', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'initialize' }),
        });
        const res = await worker.fetch(req);
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32600);
    });
});

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-together-ai');
        expect(body.result.serverInfo.version).toBe('1.0.0');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns exactly 12 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(12);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('chat');
        expect(names).toContain('complete');
        expect(names).toContain('embed');
        expect(names).toContain('generate_image');
        expect(names).toContain('list_models');
        expect(names).toContain('get_model');
        expect(names).toContain('upload_file');
        expect(names).toContain('list_files');
        expect(names).toContain('delete_file');
        expect(names).toContain('create_fine_tuning_job');
        expect(names).toContain('list_fine_tuning_jobs');
        expect(names).toContain('get_fine_tuning_job');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('not/a/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('missing auth', () => {
    it('returns -32001 when no secret header', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── chat ──────────────────────────────────────────────────────────────────────

describe('chat', () => {
    it('returns content, model, usage', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'chatcmpl-1',
            model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
            choices: [{ message: { content: 'Hello from Llama!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {
                messages: [{ role: 'user', content: 'Hi' }],
                model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.content).toBe('Hello from Llama!');
        expect(result.model).toBe('meta-llama/Llama-3.3-70B-Instruct-Turbo');
        expect(result.usage.total_tokens).toBe(18);
        expect(result.id).toBe('chatcmpl-1');
    });

    it('passes optional params correctly', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'c2',
            model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        }));

        await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {
                messages: [{ role: 'user', content: 'hi' }],
                model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
                temperature: 0.7,
                top_k: 50,
                repetition_penalty: 1.1,
                response_format: 'json_object',
            },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.temperature).toBe(0.7);
        expect(reqBody.top_k).toBe(50);
        expect(reqBody.repetition_penalty).toBe(1.1);
        expect(reqBody.response_format).toEqual({ type: 'json_object' });
    });

    it('returns -32603 when messages is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: { model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when model is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: { messages: [{ role: 'user', content: 'hi' }] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {
                messages: [{ role: 'user', content: 'hi' }],
                model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
            },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── complete ──────────────────────────────────────────────────────────────────

describe('complete', () => {
    it('returns completion text', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            model: 'mistralai/Mixtral-8x7B-v0.1',
            choices: [{ text: 'The answer is 42.', finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'complete',
            arguments: {
                prompt: 'What is the answer to life?',
                model: 'mistralai/Mixtral-8x7B-v0.1',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.text).toBe('The answer is 42.');
        expect(result.model).toBe('mistralai/Mixtral-8x7B-v0.1');
    });

    it('uses default max_tokens of 512', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            model: 'm',
            choices: [{ text: 'result', finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }));

        await worker.fetch(makeReq('tools/call', {
            name: 'complete',
            arguments: { prompt: 'test', model: 'mistralai/Mixtral-8x7B-v0.1' },
        }));
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.max_tokens).toBe(512);
    });

    it('returns -32603 when prompt is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'complete',
            arguments: { model: 'mixtral' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── embed ─────────────────────────────────────────────────────────────────────

describe('embed', () => {
    it('returns embeddings array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            model: 'togethercomputer/m2-bert-80M-8k-retrieval',
            data: [
                { index: 0, embedding: [0.1, 0.2, 0.3] },
            ],
            usage: { prompt_tokens: 5, total_tokens: 5 },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'embed',
            arguments: {
                input: 'Hello world',
                model: 'togethercomputer/m2-bert-80M-8k-retrieval',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.embeddings).toHaveLength(1);
        expect(result.embeddings[0].embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('parses JSON array input', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            model: 'togethercomputer/m2-bert-80M-8k-retrieval',
            data: [
                { index: 0, embedding: [0.1] },
                { index: 1, embedding: [0.2] },
            ],
        }));

        await worker.fetch(makeReq('tools/call', {
            name: 'embed',
            arguments: {
                input: '["Hello", "World"]',
                model: 'togethercomputer/m2-bert-80M-8k-retrieval',
            },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(Array.isArray(reqBody.input)).toBe(true);
        expect(reqBody.input).toHaveLength(2);
    });

    it('returns -32603 when input missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'embed',
            arguments: { model: 'togethercomputer/m2-bert-80M-8k-retrieval' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── generate_image ────────────────────────────────────────────────────────────

describe('generate_image', () => {
    it('returns images array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ url: 'https://example.com/image.png', b64_json: null }],
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: {
                prompt: 'A cat in space',
                model: 'black-forest-labs/FLUX.1-schnell-Free',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.images).toHaveLength(1);
        expect(result.images[0].url).toBe('https://example.com/image.png');
    });

    it('uses default dimensions', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [] }));

        await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: {
                prompt: 'test',
                model: 'black-forest-labs/FLUX.1-schnell-Free',
            },
        }));
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.width).toBe(1024);
        expect(reqBody.height).toBe(1024);
        expect(reqBody.n).toBe(1);
    });

    it('returns -32603 when prompt missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: { model: 'black-forest-labs/FLUX.1-schnell-Free' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_models ───────────────────────────────────────────────────────────────

describe('list_models', () => {
    it('returns models list from array response', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', display_name: 'Llama 3.3 70B', type: 'chat' },
            { id: 'black-forest-labs/FLUX.1-schnell-Free', display_name: 'FLUX.1 Schnell', type: 'image' },
        ]));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.models).toHaveLength(2);
        expect(result.total).toBe(2);
        expect(result.models[0].id).toBe('meta-llama/Llama-3.3-70B-Instruct-Turbo');
    });
});

// ── get_model ─────────────────────────────────────────────────────────────────

describe('get_model', () => {
    it('returns model details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
            display_name: 'Llama 3.3 70B',
            context_length: 131072,
            type: 'chat',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_model',
            arguments: { model_id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('meta-llama/Llama-3.3-70B-Instruct-Turbo');
        expect(result.context_length).toBe(131072);
    });

    it('returns -32603 when model_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_model',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── upload_file ───────────────────────────────────────────────────────────────

describe('upload_file', () => {
    it('uploads file and returns file_id', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'file_abc123',
            filename: 'train.jsonl',
            size: 1024,
            purpose: 'fine-tune',
            created_at: 1700000000,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'upload_file',
            arguments: {
                filename: 'train.jsonl',
                content_base64: btoa('{"messages": []}'),
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.file_id).toBe('file_abc123');
        expect(result.filename).toBe('train.jsonl');
    });

    it('sends as multipart/form-data', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'file_1', filename: 'f.jsonl', size: 10, purpose: 'fine-tune', created_at: 1 }));

        await worker.fetch(makeReq('tools/call', {
            name: 'upload_file',
            arguments: { filename: 'f.jsonl', content_base64: btoa('data') },
        }));

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].body).toBeInstanceOf(FormData);
    });

    it('returns -32603 when filename missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'upload_file',
            arguments: { content_base64: btoa('data') },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_files ────────────────────────────────────────────────────────────────

describe('list_files', () => {
    it('returns files list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            { id: 'file_1', filename: 'train.jsonl', size: 1024, purpose: 'fine-tune', created_at: 1700000000 },
        ]));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_files',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.files).toHaveLength(1);
        expect(result.files[0].file_id).toBe('file_1');
    });
});

// ── delete_file ───────────────────────────────────────────────────────────────

describe('delete_file', () => {
    it('deletes file and returns success', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ deleted: true, id: 'file_abc' }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'delete_file',
            arguments: { file_id: 'file_abc' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.file_id).toBe('file_abc');
    });

    it('returns -32603 when file_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'delete_file',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── create_fine_tuning_job ────────────────────────────────────────────────────

describe('create_fine_tuning_job', () => {
    it('creates a fine-tuning job', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'ft_job_123',
            status: 'queued',
            model: 'meta-llama/Llama-3-8b-hf',
            created_at: 1700000000,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_fine_tuning_job',
            arguments: {
                training_file: 'file_abc',
                model: 'meta-llama/Llama-3-8b-hf',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.job_id).toBe('ft_job_123');
        expect(result.status).toBe('queued');
    });

    it('uses default n_epochs of 1', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'ft_1', status: 'queued', model: 'm', created_at: 1 }));

        await worker.fetch(makeReq('tools/call', {
            name: 'create_fine_tuning_job',
            arguments: { training_file: 'file_1', model: 'model' },
        }));
        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.n_epochs).toBe(1);
    });

    it('returns -32603 when training_file missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_fine_tuning_job',
            arguments: { model: 'meta-llama/Llama-3-8b-hf' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_fine_tuning_jobs ─────────────────────────────────────────────────────

describe('list_fine_tuning_jobs', () => {
    it('returns jobs list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            { id: 'ft_1', status: 'completed', model: 'llama', created_at: 1700000000, fine_tuned_model: 'ft:llama:custom' },
            { id: 'ft_2', status: 'running', model: 'mistral', created_at: 1700001000, fine_tuned_model: null },
        ]));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_fine_tuning_jobs',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.jobs).toHaveLength(2);
        expect(result.jobs[0].job_id).toBe('ft_1');
        expect(result.jobs[0].fine_tuned_model).toBe('ft:llama:custom');
    });
});

// ── get_fine_tuning_job ───────────────────────────────────────────────────────

describe('get_fine_tuning_job', () => {
    it('returns job details with events', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'ft_abc',
            status: 'completed',
            model: 'meta-llama/Llama-3-8b-hf',
            events: [
                { name: 'training_started', created_at: 1700000000 },
                { name: 'training_completed', created_at: 1700003600 },
            ],
            fine_tuned_model: 'ft:llama:my-model',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_fine_tuning_job',
            arguments: { job_id: 'ft_abc' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.job_id).toBe('ft_abc');
        expect(result.status).toBe('completed');
        expect(result.events).toHaveLength(2);
        expect(result.fine_tuned_model).toBe('ft:llama:my-model');
    });

    it('returns -32603 when job_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_fine_tuning_job',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
