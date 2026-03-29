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

function apiErr(text: string, status = 400) {
    return Promise.resolve(new Response(text, { status }));
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-ASSEMBLYAI-API-KEY': 'test_aai_key',
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
        expect(body.server).toBe('mcp-assemblyai');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-assemblyai');
        expect(body.result.serverInfo.version).toBe('1.0.0');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 14 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(14);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('transcribe_url');
        expect(names).toContain('get_transcript');
        expect(names).toContain('list_transcripts');
        expect(names).toContain('delete_transcript');
        expect(names).toContain('create_realtime_token');
        expect(names).toContain('lemur_task');
        expect(names).toContain('lemur_summary');
        expect(names).toContain('lemur_qa');
        expect(names).toContain('lemur_action_items');
        expect(names).toContain('get_lemur_response');
        expect(names).toContain('upload_audio');
        expect(names).toContain('list_word_search');
        expect(names).toContain('get_sentences');
        expect(names).toContain('get_paragraphs');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('unknown/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('non-POST request', () => {
    it('returns 405', async () => {
        const req = new Request('http://localhost/', { method: 'PUT' });
        const res = await worker.fetch(req);
        expect(res.status).toBe(405);
    });
});

describe('missing auth', () => {
    it('returns -32001 when no secrets present', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_transcripts',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
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

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('transcribe_url', () => {
    it('submits transcription and returns transcript_id', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'txr_123',
            status: 'queued',
            audio_url: 'https://example.com/audio.mp3',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_url',
            arguments: { audio_url: 'https://example.com/audio.mp3' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.transcript_id).toBe('txr_123');
        expect(result.status).toBe('queued');
    });

    it('uses no Bearer prefix in Authorization header', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'txr_1', status: 'queued', audio_url: 'x' }));
        await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_url',
            arguments: { audio_url: 'https://example.com/audio.mp3' },
        }));
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].headers['Authorization']).toBe('test_aai_key');
    });

    it('includes optional features in request body', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'txr_2', status: 'queued', audio_url: 'x' }));
        await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_url',
            arguments: {
                audio_url: 'https://example.com/audio.mp3',
                speaker_labels: true,
                sentiment_analysis: true,
                summarization: true,
                summary_model: 'informative',
                summary_type: 'bullets',
            },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.speaker_labels).toBe(true);
        expect(fetchBody.sentiment_analysis).toBe(true);
        expect(fetchBody.summarization).toBe(true);
        expect(fetchBody.summary_model).toBe('informative');
        expect(fetchBody.summary_type).toBe('bullets');
    });

    it('returns -32603 when audio_url missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_url',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr('Unauthorized', 401));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_url',
            arguments: { audio_url: 'https://example.com/audio.mp3' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_transcript', () => {
    it('returns transcript details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'txr_123',
            status: 'completed',
            text: 'Hello world',
            words: [{ text: 'Hello', start: 0, end: 500 }],
            confidence: 0.98,
            audio_duration: 5.0,
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_transcript',
            arguments: { transcript_id: 'txr_123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.transcript_id).toBe('txr_123');
        expect(result.status).toBe('completed');
        expect(result.text).toBe('Hello world');
        expect(result.confidence).toBe(0.98);
    });

    it('returns -32603 when transcript_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_transcript',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_transcripts', () => {
    it('returns paginated transcripts', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            transcripts: [
                { id: 'txr_1', status: 'completed' },
                { id: 'txr_2', status: 'processing' },
            ],
            page_details: { limit: 20, result_count: 2 },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_transcripts',
            arguments: { limit: 20 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.transcripts).toHaveLength(2);
        expect(result.page_details.result_count).toBe(2);
    });

    it('passes status filter as query param', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ transcripts: [], page_details: {} }));
        await worker.fetch(makeReq('tools/call', {
            name: 'list_transcripts',
            arguments: { status: 'completed' },
        }));
        const url = new URL(mockFetch.mock.calls[0][0]);
        expect(url.searchParams.get('status')).toBe('completed');
    });
});

describe('delete_transcript', () => {
    it('deletes and returns success', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'txr_123', status: 'deleted' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'delete_transcript',
            arguments: { transcript_id: 'txr_123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
    });

    it('returns -32603 when transcript_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'delete_transcript',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_realtime_token', () => {
    it('returns a realtime token', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ token: 'rt_token_abc123' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_realtime_token',
            arguments: { expires_in: 600 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.token).toBe('rt_token_abc123');
    });

    it('uses default expires_in of 480', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ token: 'rt_token_default' }));
        await worker.fetch(makeReq('tools/call', {
            name: 'create_realtime_token',
            arguments: {},
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.expires_in).toBe(480);
    });
});

describe('lemur_task', () => {
    it('runs LeMUR task and returns response', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            request_id: 'lemur_req_1',
            response: 'The meeting discussed Q1 results and growth strategy.',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'lemur_task',
            arguments: {
                transcript_ids: ['txr_1', 'txr_2'],
                prompt: 'Summarize the key decisions made',
                context: 'This is a board meeting',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.request_id).toBe('lemur_req_1');
        expect(result.response).toContain('Q1');
    });

    it('returns -32603 when transcript_ids missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'lemur_task',
            arguments: { prompt: 'Summarize' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when prompt missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'lemur_task',
            arguments: { transcript_ids: ['txr_1'] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('lemur_summary', () => {
    it('generates a summary', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            request_id: 'lemur_sum_1',
            response: '- Key point 1\n- Key point 2',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'lemur_summary',
            arguments: {
                transcript_ids: ['txr_1'],
                answer_format: 'bullets',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.request_id).toBe('lemur_sum_1');
        expect(result.response).toContain('Key point');
    });
});

describe('lemur_qa', () => {
    it('answers questions about transcript', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            request_id: 'lemur_qa_1',
            response: [
                { question: 'What was decided?', answer: 'To increase budget by 20%' },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'lemur_qa',
            arguments: {
                transcript_ids: ['txr_1'],
                questions: [{ question: 'What was decided?' }],
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.response[0].answer).toContain('budget');
    });

    it('returns -32603 when questions missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'lemur_qa',
            arguments: { transcript_ids: ['txr_1'] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('lemur_action_items', () => {
    it('extracts action items', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            request_id: 'lemur_ai_1',
            response: '1. Follow up with client\n2. Prepare report',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'lemur_action_items',
            arguments: { transcript_ids: ['txr_1'] },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.response).toContain('Follow up');
    });
});

describe('get_lemur_response', () => {
    it('retrieves a previous LeMUR response', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            request_id: 'lemur_1',
            response: 'Previous response',
            usage: { input_tokens: 100, output_tokens: 50 },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_lemur_response',
            arguments: { request_id: 'lemur_1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.request_id).toBe('lemur_1');
        expect(result.usage.input_tokens).toBe(100);
    });
});

describe('upload_audio', () => {
    it('uploads audio and returns upload_url', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ upload_url: 'https://cdn.assemblyai.com/upload/abc123' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'upload_audio',
            arguments: {
                audio_base64: btoa('fake audio bytes'),
                content_type: 'audio/wav',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.upload_url).toContain('assemblyai.com');
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].headers['Content-Type']).toBe('audio/wav');
    });

    it('uses default content_type of audio/mp3', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ upload_url: 'https://cdn.assemblyai.com/upload/def456' }));
        await worker.fetch(makeReq('tools/call', {
            name: 'upload_audio',
            arguments: { audio_base64: btoa('audio') },
        }));
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].headers['Content-Type']).toBe('audio/mp3');
    });

    it('returns -32603 when audio_base64 missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'upload_audio',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_word_search', () => {
    it('searches for words in transcript', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'txr_123',
            total_count: 3,
            timestamps: [
                { text: 'hello', start: 100, end: 500 },
                { text: 'hello', start: 2000, end: 2400 },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_word_search',
            arguments: { transcript_id: 'txr_123', words: 'hello,world' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.total_count).toBe(3);
        expect(result.timestamps).toHaveLength(2);
    });

    it('returns -32603 when words missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_word_search',
            arguments: { transcript_id: 'txr_123' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_sentences', () => {
    it('returns sentences from transcript', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            sentences: [
                { text: 'Hello world.', start: 0, end: 2000, confidence: 0.97 },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_sentences',
            arguments: { transcript_id: 'txr_123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.sentences).toHaveLength(1);
        expect(result.sentences[0].text).toBe('Hello world.');
    });
});

describe('get_paragraphs', () => {
    it('returns paragraphs from transcript', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            paragraphs: [
                { text: 'First paragraph.', start: 0, end: 5000, confidence: 0.95 },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_paragraphs',
            arguments: { transcript_id: 'txr_123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.paragraphs).toHaveLength(1);
        expect(result.paragraphs[0].text).toBe('First paragraph.');
    });
});
