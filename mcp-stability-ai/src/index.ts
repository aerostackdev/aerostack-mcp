/**
 * Stability AI MCP Worker
 * Implements MCP protocol over HTTP for Stability AI image generation operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   STABILITY_AI_API_KEY → X-Mcp-Secret-STABILITY-AI-API-KEY
 *
 * Auth: Authorization: Bearer {API_KEY} on every request
 * Docs: https://platform.stability.ai/docs/api-reference
 *
 * Stable Image API (v2beta) — all image responses returned as base64-encoded strings.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const STABILITY_API_BASE = 'https://api.stability.ai';

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
    return request.headers.get('X-Mcp-Secret-STABILITY-AI-API-KEY');
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

/**
 * POST to Stability API with multipart/form-data.
 * Returns JSON response. Image endpoints return binary if Accept: image/*
 * but we request JSON to get base64 in the artifacts array.
 */
async function stabilityPost(
    path: string,
    apiKey: string,
    fields: Record<string, string>,
): Promise<unknown> {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
        form.append(k, v);
    }
    const res = await fetch(`${STABILITY_API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
        },
        body: form,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Stability AI ${res.status}: ${text}`);
    }
    return res.json();
}

async function stabilityGet(path: string, apiKey: string): Promise<unknown> {
    const res = await fetch(`${STABILITY_API_BASE}${path}`, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Stability AI ${res.status}: ${text}`);
    }
    return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Stability AI credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'generate_image',
        description: 'Generate an image from a text prompt using Stable Diffusion 3.5. Returns base64-encoded PNG/JPEG image',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'Text description of the image to generate (max 10,000 characters)',
                },
                negative_prompt: {
                    type: 'string',
                    description: 'What to exclude from the image (e.g. "blurry, low quality, watermark")',
                },
                model: {
                    type: 'string',
                    description: 'Model to use for generation (default: sd3.5-large)',
                    enum: ['sd3.5-large', 'sd3.5-large-turbo', 'sd3.5-medium', 'sd3-large', 'sd3-large-turbo', 'sd3-medium'],
                },
                aspect_ratio: {
                    type: 'string',
                    description: 'Image aspect ratio (default: 1:1)',
                    enum: ['16:9', '1:1', '21:9', '2:3', '3:2', '4:5', '5:4', '9:16', '9:21'],
                },
                seed: {
                    type: 'number',
                    description: 'Random seed for reproducible results (0 = random)',
                },
                output_format: {
                    type: 'string',
                    description: 'Output image format (default: png)',
                    enum: ['png', 'jpeg', 'webp'],
                },
            },
            required: ['prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'generate_image_core',
        description: 'Fast image generation using Stable Image Core — optimised for speed and cost. Returns base64-encoded image',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'Text description of the image to generate',
                },
                negative_prompt: {
                    type: 'string',
                    description: 'What to exclude from the image',
                },
                aspect_ratio: {
                    type: 'string',
                    description: 'Image aspect ratio (default: 1:1)',
                    enum: ['16:9', '1:1', '21:9', '2:3', '3:2', '4:5', '5:4', '9:16', '9:21'],
                },
                style_preset: {
                    type: 'string',
                    description: 'Visual style preset to guide the image generation',
                    enum: [
                        '3d-model', 'analog-film', 'anime', 'cinematic', 'comic-book',
                        'digital-art', 'enhance', 'fantasy-art', 'isometric', 'line-art',
                        'low-poly', 'modeling-compound', 'neon-punk', 'origami',
                        'photographic', 'pixel-art', 'tile-texture',
                    ],
                },
                seed: { type: 'number', description: 'Random seed (0 = random)' },
                output_format: {
                    type: 'string',
                    description: 'Output image format (default: png)',
                    enum: ['png', 'jpeg', 'webp'],
                },
            },
            required: ['prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'generate_image_ultra',
        description: 'Highest quality image generation using Stable Image Ultra — best detail, coherence, and typography. Returns base64-encoded image',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'Text description of the image to generate',
                },
                negative_prompt: {
                    type: 'string',
                    description: 'What to exclude from the image',
                },
                aspect_ratio: {
                    type: 'string',
                    description: 'Image aspect ratio (default: 1:1)',
                    enum: ['16:9', '1:1', '21:9', '2:3', '3:2', '4:5', '5:4', '9:16', '9:21'],
                },
                seed: { type: 'number', description: 'Random seed (0 = random)' },
                output_format: {
                    type: 'string',
                    description: 'Output image format (default: png)',
                    enum: ['png', 'jpeg', 'webp'],
                },
            },
            required: ['prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'upscale_image',
        description: 'Upscale an image by 4x using Stable Fast 4x Upscaler. Input image must be provided as a base64-encoded string',
        inputSchema: {
            type: 'object',
            properties: {
                image_base64: {
                    type: 'string',
                    description: 'Base64-encoded input image to upscale (PNG or JPEG)',
                },
                prompt: {
                    type: 'string',
                    description: 'Optional guiding prompt to enhance specific details during upscaling',
                },
                negative_prompt: {
                    type: 'string',
                    description: 'What to avoid during upscaling',
                },
                seed: { type: 'number', description: 'Random seed (0 = random)' },
                output_format: {
                    type: 'string',
                    description: 'Output image format (default: png)',
                    enum: ['png', 'jpeg', 'webp'],
                },
            },
            required: ['image_base64'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'remove_background',
        description: 'Remove the background from an image, returning the subject with a transparent background. Input as base64-encoded string',
        inputSchema: {
            type: 'object',
            properties: {
                image_base64: {
                    type: 'string',
                    description: 'Base64-encoded input image (PNG or JPEG)',
                },
                output_format: {
                    type: 'string',
                    description: 'Output format — use png for transparent background (default: png)',
                    enum: ['png', 'webp'],
                },
            },
            required: ['image_base64'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'image_to_video',
        description: 'Generate a short video clip from a static image using Stable Video Diffusion. Returns an async generation ID to poll',
        inputSchema: {
            type: 'object',
            properties: {
                image_base64: {
                    type: 'string',
                    description: 'Base64-encoded source image (JPEG or PNG, must be 1024x576 or 576x1024)',
                },
                seed: { type: 'number', description: 'Random seed (0 = random)' },
                cfg_scale: {
                    type: 'number',
                    description: 'How strictly to follow the image (1.0–10.0, default: 1.8)',
                },
                motion_bucket_id: {
                    type: 'number',
                    description: 'Controls motion intensity (1–255, default: 127). Higher = more motion',
                },
            },
            required: ['image_base64'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_video_result',
        description: 'Poll for the result of an image-to-video generation. Returns base64-encoded video when complete',
        inputSchema: {
            type: 'object',
            properties: {
                generation_id: {
                    type: 'string',
                    description: 'Generation ID returned by image_to_video',
                },
            },
            required: ['generation_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'search_and_replace',
        description: 'Replace a specific object or area in an image using a text search prompt. Returns the edited image as base64',
        inputSchema: {
            type: 'object',
            properties: {
                image_base64: {
                    type: 'string',
                    description: 'Base64-encoded source image',
                },
                search_prompt: {
                    type: 'string',
                    description: 'What to find in the image (e.g. "the car", "the sky")',
                },
                prompt: {
                    type: 'string',
                    description: 'What to replace it with (e.g. "a red sports car", "a sunset sky")',
                },
                negative_prompt: {
                    type: 'string',
                    description: 'What to avoid in the replacement',
                },
                seed: { type: 'number', description: 'Random seed (0 = random)' },
                output_format: {
                    type: 'string',
                    description: 'Output image format (default: png)',
                    enum: ['png', 'jpeg', 'webp'],
                },
            },
            required: ['image_base64', 'search_prompt', 'prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'inpaint',
        description: 'Erase and regenerate a masked area of an image. Provide the image and a mask as base64-encoded strings',
        inputSchema: {
            type: 'object',
            properties: {
                image_base64: {
                    type: 'string',
                    description: 'Base64-encoded source image',
                },
                mask_base64: {
                    type: 'string',
                    description: 'Base64-encoded mask image — white areas will be regenerated, black areas kept',
                },
                prompt: {
                    type: 'string',
                    description: 'What to generate in the masked area',
                },
                negative_prompt: {
                    type: 'string',
                    description: 'What to avoid in the inpainted area',
                },
                seed: { type: 'number', description: 'Random seed (0 = random)' },
                output_format: {
                    type: 'string',
                    description: 'Output image format (default: png)',
                    enum: ['png', 'jpeg', 'webp'],
                },
            },
            required: ['image_base64', 'mask_base64', 'prompt'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_account_balance',
        description: 'Get your Stability AI account credits balance',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

function base64ToBlob(base64: string, mimeType: string): Blob {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
}

async function generateImageResult(data: any, outputFormat: string): Promise<unknown> {
    if (data.image) {
        // v2beta returns { image: base64string, finish_reason, seed }
        return {
            image_base64: data.image,
            output_format: outputFormat,
            finish_reason: data.finish_reason ?? 'SUCCESS',
            seed: data.seed ?? 0,
            data_uri: `data:image/${outputFormat};base64,${data.image}`,
        };
    }
    // fallback for artifacts array shape
    const artifact = (data.artifacts ?? [])[0];
    if (!artifact) throw new Error('No image returned from Stability AI');
    return {
        image_base64: artifact.base64,
        output_format: outputFormat,
        finish_reason: artifact.finishReason ?? 'SUCCESS',
        seed: artifact.seed ?? 0,
        data_uri: `data:image/${outputFormat};base64,${artifact.base64}`,
    };
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            await stabilityGet('/v1/user/balance', apiKey);
            return { content: [{ type: 'text', text: 'Connected to Stability AI' }] };
        }

        case 'generate_image': {
            validateRequired(args, ['prompt']);
            const outputFormat = String(args.output_format ?? 'png');
            const fields: Record<string, string> = {
                prompt: String(args.prompt),
                model: String(args.model ?? 'sd3.5-large'),
                aspect_ratio: String(args.aspect_ratio ?? '1:1'),
                output_format: outputFormat,
            };
            if (args.negative_prompt) fields.negative_prompt = String(args.negative_prompt);
            if (args.seed !== undefined) fields.seed = String(args.seed);

            const data = await stabilityPost('/v2beta/stable-image/generate/sd3', apiKey, fields) as any;
            return generateImageResult(data, outputFormat);
        }

        case 'generate_image_core': {
            validateRequired(args, ['prompt']);
            const outputFormat = String(args.output_format ?? 'png');
            const fields: Record<string, string> = {
                prompt: String(args.prompt),
                aspect_ratio: String(args.aspect_ratio ?? '1:1'),
                output_format: outputFormat,
            };
            if (args.negative_prompt) fields.negative_prompt = String(args.negative_prompt);
            if (args.style_preset) fields.style_preset = String(args.style_preset);
            if (args.seed !== undefined) fields.seed = String(args.seed);

            const data = await stabilityPost('/v2beta/stable-image/generate/core', apiKey, fields) as any;
            return generateImageResult(data, outputFormat);
        }

        case 'generate_image_ultra': {
            validateRequired(args, ['prompt']);
            const outputFormat = String(args.output_format ?? 'png');
            const fields: Record<string, string> = {
                prompt: String(args.prompt),
                aspect_ratio: String(args.aspect_ratio ?? '1:1'),
                output_format: outputFormat,
            };
            if (args.negative_prompt) fields.negative_prompt = String(args.negative_prompt);
            if (args.seed !== undefined) fields.seed = String(args.seed);

            const data = await stabilityPost('/v2beta/stable-image/generate/ultra', apiKey, fields) as any;
            return generateImageResult(data, outputFormat);
        }

        case 'upscale_image': {
            validateRequired(args, ['image_base64']);
            const outputFormat = String(args.output_format ?? 'png');
            const mimeType = outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png';

            const form = new FormData();
            const blob = base64ToBlob(String(args.image_base64), mimeType);
            form.append('image', blob, `image.${outputFormat}`);
            form.append('output_format', outputFormat);
            if (args.prompt) form.append('prompt', String(args.prompt));
            if (args.negative_prompt) form.append('negative_prompt', String(args.negative_prompt));
            if (args.seed !== undefined) form.append('seed', String(args.seed));

            const res = await fetch(`${STABILITY_API_BASE}/v2beta/stable-image/upscale/fast`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json',
                },
                body: form,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Stability AI upscale ${res.status}: ${text}`);
            }
            const data = await res.json() as any;
            return generateImageResult(data, outputFormat);
        }

        case 'remove_background': {
            validateRequired(args, ['image_base64']);
            const outputFormat = String(args.output_format ?? 'png');
            const mimeType = 'image/png';

            const form = new FormData();
            const blob = base64ToBlob(String(args.image_base64), mimeType);
            form.append('image', blob, 'image.png');
            form.append('output_format', outputFormat);

            const res = await fetch(`${STABILITY_API_BASE}/v2beta/stable-image/edit/remove-background`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json',
                },
                body: form,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Stability AI remove-background ${res.status}: ${text}`);
            }
            const data = await res.json() as any;
            return generateImageResult(data, outputFormat);
        }

        case 'image_to_video': {
            validateRequired(args, ['image_base64']);

            const form = new FormData();
            const blob = base64ToBlob(String(args.image_base64), 'image/jpeg');
            form.append('image', blob, 'image.jpg');
            if (args.seed !== undefined) form.append('seed', String(args.seed));
            if (args.cfg_scale !== undefined) form.append('cfg_scale', String(args.cfg_scale));
            if (args.motion_bucket_id !== undefined) form.append('motion_bucket_id', String(args.motion_bucket_id));

            const res = await fetch(`${STABILITY_API_BASE}/v2beta/image-to-video`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: form,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Stability AI image-to-video ${res.status}: ${text}`);
            }
            const data = await res.json() as any;
            return {
                generation_id: data.id,
                status: 'in-progress',
                message: 'Video generation started. Use get_video_result with the generation_id to check status.',
            };
        }

        case 'get_video_result': {
            validateRequired(args, ['generation_id']);
            const res = await fetch(`${STABILITY_API_BASE}/v2beta/image-to-video/result/${args.generation_id}`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json',
                },
            });

            if (res.status === 202) {
                return { status: 'in-progress', message: 'Video generation is still processing. Try again in a few seconds.' };
            }
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Stability AI video result ${res.status}: ${text}`);
            }
            const buffer = await res.arrayBuffer();
            const base64Video = arrayBufferToBase64(buffer);
            return {
                status: 'complete',
                video_base64: base64Video,
                content_type: 'video/mp4',
                size_bytes: buffer.byteLength,
                data_uri: `data:video/mp4;base64,${base64Video}`,
            };
        }

        case 'search_and_replace': {
            validateRequired(args, ['image_base64', 'search_prompt', 'prompt']);
            const outputFormat = String(args.output_format ?? 'png');
            const mimeType = 'image/png';

            const form = new FormData();
            const blob = base64ToBlob(String(args.image_base64), mimeType);
            form.append('image', blob, 'image.png');
            form.append('search_prompt', String(args.search_prompt));
            form.append('prompt', String(args.prompt));
            form.append('output_format', outputFormat);
            if (args.negative_prompt) form.append('negative_prompt', String(args.negative_prompt));
            if (args.seed !== undefined) form.append('seed', String(args.seed));

            const res = await fetch(`${STABILITY_API_BASE}/v2beta/stable-image/edit/search-and-replace`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json',
                },
                body: form,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Stability AI search-and-replace ${res.status}: ${text}`);
            }
            const data = await res.json() as any;
            return generateImageResult(data, outputFormat);
        }

        case 'inpaint': {
            validateRequired(args, ['image_base64', 'mask_base64', 'prompt']);
            const outputFormat = String(args.output_format ?? 'png');

            const form = new FormData();
            const imageBlob = base64ToBlob(String(args.image_base64), 'image/png');
            const maskBlob = base64ToBlob(String(args.mask_base64), 'image/png');
            form.append('image', imageBlob, 'image.png');
            form.append('mask', maskBlob, 'mask.png');
            form.append('prompt', String(args.prompt));
            form.append('output_format', outputFormat);
            if (args.negative_prompt) form.append('negative_prompt', String(args.negative_prompt));
            if (args.seed !== undefined) form.append('seed', String(args.seed));

            const res = await fetch(`${STABILITY_API_BASE}/v2beta/stable-image/edit/inpaint`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json',
                },
                body: form,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Stability AI inpaint ${res.status}: ${text}`);
            }
            const data = await res.json() as any;
            return generateImageResult(data, outputFormat);
        }

        case 'get_account_balance': {
            const data = await stabilityGet('/v1/user/balance', apiKey) as any;
            return {
                credits: data.credits ?? 0,
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
            return new Response(JSON.stringify({ status: 'ok', server: 'mcp-stability-ai', version: '1.0.0' }), {
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
                serverInfo: { name: 'mcp-stability-ai', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const apiKey = getApiKey(request);
            if (!apiKey) {
                return rpcErr(id, -32001, 'Missing required secret: STABILITY_AI_API_KEY (header: X-Mcp-Secret-STABILITY-AI-API-KEY)');
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
