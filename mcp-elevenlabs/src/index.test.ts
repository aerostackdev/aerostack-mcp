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

function audioOk(bytes: Uint8Array) {
    return Promise.resolve(
        new Response(bytes, {
            status: 200,
            headers: { 'Content-Type': 'audio/mpeg' },
        }),
    );
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-ELEVENLABS-API-KEY': 'test_elevenlabs_key',
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
        expect(body.server).toBe('mcp-elevenlabs');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-elevenlabs');
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.capabilities.tools).toBeDefined();
    });
});

describe('tools/list', () => {
    it('returns exactly 14 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(14);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_voices');
        expect(names).toContain('get_voice');
        expect(names).toContain('get_voice_settings');
        expect(names).toContain('edit_voice_settings');
        expect(names).toContain('delete_voice');
        expect(names).toContain('text_to_speech');
        expect(names).toContain('text_to_speech_with_timestamps');
        expect(names).toContain('get_models');
        expect(names).toContain('get_user_info');
        expect(names).toContain('get_subscription');
        expect(names).toContain('list_history');
        expect(names).toContain('delete_history_items');
        expect(names).toContain('sound_generation');
        expect(names).toContain('list_shared_voices');
    });
});

describe('non-POST request', () => {
    it('returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        expect(res.status).toBe(405);
    });
});

describe('parse error', () => {
    it('returns -32700 on invalid JSON', async () => {
        const res = await worker.fetch(
            new Request('http://localhost/', {
                method: 'POST',
                headers: TEST_HEADERS,
                body: 'not-json',
            }),
        );
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
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
    it('returns -32001 when API key is absent', async () => {
        const res = await worker.fetch(
            makeReqNoAuth('tools/call', { name: 'list_voices', arguments: {} }),
        );
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('ELEVENLABS_API_KEY');
    });
});

// ── list_voices ───────────────────────────────────────────────────────────────

describe('list_voices', () => {
    it('returns mapped voices list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            voices: [
                {
                    voice_id: 'voice_abc123',
                    name: 'Rachel',
                    category: 'premade',
                    description: 'Calm and professional',
                    labels: { accent: 'american', gender: 'female' },
                    preview_url: 'https://cdn.elevenlabs.io/sample.mp3',
                    available_for_tiers: [],
                },
                {
                    voice_id: 'voice_def456',
                    name: 'Clyde',
                    category: 'premade',
                    labels: {},
                    available_for_tiers: ['creator'],
                },
            ],
        }));

        const res = await worker.fetch(makeReq('tools/call', { name: 'list_voices', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.voices).toHaveLength(2);
        expect(result.total).toBe(2);
        expect(result.voices[0].voice_id).toBe('voice_abc123');
        expect(result.voices[0].name).toBe('Rachel');
        expect(result.voices[0].labels.accent).toBe('american');
    });

    it('returns empty list when no voices', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ voices: [] }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_voices', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.voices).toEqual([]);
        expect(result.total).toBe(0);
    });

    it('includes show_legacy param in request URL', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ voices: [] }));
        await worker.fetch(makeReq('tools/call', {
            name: 'list_voices',
            arguments: { show_legacy: true },
        }));
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('show_legacy=true');
    });
});

// ── get_voice ─────────────────────────────────────────────────────────────────

describe('get_voice', () => {
    it('returns voice details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            voice_id: 'voice_abc123',
            name: 'Rachel',
            category: 'premade',
            description: 'A calm voice',
            labels: { gender: 'female' },
            preview_url: 'https://cdn.elevenlabs.io/sample.mp3',
            samples: [
                { sample_id: 'smp_1', file_name: 'sample.mp3', mime_type: 'audio/mpeg', size_bytes: 45000 },
            ],
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_voice',
            arguments: { voice_id: 'voice_abc123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.voice_id).toBe('voice_abc123');
        expect(result.name).toBe('Rachel');
        expect(result.samples).toHaveLength(1);
        expect(result.samples[0].sample_id).toBe('smp_1');
    });

    it('returns -32603 when voice_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_voice',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('voice_id');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(new Response('Not found', { status: 404 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_voice',
            arguments: { voice_id: 'nonexistent' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── get_voice_settings ────────────────────────────────────────────────────────

describe('get_voice_settings', () => {
    it('returns voice settings', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            stability: 0.71,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_voice_settings',
            arguments: { voice_id: 'voice_abc123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.stability).toBe(0.71);
        expect(result.similarity_boost).toBe(0.75);
        expect(result.use_speaker_boost).toBe(true);
    });

    it('returns -32603 when voice_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_voice_settings',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── edit_voice_settings ───────────────────────────────────────────────────────

describe('edit_voice_settings', () => {
    it('updates voice settings successfully', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'edit_voice_settings',
            arguments: {
                voice_id: 'voice_abc123',
                stability: 0.5,
                similarity_boost: 0.8,
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.voice_id).toBe('voice_abc123');
        expect(result.updated_settings.stability).toBe(0.5);
        expect(result.updated_settings.similarity_boost).toBe(0.8);
    });

    it('includes only provided settings in request', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
        await worker.fetch(makeReq('tools/call', {
            name: 'edit_voice_settings',
            arguments: { voice_id: 'v1', stability: 0.6 },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.stability).toBe(0.6);
        expect(fetchBody.similarity_boost).toBeUndefined();
    });

    it('returns -32603 when no settings provided', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'edit_voice_settings',
            arguments: { voice_id: 'voice_abc123' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when voice_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'edit_voice_settings',
            arguments: { stability: 0.5 },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── delete_voice ──────────────────────────────────────────────────────────────

describe('delete_voice', () => {
    it('deletes a voice successfully', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'delete_voice',
            arguments: { voice_id: 'voice_abc123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.deleted_voice_id).toBe('voice_abc123');
    });

    it('returns -32603 when voice_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'delete_voice',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── text_to_speech ────────────────────────────────────────────────────────────

describe('text_to_speech', () => {
    it('returns base64 audio and metadata', async () => {
        const audioBytes = new Uint8Array([0xFF, 0xFB, 0x90, 0x00, 0x01, 0x02]);
        mockFetch.mockResolvedValueOnce(audioOk(audioBytes));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'text_to_speech',
            arguments: {
                voice_id: 'voice_abc123',
                text: 'Hello, world!',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.audio_base64).toBeDefined();
        expect(result.content_type).toBe('audio/mpeg');
        expect(result.size_bytes).toBe(6);
        expect(result.data_uri).toMatch(/^data:audio\/mpeg;base64,/);
    });

    it('uses eleven_multilingual_v2 as default model', async () => {
        mockFetch.mockResolvedValueOnce(audioOk(new Uint8Array([0x00])));
        await worker.fetch(makeReq('tools/call', {
            name: 'text_to_speech',
            arguments: { voice_id: 'voice_abc123', text: 'test' },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.model_id).toBe('eleven_multilingual_v2');
    });

    it('includes voice_settings when stability provided', async () => {
        mockFetch.mockResolvedValueOnce(audioOk(new Uint8Array([0x00])));
        await worker.fetch(makeReq('tools/call', {
            name: 'text_to_speech',
            arguments: {
                voice_id: 'voice_abc123',
                text: 'test',
                stability: 0.5,
                similarity_boost: 0.8,
            },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.voice_settings.stability).toBe(0.5);
        expect(fetchBody.voice_settings.similarity_boost).toBe(0.8);
    });

    it('includes output_format query param', async () => {
        mockFetch.mockResolvedValueOnce(audioOk(new Uint8Array([0x00])));
        await worker.fetch(makeReq('tools/call', {
            name: 'text_to_speech',
            arguments: {
                voice_id: 'voice_abc123',
                text: 'test',
                output_format: 'mp3_44100_192',
            },
        }));
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('output_format=mp3_44100_192');
    });

    it('returns -32603 when voice_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'text_to_speech',
            arguments: { text: 'Hello' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when text is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'text_to_speech',
            arguments: { voice_id: 'voice_abc123' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{"detail":"quota exceeded"}', { status: 429 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'text_to_speech',
            arguments: { voice_id: 'voice_abc123', text: 'hello' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('429');
    });
});

// ── text_to_speech_with_timestamps ────────────────────────────────────────────

describe('text_to_speech_with_timestamps', () => {
    it('returns audio base64 and alignment data', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            audio_base64: 'SGVsbG8=',
            alignment: {
                characters: ['H', 'e', 'l', 'l', 'o'],
                character_start_times_seconds: [0.0, 0.1, 0.2, 0.25, 0.3],
                character_end_times_seconds: [0.1, 0.2, 0.25, 0.3, 0.4],
            },
            normalized_alignment: null,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'text_to_speech_with_timestamps',
            arguments: { voice_id: 'voice_abc123', text: 'Hello' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.audio_base64).toBe('SGVsbG8=');
        expect(result.alignment.characters).toHaveLength(5);
        expect(result.alignment.character_start_times_seconds[0]).toBe(0.0);
    });

    it('returns -32603 when voice_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'text_to_speech_with_timestamps',
            arguments: { text: 'Hello' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── get_models ────────────────────────────────────────────────────────────────

describe('get_models', () => {
    it('returns mapped models list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk([
            {
                model_id: 'eleven_multilingual_v2',
                name: 'Eleven Multilingual v2',
                description: 'Our most lifelike model',
                can_be_finetuned: false,
                can_do_text_to_speech: true,
                can_do_voice_conversion: false,
                languages: [{ language_id: 'en', name: 'English' }, { language_id: 'es', name: 'Spanish' }],
                token_cost_factor: 1,
            },
        ]));

        const res = await worker.fetch(makeReq('tools/call', { name: 'get_models', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].model_id).toBe('eleven_multilingual_v2');
        expect(result[0].languages).toHaveLength(2);
        expect(result[0].can_do_text_to_speech).toBe(true);
    });
});

// ── get_user_info ─────────────────────────────────────────────────────────────

describe('get_user_info', () => {
    it('returns user info with calculated remaining characters', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            xi_api_key: 'xi_test_key',
            subscription: {
                tier: 'creator',
                character_count: 25000,
                character_limit: 100000,
                next_character_count_reset_unix: 1735689600,
                status: 'active',
                can_extend_character_limit: false,
            },
            is_new_user: false,
        }));

        const res = await worker.fetch(makeReq('tools/call', { name: 'get_user_info', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.subscription.tier).toBe('creator');
        expect(result.subscription.character_count).toBe(25000);
        expect(result.subscription.character_limit).toBe(100000);
        expect(result.subscription.characters_remaining).toBe(75000);
        expect(result.is_new_user).toBe(false);
    });
});

// ── get_subscription ──────────────────────────────────────────────────────────

describe('get_subscription', () => {
    it('returns subscription details with characters remaining', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            tier: 'starter',
            character_count: 5000,
            character_limit: 30000,
            can_extend_character_limit: false,
            allowed_to_extend_character_limit: false,
            next_character_count_reset_unix: 1735689600,
            status: 'active',
            billing_period: 'monthly_period',
            invoice_next_billing_time: 1735689600,
            available_models: [
                { model_id: 'eleven_multilingual_v2', display_name: 'Eleven Multilingual v2' },
            ],
        }));

        const res = await worker.fetch(makeReq('tools/call', { name: 'get_subscription', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.tier).toBe('starter');
        expect(result.characters_remaining).toBe(25000);
        expect(result.available_models).toHaveLength(1);
        expect(result.billing_period).toBe('monthly_period');
    });
});

// ── list_history ──────────────────────────────────────────────────────────────

describe('list_history', () => {
    it('returns mapped history items', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            history: [
                {
                    history_item_id: 'hist_1',
                    voice_id: 'voice_abc123',
                    voice_name: 'Rachel',
                    text: 'Hello world',
                    date_unix: 1700000000,
                    character_count_change_from: 0,
                    character_count_change_to: 11,
                    content_type: 'audio/mpeg',
                    state: 'created',
                },
            ],
            last_history_item_id: 'hist_1',
            has_more: false,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_history',
            arguments: { page_size: 10 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.history).toHaveLength(1);
        expect(result.history[0].history_item_id).toBe('hist_1');
        expect(result.history[0].voice_name).toBe('Rachel');
        expect(result.has_more).toBe(false);
    });

    it('passes voice_id filter when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ history: [], has_more: false }));
        await worker.fetch(makeReq('tools/call', {
            name: 'list_history',
            arguments: { voice_id: 'voice_abc123' },
        }));
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('voice_id=voice_abc123');
    });
});

// ── delete_history_items ──────────────────────────────────────────────────────

describe('delete_history_items', () => {
    it('deletes history items and returns count', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'delete_history_items',
            arguments: { history_item_ids: ['hist_1', 'hist_2'] },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.deleted_count).toBe(2);
        expect(result.deleted_ids).toEqual(['hist_1', 'hist_2']);
    });

    it('sends correct DELETE body', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
        await worker.fetch(makeReq('tools/call', {
            name: 'delete_history_items',
            arguments: { history_item_ids: ['hist_1'] },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.history_item_ids).toEqual(['hist_1']);
    });

    it('returns -32603 when history_item_ids is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'delete_history_items',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when history_item_ids is empty array', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'delete_history_items',
            arguments: { history_item_ids: [] },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── sound_generation ──────────────────────────────────────────────────────────

describe('sound_generation', () => {
    it('returns base64 encoded sound', async () => {
        const audioBytes = new Uint8Array([0xFF, 0xFB, 0x00]);
        mockFetch.mockResolvedValueOnce(audioOk(audioBytes));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'sound_generation',
            arguments: { text: 'rain on a rooftop', duration_seconds: 5 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.audio_base64).toBeDefined();
        expect(result.content_type).toBe('audio/mpeg');
        expect(result.size_bytes).toBe(3);
        expect(result.data_uri).toMatch(/^data:audio\/mpeg;base64,/);
    });

    it('includes duration_seconds in request body when provided', async () => {
        mockFetch.mockResolvedValueOnce(audioOk(new Uint8Array([0x00])));
        await worker.fetch(makeReq('tools/call', {
            name: 'sound_generation',
            arguments: { text: 'thunder', duration_seconds: 10, prompt_influence: 0.5 },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.text).toBe('thunder');
        expect(fetchBody.duration_seconds).toBe(10);
        expect(fetchBody.prompt_influence).toBe(0.5);
    });

    it('returns -32603 when text is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'sound_generation',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_shared_voices ────────────────────────────────────────────────────────

describe('list_shared_voices', () => {
    it('returns mapped shared voices', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            voices: [
                {
                    voice_id: 'shared_v1',
                    name: 'Deep Narrator',
                    category: 'generated',
                    description: 'A deep storytelling voice',
                    preview_url: 'https://cdn.elevenlabs.io/preview.mp3',
                    language: 'en',
                    gender: 'male',
                    age: 'middle_aged',
                    accent: 'american',
                    use_case: 'narration',
                    cloned_by_count: 452,
                },
            ],
            total_count: 1,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_shared_voices',
            arguments: { search: 'narrator', language: 'en' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.voices).toHaveLength(1);
        expect(result.voices[0].voice_id).toBe('shared_v1');
        expect(result.voices[0].cloned_by_count).toBe(452);
        expect(result.total_count).toBe(1);
    });

    it('passes search and language params to API', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ voices: [], total_count: 0 }));
        await worker.fetch(makeReq('tools/call', {
            name: 'list_shared_voices',
            arguments: { search: 'narrator', gender: 'male', age: 'young' },
        }));
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('search=narrator');
        expect(url).toContain('gender=male');
        expect(url).toContain('age=young');
    });
});
