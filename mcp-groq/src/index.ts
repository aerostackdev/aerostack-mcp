/**
 * Groq MCP Worker
 * Implements MCP protocol over HTTP for Groq fast inference API.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   GROQ_API_KEY → X-Mcp-Secret-GROQ-API-KEY
 *
 * Auth: Authorization: Bearer {GROQ_API_KEY}
 * Docs: https://console.groq.com/docs
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

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
    return request.headers.get('X-Mcp-Secret-GROQ-API-KEY');
}

async function groqPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${GROQ_API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Groq API ${res.status}: ${text}`);
    }
    return res.json();
}

async function groqGet(path: string, apiKey: string): Promise<unknown> {
    const res = await fetch(`${GROQ_API_BASE}${path}`, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Groq API ${res.status}: ${text}`);
    }
    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'chat',
        description: 'Send messages to a Groq-hosted model and receive an ultra-fast response. Supports multi-turn conversations, system prompts, and JSON mode',
        inputSchema: {
            type: 'object',
            properties: {
                messages: {
                    type: 'array',
                    description: 'Conversation messages as [{role: "user"|"assistant"|"system", content: "..."}]',
                    items: {
                        type: 'object',
                        properties: {
                            role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                            content: { type: 'string' },
                        },
                    },
                },
                model: {
                    type: 'string',
                    description: 'Groq model to use (default: llama-3.3-70b-versatile)',
                    enum: [
                        'llama-3.3-70b-versatile',
                        'llama-3.1-70b-versatile',
                        'llama-3.1-8b-instant',
                        'llama3-70b-8192',
                        'llama3-8b-8192',
                        'mixtral-8x7b-32768',
                        'gemma2-9b-it',
                        'gemma-7b-it',
                    ],
                },
                temperature: { type: 'number', description: 'Sampling temperature (0.0–2.0)' },
                max_tokens: { type: 'number', description: 'Maximum number of tokens to generate' },
                top_p: { type: 'number', description: 'Top-p nucleus sampling (0.0–1.0)' },
                stop: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Stop sequences — generation stops when any of these strings are produced',
                },
                response_format: {
                    type: 'string',
                    description: 'Force JSON output by setting to "json_object"',
                    enum: ['text', 'json_object'],
                },
            },
            required: ['messages'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_models',
        description: 'List all available Groq models with metadata including context window size and owner',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'transcribe_audio',
        description: 'Transcribe audio to text using Whisper models on Groq. Pass audio as base64-encoded data',
        inputSchema: {
            type: 'object',
            properties: {
                audio_base64: { type: 'string', description: 'Base64-encoded audio data' },
                filename: { type: 'string', description: 'Filename with extension e.g. "audio.mp3", "speech.wav"' },
                model: {
                    type: 'string',
                    description: 'Whisper model to use (default: whisper-large-v3)',
                    enum: ['whisper-large-v3', 'whisper-large-v3-turbo', 'distil-whisper-large-v3-en'],
                },
                language: { type: 'string', description: 'Language of the audio (ISO-639-1 code, e.g. "en")' },
                prompt: { type: 'string', description: 'Optional prompt to guide transcription style' },
                response_format: {
                    type: 'string',
                    description: 'Output format (default: json)',
                    enum: ['json', 'text', 'verbose_json', 'srt', 'vtt'],
                },
                temperature: { type: 'number', description: 'Sampling temperature (0.0–1.0)' },
            },
            required: ['audio_base64', 'filename'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'translate_audio',
        description: 'Translate audio to English text using Whisper on Groq. Automatically detects source language',
        inputSchema: {
            type: 'object',
            properties: {
                audio_base64: { type: 'string', description: 'Base64-encoded audio data' },
                filename: { type: 'string', description: 'Filename with extension e.g. "audio.mp3"' },
                model: {
                    type: 'string',
                    description: 'Whisper model to use (default: whisper-large-v3)',
                    enum: ['whisper-large-v3', 'whisper-large-v3-turbo'],
                },
                prompt: { type: 'string', description: 'Optional prompt to guide translation' },
                response_format: {
                    type: 'string',
                    description: 'Output format (default: json)',
                    enum: ['json', 'text', 'verbose_json'],
                },
                temperature: { type: 'number', description: 'Sampling temperature (0.0–1.0)' },
            },
            required: ['audio_base64', 'filename'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_speech',
        description: 'Convert text to speech using Groq PlayAI TTS models. Returns base64-encoded audio',
        inputSchema: {
            type: 'object',
            properties: {
                input: { type: 'string', description: 'The text to convert to speech' },
                model: {
                    type: 'string',
                    description: 'TTS model to use (default: playai-tts)',
                    enum: ['playai-tts', 'playai-tts-arabic'],
                },
                voice: { type: 'string', description: 'Voice to use (default: Fritz-PlayAI)' },
                response_format: {
                    type: 'string',
                    description: 'Audio format (default: wav)',
                    enum: ['wav', 'mp3', 'flac', 'opus', 'aac'],
                },
                speed: { type: 'number', description: 'Speed of speech (0.5–2.0, default: 1.0)' },
            },
            required: ['input'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_speech_voices',
        description: 'List available voices for Groq PlayAI TTS models',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_batch',
        description: 'Create a batch inference job for processing multiple requests asynchronously at lower cost',
        inputSchema: {
            type: 'object',
            properties: {
                input_file_id: { type: 'string', description: 'File ID of the JSONL batch input file' },
                endpoint: { type: 'string', description: 'API endpoint to run batch against (e.g. "/v1/chat/completions")' },
                completion_window: { type: 'string', description: 'Time window to complete the batch (default: "24h")' },
            },
            required: ['input_file_id', 'endpoint'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_batches',
        description: 'List all batch inference jobs with their status and request counts',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_batch',
        description: 'Get the current status and details of a specific batch inference job',
        inputSchema: {
            type: 'object',
            properties: {
                batch_id: { type: 'string', description: 'The batch job ID' },
            },
            required: ['batch_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'cancel_batch',
        description: 'Cancel a pending or in-progress batch inference job',
        inputSchema: {
            type: 'object',
            properties: {
                batch_id: { type: 'string', description: 'The batch job ID to cancel' },
            },
            required: ['batch_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case 'chat': {
            validateRequired(args, ['messages']);
            if (!Array.isArray(args.messages) || args.messages.length === 0) {
                throw new Error('messages must be a non-empty array');
            }

            const requestBody: Record<string, unknown> = {
                model: args.model ?? 'llama-3.3-70b-versatile',
                messages: args.messages,
            };
            if (args.temperature !== undefined) requestBody.temperature = args.temperature;
            if (args.max_tokens !== undefined) requestBody.max_tokens = args.max_tokens;
            if (args.top_p !== undefined) requestBody.top_p = args.top_p;
            if (args.stop !== undefined) requestBody.stop = args.stop;
            if (args.response_format) requestBody.response_format = { type: args.response_format };

            const data = await groqPost('/chat/completions', apiKey, requestBody) as any;
            const choice = data.choices?.[0];
            return {
                content: choice?.message?.content ?? '',
                model: data.model,
                finish_reason: choice?.finish_reason ?? null,
                usage: {
                    prompt_tokens: data.usage?.prompt_tokens ?? 0,
                    completion_tokens: data.usage?.completion_tokens ?? 0,
                    total_tokens: data.usage?.total_tokens ?? 0,
                },
                id: data.id,
            };
        }

        case 'list_models': {
            const data = await groqGet('/models', apiKey) as any;
            return {
                models: (data.data ?? []).map((m: any) => ({
                    id: m.id,
                    object: m.object,
                    created: m.created,
                    owned_by: m.owned_by,
                    active: m.active ?? true,
                    context_window: m.context_window ?? null,
                })),
                total: data.data?.length ?? 0,
            };
        }

        case 'transcribe_audio': {
            validateRequired(args, ['audio_base64', 'filename']);

            const binary = atob(String(args.audio_base64));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            // Detect mime type from filename
            const fname = String(args.filename).toLowerCase();
            let mimeType = 'audio/mpeg';
            if (fname.endsWith('.wav')) mimeType = 'audio/wav';
            else if (fname.endsWith('.flac')) mimeType = 'audio/flac';
            else if (fname.endsWith('.ogg')) mimeType = 'audio/ogg';
            else if (fname.endsWith('.m4a')) mimeType = 'audio/mp4';
            else if (fname.endsWith('.webm')) mimeType = 'audio/webm';

            const blob = new Blob([bytes], { type: mimeType });
            const form = new FormData();
            form.append('file', blob, String(args.filename));
            form.append('model', String(args.model ?? 'whisper-large-v3'));
            if (args.language) form.append('language', String(args.language));
            if (args.prompt) form.append('prompt', String(args.prompt));
            form.append('response_format', String(args.response_format ?? 'json'));
            if (args.temperature !== undefined) form.append('temperature', String(args.temperature));

            const res = await fetch(`${GROQ_API_BASE}/audio/transcriptions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: form,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Groq API ${res.status}: ${text}`);
            }

            const responseFormat = String(args.response_format ?? 'json');
            if (responseFormat === 'text' || responseFormat === 'srt' || responseFormat === 'vtt') {
                const text = await res.text();
                return { text };
            }

            const data = await res.json() as any;
            return {
                text: data.text ?? '',
                language: data.language ?? null,
                duration: data.duration ?? null,
                segments: data.segments ?? null,
            };
        }

        case 'translate_audio': {
            validateRequired(args, ['audio_base64', 'filename']);

            const binary = atob(String(args.audio_base64));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            const fname = String(args.filename).toLowerCase();
            let mimeType = 'audio/mpeg';
            if (fname.endsWith('.wav')) mimeType = 'audio/wav';
            else if (fname.endsWith('.flac')) mimeType = 'audio/flac';

            const blob = new Blob([bytes], { type: mimeType });
            const form = new FormData();
            form.append('file', blob, String(args.filename));
            form.append('model', String(args.model ?? 'whisper-large-v3'));
            if (args.prompt) form.append('prompt', String(args.prompt));
            form.append('response_format', String(args.response_format ?? 'json'));
            if (args.temperature !== undefined) form.append('temperature', String(args.temperature));

            const res = await fetch(`${GROQ_API_BASE}/audio/translations`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: form,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Groq API ${res.status}: ${text}`);
            }

            const responseFormat = String(args.response_format ?? 'json');
            if (responseFormat === 'text') {
                const text = await res.text();
                return { text };
            }
            const data = await res.json() as any;
            return { text: data.text ?? '' };
        }

        case 'create_speech': {
            validateRequired(args, ['input']);

            const requestBody: Record<string, unknown> = {
                model: args.model ?? 'playai-tts',
                input: args.input,
                voice: args.voice ?? 'Fritz-PlayAI',
                response_format: args.response_format ?? 'wav',
            };
            if (args.speed !== undefined) requestBody.speed = args.speed;

            const res = await fetch(`${GROQ_API_BASE}/audio/speech`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Groq API ${res.status}: ${text}`);
            }

            const arrayBuffer = await res.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const audio_base64 = btoa(binary);
            const fmt = String(args.response_format ?? 'wav');
            const mimeMap: Record<string, string> = {
                wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac',
                opus: 'audio/opus', aac: 'audio/aac',
            };
            const content_type = mimeMap[fmt] ?? 'audio/wav';

            return {
                audio_base64,
                content_type,
                data_uri: `data:${content_type};base64,${audio_base64}`,
                size_bytes: arrayBuffer.byteLength,
            };
        }

        case 'list_speech_voices': {
            const data = await groqGet('/audio/voices', apiKey) as any;
            return {
                voices: (data.voices ?? data ?? []).map((v: any) => ({
                    voice_id: v.voice_id ?? v.id ?? v,
                    name: v.name ?? v.voice_id ?? v,
                    preview_url: v.preview_url ?? null,
                })),
            };
        }

        case 'create_batch': {
            validateRequired(args, ['input_file_id', 'endpoint']);
            const data = await groqPost('/batches', apiKey, {
                input_file_id: args.input_file_id,
                endpoint: args.endpoint,
                completion_window: args.completion_window ?? '24h',
            }) as any;
            return {
                batch_id: data.id,
                status: data.status,
                created_at: data.created_at,
                endpoint: data.endpoint,
            };
        }

        case 'list_batches': {
            const data = await groqGet('/batches', apiKey) as any;
            return {
                batches: (data.data ?? []).map((b: any) => ({
                    batch_id: b.id,
                    status: b.status,
                    created_at: b.created_at,
                    request_counts: b.request_counts ?? null,
                })),
            };
        }

        case 'get_batch': {
            validateRequired(args, ['batch_id']);
            const data = await groqGet(`/batches/${args.batch_id}`, apiKey) as any;
            return {
                batch_id: data.id,
                status: data.status,
                created_at: data.created_at,
                completed_at: data.completed_at ?? null,
                request_counts: data.request_counts ?? null,
                output_file_id: data.output_file_id ?? null,
            };
        }

        case 'cancel_batch': {
            validateRequired(args, ['batch_id']);
            const data = await groqPost(`/batches/${args.batch_id}/cancel`, apiKey, {}) as any;
            return {
                batch_id: data.id,
                status: data.status,
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-groq', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-groq', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = getApiKey(request);
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: GROQ_API_KEY (header: X-Mcp-Secret-GROQ-API-KEY)');
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
