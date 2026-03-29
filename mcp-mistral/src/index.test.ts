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
    'X-Mcp-Secret-MISTRAL-API-KEY': 'test_mistral_key',
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
        expect(body.server).toBe('mcp-mistral');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-mistral');
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
        expect(names).toContain('embed');
        expect(names).toContain('fill_in_middle');
        expect(names).toContain('list_models');
        expect(names).toContain('get_model');
        expect(names).toContain('upload_file');
        expect(names).toContain('list_files');
        expect(names).toContain('delete_file');
        expect(names).toContain('create_fine_tuning_job');
        expect(names).toContain('list_fine_tuning_jobs');
        expect(names).toContain('get_fine_tuning_job');
        expect(names).toContain('cancel_fine_tuning_job');
    });
});

describe('missing auth', () => {
    it('returns -32001 when API key is absent', async () => {
        const res = await worker.fetch(
            makeReqNoAuth('tools/call', { name: 'list_models', arguments: {} }),
        );
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('MISTRAL_API_KEY');
    });
});

// ── chat ──────────────────────────────────────────────────────────────────────

describe('chat', () => {
    it('returns message content and usage', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'cmpl_abc123',
            model: 'mistral-large-latest',
            choices: [
                {
                    message: { role: 'assistant', content: 'The capital of France is Paris.' },
                    finish_reason: 'stop',
                },
            ],
            usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {
                messages: [{ role: 'user', content: 'What is the capital of France?' }],
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.content).toBe('The capital of France is Paris.');
        expect(result.model).toBe('mistral-large-latest');
        expect(result.finish_reason).toBe('stop');
        expect(result.usage.total_tokens).toBe(23);
    });

    it('uses mistral-large-latest as default model', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            model: 'mistral-large-latest',
            choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        }));
        await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: { messages: [{ role: 'user', content: 'hi' }] },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.model).toBe('mistral-large-latest');
    });

    it('wraps response_format in type object', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            model: 'mistral-large-latest',
            choices: [{ message: { content: '{"key":"value"}' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        }));
        await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {
                messages: [{ role: 'user', content: 'Return JSON' }],
                response_format: 'json_object',
            },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.response_format).toEqual({ type: 'json_object' });
    });

    it('sends to /chat/completions endpoint', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            model: 'mistral-large-latest',
            choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
            usage: {},
        }));
        await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: { messages: [{ role: 'user', content: 'hello' }] },
        }));
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/chat/completions');
    });

    it('returns -32603 when messages is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when messages is empty', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: { messages: [] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── embed ─────────────────────────────────────────────────────────────────────

describe('embed', () => {
    it('returns embeddings with index', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            model: 'mistral-embed',
            data: [
                { index: 0, embedding: [0.1, 0.2, 0.3] },
                { index: 1, embedding: [0.4, 0.5, 0.6] },
            ],
            usage: { prompt_tokens: 10, total_tokens: 10 },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'embed',
            arguments: { inputs: ['hello', 'world'] },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.embeddings).toHaveLength(2);
        expect(result.embeddings[0].index).toBe(0);
        expect(result.embeddings[0].embedding).toHaveLength(3);
        expect(result.model).toBe('mistral-embed');
    });

    it('uses mistral-embed as default model', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ model: 'mistral-embed', data: [], usage: {} }));
        await worker.fetch(makeReq('tools/call', {
            name: 'embed',
            arguments: { inputs: ['test'] },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.model).toBe('mistral-embed');
        expect(fetchBody.encoding_format).toBe('float');
    });

    it('returns -32603 when inputs is empty', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'embed',
            arguments: { inputs: [] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── fill_in_middle ────────────────────────────────────────────────────────────

describe('fill_in_middle', () => {
    it('returns code completion', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            model: 'codestral-latest',
            choices: [
                { message: { content: '    return x + y\n' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 6, total_tokens: 26 },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'fill_in_middle',
            arguments: {
                prompt: 'def add(x, y):\n',
                suffix: '\nresult = add(1, 2)',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.completion).toBe('    return x + y\n');
        expect(result.model).toBe('codestral-latest');
        expect(result.finish_reason).toBe('stop');
    });

    it('posts to /fim/completions endpoint', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            model: 'codestral-latest',
            choices: [{ message: { content: '    pass' }, finish_reason: 'stop' }],
            usage: {},
        }));
        await worker.fetch(makeReq('tools/call', {
            name: 'fill_in_middle',
            arguments: { prompt: 'def foo():\n', suffix: '\nresult = foo()' },
        }));
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/fim/completions');
    });

    it('returns -32603 when suffix is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'fill_in_middle',
            arguments: { prompt: 'def foo():' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_models ───────────────────────────────────────────────────────────────

describe('list_models', () => {
    it('returns mapped models list with total', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [
                {
                    id: 'mistral-large-latest',
                    object: 'model',
                    created: 1700000000,
                    owned_by: 'mistralai',
                    name: 'Mistral Large',
                    description: 'Top-tier reasoning model',
                    max_context_length: 128000,
                    aliases: ['mistral-large-2411'],
                    type: 'base',
                },
            ],
        }));

        const res = await worker.fetch(makeReq('tools/call', { name: 'list_models', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.models).toHaveLength(1);
        expect(result.models[0].id).toBe('mistral-large-latest');
        expect(result.models[0].max_context_length).toBe(128000);
        expect(result.total).toBe(1);
    });
});

// ── get_model ─────────────────────────────────────────────────────────────────

describe('get_model', () => {
    it('returns model details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'mistral-large-latest',
            object: 'model',
            created: 1700000000,
            owned_by: 'mistralai',
            name: 'Mistral Large',
            description: 'Top-tier reasoning',
            max_context_length: 128000,
            type: 'base',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_model',
            arguments: { model_id: 'mistral-large-latest' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('mistral-large-latest');
        expect(result.type).toBe('base');
    });

    it('returns -32603 when model_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_model',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_files ────────────────────────────────────────────────────────────────

describe('list_files', () => {
    it('returns mapped files list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [
                {
                    id: 'file_abc123',
                    filename: 'training_data.jsonl',
                    purpose: 'fine-tune',
                    bytes: 102400,
                    created_at: 1700000000,
                    status: 'processed',
                },
            ],
        }));

        const res = await worker.fetch(makeReq('tools/call', { name: 'list_files', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.files).toHaveLength(1);
        expect(result.files[0].file_id).toBe('file_abc123');
        expect(result.files[0].filename).toBe('training_data.jsonl');
        expect(result.total).toBe(1);
    });
});

// ── delete_file ───────────────────────────────────────────────────────────────

describe('delete_file', () => {
    it('deletes file successfully', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'file_abc123', deleted: true }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'delete_file',
            arguments: { file_id: 'file_abc123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.file_id).toBe('file_abc123');
    });

    it('returns -32603 when file_id is missing', async () => {
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
            id: 'ftjob_abc123',
            model: 'open-mistral-7b',
            status: 'QUEUED',
            training_files: [{ file_id: 'file_train_1' }],
            created_at: 1700000000,
            fine_tuned_model: null,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_fine_tuning_job',
            arguments: {
                model: 'open-mistral-7b',
                training_files: ['file_train_1'],
                suffix: 'my-model',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.job_id).toBe('ftjob_abc123');
        expect(result.status).toBe('QUEUED');
        expect(result.model).toBe('open-mistral-7b');
    });

    it('maps training_files to file_id objects', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'ftjob_1',
            model: 'open-mistral-7b',
            status: 'QUEUED',
            training_files: [],
            created_at: 1700000000,
        }));
        await worker.fetch(makeReq('tools/call', {
            name: 'create_fine_tuning_job',
            arguments: {
                model: 'open-mistral-7b',
                training_files: ['file_abc', 'file_def'],
            },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.training_files).toEqual([{ file_id: 'file_abc' }, { file_id: 'file_def' }]);
    });

    it('returns -32603 when training_files is empty', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_fine_tuning_job',
            arguments: { model: 'open-mistral-7b', training_files: [] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_fine_tuning_jobs ─────────────────────────────────────────────────────

describe('list_fine_tuning_jobs', () => {
    it('returns mapped jobs list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [
                {
                    id: 'ftjob_1',
                    model: 'open-mistral-7b',
                    status: 'SUCCESS',
                    created_at: 1700000000,
                    fine_tuned_model: 'ft:open-mistral-7b:my-org:my-model:abc123',
                },
            ],
            total: 1,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_fine_tuning_jobs',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.jobs).toHaveLength(1);
        expect(result.jobs[0].job_id).toBe('ftjob_1');
        expect(result.jobs[0].status).toBe('SUCCESS');
    });
});

// ── get_fine_tuning_job ───────────────────────────────────────────────────────

describe('get_fine_tuning_job', () => {
    it('returns job details with events', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'ftjob_1',
            model: 'open-mistral-7b',
            status: 'RUNNING',
            created_at: 1700000000,
            trained_tokens: 5000,
            fine_tuned_model: null,
            events: [
                { name: 'status-updated', created_at: 1700000001, message: 'Job started' },
            ],
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_fine_tuning_job',
            arguments: { job_id: 'ftjob_1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.job_id).toBe('ftjob_1');
        expect(result.status).toBe('RUNNING');
        expect(result.trained_tokens).toBe(5000);
        expect(result.events).toHaveLength(1);
        expect(result.events[0].name).toBe('status-updated');
    });

    it('returns -32603 when job_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_fine_tuning_job',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── cancel_fine_tuning_job ────────────────────────────────────────────────────

describe('cancel_fine_tuning_job', () => {
    it('cancels a job and returns updated status', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'ftjob_1',
            model: 'open-mistral-7b',
            status: 'CANCELLED',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'cancel_fine_tuning_job',
            arguments: { job_id: 'ftjob_1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.job_id).toBe('ftjob_1');
        expect(result.status).toBe('CANCELLED');
    });

    it('returns -32603 when job_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'cancel_fine_tuning_job',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
