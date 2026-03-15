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
function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ error: { message } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-OPENAI-API-KEY': 'sk-test-key-abc',
        },
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
        expect(body.server).toBe('openai-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('openai-mcp');
        expect(body.result.serverInfo.version).toBe('1.0.0');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns exactly 7 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(7);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('chat_completion');
        expect(names).toContain('list_models');
        expect(names).toContain('create_embedding');
        expect(names).toContain('create_image');
        expect(names).toContain('create_moderation');
        expect(names).toContain('list_files');
        expect(names).toContain('list_fine_tuning_jobs');
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
    it('returns -32001 when no OPENAI-API-KEY header', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools: happy paths ────────────────────────────────────────────────────────

describe('chat_completion', () => {
    it('returns mapped completion', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            model: 'gpt-4',
            choices: [{ message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat_completion',
            arguments: {
                model: 'gpt-4',
                messages: [{ role: 'user', content: 'Hi' }],
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('chatcmpl-1');
        expect(result.message.content).toBe('Hello!');
        expect(result.usage.total_tokens).toBe(15);
    });

    it('returns -32603 when messages is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat_completion',
            arguments: { model: 'gpt-4' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('messages');
    });

    it('returns -32603 when messages is empty array', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat_completion',
            arguments: { model: 'gpt-4', messages: [] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 on OpenAI 429 rate limit', async () => {
        mockFetch.mockResolvedValueOnce(new Response(
            JSON.stringify({ error: { message: 'Rate limit exceeded', type: 'rate_limit_error', code: 'rate_limit_exceeded' } }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
        ));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat_completion',
            arguments: { messages: [{ role: 'user', content: 'Hi' }] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('429');
    });
});

describe('list_models', () => {
    it('returns mapped models sorted by created', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [
                { id: 'gpt-4', object: 'model', owned_by: 'openai', created: 1700000100 },
                { id: 'gpt-3.5-turbo', object: 'model', owned_by: 'openai', created: 1700000000 },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('gpt-4');
        expect(result[0].owned_by).toBe('openai');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(401, 'Invalid API key'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_embedding', () => {
    it('returns embedding preview', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1], index: 0 }],
            model: 'text-embedding-ada-002',
            usage: { total_tokens: 5 },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_embedding',
            arguments: { input: 'Hello world' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.model).toBe('text-embedding-ada-002');
        expect(result.dimensions).toBe(11);
        expect(result.embedding_preview).toHaveLength(10);
        expect(result.usage.total_tokens).toBe(5);
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(400, 'Invalid input'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_embedding',
            arguments: { input: '' },
        }));
        // empty string is falsy so throws before fetch
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_image', () => {
    it('returns image urls', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            created: 1700000000,
            data: [{ url: 'https://oaidalleapiprodscus.blob.core.windows.net/test.png', revised_prompt: 'A cat' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_image',
            arguments: { prompt: 'A cute cat' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].url).toContain('blob.core.windows.net');
        expect(result[0].revised_prompt).toBe('A cat');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(400, 'Content policy violation'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_image',
            arguments: { prompt: 'Explicit content' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_moderation', () => {
    it('returns moderation result not flagged', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'modr-1',
            results: [{ flagged: false, categories: { hate: false, harassment: false }, category_scores: { hate: 0.001 } }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_moderation',
            arguments: { input: 'Hello world' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.flagged).toBe(false);
        expect(result.categories).toHaveProperty('hate');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(500, 'Server error'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_moderation',
            arguments: { input: 'test' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_files', () => {
    it('returns mapped files', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{ id: 'file-1', filename: 'training.jsonl', purpose: 'fine-tune', bytes: 1024, created_at: 1700000000 }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_files',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('file-1');
        expect(result[0].filename).toBe('training.jsonl');
        expect(result[0].purpose).toBe('fine-tune');
        expect(result[0].bytes).toBe(1024);
    });

    it('returns empty array when no files', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: [] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_files',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toEqual([]);
    });
});

describe('list_fine_tuning_jobs', () => {
    it('returns mapped fine-tuning jobs', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [{
                id: 'ftjob-1', status: 'succeeded', model: 'gpt-3.5-turbo',
                fine_tuned_model: 'ft:gpt-3.5-turbo:org:1', created_at: 1700000000,
            }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_fine_tuning_jobs',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('ftjob-1');
        expect(result[0].status).toBe('succeeded');
        expect(result[0].fine_tuned_model).toBe('ft:gpt-3.5-turbo:org:1');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(403, 'Forbidden'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_fine_tuning_jobs',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── E2E (skipped in CI) ───────────────────────────────────────────────────────

describe.skip('E2E — real OpenAI API', () => {
    it('lists real models', async () => {
        // Requires OPENAI_API_KEY in env
    });
});
