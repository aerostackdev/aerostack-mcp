import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'AIza-test-key-abc123';

const mockGenerateResponse = {
    candidates: [{
        content: { parts: [{ text: 'Hello from Gemini!' }], role: 'model' },
        finishReason: 'STOP',
    }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 4 },
};

const mockModelsList = {
    models: [
        { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', supportedGenerationMethods: ['generateContent'] },
    ],
};

const mockModel = {
    name: 'models/gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    inputTokenLimit: 1048576,
    outputTokenLimit: 8192,
    supportedGenerationMethods: ['generateContent', 'countTokens'],
};

const mockTokenCount = { totalTokens: 7 };

const mockEmbedResponse = {
    embedding: { values: [0.1, 0.2, 0.3, 0.4, 0.5] },
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
    if (!missingAuth) headers['X-Mcp-Secret-GEMINI-API-KEY'] = API_KEY;
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
    it('GET / returns status ok with server mcp-gemini and tools 6', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-gemini');
        expect(body.tools).toBe(6);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json{{{',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-gemini');
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
        const req = makeReq('unknown/method');
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
    it('missing GEMINI_API_KEY returns -32001', async () => {
        const body = await callTool('generate_content', { prompt: 'hello' }, true);
        expect(body.error?.code).toBe(-32001);
        expect(body.error?.message).toContain('GEMINI_API_KEY');
    });

    it('passes api key as Authorization Bearer header', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockGenerateResponse));
        await callTool('generate_content', { prompt: 'hi' });
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect((options.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('generate_content', () => {
    it('POSTs to correct URL with prompt wrapped in contents', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockGenerateResponse));
        const result = await getToolResult('generate_content', { prompt: 'Hello Gemini' });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].content.parts[0].text).toBe('Hello from Gemini!');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/models/gemini-2.0-flash:generateContent');
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect((sent.contents as Array<{ role: string; parts: Array<{ text: string }> }>)[0].parts[0].text).toBe('Hello Gemini');
    });

    it('uses custom model when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockGenerateResponse));
        await getToolResult('generate_content', { prompt: 'Hi', model: 'gemini-1.5-pro' });
        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/models/gemini-1.5-pro:generateContent');
    });

    it('includes generationConfig when temperature or maxOutputTokens provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockGenerateResponse));
        await getToolResult('generate_content', { prompt: 'Hi', temperature: 0.5, maxOutputTokens: 512 });
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect((sent.generationConfig as { temperature: number; maxOutputTokens: number }).temperature).toBe(0.5);
        expect((sent.generationConfig as { temperature: number; maxOutputTokens: number }).maxOutputTokens).toBe(512);
    });
});

describe('list_models', () => {
    it('GETs /models and returns model list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockModelsList));
        const result = await getToolResult('list_models');
        expect(result.models).toHaveLength(2);
        expect(result.models[0].displayName).toBe('Gemini 2.0 Flash');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/models');
        expect((options.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
});

describe('get_model', () => {
    it('GETs /models/{model} and returns model details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockModel));
        const result = await getToolResult('get_model', { model: 'gemini-2.0-flash' });
        expect(result.displayName).toBe('Gemini 2.0 Flash');
        expect(result.inputTokenLimit).toBe(1048576);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/models/gemini-2.0-flash');
    });

    it('missing model param returns error', async () => {
        const body = await callTool('get_model', {});
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('model');
    });
});

describe('count_tokens', () => {
    it('POSTs to countTokens endpoint and returns totalTokens', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockTokenCount));
        const result = await getToolResult('count_tokens', { prompt: 'How many tokens?' });
        expect(result.totalTokens).toBe(7);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain(':countTokens');
    });
});

describe('embed_content', () => {
    it('POSTs to text-embedding-004:embedContent and returns embedding', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockEmbedResponse));
        const result = await getToolResult('embed_content', { text: 'embed this text' });
        expect(result.embedding.values).toHaveLength(5);

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('text-embedding-004:embedContent');
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect((sent.content as { parts: Array<{ text: string }> }).parts[0].text).toBe('embed this text');
    });
});

describe('generate_with_system', () => {
    it('POSTs with system_instruction and contents', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockGenerateResponse));
        const result = await getToolResult('generate_with_system', {
            prompt: 'What is 2+2?',
            systemPrompt: 'You are a math tutor.',
        });
        expect(result.candidates).toHaveLength(1);

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect((sent.system_instruction as { parts: Array<{ text: string }> }).parts[0].text).toBe('You are a math tutor.');
        expect((sent.contents as Array<{ parts: Array<{ text: string }> }>)[0].parts[0].text).toBe('What is 2+2?');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('Gemini 401 error propagates as -32603', async () => {
        mockFetch.mockResolvedValueOnce(apiErr('API key not valid', 401));
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
