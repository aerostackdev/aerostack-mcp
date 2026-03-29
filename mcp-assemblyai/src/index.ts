/**
 * AssemblyAI MCP Worker
 * Implements MCP protocol over HTTP for AssemblyAI audio transcription and intelligence.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   ASSEMBLYAI_API_KEY → X-Mcp-Secret-ASSEMBLYAI-API-KEY
 *
 * Auth: Authorization: {API_KEY} (no Bearer prefix)
 * Docs: https://www.assemblyai.com/docs
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';

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
    return request.headers.get('X-Mcp-Secret-ASSEMBLYAI-API-KEY');
}

async function aaiGet(path: string, apiKey: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(`${ASSEMBLYAI_BASE}${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
    }
    const res = await fetch(url.toString(), {
        headers: {
            Authorization: apiKey,
            'Content-Type': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`AssemblyAI API ${res.status}: ${text}`);
    }
    return res.json();
}

async function aaiPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${ASSEMBLYAI_BASE}${path}`, {
        method: 'POST',
        headers: {
            Authorization: apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`AssemblyAI API ${res.status}: ${text}`);
    }
    return res.json();
}

async function aaiDelete(path: string, apiKey: string): Promise<unknown> {
    const res = await fetch(`${ASSEMBLYAI_BASE}${path}`, {
        method: 'DELETE',
        headers: {
            Authorization: apiKey,
            'Content-Type': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`AssemblyAI API ${res.status}: ${text}`);
    }
    return res.json();
}

async function aaiPostBinary(path: string, apiKey: string, body: Uint8Array, contentType: string): Promise<unknown> {
    const res = await fetch(`${ASSEMBLYAI_BASE}${path}`, {
        method: 'POST',
        headers: {
            Authorization: apiKey,
            'Content-Type': contentType,
        },
        body,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`AssemblyAI API ${res.status}: ${text}`);
    }
    return res.json();
}

// ── Tools ─────────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'transcribe_url',
        description: 'Submit an audio URL for transcription with AssemblyAI',
        inputSchema: {
            type: 'object',
            properties: {
                audio_url: { type: 'string', description: 'URL of the audio file to transcribe' },
                language_code: { type: 'string', description: 'Language code (default: en_us)' },
                punctuate: { type: 'boolean', description: 'Add punctuation (default: true)' },
                format_text: { type: 'boolean', description: 'Format text (default: true)' },
                disfluencies: { type: 'boolean', description: 'Include disfluencies like um, uh (default: false)' },
                speaker_labels: { type: 'boolean', description: 'Enable speaker diarization (default: false)' },
                auto_chapters: { type: 'boolean', description: 'Generate chapter summaries (default: false)' },
                entity_detection: { type: 'boolean', description: 'Detect entities (default: false)' },
                sentiment_analysis: { type: 'boolean', description: 'Analyze sentiment (default: false)' },
                auto_highlights: { type: 'boolean', description: 'Detect key phrases (default: false)' },
                iab_categories: { type: 'boolean', description: 'IAB content classification (default: false)' },
                content_safety: { type: 'boolean', description: 'Detect sensitive content (default: false)' },
                summarization: { type: 'boolean', description: 'Generate a summary (default: false)' },
                summary_model: {
                    type: 'string',
                    description: 'Summary model (informative, conversational, or catchy)',
                    enum: ['informative', 'conversational', 'catchy'],
                },
                summary_type: {
                    type: 'string',
                    description: 'Summary format',
                    enum: ['bullets', 'bullets_verbose', 'gist', 'headline', 'paragraph'],
                },
            },
            required: ['audio_url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_transcript',
        description: 'Get the status and result of a transcript by ID',
        inputSchema: {
            type: 'object',
            properties: {
                transcript_id: { type: 'string', description: 'AssemblyAI transcript ID' },
            },
            required: ['transcript_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_transcripts',
        description: 'List transcripts for the authenticated account',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Max number of results (default: 20)' },
                status: {
                    type: 'string',
                    description: 'Filter by status',
                    enum: ['queued', 'processing', 'completed', 'error'],
                },
                created_on: { type: 'string', description: 'Filter by creation date (YYYY-MM-DD)' },
                before_id: { type: 'string', description: 'Cursor: results before this ID' },
                after_id: { type: 'string', description: 'Cursor: results after this ID' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_transcript',
        description: 'Delete a transcript by ID (removes audio data from AssemblyAI servers)',
        inputSchema: {
            type: 'object',
            properties: {
                transcript_id: { type: 'string', description: 'AssemblyAI transcript ID' },
            },
            required: ['transcript_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'create_realtime_token',
        description: 'Create a temporary token for real-time streaming transcription',
        inputSchema: {
            type: 'object',
            properties: {
                expires_in: { type: 'number', description: 'Token expiry in seconds (default: 480)' },
            },
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'lemur_task',
        description: 'Run a custom LLM task on one or more transcripts with AssemblyAI LeMUR',
        inputSchema: {
            type: 'object',
            properties: {
                transcript_ids: { type: 'array', items: { type: 'string' }, description: 'Array of transcript IDs' },
                prompt: { type: 'string', description: 'The task prompt' },
                context: { type: 'string', description: 'Optional system context' },
                final_model: {
                    type: 'string',
                    description: 'LLM model to use',
                    enum: ['anthropic/claude-3-5-sonnet', 'anthropic/claude-3-haiku', 'anthropic/claude-3-opus'],
                },
                max_output_size: { type: 'number', description: 'Max tokens in response (default: 2000)' },
                temperature: { type: 'number', description: 'Sampling temperature (default: 0)' },
            },
            required: ['transcript_ids', 'prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'lemur_summary',
        description: 'Generate a summary of transcripts using AssemblyAI LeMUR',
        inputSchema: {
            type: 'object',
            properties: {
                transcript_ids: { type: 'array', items: { type: 'string' }, description: 'Array of transcript IDs' },
                context: { type: 'string', description: 'Optional context for the summary' },
                final_model: {
                    type: 'string',
                    description: 'LLM model to use',
                    enum: ['anthropic/claude-3-5-sonnet', 'anthropic/claude-3-haiku', 'anthropic/claude-3-opus'],
                },
                answer_format: {
                    type: 'string',
                    description: 'Summary format',
                    enum: ['bullets', 'bullets_verbose', 'list', 'none', 'paragraphs', 'question'],
                },
                max_output_size: { type: 'number', description: 'Max tokens in response' },
            },
            required: ['transcript_ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'lemur_qa',
        description: 'Ask questions about transcripts using AssemblyAI LeMUR',
        inputSchema: {
            type: 'object',
            properties: {
                transcript_ids: { type: 'array', items: { type: 'string' }, description: 'Array of transcript IDs' },
                questions: {
                    type: 'array',
                    description: 'Array of question objects',
                    items: {
                        type: 'object',
                        properties: {
                            question: { type: 'string' },
                            answer_format: { type: 'string' },
                            answer_options: { type: 'array', items: { type: 'string' } },
                        },
                    },
                },
                context: { type: 'string', description: 'Optional context' },
                final_model: {
                    type: 'string',
                    description: 'LLM model to use',
                    enum: ['anthropic/claude-3-5-sonnet', 'anthropic/claude-3-haiku', 'anthropic/claude-3-opus'],
                },
            },
            required: ['transcript_ids', 'questions'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'lemur_action_items',
        description: 'Extract action items from transcripts using AssemblyAI LeMUR',
        inputSchema: {
            type: 'object',
            properties: {
                transcript_ids: { type: 'array', items: { type: 'string' }, description: 'Array of transcript IDs' },
                context: { type: 'string', description: 'Optional context' },
                final_model: {
                    type: 'string',
                    description: 'LLM model to use',
                    enum: ['anthropic/claude-3-5-sonnet', 'anthropic/claude-3-haiku', 'anthropic/claude-3-opus'],
                },
            },
            required: ['transcript_ids'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_lemur_response',
        description: 'Retrieve a previous LeMUR response by request ID',
        inputSchema: {
            type: 'object',
            properties: {
                request_id: { type: 'string', description: 'LeMUR request ID' },
            },
            required: ['request_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'upload_audio',
        description: 'Upload audio data from base64 to AssemblyAI for transcription',
        inputSchema: {
            type: 'object',
            properties: {
                audio_base64: { type: 'string', description: 'Base64-encoded audio data' },
                content_type: { type: 'string', description: 'MIME type (default: audio/mp3)' },
            },
            required: ['audio_base64'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_word_search',
        description: 'Search for specific words in a transcript',
        inputSchema: {
            type: 'object',
            properties: {
                transcript_id: { type: 'string', description: 'AssemblyAI transcript ID' },
                words: { type: 'string', description: 'Comma-separated list of words to search for' },
            },
            required: ['transcript_id', 'words'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_sentences',
        description: 'Get sentence-level breakdown of a transcript',
        inputSchema: {
            type: 'object',
            properties: {
                transcript_id: { type: 'string', description: 'AssemblyAI transcript ID' },
            },
            required: ['transcript_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_paragraphs',
        description: 'Get paragraph-level breakdown of a transcript',
        inputSchema: {
            type: 'object',
            properties: {
                transcript_id: { type: 'string', description: 'AssemblyAI transcript ID' },
            },
            required: ['transcript_id'],
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
        case 'transcribe_url': {
            validateRequired(args, ['audio_url']);
            const body: Record<string, unknown> = {
                audio_url: args.audio_url,
                language_code: args.language_code ?? 'en_us',
                punctuate: args.punctuate !== false,
                format_text: args.format_text !== false,
                disfluencies: args.disfluencies === true,
                speaker_labels: args.speaker_labels === true,
                auto_chapters: args.auto_chapters === true,
                entity_detection: args.entity_detection === true,
                sentiment_analysis: args.sentiment_analysis === true,
                auto_highlights: args.auto_highlights === true,
                iab_categories: args.iab_categories === true,
                content_safety: args.content_safety === true,
                summarization: args.summarization === true,
            };
            if (args.summarization) {
                if (args.summary_model) body.summary_model = args.summary_model;
                if (args.summary_type) body.summary_type = args.summary_type;
            }
            const data = await aaiPost('/transcript', apiKey, body) as any;
            return {
                transcript_id: data.id,
                status: data.status,
                text: data.text ?? null,
                words: data.words ?? [],
                confidence: data.confidence ?? null,
                audio_url: data.audio_url,
            };
        }

        case 'get_transcript': {
            validateRequired(args, ['transcript_id']);
            const data = await aaiGet(`/transcript/${args.transcript_id}`, apiKey) as any;
            return {
                transcript_id: data.id,
                status: data.status,
                text: data.text ?? null,
                words: data.words ?? [],
                confidence: data.confidence ?? null,
                audio_duration: data.audio_duration ?? null,
                error: data.error ?? null,
                chapters: data.chapters ?? null,
                entities: data.entities ?? null,
                sentiment_analysis_results: data.sentiment_analysis_results ?? null,
                summary: data.summary ?? null,
                highlights: data.auto_highlights_result ?? null,
                categories: data.iab_categories_result ?? null,
            };
        }

        case 'list_transcripts': {
            const params: Record<string, string> = {
                limit: String(args.limit ?? 20),
            };
            if (args.status) params.status = String(args.status);
            if (args.created_on) params.created_on = String(args.created_on);
            if (args.before_id) params.before_id = String(args.before_id);
            if (args.after_id) params.after_id = String(args.after_id);

            const data = await aaiGet('/transcript', apiKey, params) as any;
            return {
                transcripts: data.transcripts ?? [],
                page_details: data.page_details ?? {},
            };
        }

        case 'delete_transcript': {
            validateRequired(args, ['transcript_id']);
            const data = await aaiDelete(`/transcript/${args.transcript_id}`, apiKey) as any;
            return {
                success: true,
                transcript_id: data.id ?? args.transcript_id,
            };
        }

        case 'create_realtime_token': {
            const expires_in = Number(args.expires_in ?? 480);
            const data = await aaiPost('/realtime/token', apiKey, { expires_in }) as any;
            return { token: data.token };
        }

        case 'lemur_task': {
            validateRequired(args, ['transcript_ids', 'prompt']);
            const body: Record<string, unknown> = {
                transcript_ids: args.transcript_ids,
                prompt: args.prompt,
                final_model: args.final_model ?? 'anthropic/claude-3-5-sonnet',
                max_output_size: args.max_output_size ?? 2000,
                temperature: args.temperature ?? 0,
            };
            if (args.context) body.context = args.context;
            const data = await aaiPost('/lemur/v3/generate/task', apiKey, body) as any;
            return {
                request_id: data.request_id,
                response: data.response,
            };
        }

        case 'lemur_summary': {
            validateRequired(args, ['transcript_ids']);
            const body: Record<string, unknown> = {
                transcript_ids: args.transcript_ids,
                final_model: args.final_model ?? 'anthropic/claude-3-5-sonnet',
            };
            if (args.context) body.context = args.context;
            if (args.answer_format) body.answer_format = args.answer_format;
            if (args.max_output_size) body.max_output_size = args.max_output_size;
            const data = await aaiPost('/lemur/v3/generate/summary', apiKey, body) as any;
            return {
                request_id: data.request_id,
                response: data.response,
            };
        }

        case 'lemur_qa': {
            validateRequired(args, ['transcript_ids', 'questions']);
            const body: Record<string, unknown> = {
                transcript_ids: args.transcript_ids,
                questions: args.questions,
                final_model: args.final_model ?? 'anthropic/claude-3-5-sonnet',
            };
            if (args.context) body.context = args.context;
            const data = await aaiPost('/lemur/v3/generate/question-answer', apiKey, body) as any;
            return {
                request_id: data.request_id,
                response: data.response ?? [],
            };
        }

        case 'lemur_action_items': {
            validateRequired(args, ['transcript_ids']);
            const body: Record<string, unknown> = {
                transcript_ids: args.transcript_ids,
                final_model: args.final_model ?? 'anthropic/claude-3-5-sonnet',
            };
            if (args.context) body.context = args.context;
            const data = await aaiPost('/lemur/v3/generate/action-items', apiKey, body) as any;
            return {
                request_id: data.request_id,
                response: data.response,
            };
        }

        case 'get_lemur_response': {
            validateRequired(args, ['request_id']);
            const data = await aaiGet(`/lemur/v3/${args.request_id}`, apiKey) as any;
            return {
                request_id: data.request_id,
                response: data.response,
                usage: data.usage ?? null,
            };
        }

        case 'upload_audio': {
            validateRequired(args, ['audio_base64']);
            const contentType = String(args.content_type ?? 'audio/mp3');
            const binaryStr = atob(String(args.audio_base64));
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            const data = await aaiPostBinary('/upload', apiKey, bytes, contentType) as any;
            return { upload_url: data.upload_url };
        }

        case 'list_word_search': {
            validateRequired(args, ['transcript_id', 'words']);
            const data = await aaiGet(
                `/transcript/${args.transcript_id}/word-search`,
                apiKey,
                { words: String(args.words) },
            ) as any;
            return {
                id: data.id,
                total_count: data.total_count ?? 0,
                timestamps: data.timestamps ?? [],
            };
        }

        case 'get_sentences': {
            validateRequired(args, ['transcript_id']);
            const data = await aaiGet(`/transcript/${args.transcript_id}/sentences`, apiKey) as any;
            return { sentences: data.sentences ?? [] };
        }

        case 'get_paragraphs': {
            validateRequired(args, ['transcript_id']);
            const data = await aaiGet(`/transcript/${args.transcript_id}/paragraphs`, apiKey) as any;
            return { paragraphs: data.paragraphs ?? [] };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker ────────────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-assemblyai', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-assemblyai', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = getApiKey(request);
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: ASSEMBLYAI_API_KEY');
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
