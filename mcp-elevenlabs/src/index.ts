/**
 * ElevenLabs MCP Worker
 * Implements MCP protocol over HTTP for ElevenLabs voice AI operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   ELEVENLABS_API_KEY → X-Mcp-Secret-ELEVENLABS-API-KEY
 *
 * Auth: xi-api-key header on every request
 * Docs: https://elevenlabs.io/docs/api-reference
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// ── Helpers ───────────────────────────────────────────────────────────────────

function rpcOk(id: number | string, result: unknown): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: number | string | null, code: number, message: string): Response {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function toolOk(data: unknown): { content: { type: string; text: string }[] } {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

function getApiKey(request: Request): string | null {
    return request.headers.get('X-Mcp-Secret-ELEVENLABS-API-KEY');
}

async function elevenLabsGet(path: string, apiKey: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${ELEVENLABS_API_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
        headers: {
            'xi-api-key': apiKey,
            'Accept': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ElevenLabs API ${res.status}: ${text}`);
    }
    return res.json();
}

async function elevenLabsPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${ELEVENLABS_API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ElevenLabs API ${res.status}: ${text}`);
    }
    return res.json();
}

async function elevenLabsDelete(path: string, apiKey: string, body?: unknown): Promise<void> {
    const res = await fetch(`${ELEVENLABS_API_BASE}${path}`, {
        method: 'DELETE',
        headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`ElevenLabs API ${res.status}: ${text}`);
    }
}

/** Convert ArrayBuffer to base64 string safely (chunked to avoid stack overflow). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'list_voices',
        description: 'List all available voices including pre-made and your custom cloned voices',
        inputSchema: {
            type: 'object',
            properties: {
                show_legacy: {
                    type: 'boolean',
                    description: 'Include legacy voices in results (default: false)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_voice',
        description: 'Get detailed information about a specific voice including labels and settings',
        inputSchema: {
            type: 'object',
            properties: {
                voice_id: { type: 'string', description: 'The unique identifier of the voice' },
                with_settings: {
                    type: 'boolean',
                    description: 'Include voice settings (stability, similarity_boost, style) in response',
                },
            },
            required: ['voice_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_voice_settings',
        description: 'Get the default settings for a voice (stability, similarity boost, style, speaker boost)',
        inputSchema: {
            type: 'object',
            properties: {
                voice_id: { type: 'string', description: 'The unique identifier of the voice' },
            },
            required: ['voice_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'edit_voice_settings',
        description: 'Update settings for a specific voice: stability, similarity boost, style exaggeration, and speaker boost',
        inputSchema: {
            type: 'object',
            properties: {
                voice_id: { type: 'string', description: 'The unique identifier of the voice to update' },
                stability: {
                    type: 'number',
                    description: 'Voice stability (0.0–1.0). Higher = more consistent, lower = more expressive',
                },
                similarity_boost: {
                    type: 'number',
                    description: 'How closely to match the original voice (0.0–1.0)',
                },
                style: {
                    type: 'number',
                    description: 'Style exaggeration (0.0–1.0). Only available for v2+ models',
                },
                use_speaker_boost: {
                    type: 'boolean',
                    description: 'Boost speaker clarity. Increases latency slightly',
                },
            },
            required: ['voice_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_voice',
        description: 'Permanently delete a custom cloned voice from your account',
        inputSchema: {
            type: 'object',
            properties: {
                voice_id: { type: 'string', description: 'The unique identifier of the voice to delete' },
            },
            required: ['voice_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'text_to_speech',
        description: 'Convert text to speech using a specified voice. Returns base64-encoded MP3 audio data',
        inputSchema: {
            type: 'object',
            properties: {
                voice_id: {
                    type: 'string',
                    description: 'Voice ID to use. Use list_voices to find available voice IDs',
                },
                text: {
                    type: 'string',
                    description: 'The text to convert to speech (max 5,000 characters)',
                },
                model_id: {
                    type: 'string',
                    description: 'Model to use (default: eleven_multilingual_v2). Use get_models to list all models',
                    enum: [
                        'eleven_multilingual_v2',
                        'eleven_turbo_v2_5',
                        'eleven_turbo_v2',
                        'eleven_monolingual_v1',
                        'eleven_english_sts_v2',
                    ],
                },
                stability: {
                    type: 'number',
                    description: 'Override voice stability for this request (0.0–1.0)',
                },
                similarity_boost: {
                    type: 'number',
                    description: 'Override similarity boost for this request (0.0–1.0)',
                },
                style: {
                    type: 'number',
                    description: 'Override style exaggeration for this request (0.0–1.0)',
                },
                output_format: {
                    type: 'string',
                    description: 'Output audio format (default: mp3_44100_128)',
                    enum: ['mp3_22050_32', 'mp3_44100_64', 'mp3_44100_96', 'mp3_44100_128', 'mp3_44100_192', 'pcm_16000', 'pcm_22050', 'pcm_44100'],
                },
            },
            required: ['voice_id', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'text_to_speech_with_timestamps',
        description: 'Convert text to speech and return both base64 audio and character-level timing data for caption generation',
        inputSchema: {
            type: 'object',
            properties: {
                voice_id: {
                    type: 'string',
                    description: 'Voice ID to use',
                },
                text: {
                    type: 'string',
                    description: 'The text to convert to speech',
                },
                model_id: {
                    type: 'string',
                    description: 'Model to use (default: eleven_multilingual_v2)',
                },
            },
            required: ['voice_id', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_models',
        description: 'List all available ElevenLabs TTS models with their capabilities, languages, and token costs',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user_info',
        description: 'Get your ElevenLabs account information including character usage quota and subscription tier',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_subscription',
        description: 'Get detailed subscription information: plan name, character limits, reset date, and available features',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_history',
        description: 'List your text-to-speech generation history with timestamps, voice used, and character count',
        inputSchema: {
            type: 'object',
            properties: {
                page_size: {
                    type: 'number',
                    description: 'Number of history items to return (default: 100, max: 1000)',
                },
                start_after_history_item_id: {
                    type: 'string',
                    description: 'Pagination cursor — return items generated before this history item ID',
                },
                voice_id: {
                    type: 'string',
                    description: 'Filter history to a specific voice ID',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_history_items',
        description: 'Delete one or more history items permanently from your generation history',
        inputSchema: {
            type: 'object',
            properties: {
                history_item_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of history item IDs to delete',
                },
            },
            required: ['history_item_ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'sound_generation',
        description: 'Generate a sound effect or ambient audio from a text description (e.g. "rain on a rooftop", "electric guitar riff")',
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'Description of the sound to generate (e.g. "a thunderstorm with heavy rain")',
                },
                duration_seconds: {
                    type: 'number',
                    description: 'Duration of the generated sound in seconds (default: auto, max: 22)',
                },
                prompt_influence: {
                    type: 'number',
                    description: 'How closely to follow the text prompt (0.0–1.0, default: 0.3)',
                },
            },
            required: ['text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_shared_voices',
        description: 'Search the ElevenLabs shared voice library for community voices by name, language, or category',
        inputSchema: {
            type: 'object',
            properties: {
                page_size: {
                    type: 'number',
                    description: 'Number of results to return (default: 30)',
                },
                search: {
                    type: 'string',
                    description: 'Search query to filter voices by name',
                },
                language: {
                    type: 'string',
                    description: 'Filter by language code (e.g. "en", "es", "fr", "de")',
                },
                gender: {
                    type: 'string',
                    description: 'Filter by gender',
                    enum: ['male', 'female', 'neutral'],
                },
                age: {
                    type: 'string',
                    description: 'Filter by age range',
                    enum: ['young', 'middle_aged', 'old'],
                },
                accent: {
                    type: 'string',
                    description: 'Filter by accent (e.g. "american", "british", "australian")',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case 'list_voices': {
            const data = await elevenLabsGet('/voices', apiKey, {
                show_legacy: String(args.show_legacy ?? false),
            }) as { voices: unknown[] };
            return {
                voices: (data.voices ?? []).map((v: any) => ({
                    voice_id: v.voice_id,
                    name: v.name,
                    category: v.category,
                    description: v.description ?? '',
                    labels: v.labels ?? {},
                    preview_url: v.preview_url ?? null,
                    available_for_tiers: v.available_for_tiers ?? [],
                })),
                total: data.voices?.length ?? 0,
            };
        }

        case 'get_voice': {
            validateRequired(args, ['voice_id']);
            const params: Record<string, string> = {};
            if (args.with_settings) params.with_settings = 'true';
            const data = await elevenLabsGet(`/voices/${args.voice_id}`, apiKey, params) as any;
            return {
                voice_id: data.voice_id,
                name: data.name,
                category: data.category,
                description: data.description ?? '',
                labels: data.labels ?? {},
                preview_url: data.preview_url ?? null,
                settings: data.settings ?? null,
                samples: (data.samples ?? []).map((s: any) => ({
                    sample_id: s.sample_id,
                    file_name: s.file_name,
                    mime_type: s.mime_type,
                    size_bytes: s.size_bytes,
                })),
            };
        }

        case 'get_voice_settings': {
            validateRequired(args, ['voice_id']);
            const data = await elevenLabsGet(`/voices/${args.voice_id}/settings`, apiKey) as any;
            return {
                stability: data.stability,
                similarity_boost: data.similarity_boost,
                style: data.style ?? 0,
                use_speaker_boost: data.use_speaker_boost ?? true,
            };
        }

        case 'edit_voice_settings': {
            validateRequired(args, ['voice_id']);
            const settings: Record<string, unknown> = {};
            if (args.stability !== undefined) settings.stability = args.stability;
            if (args.similarity_boost !== undefined) settings.similarity_boost = args.similarity_boost;
            if (args.style !== undefined) settings.style = args.style;
            if (args.use_speaker_boost !== undefined) settings.use_speaker_boost = args.use_speaker_boost;

            if (Object.keys(settings).length === 0) {
                throw new Error('At least one setting (stability, similarity_boost, style, use_speaker_boost) must be provided');
            }

            await elevenLabsPost(`/voices/${args.voice_id}/settings/edit`, apiKey, settings);
            return { success: true, voice_id: args.voice_id, updated_settings: settings };
        }

        case 'delete_voice': {
            validateRequired(args, ['voice_id']);
            await elevenLabsDelete(`/voices/${args.voice_id}`, apiKey);
            return { success: true, deleted_voice_id: args.voice_id };
        }

        case 'text_to_speech': {
            validateRequired(args, ['voice_id', 'text']);

            const requestBody: Record<string, unknown> = {
                text: args.text,
                model_id: args.model_id ?? 'eleven_multilingual_v2',
            };

            const voiceSettings: Record<string, unknown> = {};
            if (args.stability !== undefined) voiceSettings.stability = args.stability;
            if (args.similarity_boost !== undefined) voiceSettings.similarity_boost = args.similarity_boost;
            if (args.style !== undefined) voiceSettings.style = args.style;
            if (Object.keys(voiceSettings).length > 0) {
                requestBody.voice_settings = voiceSettings;
            }

            const outputFormat = String(args.output_format ?? 'mp3_44100_128');
            const url = new URL(`${ELEVENLABS_API_BASE}/text-to-speech/${args.voice_id}`);
            url.searchParams.set('output_format', outputFormat);

            const res = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg',
                },
                body: JSON.stringify(requestBody),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`ElevenLabs TTS ${res.status}: ${text}`);
            }

            const buffer = await res.arrayBuffer();
            const base64Audio = arrayBufferToBase64(buffer);
            const contentType = res.headers.get('Content-Type') ?? 'audio/mpeg';

            return {
                audio_base64: base64Audio,
                content_type: contentType,
                output_format: outputFormat,
                size_bytes: buffer.byteLength,
                data_uri: `data:${contentType};base64,${base64Audio}`,
            };
        }

        case 'text_to_speech_with_timestamps': {
            validateRequired(args, ['voice_id', 'text']);

            const requestBody: Record<string, unknown> = {
                text: args.text,
                model_id: args.model_id ?? 'eleven_multilingual_v2',
            };

            const res = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${args.voice_id}/with-timestamps`, {
                method: 'POST',
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`ElevenLabs TTS with timestamps ${res.status}: ${text}`);
            }

            const data = await res.json() as any;
            return {
                audio_base64: data.audio_base64,
                alignment: data.alignment ?? null,
                normalized_alignment: data.normalized_alignment ?? null,
            };
        }

        case 'get_models': {
            const data = await elevenLabsGet('/models', apiKey) as any[];
            return (data ?? []).map((m: any) => ({
                model_id: m.model_id,
                name: m.name,
                description: m.description ?? '',
                can_be_finetuned: m.can_be_finetuned ?? false,
                can_do_text_to_speech: m.can_do_text_to_speech ?? false,
                can_do_voice_conversion: m.can_do_voice_conversion ?? false,
                languages: (m.languages ?? []).map((l: any) => ({ language_id: l.language_id, name: l.name })),
                token_cost_factor: m.token_cost_factor ?? 1,
            }));
        }

        case 'get_user_info': {
            const data = await elevenLabsGet('/user', apiKey) as any;
            return {
                xi_api_key: data.xi_api_key ?? null,
                subscription: {
                    tier: data.subscription?.tier,
                    character_count: data.subscription?.character_count,
                    character_limit: data.subscription?.character_limit,
                    characters_remaining: (data.subscription?.character_limit ?? 0) - (data.subscription?.character_count ?? 0),
                    next_character_count_reset_unix: data.subscription?.next_character_count_reset_unix,
                    status: data.subscription?.status,
                    can_extend_character_limit: data.subscription?.can_extend_character_limit,
                },
                is_new_user: data.is_new_user ?? false,
            };
        }

        case 'get_subscription': {
            const data = await elevenLabsGet('/user/subscription', apiKey) as any;
            return {
                tier: data.tier,
                character_count: data.character_count,
                character_limit: data.character_limit,
                characters_remaining: (data.character_limit ?? 0) - (data.character_count ?? 0),
                can_extend_character_limit: data.can_extend_character_limit ?? false,
                allowed_to_extend_character_limit: data.allowed_to_extend_character_limit ?? false,
                next_character_count_reset_unix: data.next_character_count_reset_unix,
                status: data.status,
                billing_period: data.billing_period ?? null,
                character_refresh_period: data.character_refresh_period ?? null,
                invoice_next_billing_time: data.invoice_next_billing_time ?? null,
                available_models: (data.available_models ?? []).map((m: any) => ({
                    model_id: m.model_id,
                    display_name: m.display_name,
                })),
            };
        }

        case 'list_history': {
            const params: Record<string, string> = {
                page_size: String(args.page_size ?? 100),
            };
            if (args.start_after_history_item_id) {
                params.start_after_history_item_id = String(args.start_after_history_item_id);
            }
            if (args.voice_id) {
                params.voice_id = String(args.voice_id);
            }
            const data = await elevenLabsGet('/history', apiKey, params) as any;
            return {
                history: (data.history ?? []).map((h: any) => ({
                    history_item_id: h.history_item_id,
                    voice_id: h.voice_id,
                    voice_name: h.voice_name ?? '',
                    text: h.text,
                    date_unix: h.date_unix,
                    character_count_change_from: h.character_count_change_from,
                    character_count_change_to: h.character_count_change_to,
                    content_type: h.content_type,
                    state: h.state,
                    settings: h.settings ?? null,
                })),
                last_history_item_id: data.last_history_item_id ?? null,
                has_more: data.has_more ?? false,
            };
        }

        case 'delete_history_items': {
            validateRequired(args, ['history_item_ids']);
            if (!Array.isArray(args.history_item_ids) || args.history_item_ids.length === 0) {
                throw new Error('history_item_ids must be a non-empty array');
            }
            await elevenLabsDelete('/history/items', apiKey, {
                history_item_ids: args.history_item_ids,
            });
            return {
                success: true,
                deleted_count: (args.history_item_ids as string[]).length,
                deleted_ids: args.history_item_ids,
            };
        }

        case 'sound_generation': {
            validateRequired(args, ['text']);
            const requestBody: Record<string, unknown> = {
                text: args.text,
            };
            if (args.duration_seconds !== undefined) {
                requestBody.duration_seconds = args.duration_seconds;
            }
            if (args.prompt_influence !== undefined) {
                requestBody.prompt_influence = args.prompt_influence;
            }

            const res = await fetch(`${ELEVENLABS_API_BASE}/sound-generation`, {
                method: 'POST',
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg',
                },
                body: JSON.stringify(requestBody),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`ElevenLabs sound generation ${res.status}: ${text}`);
            }

            const buffer = await res.arrayBuffer();
            const base64Audio = arrayBufferToBase64(buffer);

            return {
                audio_base64: base64Audio,
                content_type: 'audio/mpeg',
                size_bytes: buffer.byteLength,
                data_uri: `data:audio/mpeg;base64,${base64Audio}`,
            };
        }

        case 'list_shared_voices': {
            const params: Record<string, string> = {
                page_size: String(args.page_size ?? 30),
            };
            if (args.search) params.search = String(args.search);
            if (args.language) params.language = String(args.language);
            if (args.gender) params.gender = String(args.gender);
            if (args.age) params.age = String(args.age);
            if (args.accent) params.accent = String(args.accent);

            const data = await elevenLabsGet('/shared-voices', apiKey, params) as any;
            return {
                voices: (data.voices ?? []).map((v: any) => ({
                    voice_id: v.voice_id,
                    name: v.name,
                    category: v.category ?? '',
                    description: v.description ?? '',
                    preview_url: v.preview_url ?? null,
                    language: v.language ?? null,
                    gender: v.gender ?? null,
                    age: v.age ?? null,
                    accent: v.accent ?? null,
                    use_case: v.use_case ?? null,
                    cloned_by_count: v.cloned_by_count ?? 0,
                })),
                total_count: data.total_count ?? 0,
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-elevenlabs', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (body.jsonrpc !== '2.0') {
            return rpcErr(id ?? null, -32600, 'Invalid Request: jsonrpc must be "2.0"');
        }

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-elevenlabs', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = getApiKey(request);
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: ELEVENLABS_API_KEY (header: X-Mcp-Secret-ELEVENLABS-API-KEY)');
            }

            const p = params as { name: string; arguments?: Record<string, unknown> };
            const toolName = p?.name ?? '';
            const toolArgs = p?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, apiKey);
                return rpcOk(id, toolOk(result));
            } catch (err: unknown) {
                if (err instanceof Error) {
                    return rpcErr(id, -32603, err.message);
                }
                return rpcErr(id, -32603, 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
