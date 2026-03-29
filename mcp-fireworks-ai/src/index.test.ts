import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'fw-test-key-abc123';

const mockChatCompletion = {
    id: 'cmpl_abc123',
    object: 'chat.completion',
    model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello from Llama!' },
        finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
};

const mockTextCompletion = {
    id: 'cmpl_def456',
    object: 'text_completion',
    model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    choices: [{ text: ' world! How are you?', finish_reason: 'stop' }],
    usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
};

const mockEmbedding = {
    object: 'list',
    data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3, 0.4, 0.5] }],
    model: 'nomic-ai/nomic-embed-text-v1.5',
    usage: { prompt_tokens: 5, total_tokens: 5 },
};

const mockModelsList = {
    object: 'list',
    data: [
        { id: 'accounts/fireworks/models/llama-v3p1-8b-instruct', object: 'model', created: 1700000000 },
        { id: 'accounts/fireworks/models/mixtral-8x7b-instruct', object: 'model', created: 1700000001 },
    ],
};

const mockImageGeneration = {
    created: 1700000000,
    data: [{ url: 'https://cdn.fireworks.ai/images/generated-image-123.png' }],
};

function apiOk(data: unknown) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiErr(message: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ error: { message, code: status } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, missingAuth = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingAuth) headers['X-Mcp-Secret-FIREWORKS-API-KEY'] = API_KEY;
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
    it('GET / returns status ok with server mcp-fireworks-ai and tools 5', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-fireworks-ai');
        expect(body.tools).toBe(5);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{{bad json',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-fireworks-ai');
    });

    it('tools/list returns exactly 5 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(5);
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
    it('missing FIREWORKS_API_KEY returns -32001', async () => {
        const body = await callTool('list_models', {}, true);
        expect(body.error?.code).toBe(-32001);
        expect(body.error?.message).toContain('FIREWORKS_API_KEY');
    });

    it('passes Bearer token in Authorization header', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockModelsList));
        await callTool('list_models');
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect((options.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('chat_completion', () => {
    it('POSTs to /chat/completions with messages and default model', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockChatCompletion));
        const result = await getToolResult('chat_completion', {
            messages: [{ role: 'user', content: 'Hello' }],
        });
        expect(result.id).toBe('cmpl_abc123');
        expect(result.choices[0].message.content).toBe('Hello from Llama!');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/chat/completions');
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.model).toBe('accounts/fireworks/models/llama-v3p1-8b-instruct');
        expect(sent.max_tokens).toBe(1024);
    });

    it('uses custom model and temperature when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockChatCompletion));
        await getToolResult('chat_completion', {
            messages: [{ role: 'user', content: 'Hi' }],
            model: 'accounts/fireworks/models/mixtral-8x7b-instruct',
            temperature: 0.5,
        });
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.model).toBe('accounts/fireworks/models/mixtral-8x7b-instruct');
        expect(sent.temperature).toBe(0.5);
    });
});

describe('text_completion', () => {
    it('POSTs to /completions with prompt', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockTextCompletion));
        const result = await getToolResult('text_completion', { prompt: 'Hello' });
        expect(result.choices[0].text).toBe(' world! How are you?');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/completions');
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.prompt).toBe('Hello');
        expect(sent.max_tokens).toBe(512);
    });
});

describe('create_embedding', () => {
    it('POSTs to /embeddings with text input and default model', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockEmbedding));
        const result = await getToolResult('create_embedding', { input: 'embed this' });
        expect(result.data[0].embedding).toHaveLength(5);

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/embeddings');
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.model).toBe('nomic-ai/nomic-embed-text-v1.5');
        expect(sent.input).toBe('embed this');
    });

    it('supports array input', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockEmbedding));
        await getToolResult('create_embedding', { input: ['text 1', 'text 2'] });
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(Array.isArray(sent.input)).toBe(true);
        expect((sent.input as string[]).length).toBe(2);
    });
});

describe('list_models', () => {
    it('GETs /models and returns model list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockModelsList));
        const result = await getToolResult('list_models');
        expect(result.data).toHaveLength(2);
        expect(result.data[0].id).toBe('accounts/fireworks/models/llama-v3p1-8b-instruct');

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/models');
    });
});

describe('image_generation', () => {
    it('POSTs to image_generation path with prompt', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockImageGeneration));
        const result = await getToolResult('image_generation', { prompt: 'A beautiful sunset' });
        expect(result.data[0].url).toContain('https://');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('stable-diffusion-xl-1024-v1-0');
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.prompt).toBe('A beautiful sunset');
    });

    it('includes n, width, height when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockImageGeneration));
        await getToolResult('image_generation', { prompt: 'sunset', n: 2, width: 512, height: 512 });
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.n).toBe(2);
        expect(sent.width).toBe(512);
        expect(sent.height).toBe(512);
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('Fireworks 401 error propagates as -32603', async () => {
        mockFetch.mockResolvedValueOnce(apiErr('Invalid API key', 401));
        const body = await callTool('list_models');
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('401');
    });

    it('unknown tool returns error', async () => {
        const body = await callTool('nonexistent_tool');
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('Unknown tool');
    });
});
