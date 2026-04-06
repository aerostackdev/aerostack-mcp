/**
 * Fal.ai MCP Worker
 * Implements MCP protocol over HTTP for Fal.ai fast image/video/audio generation.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   FAL_AI_API_KEY → X-Mcp-Secret-FAL-AI-API-KEY
 *
 * Auth: Authorization: Key {FAL_AI_API_KEY}
 * Docs: https://fal.ai/docs
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const FAL_RUN_BASE = 'https://fal.run';
const FAL_QUEUE_BASE = 'https://queue.fal.run';

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
    return request.headers.get('X-Mcp-Secret-FAL-AI-API-KEY');
}

async function falPost(url: string, apiKey: string, body: unknown): Promise<unknown> {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Fal.ai ${res.status}: ${text}`);
    }
    return res.json();
}

async function falGet(url: string, apiKey: string): Promise<unknown> {
    const res = await fetch(url, {
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Accept': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Fal.ai ${res.status}: ${text}`);
    }
    return res.json();
}

// ── Curated popular models list ───────────────────────────────────────────────

const POPULAR_MODELS = [
    { id: 'fal-ai/flux/schnell', name: 'FLUX.1 Schnell', type: 'image', description: 'Ultra-fast 4-step image generation. Best for quick iterations.' },
    { id: 'fal-ai/flux/dev', name: 'FLUX.1 Dev', type: 'image', description: 'High-quality open-weight image generation with 25-50 steps.' },
    { id: 'fal-ai/flux-pro', name: 'FLUX.1 Pro', type: 'image', description: 'State-of-the-art professional image generation.' },
    { id: 'fal-ai/flux-pro/v1.1', name: 'FLUX.1 Pro v1.1', type: 'image', description: 'Latest FLUX Pro with improved quality and speed.' },
    { id: 'fal-ai/stable-diffusion-v3-medium', name: 'Stable Diffusion 3 Medium', type: 'image', description: 'SD3 Medium — multimodal diffusion transformer.' },
    { id: 'fal-ai/aura-flow', name: 'AuraFlow', type: 'image', description: 'Open-source flow-based image generation model.' },
    { id: 'fal-ai/fast-animatediff/text-to-video', name: 'AnimateDiff Text-to-Video', type: 'video', description: 'Fast AnimateDiff for text-to-video generation.' },
    { id: 'fal-ai/fast-animatediff/turbo/text-to-video', name: 'AnimateDiff Turbo', type: 'video', description: 'Accelerated AnimateDiff video generation.' },
    { id: 'fal-ai/stable-video', name: 'Stable Video Diffusion', type: 'video', description: 'Image-to-video generation using SVD.' },
    { id: 'fal-ai/flux/dev/image-to-image', name: 'FLUX Dev Image-to-Image', type: 'image', description: 'Transform existing images using FLUX Dev.' },
    { id: 'fal-ai/imageutils/rembg', name: 'Remove Background', type: 'utility', description: 'Remove background from images using rembg.' },
    { id: 'fal-ai/esrgan', name: 'ESRGAN Upscaler', type: 'utility', description: 'Upscale images 2x or 4x using ESRGAN.' },
    { id: 'fal-ai/whisper', name: 'Whisper', type: 'audio', description: 'Speech-to-text transcription and translation using Whisper.' },
    { id: 'fal-ai/stable-audio', name: 'Stable Audio', type: 'audio', description: 'AI music and audio generation from text prompts.' },
    { id: 'fal-ai/lora', name: 'FLUX LoRA', type: 'image', description: 'Run FLUX with custom LoRA fine-tuned models.' },
];

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Fal.ai credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'generate_image',
        description: 'Generate images from text prompts using FLUX.1 Schnell — ultra-fast 4-step generation',
        inputSchema: {
            type: 'object',
            properties: {
                model_id: {
                    type: 'string',
                    description: 'Fal model ID (default: fal-ai/flux/schnell)',
                },
                prompt: { type: 'string', description: 'Text description of the image to generate' },
                image_size: {
                    type: 'string',
                    description: 'Image size preset (default: square_hd)',
                    enum: ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'],
                },
                num_images: { type: 'number', description: 'Number of images to generate (default: 1)' },
                seed: { type: 'number', description: 'Random seed for reproducibility' },
                enable_safety_checker: { type: 'boolean', description: 'Enable safety checker (default: true)' },
                num_inference_steps: { type: 'number', description: 'Number of inference steps (default: 4)' },
            },
            required: ['prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'generate_image_flux_pro',
        description: 'Generate high-quality professional images using FLUX.1 Pro — best quality, slower generation',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Text description of the image to generate' },
                image_size: {
                    type: 'string',
                    description: 'Image size preset (default: landscape_4_3)',
                    enum: ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'],
                },
                num_inference_steps: { type: 'number', description: 'Number of steps (default: 25)' },
                guidance_scale: { type: 'number', description: 'Guidance scale (default: 3.5)' },
                num_images: { type: 'number', description: 'Number of images (default: 1)' },
                seed: { type: 'number', description: 'Random seed for reproducibility' },
            },
            required: ['prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'generate_video',
        description: 'Generate short animated videos from text prompts using AnimateDiff on Fal.ai',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Text description of the video to generate' },
                num_frames: { type: 'number', description: 'Number of frames (default: 16)' },
                fps: { type: 'number', description: 'Frames per second (default: 8)' },
                num_inference_steps: { type: 'number', description: 'Inference steps (default: 25)' },
                seed: { type: 'number', description: 'Random seed' },
            },
            required: ['prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'image_to_image',
        description: 'Transform an existing image using FLUX Dev image-to-image — modify style or content while preserving structure',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Text description of the desired transformation' },
                image_url: { type: 'string', description: 'URL of the source image to transform' },
                strength: { type: 'number', description: 'Transformation strength 0.0–1.0 (default: 0.95, higher = more change)' },
                num_inference_steps: { type: 'number', description: 'Inference steps (default: 25)' },
                seed: { type: 'number', description: 'Random seed' },
            },
            required: ['prompt', 'image_url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'remove_background',
        description: 'Remove the background from any image using rembg AI model',
        inputSchema: {
            type: 'object',
            properties: {
                image_url: { type: 'string', description: 'URL of the image to remove background from' },
            },
            required: ['image_url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'upscale_image',
        description: 'Upscale an image 2x or 4x using ESRGAN AI upscaling',
        inputSchema: {
            type: 'object',
            properties: {
                image_url: { type: 'string', description: 'URL of the image to upscale' },
                scale: {
                    type: 'number',
                    description: 'Upscaling factor (default: 4)',
                    enum: [2, 4],
                },
            },
            required: ['image_url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'run_model',
        description: 'Run any Fal.ai model directly with custom input parameters. Use this for models not covered by other tools',
        inputSchema: {
            type: 'object',
            properties: {
                model_id: { type: 'string', description: 'Full Fal model path e.g. "fal-ai/flux/schnell" or "fal-ai/lora"' },
                input: { type: 'object', description: 'Model-specific input parameters as an object' },
            },
            required: ['model_id', 'input'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'submit_async_job',
        description: 'Submit a Fal.ai model job to the async queue for long-running generation tasks',
        inputSchema: {
            type: 'object',
            properties: {
                model_id: { type: 'string', description: 'Full Fal model path e.g. "fal-ai/flux/dev"' },
                input: { type: 'object', description: 'Model-specific input parameters' },
            },
            required: ['model_id', 'input'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_async_result',
        description: 'Get the result of an async Fal.ai job by request ID',
        inputSchema: {
            type: 'object',
            properties: {
                model_id: { type: 'string', description: 'The model ID used when submitting the job' },
                request_id: { type: 'string', description: 'The request ID returned by submit_async_job' },
            },
            required: ['model_id', 'request_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'transcribe_audio',
        description: 'Transcribe or translate audio using Whisper on Fal.ai — supports 99+ languages',
        inputSchema: {
            type: 'object',
            properties: {
                audio_url: { type: 'string', description: 'Public URL of the audio file to transcribe' },
                task: {
                    type: 'string',
                    description: 'Task: transcribe (default) or translate to English',
                    enum: ['transcribe', 'translate'],
                },
                language: { type: 'string', description: 'Language code e.g. "en", "fr" (auto-detect if omitted)' },
                diarize: { type: 'boolean', description: 'Enable speaker diarization (default: false)' },
            },
            required: ['audio_url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'generate_music',
        description: 'Generate music and audio from text descriptions using Stable Audio on Fal.ai',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Text description of the music/audio to generate' },
                seconds_total: { type: 'number', description: 'Duration in seconds (default: 30)' },
                steps: { type: 'number', description: 'Inference steps (default: 100)' },
                seed: { type: 'number', description: 'Random seed for reproducibility' },
            },
            required: ['prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'list_models',
        description: 'List popular Fal.ai models with their IDs, types, and descriptions',
        inputSchema: {
            type: 'object',
            properties: {},
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
        case '_ping': {
            await falGet(`${FAL_QUEUE_BASE}/fal-ai/flux/schnell/requests?page=1`, apiKey);
            return toolOk({ connected: true, service: 'Fal.ai' });
        }

        case 'generate_image': {
            validateRequired(args, ['prompt']);

            const modelId = String(args.model_id ?? 'fal-ai/flux/schnell');
            const requestBody: Record<string, unknown> = {
                prompt: args.prompt,
                image_size: args.image_size ?? 'square_hd',
                num_images: args.num_images ?? 1,
                enable_safety_checker: args.enable_safety_checker !== false,
                num_inference_steps: args.num_inference_steps ?? 4,
            };
            if (args.seed !== undefined) requestBody.seed = args.seed;

            const data = await falPost(`${FAL_RUN_BASE}/${modelId}`, apiKey, requestBody) as any;
            return {
                images: (data.images ?? []).map((img: any) => ({
                    url: img.url,
                    width: img.width ?? null,
                    height: img.height ?? null,
                    content_type: img.content_type ?? 'image/jpeg',
                })),
                seed: data.seed ?? null,
                timings: data.timings ?? null,
            };
        }

        case 'generate_image_flux_pro': {
            validateRequired(args, ['prompt']);

            const requestBody: Record<string, unknown> = {
                prompt: args.prompt,
                image_size: args.image_size ?? 'landscape_4_3',
                num_inference_steps: args.num_inference_steps ?? 25,
                guidance_scale: args.guidance_scale ?? 3.5,
                num_images: args.num_images ?? 1,
            };
            if (args.seed !== undefined) requestBody.seed = args.seed;

            const data = await falPost(`${FAL_RUN_BASE}/fal-ai/flux-pro`, apiKey, requestBody) as any;
            return {
                images: (data.images ?? []).map((img: any) => ({
                    url: img.url,
                    width: img.width ?? null,
                    height: img.height ?? null,
                    content_type: img.content_type ?? 'image/jpeg',
                })),
                seed: data.seed ?? null,
            };
        }

        case 'generate_video': {
            validateRequired(args, ['prompt']);

            const requestBody: Record<string, unknown> = {
                prompt: args.prompt,
                num_frames: args.num_frames ?? 16,
                fps: args.fps ?? 8,
                num_inference_steps: args.num_inference_steps ?? 25,
            };
            if (args.seed !== undefined) requestBody.seed = args.seed;

            const data = await falPost(`${FAL_RUN_BASE}/fal-ai/fast-animatediff/text-to-video`, apiKey, requestBody) as any;
            return {
                video: data.video ?? data.output ?? null,
                seed: data.seed ?? null,
            };
        }

        case 'image_to_image': {
            validateRequired(args, ['prompt', 'image_url']);

            const requestBody: Record<string, unknown> = {
                prompt: args.prompt,
                image_url: args.image_url,
                strength: args.strength ?? 0.95,
                num_inference_steps: args.num_inference_steps ?? 25,
            };
            if (args.seed !== undefined) requestBody.seed = args.seed;

            const data = await falPost(`${FAL_RUN_BASE}/fal-ai/flux/dev/image-to-image`, apiKey, requestBody) as any;
            return {
                images: (data.images ?? []).map((img: any) => ({
                    url: img.url,
                    width: img.width ?? null,
                    height: img.height ?? null,
                    content_type: img.content_type ?? 'image/jpeg',
                })),
                seed: data.seed ?? null,
            };
        }

        case 'remove_background': {
            validateRequired(args, ['image_url']);

            const data = await falPost(`${FAL_RUN_BASE}/fal-ai/imageutils/rembg`, apiKey, {
                image_url: args.image_url,
            }) as any;

            const img = data.image ?? data;
            return {
                image: {
                    url: img.url,
                    content_type: img.content_type ?? 'image/png',
                    width: img.width ?? null,
                    height: img.height ?? null,
                },
            };
        }

        case 'upscale_image': {
            validateRequired(args, ['image_url']);

            const data = await falPost(`${FAL_RUN_BASE}/fal-ai/esrgan`, apiKey, {
                image_url: args.image_url,
                scale: args.scale ?? 4,
            }) as any;

            const img = data.image ?? data;
            return {
                image: {
                    url: img.url,
                    content_type: img.content_type ?? 'image/jpeg',
                },
            };
        }

        case 'run_model': {
            validateRequired(args, ['model_id', 'input']);
            if (typeof args.input !== 'object' || args.input === null) {
                throw new Error('input must be an object');
            }

            const data = await falPost(`${FAL_RUN_BASE}/${args.model_id}`, apiKey, args.input);
            return data;
        }

        case 'submit_async_job': {
            validateRequired(args, ['model_id', 'input']);
            if (typeof args.input !== 'object' || args.input === null) {
                throw new Error('input must be an object');
            }

            const data = await falPost(`${FAL_QUEUE_BASE}/${args.model_id}`, apiKey, args.input) as any;
            return {
                request_id: data.request_id,
                status: data.status ?? 'IN_QUEUE',
                queue_position: data.queue_position ?? null,
            };
        }

        case 'get_async_result': {
            validateRequired(args, ['model_id', 'request_id']);

            const statusUrl = `${FAL_QUEUE_BASE}/${args.model_id}/requests/${args.request_id}/status`;
            const statusData = await falGet(statusUrl, apiKey) as any;

            if (statusData.status === 'COMPLETED') {
                const resultUrl = `${FAL_QUEUE_BASE}/${args.model_id}/requests/${args.request_id}`;
                const resultData = await falGet(resultUrl, apiKey) as any;
                return {
                    status: 'COMPLETED',
                    output: resultData,
                    error: null,
                };
            }

            return {
                status: statusData.status ?? 'IN_QUEUE',
                output: null,
                error: statusData.error ?? null,
            };
        }

        case 'transcribe_audio': {
            validateRequired(args, ['audio_url']);

            const requestBody: Record<string, unknown> = {
                audio_url: args.audio_url,
                task: args.task ?? 'transcribe',
                diarize: args.diarize ?? false,
            };
            if (args.language) requestBody.language = args.language;

            const data = await falPost(`${FAL_RUN_BASE}/fal-ai/whisper`, apiKey, requestBody) as any;
            return {
                text: data.text ?? '',
                chunks: data.chunks ?? data.segments ?? [],
                detected_language: data.detected_language ?? null,
            };
        }

        case 'generate_music': {
            validateRequired(args, ['prompt']);

            const requestBody: Record<string, unknown> = {
                prompt: args.prompt,
                seconds_total: args.seconds_total ?? 30,
                steps: args.steps ?? 100,
            };
            if (args.seed !== undefined) requestBody.seed = args.seed;

            const data = await falPost(`${FAL_RUN_BASE}/fal-ai/stable-audio`, apiKey, requestBody) as any;
            const audio = data.audio_file ?? data.audio ?? data;
            return {
                audio: {
                    url: audio.url ?? audio,
                    content_type: audio.content_type ?? 'audio/wav',
                },
            };
        }

        case 'list_models': {
            // Fal.ai does not expose a public models list endpoint.
            // Return a curated list of popular models.
            return {
                models: POPULAR_MODELS,
                total: POPULAR_MODELS.length,
                note: 'Curated list of popular Fal.ai models. Visit https://fal.ai/models for the full catalog.',
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
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-fal-ai', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-fal-ai', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = getApiKey(request);
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: FAL_AI_API_KEY (header: X-Mcp-Secret-FAL-AI-API-KEY)');
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
