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
    'X-Mcp-Secret-COHERE-API-KEY': 'test_cohere_key',
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
        expect(body.server).toBe('mcp-cohere');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-cohere');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns exactly 10 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(10);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('chat');
        expect(names).toContain('embed');
        expect(names).toContain('rerank');
        expect(names).toContain('classify');
        expect(names).toContain('generate');
        expect(names).toContain('tokenize');
        expect(names).toContain('detokenize');
        expect(names).toContain('detect_language');
        expect(names).toContain('summarize');
        expect(names).toContain('list_models');
    });
});

describe('missing auth', () => {
    it('returns -32001 when API key is absent', async () => {
        const res = await worker.fetch(
            makeReqNoAuth('tools/call', { name: 'list_models', arguments: {} }),
        );
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('COHERE_API_KEY');
    });
});

// ── chat ──────────────────────────────────────────────────────────────────────

describe('chat', () => {
    it('returns text response with usage', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            message: {
                content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
                citations: [],
                documents: [],
            },
            model: 'command-r-plus-08-2024',
            finish_reason: 'COMPLETE',
            usage: { billed_units: { input_tokens: 10, output_tokens: 8 } },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: { message: 'Hello!' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.text).toBe('Hello! How can I help you today?');
        expect(result.model).toBe('command-r-plus-08-2024');
        expect(result.finish_reason).toBe('COMPLETE');
    });

    it('uses command-r-plus-08-2024 as default model', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            message: { content: [{ type: 'text', text: 'OK' }], citations: [], documents: [] },
            finish_reason: 'COMPLETE',
        }));
        await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: { message: 'test' },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.model).toBe('command-r-plus-08-2024');
    });

    it('maps chat_history to v2 messages format', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            message: { content: [{ type: 'text', text: 'Sure' }], citations: [], documents: [] },
            finish_reason: 'COMPLETE',
        }));
        await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {
                message: 'follow-up question',
                chat_history: [
                    { role: 'USER', message: 'first question' },
                    { role: 'CHATBOT', message: 'first answer' },
                ],
            },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.messages).toHaveLength(3);
        expect(fetchBody.messages[0]).toEqual({ role: 'user', content: 'first question' });
        expect(fetchBody.messages[1]).toEqual({ role: 'assistant', content: 'first answer' });
        expect(fetchBody.messages[2]).toEqual({ role: 'user', content: 'follow-up question' });
    });

    it('includes system prompt when preamble provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            message: { content: [{ type: 'text', text: 'response' }], citations: [], documents: [] },
            finish_reason: 'COMPLETE',
        }));
        await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: { message: 'hello', preamble: 'You are a helpful assistant.' },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.system).toBe('You are a helpful assistant.');
    });

    it('returns -32603 when message is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── embed ─────────────────────────────────────────────────────────────────────

describe('embed', () => {
    it('returns embeddings', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            embeddings: {
                float: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
            },
            texts: ['hello world', 'foo bar'],
            model: 'embed-english-v3.0',
            response_type: 'embeddings_by_type',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'embed',
            arguments: {
                texts: ['hello world', 'foo bar'],
                input_type: 'search_document',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.embeddings.float).toHaveLength(2);
        expect(result.embeddings.float[0]).toHaveLength(3);
        expect(result.model).toBe('embed-english-v3.0');
    });

    it('uses embed-english-v3.0 and float as defaults', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ embeddings: { float: [[0.1]] }, texts: ['test'] }));
        await worker.fetch(makeReq('tools/call', {
            name: 'embed',
            arguments: { texts: ['test'], input_type: 'search_query' },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.model).toBe('embed-english-v3.0');
        expect(fetchBody.embedding_types).toEqual(['float']);
        expect(fetchBody.input_type).toBe('search_query');
    });

    it('returns -32603 when texts is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'embed',
            arguments: { input_type: 'search_query' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when input_type is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'embed',
            arguments: { texts: ['test'] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when texts is empty array', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'embed',
            arguments: { texts: [], input_type: 'search_query' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── rerank ────────────────────────────────────────────────────────────────────

describe('rerank', () => {
    it('returns documents sorted by relevance score', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: [
                { index: 2, relevance_score: 0.98, document: { text: 'most relevant doc' } },
                { index: 0, relevance_score: 0.65, document: { text: 'somewhat relevant' } },
                { index: 1, relevance_score: 0.12, document: { text: 'least relevant' } },
            ],
            model: 'rerank-english-v3.0',
            meta: { billed_units: { search_units: 1 } },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'rerank',
            arguments: {
                query: 'machine learning basics',
                documents: ['somewhat relevant', 'least relevant', 'most relevant doc'],
                top_n: 3,
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.results).toHaveLength(3);
        expect(result.results[0].index).toBe(2);
        expect(result.results[0].relevance_score).toBe(0.98);
        expect(result.results[0].document.text).toBe('most relevant doc');
    });

    it('returns -32603 when query is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'rerank',
            arguments: { documents: ['doc1'] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when documents is empty', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'rerank',
            arguments: { query: 'test', documents: [] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── classify ──────────────────────────────────────────────────────────────────

describe('classify', () => {
    it('returns classifications with confidence scores', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            classifications: [
                {
                    input: 'This product is amazing!',
                    prediction: 'positive',
                    confidence: 0.96,
                    labels: { positive: { confidence: 0.96 }, negative: { confidence: 0.04 } },
                },
            ],
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'classify',
            arguments: {
                inputs: ['This product is amazing!'],
                examples: [
                    { text: 'Great service', label: 'positive' },
                    { text: 'Terrible experience', label: 'negative' },
                ],
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.classifications).toHaveLength(1);
        expect(result.classifications[0].prediction).toBe('positive');
        expect(result.classifications[0].confidence).toBe(0.96);
    });

    it('returns -32603 when inputs is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'classify',
            arguments: { examples: [{ text: 'x', label: 'y' }] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when examples is empty', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'classify',
            arguments: { inputs: ['test'], examples: [] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── generate ──────────────────────────────────────────────────────────────────

describe('generate', () => {
    it('returns generated text', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'gen_abc123',
            prompt: 'Once upon a time',
            generations: [
                { id: 'g1', text: ' there was a dragon who loved to read.', finish_reason: 'COMPLETE' },
            ],
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate',
            arguments: { prompt: 'Once upon a time', max_tokens: 50 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.text).toBe(' there was a dragon who loved to read.');
        expect(result.generations).toHaveLength(1);
        expect(result.generations[0].finish_reason).toBe('COMPLETE');
    });

    it('uses command as default model and 1024 as default max_tokens', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            generations: [{ text: 'output', finish_reason: 'COMPLETE' }],
        }));
        await worker.fetch(makeReq('tools/call', {
            name: 'generate',
            arguments: { prompt: 'test' },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.model).toBe('command');
        expect(fetchBody.max_tokens).toBe(1024);
    });

    it('returns -32603 when prompt is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── tokenize ──────────────────────────────────────────────────────────────────

describe('tokenize', () => {
    it('returns token IDs and strings', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            tokens: [13292, 204, 6321],
            token_strings: ['Hello', ' world', '!'],
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'tokenize',
            arguments: { text: 'Hello world!', model: 'command' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.tokens).toEqual([13292, 204, 6321]);
        expect(result.token_strings).toEqual(['Hello', ' world', '!']);
    });

    it('returns -32603 when model is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'tokenize',
            arguments: { text: 'Hello' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── detokenize ────────────────────────────────────────────────────────────────

describe('detokenize', () => {
    it('returns reconstructed text', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ text: 'Hello world!' }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'detokenize',
            arguments: { tokens: [13292, 204, 6321], model: 'command' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.text).toBe('Hello world!');
    });

    it('returns -32603 when tokens is empty', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'detokenize',
            arguments: { tokens: [], model: 'command' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── detect_language ───────────────────────────────────────────────────────────

describe('detect_language', () => {
    it('returns detected languages', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: [
                { language_code: 'en', language_name: 'English' },
                { language_code: 'fr', language_name: 'French' },
            ],
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'detect_language',
            arguments: { texts: ['Hello world', 'Bonjour le monde'] },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.results).toHaveLength(2);
        expect(result.results[0].language_code).toBe('en');
        expect(result.results[1].language_name).toBe('French');
    });

    it('returns -32603 when texts is empty', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'detect_language',
            arguments: { texts: [] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── summarize ─────────────────────────────────────────────────────────────────

describe('summarize', () => {
    it('returns summary text', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'sum_abc',
            summary: 'The article discusses the importance of renewable energy sources.',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'summarize',
            arguments: {
                text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10),
                length: 'short',
                format: 'bullets',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.summary).toContain('renewable energy');
    });

    it('uses command as default model with medium length', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ summary: 'Summary here', id: 'sum_1' }));
        await worker.fetch(makeReq('tools/call', {
            name: 'summarize',
            arguments: { text: 'Some long text here... '.repeat(15) },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.model).toBe('command');
        expect(fetchBody.length).toBe('medium');
        expect(fetchBody.format).toBe('paragraph');
    });

    it('returns -32603 when text is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'summarize',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_models ───────────────────────────────────────────────────────────────

describe('list_models', () => {
    it('returns mapped models list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            models: [
                {
                    name: 'command-r-plus-08-2024',
                    endpoints: ['chat'],
                    finetuned: false,
                    context_length: 128000,
                    tokenizer_url: null,
                },
                {
                    name: 'embed-english-v3.0',
                    endpoints: ['embed'],
                    finetuned: false,
                    context_length: 512,
                    tokenizer_url: 'https://storage.googleapis.com/cohere-public/tokenizers/embed-english-v3.0.json',
                },
            ],
            next_page_token: null,
        }));

        const res = await worker.fetch(makeReq('tools/call', { name: 'list_models', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.models).toHaveLength(2);
        expect(result.models[0].name).toBe('command-r-plus-08-2024');
        expect(result.models[0].context_length).toBe(128000);
        expect(result.next_page_token).toBeNull();
    });

    it('passes endpoint filter to API', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ models: [], next_page_token: null }));
        await worker.fetch(makeReq('tools/call', {
            name: 'list_models',
            arguments: { endpoint: 'embed' },
        }));
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('endpoint=embed');
    });
});
