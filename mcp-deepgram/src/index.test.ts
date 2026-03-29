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
    'X-Mcp-Secret-DEEPGRAM-API-KEY': 'test_dg_key',
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
        expect(body.server).toBe('mcp-deepgram');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-deepgram');
        expect(body.result.serverInfo.version).toBe('1.0.0');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 12 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(12);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('transcribe_url');
        expect(names).toContain('transcribe_audio');
        expect(names).toContain('text_to_speech');
        expect(names).toContain('analyze_intent');
        expect(names).toContain('detect_topics');
        expect(names).toContain('detect_sentiment');
        expect(names).toContain('summarize_audio');
        expect(names).toContain('list_projects');
        expect(names).toContain('get_project');
        expect(names).toContain('list_api_keys');
        expect(names).toContain('get_usage_summary');
        expect(names).toContain('list_models');
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
    it('returns 405 for GET to non-health path', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        expect(res.status).toBe(405);
    });
});

describe('missing auth', () => {
    it('returns -32001 when no secret present', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_projects',
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

describe('invalid jsonrpc', () => {
    it('returns -32600 when jsonrpc is not 2.0', async () => {
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

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('transcribe_url', () => {
    it('returns transcript from URL', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: {
                channels: [{
                    alternatives: [{ transcript: 'Hello world', words: [], confidence: 0.99 }],
                    detected_language: 'en',
                }],
                utterances: null,
                summary: null,
            },
            metadata: { duration: 5.0 },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_url',
            arguments: { url: 'https://example.com/audio.mp3' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.transcript).toBe('Hello world');
        expect(result.confidence).toBe(0.99);
        expect(result.detected_language).toBe('en');
    });

    it('passes correct query parameters', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: { channels: [{ alternatives: [{ transcript: '', words: [], confidence: 0 }] }] },
            metadata: {},
        }));
        await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_url',
            arguments: { url: 'https://example.com/audio.mp3', model: 'nova-2-meeting', diarize: true },
        }));
        const url = new URL(mockFetch.mock.calls[0][0]);
        expect(url.searchParams.get('model')).toBe('nova-2-meeting');
        expect(url.searchParams.get('diarize')).toBe('true');
    });

    it('returns -32603 when url is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_url',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr('Bad request', 400));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_url',
            arguments: { url: 'https://example.com/audio.mp3' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('transcribe_audio', () => {
    it('sends binary audio and returns transcript', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: {
                channels: [{
                    alternatives: [{ transcript: 'Test audio', words: [], confidence: 0.95 }],
                }],
            },
            metadata: {},
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_audio',
            arguments: {
                audio_base64: btoa('fake audio data'),
                content_type: 'audio/mp3',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.transcript).toBe('Test audio');
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].headers['Content-Type']).toBe('audio/mp3');
    });

    it('returns -32603 when audio_base64 missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_audio',
            arguments: { content_type: 'audio/mp3' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('text_to_speech', () => {
    it('returns base64 audio', async () => {
        const fakeAudio = new Uint8Array([0x49, 0x44, 0x33]).buffer;
        mockFetch.mockResolvedValueOnce(Promise.resolve(new Response(fakeAudio, {
            status: 200,
            headers: { 'Content-Type': 'audio/mpeg' },
        })));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'text_to_speech',
            arguments: { text: 'Hello world', model: 'aura-asteria-en' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.audio_base64).toBeTruthy();
        expect(result.content_type).toBe('audio/mpeg');
        expect(result.data_uri).toContain('data:audio/mpeg;base64,');
        expect(result.size_bytes).toBe(3);
    });

    it('returns -32603 when text is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'text_to_speech',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('analyze_intent', () => {
    it('returns intents from audio', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: {
                intents: [{ intent: 'Book a flight', confidence: 0.9 }],
                channels: [{ alternatives: [{ transcript: 'I want to book a flight' }] }],
            },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'analyze_intent',
            arguments: { url: 'https://example.com/audio.mp3' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.intents).toHaveLength(1);
        expect(result.transcript).toBe('I want to book a flight');
    });
});

describe('detect_topics', () => {
    it('returns topics from audio', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: {
                topics: [{ topic: 'Technology', confidence: 0.85 }],
                channels: [{ alternatives: [{ transcript: 'AI is transforming tech' }] }],
            },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'detect_topics',
            arguments: { url: 'https://example.com/audio.mp3' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.topics).toHaveLength(1);
    });
});

describe('detect_sentiment', () => {
    it('returns sentiment segments', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: {
                sentiments: {
                    segments: [{ text: 'Great service', sentiment: 'positive', score: 0.9 }],
                    average: { sentiment: 'positive', score: 0.9 },
                },
            },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'detect_sentiment',
            arguments: { url: 'https://example.com/audio.mp3' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.segments).toHaveLength(1);
        expect(result.average_sentiment.sentiment).toBe('positive');
    });
});

describe('summarize_audio', () => {
    it('returns summary and transcript', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: {
                summary: { text: 'Speaker discussed Q1 results.' },
                channels: [{ alternatives: [{ transcript: 'In Q1 we saw growth...' }] }],
            },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'summarize_audio',
            arguments: { url: 'https://example.com/meeting.mp3' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.summary).toBe('Speaker discussed Q1 results.');
        expect(result.transcript).toBe('In Q1 we saw growth...');
    });
});

describe('list_projects', () => {
    it('returns projects list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            projects: [
                { project_id: 'proj1', name: 'My Project', company: 'Acme' },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_projects',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.projects).toHaveLength(1);
        expect(result.projects[0].name).toBe('My Project');
    });
});

describe('get_project', () => {
    it('returns project details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            project_id: 'proj1',
            name: 'My Project',
            company: 'Acme',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_project',
            arguments: { project_id: 'proj1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.project_id).toBe('proj1');
        expect(result.name).toBe('My Project');
    });

    it('returns -32603 when project_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_project',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_api_keys', () => {
    it('returns api keys for project', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            api_keys: [
                { api_key_id: 'key1', comment: 'Production', scopes: ['usage:read'], created: '2024-01-01' },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_api_keys',
            arguments: { project_id: 'proj1' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.api_keys).toHaveLength(1);
    });
});

describe('get_usage_summary', () => {
    it('returns usage data', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            start: '2024-01-01',
            end: '2024-01-31',
            resolution: 'day',
            results: [{ hours: 5.2, requests: 100, tokens: 5000, characters: 25000 }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_usage_summary',
            arguments: { project_id: 'proj1', start_date: '2024-01-01', end_date: '2024-01-31' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.start).toBe('2024-01-01');
        expect(result.results).toHaveLength(1);
    });

    it('returns -32603 when project_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_usage_summary',
            arguments: { start_date: '2024-01-01', end_date: '2024-01-31' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_models', () => {
    it('returns models list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            stt: [
                { name: 'Nova-2', canonical_name: 'nova-2', architecture: 'nova', language: 'en' },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.models).toHaveLength(1);
        expect(result.models[0].canonical_name).toBe('nova-2');
    });
});
