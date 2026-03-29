import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'vapi-test-key-abc123';

const mockAssistant = {
    id: 'asst_abc123',
    name: 'My Assistant',
    model: { provider: 'openai', model: 'gpt-4o', messages: [{ role: 'system', content: 'You are helpful.' }] },
    voice: { provider: '11labs', voiceId: 'voice_xyz' },
    firstMessage: 'Hello! How can I help you?',
    createdAt: '2024-01-01T00:00:00Z',
};

const mockAssistantList = [mockAssistant];

const mockCall = {
    id: 'call_abc123',
    assistantId: 'asst_abc123',
    status: 'ended',
    duration: 120,
    transcript: [{ role: 'assistant', message: 'Hello!' }, { role: 'user', message: 'Hi!' }],
    createdAt: '2024-01-01T00:00:00Z',
};

const mockCallList = [mockCall];

const mockPhoneNumbers = [{
    id: 'pn_abc123',
    number: '+15551234567',
    provider: 'twilio',
    createdAt: '2024-01-01T00:00:00Z',
}];

const mockCreatedCall = {
    id: 'call_new123',
    status: 'queued',
    assistantId: 'asst_abc123',
    customer: { number: '+15559876543' },
};

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function apiNoContent() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

function apiErr(message: string, status = 400) {
    return Promise.resolve(new Response(JSON.stringify({ message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function makeReq(method: string, params?: unknown, missingAuth = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingAuth) headers['X-Mcp-Secret-VAPI-API-KEY'] = API_KEY;
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
    it('GET / returns status ok with server mcp-vapi and tools 9', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-vapi');
        expect(body.tools).toBe(9);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'bad json',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { protocolVersion: string; serverInfo: { name: string } } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-vapi');
    });

    it('tools/list returns exactly 9 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as { result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> } };
        expect(body.result.tools).toHaveLength(9);
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
    it('missing VAPI_API_KEY returns -32001', async () => {
        const body = await callTool('list_assistants', {}, true);
        expect(body.error?.code).toBe(-32001);
        expect(body.error?.message).toContain('VAPI_API_KEY');
    });

    it('passes Bearer token in Authorization header', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockAssistantList));
        await callTool('list_assistants');
        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect((options.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
});

// ── Assistants ────────────────────────────────────────────────────────────────

describe('list_assistants', () => {
    it('GETs /assistant with limit and returns assistant list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockAssistantList));
        const result = await getToolResult('list_assistants');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe('asst_abc123');

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/assistant');
        expect(url).toContain('limit=');
    });
});

describe('get_assistant', () => {
    it('GETs /assistant/{id} and returns assistant details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockAssistant));
        const result = await getToolResult('get_assistant', { id: 'asst_abc123' });
        expect(result.id).toBe('asst_abc123');
        expect(result.name).toBe('My Assistant');

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/assistant/asst_abc123');
    });

    it('missing id returns error', async () => {
        const body = await callTool('get_assistant', {});
        expect(body.error).toBeDefined();
    });
});

describe('create_assistant', () => {
    it('POSTs to /assistant with correct body structure', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockAssistant));
        const result = await getToolResult('create_assistant', {
            name: 'My Assistant',
            model_provider: 'openai',
            model_name: 'gpt-4o',
            voice_provider: '11labs',
            voice_id: 'voice_xyz',
            first_message: 'Hello!',
        });
        expect(result.id).toBe('asst_abc123');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/assistant');
        expect(options.method).toBe('POST');
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect((sent.model as { provider: string }).provider).toBe('openai');
        expect((sent.voice as { provider: string }).provider).toBe('11labs');
        expect(sent.firstMessage).toBe('Hello!');
    });
});

// ── Calls ─────────────────────────────────────────────────────────────────────

describe('list_calls', () => {
    it('GETs /call with limit and returns call list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCallList));
        const result = await getToolResult('list_calls');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].id).toBe('call_abc123');
    });
});

describe('get_call', () => {
    it('GETs /call/{id} and returns call with transcript', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCall));
        const result = await getToolResult('get_call', { id: 'call_abc123' });
        expect(result.id).toBe('call_abc123');
        expect(result.transcript).toHaveLength(2);

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/call/call_abc123');
    });
});

describe('create_call', () => {
    it('POSTs to /call with assistantId and customer number', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCreatedCall));
        const result = await getToolResult('create_call', {
            assistant_id: 'asst_abc123',
            customer_number: '+15559876543',
        });
        expect(result.id).toBe('call_new123');
        expect(result.status).toBe('queued');

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/call');
        expect(options.method).toBe('POST');
        const sent = JSON.parse(options.body as string) as Record<string, unknown>;
        expect(sent.assistantId).toBe('asst_abc123');
        expect((sent.customer as { number: string }).number).toBe('+15559876543');
    });
});

describe('delete_assistant', () => {
    it('DELETEs /assistant/{id} and returns success', async () => {
        mockFetch.mockResolvedValueOnce(apiNoContent());
        const result = await getToolResult('delete_assistant', { id: 'asst_abc123' });
        expect(result.success).toBe(true);

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/assistant/asst_abc123');
        expect(options.method).toBe('DELETE');
    });
});

describe('list_phone_numbers', () => {
    it('GETs /phone-number with limit and returns phone numbers', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockPhoneNumbers));
        const result = await getToolResult('list_phone_numbers');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].number).toBe('+15551234567');

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain('/phone-number');
    });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
    it('Vapi 401 error propagates as -32603', async () => {
        mockFetch.mockResolvedValueOnce(apiErr('Unauthorized', 401));
        const body = await callTool('list_assistants');
        expect(body.error?.code).toBe(-32603);
        expect(body.error?.message).toContain('401');
    });

    it('unknown tool returns error', async () => {
        const body = await callTool('nonexistent_tool');
        expect(body.error).toBeDefined();
        expect(body.error?.message).toContain('Unknown tool');
    });
});
