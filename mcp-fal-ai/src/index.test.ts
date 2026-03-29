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
    'X-Mcp-Secret-FAL-AI-API-KEY': 'test_fal_key',
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
        expect(body.server).toBe('mcp-fal-ai');
        expect(body.version).toBe('1.0.0');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('non-POST request', () => {
    it('returns 405', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        // GET /health is handled; GET / is not
        // Use a path other than /health
        const req2 = new Request('http://localhost/other', { method: 'GET' });
        const res2 = await worker.fetch(req2);
        expect(res2.status).toBe(405);
    });
});

describe('parse error', () => {
    it('returns -32700 on invalid JSON', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-json-at-all',
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
        expect(body.result.serverInfo.name).toBe('mcp-fal-ai');
        expect(body.result.serverInfo.version).toBe('1.0.0');
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.capabilities.tools).toBeDefined();
    });
});

describe('tools/list', () => {
    it('returns exactly 12 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(12);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('generate_image');
        expect(names).toContain('generate_image_flux_pro');
        expect(names).toContain('generate_video');
        expect(names).toContain('image_to_image');
        expect(names).toContain('remove_background');
        expect(names).toContain('upscale_image');
        expect(names).toContain('run_model');
        expect(names).toContain('submit_async_job');
        expect(names).toContain('get_async_result');
        expect(names).toContain('transcribe_audio');
        expect(names).toContain('generate_music');
        expect(names).toContain('list_models');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('something/else'));
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

// ── generate_image ────────────────────────────────────────────────────────────

describe('generate_image', () => {
    it('generates image and returns url', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            images: [{ url: 'https://fal.media/files/img123.jpg', width: 1024, height: 1024, content_type: 'image/jpeg' }],
            seed: 42,
            timings: { inference: 0.8 },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: { prompt: 'A beautiful sunset over mountains' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.images).toHaveLength(1);
        expect(result.images[0].url).toBe('https://fal.media/files/img123.jpg');
        expect(result.seed).toBe(42);
    });

    it('uses default model fal-ai/flux/schnell', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ images: [], seed: 1 }));

        await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: { prompt: 'test' },
        }));

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('fal-ai/flux/schnell');
    });

    it('uses custom model_id when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ images: [], seed: 1 }));

        await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: { prompt: 'test', model_id: 'fal-ai/flux/dev' },
        }));

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('fal-ai/flux/dev');
    });

    it('uses correct defaults', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ images: [], seed: 1 }));

        await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: { prompt: 'test' },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.image_size).toBe('square_hd');
        expect(reqBody.num_images).toBe(1);
        expect(reqBody.num_inference_steps).toBe(4);
        expect(reqBody.enable_safety_checker).toBe(true);
    });

    it('passes seed when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ images: [], seed: 99 }));

        await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: { prompt: 'test', seed: 99 },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.seed).toBe(99);
    });

    it('uses Key auth not Bearer', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ images: [], seed: 1 }));

        await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: { prompt: 'test' },
        }));

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].headers['Authorization']).toBe('Key test_fal_key');
    });

    it('returns -32603 when prompt missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(new Response('Model not found', { status: 404 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: { prompt: 'test', model_id: 'fal-ai/nonexistent' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── generate_image_flux_pro ───────────────────────────────────────────────────

describe('generate_image_flux_pro', () => {
    it('calls flux-pro endpoint', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            images: [{ url: 'https://fal.media/pro.jpg', width: 1365, height: 1024, content_type: 'image/jpeg' }],
            seed: 7,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image_flux_pro',
            arguments: { prompt: 'A futuristic city' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.images).toHaveLength(1);

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('flux-pro');
    });

    it('uses correct defaults', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ images: [], seed: 1 }));

        await worker.fetch(makeReq('tools/call', {
            name: 'generate_image_flux_pro',
            arguments: { prompt: 'test' },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.image_size).toBe('landscape_4_3');
        expect(reqBody.num_inference_steps).toBe(25);
        expect(reqBody.guidance_scale).toBe(3.5);
        expect(reqBody.num_images).toBe(1);
    });

    it('returns -32603 when prompt missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image_flux_pro',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── generate_video ────────────────────────────────────────────────────────────

describe('generate_video', () => {
    it('generates video and returns url', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            video: { url: 'https://fal.media/video.mp4', content_type: 'video/mp4' },
            seed: 15,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_video',
            arguments: { prompt: 'A dog running in the park' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.video.url).toBe('https://fal.media/video.mp4');
        expect(result.seed).toBe(15);
    });

    it('calls animatediff endpoint', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ video: { url: 'v.mp4' }, seed: 1 }));

        await worker.fetch(makeReq('tools/call', {
            name: 'generate_video',
            arguments: { prompt: 'test' },
        }));

        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toContain('animatediff');
    });

    it('uses default num_frames and fps', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ video: null, seed: 1 }));

        await worker.fetch(makeReq('tools/call', {
            name: 'generate_video',
            arguments: { prompt: 'test' },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.num_frames).toBe(16);
        expect(reqBody.fps).toBe(8);
    });

    it('returns -32603 when prompt missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_video',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── image_to_image ────────────────────────────────────────────────────────────

describe('image_to_image', () => {
    it('transforms image and returns results', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            images: [{ url: 'https://fal.media/transformed.jpg', width: 1024, height: 1024, content_type: 'image/jpeg' }],
            seed: 22,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'image_to_image',
            arguments: {
                prompt: 'Make it look like a painting',
                image_url: 'https://example.com/input.jpg',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.images).toHaveLength(1);
        expect(result.images[0].url).toBe('https://fal.media/transformed.jpg');
    });

    it('uses default strength', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ images: [], seed: 1 }));

        await worker.fetch(makeReq('tools/call', {
            name: 'image_to_image',
            arguments: { prompt: 'test', image_url: 'https://example.com/img.jpg' },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.strength).toBe(0.95);
    });

    it('returns -32603 when image_url missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'image_to_image',
            arguments: { prompt: 'test' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── remove_background ─────────────────────────────────────────────────────────

describe('remove_background', () => {
    it('removes background and returns image', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            image: { url: 'https://fal.media/nobg.png', content_type: 'image/png', width: 800, height: 600 },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'remove_background',
            arguments: { image_url: 'https://example.com/photo.jpg' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.image.url).toBe('https://fal.media/nobg.png');
        expect(result.image.content_type).toBe('image/png');
    });

    it('calls rembg endpoint', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ image: { url: 'x.png' } }));

        await worker.fetch(makeReq('tools/call', {
            name: 'remove_background',
            arguments: { image_url: 'https://example.com/img.jpg' },
        }));

        expect(mockFetch.mock.calls[0][0]).toContain('rembg');
    });

    it('returns -32603 when image_url missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'remove_background',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── upscale_image ─────────────────────────────────────────────────────────────

describe('upscale_image', () => {
    it('upscales image and returns url', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            image: { url: 'https://fal.media/upscaled.jpg', content_type: 'image/jpeg' },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'upscale_image',
            arguments: { image_url: 'https://example.com/small.jpg' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.image.url).toBe('https://fal.media/upscaled.jpg');
    });

    it('uses default scale of 4', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ image: { url: 'x.jpg' } }));

        await worker.fetch(makeReq('tools/call', {
            name: 'upscale_image',
            arguments: { image_url: 'https://example.com/img.jpg' },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.scale).toBe(4);
    });

    it('returns -32603 when image_url missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'upscale_image',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── run_model ─────────────────────────────────────────────────────────────────

describe('run_model', () => {
    it('runs any model with custom input', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            output: 'custom model result',
            metadata: { time: 1.5 },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'run_model',
            arguments: {
                model_id: 'fal-ai/lora',
                input: { prompt: 'a photo', loras: [{ path: 'lora_url' }] },
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.output).toBe('custom model result');
    });

    it('constructs correct URL from model_id', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ output: 'ok' }));

        await worker.fetch(makeReq('tools/call', {
            name: 'run_model',
            arguments: { model_id: 'fal-ai/custom-model', input: { prompt: 'test' } },
        }));

        expect(mockFetch.mock.calls[0][0]).toContain('fal-ai/custom-model');
        expect(mockFetch.mock.calls[0][0]).toContain('fal.run');
    });

    it('returns -32603 when model_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'run_model',
            arguments: { input: { prompt: 'test' } },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when input is not an object', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'run_model',
            arguments: { model_id: 'fal-ai/flux/schnell', input: 'not-an-object' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── submit_async_job ──────────────────────────────────────────────────────────

describe('submit_async_job', () => {
    it('submits job and returns request_id', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            request_id: 'req_abc123',
            status: 'IN_QUEUE',
            queue_position: 3,
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'submit_async_job',
            arguments: {
                model_id: 'fal-ai/flux/dev',
                input: { prompt: 'A complex scene' },
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.request_id).toBe('req_abc123');
        expect(result.status).toBe('IN_QUEUE');
        expect(result.queue_position).toBe(3);
    });

    it('uses queue.fal.run endpoint', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ request_id: 'r1', status: 'IN_QUEUE' }));

        await worker.fetch(makeReq('tools/call', {
            name: 'submit_async_job',
            arguments: { model_id: 'fal-ai/flux/dev', input: { prompt: 'test' } },
        }));

        expect(mockFetch.mock.calls[0][0]).toContain('queue.fal.run');
    });

    it('returns -32603 when model_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'submit_async_job',
            arguments: { input: { prompt: 'test' } },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── get_async_result ──────────────────────────────────────────────────────────

describe('get_async_result', () => {
    it('returns completed result when status is COMPLETED', async () => {
        mockFetch
            .mockResolvedValueOnce(apiOk({ status: 'COMPLETED' }))
            .mockResolvedValueOnce(apiOk({
                images: [{ url: 'https://fal.media/done.jpg' }],
                seed: 77,
            }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_async_result',
            arguments: {
                model_id: 'fal-ai/flux/dev',
                request_id: 'req_abc123',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.status).toBe('COMPLETED');
        expect(result.output).toBeDefined();
        expect(result.output.images[0].url).toBe('https://fal.media/done.jpg');
    });

    it('returns IN_QUEUE status without output when not complete', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ status: 'IN_QUEUE', queue_position: 5 }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_async_result',
            arguments: {
                model_id: 'fal-ai/flux/dev',
                request_id: 'req_pending',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.status).toBe('IN_QUEUE');
        expect(result.output).toBeNull();
    });

    it('returns -32603 when request_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_async_result',
            arguments: { model_id: 'fal-ai/flux/dev' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── transcribe_audio ──────────────────────────────────────────────────────────

describe('transcribe_audio', () => {
    it('transcribes audio from URL', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            text: 'Hello this is a transcription',
            chunks: [
                { timestamp: [0, 2.5], text: 'Hello this is' },
                { timestamp: [2.5, 4.0], text: 'a transcription' },
            ],
            detected_language: 'en',
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_audio',
            arguments: { audio_url: 'https://example.com/audio.mp3' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.text).toBe('Hello this is a transcription');
        expect(result.chunks).toHaveLength(2);
        expect(result.detected_language).toBe('en');
    });

    it('calls fal-ai/whisper endpoint', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ text: 'test', chunks: [] }));

        await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_audio',
            arguments: { audio_url: 'https://example.com/audio.mp3' },
        }));

        expect(mockFetch.mock.calls[0][0]).toContain('fal-ai/whisper');
    });

    it('uses default task transcribe', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ text: 'ok', chunks: [] }));

        await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_audio',
            arguments: { audio_url: 'https://example.com/audio.mp3' },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.task).toBe('transcribe');
    });

    it('returns -32603 when audio_url missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'transcribe_audio',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── generate_music ────────────────────────────────────────────────────────────

describe('generate_music', () => {
    it('generates music and returns audio url', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            audio_file: { url: 'https://fal.media/music.wav', content_type: 'audio/wav' },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_music',
            arguments: { prompt: 'Upbeat jazz piano' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.audio.url).toBe('https://fal.media/music.wav');
        expect(result.audio.content_type).toBe('audio/wav');
    });

    it('uses default duration and steps', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ audio_file: { url: 'x.wav' } }));

        await worker.fetch(makeReq('tools/call', {
            name: 'generate_music',
            arguments: { prompt: 'test' },
        }));

        const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(reqBody.seconds_total).toBe(30);
        expect(reqBody.steps).toBe(100);
    });

    it('calls stable-audio endpoint', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ audio_file: { url: 'x.wav' } }));

        await worker.fetch(makeReq('tools/call', {
            name: 'generate_music',
            arguments: { prompt: 'test' },
        }));

        expect(mockFetch.mock.calls[0][0]).toContain('stable-audio');
    });

    it('returns -32603 when prompt missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_music',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── list_models ───────────────────────────────────────────────────────────────

describe('list_models', () => {
    it('returns hardcoded popular models without making API call', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.models.length).toBeGreaterThanOrEqual(15);
        expect(result.total).toBe(result.models.length);
        expect(result.note).toContain('fal.ai/models');
        // Verify no API call was made
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('includes FLUX models', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        const ids = result.models.map((m: any) => m.id);
        expect(ids).toContain('fal-ai/flux/schnell');
        expect(ids).toContain('fal-ai/flux-pro');
    });

    it('includes models of multiple types', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        const types = new Set(result.models.map((m: any) => m.type));
        expect(types.has('image')).toBe(true);
        expect(types.has('video')).toBe(true);
        expect(types.has('audio')).toBe(true);
    });
});
