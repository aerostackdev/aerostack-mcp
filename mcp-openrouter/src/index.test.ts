import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'sk-or-test-key-abc123';

const mockChatCompletion = {
    id: 'gen-abc123',
    object: 'chat.completion',
    model: 'openai/gpt-4o',
    choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello from OpenRouter!' },
        finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
};

const mockModelsList = {
    data: [
        { id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.000005', completion: '0.000015' } },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', pricing: { prompt: '0.000003', completion: '0.000015' } },
    ],
};

const mockModel = {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    context_length: 128000,
    pricing: { prompt: '0.000005', completion: '0.000015' },
};

const mockCredits = {
    data: {
        label: 'My API Key',
        usage: 0.05,
        limit: 10.0,
        is_free_tier: false,
        rate_limit: { requests: 200, interval: '10s' },
    },
};

const mockGeneration = {
    data: {
        id: 'gen-abc123',
        model: 'openai/gpt-4o',
        total_cost: 0.00025,
        tokens_prompt: 10,
        tokens_completion: 6,
    },
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
    if (!missingAuth) headers['X-Mcp-Secret-OPENROUTER-API-KEY'] = API_KEY;
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
    it('GET / returns status ok with server mcp-openrouter and tools 5', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-openrouter');
        expect(body.tools).toBe(5);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'PUT' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{{invalid',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-openrouter');
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
    it('missing OPENROUTER_API_KEY returns -32001', async () => {
        const body = await callTool('list_models', {}, true);
        expect(body.error?.code).toBe(-32001);
        expect(body.error?.message).toContain('OPENROUTER_API_KEY');
    });

    it('passes Bearer token and HTTP-Referer headers', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockModelsList));
        await callTool('list_models');
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect((options.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
        expect((options.headers as Record<string, string>)['HTTP-Referer']).toBe('https://aerostack.dev');
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('chat_completion', () => {
    it('POSTs to /chat/completions with model and messages', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockChatCompletion));
        const result = await getToolResult('chat_completion', {
            model: 'openai/gpt-4o',
            messages: [{ role: 'user', content: 'Hello!' }],
        });
        expect(result.id).toBe('gen-abc123');
        expect(result.choices[0].message.content).toBe('Hello from OpenRouter!');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/chat/completions');
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.model).toBe('openai/gpt-4o');
    });

    it('includes max_tokens and temperature when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockChatCompletion));
        await getToolResult('chat_completion', {
            model: 'openai/gpt-4o',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 500,
            temperature: 0.7,
        });
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.max_tokens).toBe(500);
        expect(sent.temperature).toBe(0.7);
    });
});

describe('list_models', () => {
    it('GETs /models and returns models array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockModelsList));
        const result = await getToolResult('list_models');
        expect(result.data).toHaveLength(2);
        expect(result.data[0].id).toBe('openai/gpt-4o');
    });
});

describe('get_model', () => {
    it('GETs /models/{model_id} and returns model details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockModel));
        const result = await getToolResult('get_model', { model_id: 'openai/gpt-4o' });
        expect(result.id).toBe('openai/gpt-4o');
        expect(result.context_length).toBe(128000);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/models/openai/gpt-4o');
    });

    it('missing model_id returns error', async () => {
        const body = await callTool('get_model', {});
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('model_id');
    });
});

describe('get_credits', () => {
    it('GETs /auth/key and returns credit info', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCredits));
        const result = await getToolResult('get_credits');
        expect(result.data.usage).toBe(0.05);
        expect(result.data.limit).toBe(10.0);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/auth/key');
    });
});

describe('get_generation', () => {
    it('GETs /generation?id={id} and returns generation details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockGeneration));
        const result = await getToolResult('get_generation', { generation_id: 'gen-abc123' });
        expect(result.data.id).toBe('gen-abc123');
        expect(result.data.total_cost).toBe(0.00025);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/generation?id=gen-abc123');
    });

    it('missing generation_id returns error', async () => {
        const body = await callTool('get_generation', {});
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('generation_id');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('OpenRouter 401 error propagates as -32603', async () => {
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
