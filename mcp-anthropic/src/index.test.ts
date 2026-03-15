import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_KEY = 'sk-ant-test-key-abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockMessage = {
    id: 'msg_01',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello' }],
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
};

const mockModelsList = {
    data: [{ id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' }],
};

const mockModel = {
    id: 'claude-sonnet-4-6',
    display_name: 'Claude Sonnet 4.6',
    type: 'model',
    created_at: '2024-01-01T00:00:00Z',
};

const mockTokenCount = { input_tokens: 42 };

const mockBatch = {
    id: 'msgbatch_01xyz',
    type: 'message_batch',
    processing_status: 'in_progress',
    request_counts: { processing: 5, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
    created_at: '2024-01-01T00:00:00Z',
    expires_at: '2024-01-02T00:00:00Z',
};

const mockBatchList = {
    data: [mockBatch],
    has_more: false,
    first_id: 'msgbatch_01xyz',
    last_id: 'msgbatch_01xyz',
};

const mockWorkspaces = {
    data: [{ id: 'wrkspc_01', name: 'Default', display_color: 'gray' }],
    has_more: false,
};

const mockApiKeys = {
    data: [{ id: 'apikey_01', name: 'My API Key', status: 'active', created_at: '2024-01-01T00:00:00Z' }],
    has_more: false,
};

const mockUsage = {
    data: [{ timestamp: '2024-01-01', input_tokens: 100, output_tokens: 50 }],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiErr(message: string, type: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ error: { type, message } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, missingAuth = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingAuth) headers['X-Mcp-Secret-ANTHROPIC-API-KEY'] = API_KEY;
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

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-anthropic and tools 12', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-anthropic');
        expect(body.tools).toBe(12);
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
        expect(body.result.serverInfo.name).toBe('mcp-anthropic');
    });

    it('tools/list returns exactly 12 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(12);
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
    it('missing ANTHROPIC_API_KEY returns -32001', async () => {
        const body = await callTool('create_message', { messages: [{ role: 'user', content: 'hi' }] }, true);
        expect(body.error?.code).toBe(-32001);
        expect(body.error?.message).toContain('ANTHROPIC_API_KEY');
    });

    it('passes x-api-key header on API calls', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockMessage));
        await callTool('create_message', { messages: [{ role: 'user', content: 'hi' }] });
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect((options.headers as Record<string, string>)['x-api-key']).toBe(API_KEY);
        expect((options.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');
    });
});

// ── Messages ──────────────────────────────────────────────────────────────────

describe('Messages', () => {
    it('create_message — sends POST /messages with correct body', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockMessage));
        const result = await getToolResult('create_message', {
            messages: [{ role: 'user', content: 'Hello' }],
        });
        expect(result.id).toBe('msg_01');
        expect(result.role).toBe('assistant');
        expect(result.model).toBe('claude-sonnet-4-6');
        expect(result.stop_reason).toBe('end_turn');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/v1/messages');
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.stream).toBe(false); // always false
        expect(sent.model).toBe('claude-sonnet-4-6');
        expect(sent.max_tokens).toBe(1024);
    });

    it('create_message — sets system, temperature, top_p, stop_sequences when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockMessage));
        await getToolResult('create_message', {
            messages: [{ role: 'user', content: 'Hi' }],
            system: 'You are a helpful assistant.',
            temperature: 0.5,
            top_p: 0.9,
            stop_sequences: ['STOP'],
        });
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.system).toBe('You are a helpful assistant.');
        expect(sent.temperature).toBe(0.5);
        expect(sent.top_p).toBe(0.9);
        expect(sent.stop_sequences).toEqual(['STOP']);
    });

    it('create_message_with_tools — sends tools and tool_choice', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockMessage));
        const tools = [{ name: 'get_weather', description: 'Get weather', input_schema: { type: 'object', properties: { location: { type: 'string' } } } }];
        const result = await getToolResult('create_message_with_tools', {
            messages: [{ role: 'user', content: 'What is the weather?' }],
            tools,
            tool_choice: { type: 'auto' },
        });
        expect(result.id).toBe('msg_01');

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.tools).toBeDefined();
        expect(sent.tool_choice).toEqual({ type: 'auto' });
        expect(sent.stream).toBe(false);
    });

    it('count_tokens — POST /messages/count_tokens returns input_tokens', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockTokenCount));
        const result = await getToolResult('count_tokens', {
            messages: [{ role: 'user', content: 'Hello world' }],
        });
        expect(result.input_tokens).toBe(42);

        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/messages/count_tokens');
    });

    it('create_message_batch — POST /messages/batches returns batch object', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockBatch));
        const result = await getToolResult('create_message_batch', {
            requests: [
                {
                    custom_id: 'req_1',
                    params: {
                        model: 'claude-sonnet-4-6',
                        max_tokens: 100,
                        messages: [{ role: 'user', content: 'Hi' }],
                    },
                },
            ],
        });
        expect(result.id).toBe('msgbatch_01xyz');
        expect(result.processing_status).toBe('in_progress');
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/messages/batches');
    });
});

// ── Models ────────────────────────────────────────────────────────────────────

describe('Models', () => {
    it('list_models — GET /models returns data array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockModelsList));
        const result = await getToolResult('list_models');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('claude-sonnet-4-6');

        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/models');
    });

    it('get_model — GET /models/{model_id}', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockModel));
        const result = await getToolResult('get_model', { model_id: 'claude-sonnet-4-6' });
        expect(result.id).toBe('claude-sonnet-4-6');
        expect(result.display_name).toBe('Claude Sonnet 4.6');

        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/models/claude-sonnet-4-6');
    });

    it('get_model — missing model_id returns error', async () => {
        const body = await callTool('get_model', {});
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('model_id');
    });
});

// ── Message Batches ───────────────────────────────────────────────────────────

describe('Message Batches', () => {
    it('list_batches — GET /messages/batches with default limit 20', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockBatchList));
        const result = await getToolResult('list_batches');
        expect(result.data).toHaveLength(1);

        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/messages/batches');
        expect(url).toContain('limit=20');
    });

    it('list_batches — uses before_id for pagination', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockBatchList));
        await getToolResult('list_batches', { limit: 10, before_id: 'msgbatch_prev' });
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('before_id=msgbatch_prev');
        expect(url).toContain('limit=10');
    });

    it('get_batch — GET /messages/batches/{id}', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockBatch));
        const result = await getToolResult('get_batch', { message_batch_id: 'msgbatch_01xyz' });
        expect(result.id).toBe('msgbatch_01xyz');
        expect(result.processing_status).toBe('in_progress');

        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/messages/batches/msgbatch_01xyz');
    });

    it('get_batch — missing message_batch_id returns error', async () => {
        const body = await callTool('get_batch', {});
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('message_batch_id');
    });

    it('cancel_batch — POST /messages/batches/{id}/cancel', async () => {
        const canceled = { ...mockBatch, processing_status: 'canceling' };
        mockFetch.mockResolvedValueOnce(apiOk(canceled));
        const result = await getToolResult('cancel_batch', { message_batch_id: 'msgbatch_01xyz' });
        expect(result.processing_status).toBe('canceling');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/messages/batches/msgbatch_01xyz/cancel');
        expect(options.method).toBe('POST');
    });

    it('cancel_batch — missing message_batch_id returns error', async () => {
        const body = await callTool('cancel_batch', {});
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('message_batch_id');
    });
});

// ── Admin ─────────────────────────────────────────────────────────────────────

describe('Admin', () => {
    it('list_workspaces — sends anthropic-beta header and returns workspaces', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockWorkspaces));
        const result = await getToolResult('list_workspaces');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('wrkspc_01');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/organizations/workspaces');
        expect((options.headers as Record<string, string>)['anthropic-beta']).toBe('admin-api-2024-05-01');
    });

    it('get_usage — sends anthropic-beta header and returns usage data', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockUsage));
        const result = await getToolResult('get_usage');
        expect(result.data).toBeDefined();

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/usage');
        expect((options.headers as Record<string, string>)['anthropic-beta']).toBe('admin-api-2024-05-01');
    });

    it('list_api_keys — sends anthropic-beta header and returns api keys', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockApiKeys));
        const result = await getToolResult('list_api_keys');
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('apikey_01');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/api_keys');
        expect((options.headers as Record<string, string>)['anthropic-beta']).toBe('admin-api-2024-05-01');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('Anthropic 401 error propagates as -32603', async () => {
        mockFetch.mockResolvedValueOnce(apiErr('Invalid API key', 'authentication_error', 401));
        const body = await callTool('list_models');
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('401');
    });

    it('Anthropic 429 rate limit error propagates', async () => {
        mockFetch.mockResolvedValueOnce(apiErr('Rate limit exceeded', 'rate_limit_error', 429));
        const body = await callTool('list_models');
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('429');
    });

    it('unknown tool returns error', async () => {
        const body = await callTool('nonexistent_tool');
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('Unknown tool');
    });
});

// ── E2E (skipped — require real credentials) ──────────────────────────────────

describe.skip('E2E — real Anthropic API', () => {
    it('create_message — real API call', async () => {
        // Requires ANTHROPIC_API_KEY env var
    });

    it('list_models — real API call', async () => {
        // Requires ANTHROPIC_API_KEY env var
    });

    it('count_tokens — real API call', async () => {
        // Requires ANTHROPIC_API_KEY env var
    });
});
