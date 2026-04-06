/**
 * Deepgram MCP Worker
 * Implements MCP protocol over HTTP for Deepgram speech-to-text and audio intelligence.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   DEEPGRAM_API_KEY → X-Mcp-Secret-DEEPGRAM-API-KEY
 *
 * Auth: Authorization: Token {API_KEY}
 * Docs: https://developers.deepgram.com/docs
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const DEEPGRAM_BASE = 'https://api.deepgram.com/v1';

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
    return request.headers.get('X-Mcp-Secret-DEEPGRAM-API-KEY');
}

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

async function deepgramFetch(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<unknown> {
    const res = await fetch(`${DEEPGRAM_BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Token ${apiKey}`,
            ...options.headers,
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Deepgram API ${res.status}: ${text}`);
    }
    return res.json();
}

async function deepgramFetchBinary(
    path: string,
    apiKey: string,
    options: RequestInit = {},
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
    const res = await fetch(`${DEEPGRAM_BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Token ${apiKey}`,
            ...options.headers,
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Deepgram API ${res.status}: ${text}`);
    }
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('Content-Type') ?? 'audio/mpeg';
    return { buffer, contentType };
}

// ── Tools ─────────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Deepgram credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'transcribe_url',
        description: 'Transcribe audio from a URL using Deepgram speech-to-text',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL of the audio file to transcribe' },
                model: {
                    type: 'string',
                    description: 'Model to use (default: nova-2)',
                    enum: ['nova-2', 'nova-2-general', 'nova-2-meeting', 'nova-2-phonecall', 'nova-2-voicemail', 'nova-2-finance', 'whisper-medium'],
                },
                language: { type: 'string', description: 'Language code (default: en)' },
                punctuate: { type: 'boolean', description: 'Add punctuation (default: true)' },
                diarize: { type: 'boolean', description: 'Speaker diarization (default: false)' },
                smart_format: { type: 'boolean', description: 'Smart formatting (default: true)' },
                utterances: { type: 'boolean', description: 'Return utterances (default: false)' },
                paragraphs: { type: 'boolean', description: 'Return paragraphs (default: false)' },
                summarize: { type: 'boolean', description: 'Summarize audio (default: false, nova-2 only)' },
                detect_topics: { type: 'boolean', description: 'Detect topics (default: false)' },
                detect_language: { type: 'boolean', description: 'Auto-detect language (default: false)' },
                tier: { type: 'string', description: 'Model tier (optional)' },
            },
            required: ['url'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'transcribe_audio',
        description: 'Transcribe audio from base64-encoded data using Deepgram',
        inputSchema: {
            type: 'object',
            properties: {
                audio_base64: { type: 'string', description: 'Base64-encoded audio data' },
                content_type: { type: 'string', description: 'MIME type of audio (e.g. audio/mp3)' },
                model: { type: 'string', description: 'Model to use (default: nova-2)' },
                language: { type: 'string', description: 'Language code (default: en)' },
                punctuate: { type: 'boolean', description: 'Add punctuation (default: true)' },
                diarize: { type: 'boolean', description: 'Speaker diarization (default: false)' },
                smart_format: { type: 'boolean', description: 'Smart formatting (default: true)' },
            },
            required: ['audio_base64', 'content_type'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'text_to_speech',
        description: 'Convert text to speech using Deepgram Aura voice models',
        inputSchema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'Text to convert to speech' },
                model: {
                    type: 'string',
                    description: 'Voice model (default: aura-asteria-en)',
                    enum: ['aura-asteria-en', 'aura-luna-en', 'aura-stella-en', 'aura-athena-en', 'aura-hera-en', 'aura-orion-en', 'aura-arcas-en', 'aura-perseus-en', 'aura-angus-en', 'aura-orpheus-en', 'aura-helios-en', 'aura-zeus-en'],
                },
            },
            required: ['text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'analyze_intent',
        description: 'Detect intent from audio using Deepgram audio intelligence',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL of the audio file to analyze' },
            },
            required: ['url'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'detect_topics',
        description: 'Detect topics from audio using Deepgram audio intelligence',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL of the audio file to analyze' },
            },
            required: ['url'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'detect_sentiment',
        description: 'Detect sentiment from audio using Deepgram audio intelligence',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL of the audio file to analyze' },
            },
            required: ['url'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'summarize_audio',
        description: 'Summarize audio content using Deepgram audio intelligence',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL of the audio file to summarize' },
                language: { type: 'string', description: 'Language code (default: en)' },
            },
            required: ['url'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_projects',
        description: 'List all Deepgram projects for the authenticated account',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_project',
        description: 'Get details for a specific Deepgram project',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: { type: 'string', description: 'Deepgram project ID' },
            },
            required: ['project_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_api_keys',
        description: 'List API keys for a Deepgram project',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: { type: 'string', description: 'Deepgram project ID' },
            },
            required: ['project_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_usage_summary',
        description: 'Get usage summary for a Deepgram project over a date range',
        inputSchema: {
            type: 'object',
            properties: {
                project_id: { type: 'string', description: 'Deepgram project ID' },
                start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
            },
            required: ['project_id', 'start_date', 'end_date'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_models',
        description: 'List all available Deepgram models',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            // Call a lightweight read endpoint to verify credentials
            await deepgramFetch('/projects', apiKey);
            return toolOk({ connected: true });
        }

        case 'transcribe_url': {
            validateRequired(args, ['url']);
            const model = String(args.model ?? 'nova-2');
            const language = String(args.language ?? 'en');
            const punctuate = args.punctuate !== false;
            const smart_format = args.smart_format !== false;
            const diarize = args.diarize === true;
            const utterances = args.utterances === true;
            const paragraphs = args.paragraphs === true;
            const summarize = args.summarize === true;
            const detect_topics = args.detect_topics === true;
            const detect_language = args.detect_language === true;

            const qs = new URLSearchParams({
                model,
                language,
                punctuate: String(punctuate),
                smart_format: String(smart_format),
                diarize: String(diarize),
                utterances: String(utterances),
                paragraphs: String(paragraphs),
                summarize: summarize ? 'v2' : 'false',
                detect_topics: String(detect_topics),
                detect_language: String(detect_language),
            });
            if (args.tier) qs.set('tier', String(args.tier));

            const data = await deepgramFetch(`/listen?${qs.toString()}`, apiKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: args.url }),
            }) as any;

            const channel = data?.results?.channels?.[0]?.alternatives?.[0] ?? {};
            return {
                transcript: channel.transcript ?? '',
                words: channel.words ?? [],
                confidence: channel.confidence ?? 0,
                detected_language: data?.results?.channels?.[0]?.detected_language ?? null,
                metadata: data?.metadata ?? {},
                utterances: data?.results?.utterances ?? null,
                summary: data?.results?.summary ?? null,
            };
        }

        case 'transcribe_audio': {
            validateRequired(args, ['audio_base64', 'content_type']);
            const model = String(args.model ?? 'nova-2');
            const language = String(args.language ?? 'en');
            const punctuate = args.punctuate !== false;
            const smart_format = args.smart_format !== false;
            const diarize = args.diarize === true;

            const qs = new URLSearchParams({
                model,
                language,
                punctuate: String(punctuate),
                smart_format: String(smart_format),
                diarize: String(diarize),
            });

            const binaryStr = atob(String(args.audio_base64));
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }

            const data = await deepgramFetch(`/listen?${qs.toString()}`, apiKey, {
                method: 'POST',
                headers: { 'Content-Type': String(args.content_type) },
                body: bytes,
            }) as any;

            const channel = data?.results?.channels?.[0]?.alternatives?.[0] ?? {};
            return {
                transcript: channel.transcript ?? '',
                words: channel.words ?? [],
                confidence: channel.confidence ?? 0,
                detected_language: data?.results?.channels?.[0]?.detected_language ?? null,
                metadata: data?.metadata ?? {},
            };
        }

        case 'text_to_speech': {
            validateRequired(args, ['text']);
            const model = String(args.model ?? 'aura-asteria-en');
            const { buffer, contentType } = await deepgramFetchBinary(`/speak?model=${model}`, apiKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: args.text }),
            });
            const audio_base64 = arrayBufferToBase64(buffer);
            return {
                audio_base64,
                content_type: contentType,
                data_uri: `data:${contentType};base64,${audio_base64}`,
                size_bytes: buffer.byteLength,
            };
        }

        case 'analyze_intent': {
            validateRequired(args, ['url']);
            const data = await deepgramFetch(`/read?intents=true`, apiKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: args.url, language: 'en' }),
            }) as any;
            return {
                intents: data?.results?.intents ?? [],
                transcript: data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '',
                confidence: data?.results?.channels?.[0]?.alternatives?.[0]?.confidence ?? 0,
            };
        }

        case 'detect_topics': {
            validateRequired(args, ['url']);
            const data = await deepgramFetch(`/read?topics=true`, apiKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: args.url }),
            }) as any;
            return {
                topics: data?.results?.topics ?? [],
                transcript: data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '',
            };
        }

        case 'detect_sentiment': {
            validateRequired(args, ['url']);
            const data = await deepgramFetch(`/read?sentiment=true`, apiKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: args.url }),
            }) as any;
            return {
                segments: data?.results?.sentiments?.segments ?? [],
                average_sentiment: data?.results?.sentiments?.average ?? null,
            };
        }

        case 'summarize_audio': {
            validateRequired(args, ['url']);
            const language = String(args.language ?? 'en');
            const data = await deepgramFetch(`/read?summarize=v2`, apiKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: args.url, language }),
            }) as any;
            return {
                summary: data?.results?.summary?.text ?? '',
                transcript: data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '',
            };
        }

        case 'list_projects': {
            const data = await deepgramFetch('/projects', apiKey) as any;
            return { projects: data?.projects ?? [] };
        }

        case 'get_project': {
            validateRequired(args, ['project_id']);
            const data = await deepgramFetch(`/projects/${args.project_id}`, apiKey) as any;
            return {
                project_id: data?.project_id,
                name: data?.name,
                company: data?.company,
            };
        }

        case 'list_api_keys': {
            validateRequired(args, ['project_id']);
            const data = await deepgramFetch(`/projects/${args.project_id}/keys`, apiKey) as any;
            return { api_keys: data?.api_keys ?? [] };
        }

        case 'get_usage_summary': {
            validateRequired(args, ['project_id', 'start_date', 'end_date']);
            const qs = new URLSearchParams({
                start: String(args.start_date),
                end: String(args.end_date),
            });
            const data = await deepgramFetch(`/projects/${args.project_id}/usage?${qs.toString()}`, apiKey) as any;
            return {
                start: data?.start,
                end: data?.end,
                resolution: data?.resolution,
                results: data?.results ?? [],
            };
        }

        case 'list_models': {
            const data = await deepgramFetch('/models', apiKey) as any;
            return { models: data?.stt ?? data?.models ?? [] };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker ────────────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-deepgram', version: '1.0.0' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: any;
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { jsonrpc, id, method, params } = body;
        if (jsonrpc !== '2.0') return rpcErr(id ?? null, -32600, 'Invalid Request');

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-deepgram', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = getApiKey(request);
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: DEEPGRAM_API_KEY');
            }

            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, apiKey);
                return rpcOk(id, toolOk(result));
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
