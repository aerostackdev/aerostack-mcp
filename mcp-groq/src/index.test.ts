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
    'X-Mcp-Secret-GROQ-API-KEY': 'test_groq_key',
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
        expect(body.server).toBe('mcp-groq');
        expect(body.version).toBe('1.0.0');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('non-POST request', () => {
    it('returns 405', async () => {
        const req = new Request('http://localhost/', { method: 'PUT' });
        const res = await worker.fetch(req);
        expect(res.status).toBe(405);
    });
});

describe('parse error', () => {
    it('returns -32700 on invalid JSON', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-json',
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
        expect(body.result.serverInfo.name).toBe('mcp-groq');
        expect(body.result.serverInfo.version).toBe('1.0.0');
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.capabilities.tools).toBeDefined();
    });
});

describe('tools/list', () => {
    it('returns exactly 10 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(10);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('chat');
        expect(names).toContain('list_models');
        expect(names).toContain('transcribe_audio');
        expect(names).toContain('translate_audio');
        expect(names).toContain('create_speech');
        expect(names).toContain('list_speech_voices');
        expect(names).toContain('create_batch');
        expect(names).toContain('list_batches');
        expect(names).toContain('get_batch');
        expect(names).toContain('cancel_batch');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('unknown/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
        expect(body.error.message).toContain('Method not found');
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
    it('calls chat completions and returns content', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'chatcmpl-123',
            model: 'llama-3.3-70b-versatile',
            choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {
                messages: [{ role: 'user', content: 'Hi there' }],
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.content).toBe('Hello!');
        expect(result.model).toBe('llama-3.3-70b-versatile');
        expect(result.finish_reason).toBe('stop');
        expect(result.usage.total_tokens).toBe(15);
        expect(result.id).toBe('chatcmpl-123');
    });

    it('uses default model when not specified', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'chatcmpl-1',
            model: 'llama-3.3-70b-versatile',
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }));

        await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: { messages: [{ role: 'user', content: 'test' }] },
        }));

        const fetchCall = mockFetch.mock.calls[0];
        const reqBody = JSON.parse(fetchCall[1].body);
        expect(reqBody.model).toBe('llama-3.3-70b-versatile');
    });

    it('passes optional params correctly', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'chatcmpl-2',
            model: 'gemma2-9b-it',
            choices: [{ message: { content: 'sure' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        }));

        await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {
                messages: [{ role: 'user', content: 'test' }],
                model: 'gemma2-9b-it',
                temperature: 0.5,
                max_tokens: 100,
                response_format: 'json_object',
            },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.model).toBe('gemma2-9b-it');
        expect(reqBody.temperature).toBe(0.5);
        expect(reqBody.max_tokens).toBe(100);
        expect(reqBody.response_format).toEqual({ type: 'json_object' });
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

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(new Response('Rate limit exceeded', { status: 429 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: { messages: [{ role: 'user', content: 'hi' }] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('429');
    });
});

// ── list_models ───────────────────────────────────────────────────────────────

describe('list_models', () => {
    it('returns mapped models list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [
                { id: 'llama-3.3-70b-versatile', object: 'model', created: 1700000000, owned_by: 'Meta', active: true, context_window: 128000 },
                { id: 'gemma2-9b-it', object: 'model', created: 1700000001, owned_by: 'Google', active: true, context_window: 8192 },
            ],
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.models).toHaveLength(2);
        expect(result.total).toBe(2);
        expect(result.models[0].id).toBe('llama-3.3-70b-versatile');
        expect(result.models[0].context_window).toBe(128000);
    });
});

// ── transcribe_audio ──────────────────────────────────────────────────────────

describe('transcribe_audio', () => {
    it('transcribes audio and returns text', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            text: 'Hello world this is a test',
            language: 'en',
            duration: 3.5,
        }));

        // Valid minimal base64 (just some bytes)
        const audio_base64 = btoa('fake audio data');
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_audio',
            arguments: { audio_base64, filename: 'test.mp3' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.text).toBe('Hello world this is a test');
        expect(result.language).toBe('en');
        expect(result.duration).toBe(3.5);
    });

    it('sends multipart/form-data with model and filename', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ text: 'hello' }));

        await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_audio',
            arguments: {
                audio_base64: btoa('audio'),
                filename: 'speech.wav',
                model: 'whisper-large-v3-turbo',
                language: 'fr',
            },
        }));

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('/audio/transcriptions');
        expect(fetchCall[1].body).toBeInstanceOf(FormData);
    });

    it('returns -32603 when audio_base64 is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_audio',
            arguments: { filename: 'test.mp3' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when filename is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_audio',
            arguments: { audio_base64: btoa('data') },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── translate_audio ───────────────────────────────────────────────────────────

describe('translate_audio', () => {
    it('translates audio to English', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ text: 'Hello in English' }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'translate_audio',
            arguments: {
                audio_base64: btoa('audio data'),
                filename: 'audio.mp3',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.text).toBe('Hello in English');
    });

    it('returns -32603 when audio_base64 missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'translate_audio',
            arguments: { filename: 'audio.mp3' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── create_speech ─────────────────────────────────────────────────────────────

describe('create_speech', () => {
    it('converts text to speech and returns base64 audio', async () => {
        const fakeAudio = new Uint8Array([82, 73, 70, 70]); // RIFF header bytes
        mockFetch.mockResolvedValueOnce(Promise.resolve(new Response(fakeAudio.buffer, {
            status: 200,
            headers: { 'Content-Type': 'audio/wav' },
        })));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_speech',
            arguments: { input: 'Hello world' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.audio_base64).toBeTruthy();
        expect(result.content_type).toBe('audio/wav');
        expect(result.data_uri).toContain('data:audio/wav;base64,');
        expect(result.size_bytes).toBe(4);
    });

    it('uses default model and voice', async () => {
        const fakeAudio = new Uint8Array([1, 2, 3]);
        mockFetch.mockResolvedValueOnce(Promise.resolve(new Response(fakeAudio.buffer, {
            status: 200,
            headers: { 'Content-Type': 'audio/wav' },
        })));

        await worker.fetch(makeReq('tools/call', {
            name: 'create_speech',
            arguments: { input: 'test' },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.model).toBe('playai-tts');
        expect(reqBody.voice).toBe('Fritz-PlayAI');
        expect(reqBody.response_format).toBe('wav');
    });

    it('returns -32603 when input is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_speech',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── create_batch ──────────────────────────────────────────────────────────────

describe('create_batch', () => {
    it('creates a batch job', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'batch_abc123',
            status: 'validating',
            created_at: 1700000000,
            endpoint: '/v1/chat/completions',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_batch',
            arguments: {
                input_file_id: 'file_abc',
                endpoint: '/v1/chat/completions',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.batch_id).toBe('batch_abc123');
        expect(result.status).toBe('validating');
    });

    it('uses default completion_window', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'batch_1', status: 'validating', created_at: 1 }));

        await worker.fetch(makeReq('tools/call', {
            name: 'create_batch',
            arguments: { input_file_id: 'file_1', endpoint: '/v1/chat/completions' },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.completion_window).toBe('24h');
    });

    it('returns -32603 when input_file_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_batch',
            arguments: { endpoint: '/v1/chat/completions' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_batches ──────────────────────────────────────────────────────────────

describe('list_batches', () => {
    it('returns batches list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: [
                { id: 'batch_1', status: 'completed', created_at: 1700000000, request_counts: { total: 100, completed: 100, failed: 0 } },
                { id: 'batch_2', status: 'in_progress', created_at: 1700001000, request_counts: { total: 50, completed: 20, failed: 1 } },
            ],
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_batches',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.batches).toHaveLength(2);
        expect(result.batches[0].batch_id).toBe('batch_1');
        expect(result.batches[0].status).toBe('completed');
    });
});

// ── get_batch ─────────────────────────────────────────────────────────────────

describe('get_batch', () => {
    it('returns batch details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'batch_xyz',
            status: 'completed',
            created_at: 1700000000,
            completed_at: 1700003600,
            request_counts: { total: 10, completed: 10, failed: 0 },
            output_file_id: 'file_out_abc',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_batch',
            arguments: { batch_id: 'batch_xyz' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.batch_id).toBe('batch_xyz');
        expect(result.status).toBe('completed');
        expect(result.output_file_id).toBe('file_out_abc');
    });

    it('returns -32603 when batch_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_batch',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── cancel_batch ──────────────────────────────────────────────────────────────

describe('cancel_batch', () => {
    it('cancels a batch and returns status', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'batch_abc', status: 'cancelling' }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'cancel_batch',
            arguments: { batch_id: 'batch_abc' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.batch_id).toBe('batch_abc');
        expect(result.status).toBe('cancelling');
    });

    it('returns -32603 when batch_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'cancel_batch',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_speech_voices ────────────────────────────────────────────────────────

describe('list_speech_voices', () => {
    it('returns voices list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            voices: [
                { voice_id: 'Fritz-PlayAI', name: 'Fritz', preview_url: null },
                { voice_id: 'Celeste-PlayAI', name: 'Celeste', preview_url: null },
            ],
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_speech_voices',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.voices).toHaveLength(2);
        expect(result.voices[0].voice_id).toBe('Fritz-PlayAI');
    });
});
