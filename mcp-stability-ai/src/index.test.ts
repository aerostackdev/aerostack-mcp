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

function imageApiOk(base64: string, outputFormat = 'png') {
    return Promise.resolve(
        new Response(JSON.stringify({
            image: base64,
            finish_reason: 'SUCCESS',
            seed: 42,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }),
    );
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-STABILITY-AI-API-KEY': 'test_stability_key',
};

// A tiny 1x1 transparent PNG as base64
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

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
        expect(body.server).toBe('mcp-stability-ai');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-stability-ai');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns exactly 10 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(10);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('generate_image');
        expect(names).toContain('generate_image_core');
        expect(names).toContain('generate_image_ultra');
        expect(names).toContain('upscale_image');
        expect(names).toContain('remove_background');
        expect(names).toContain('image_to_video');
        expect(names).toContain('get_video_result');
        expect(names).toContain('search_and_replace');
        expect(names).toContain('inpaint');
        expect(names).toContain('get_account_balance');
    });
});

describe('missing auth', () => {
    it('returns -32001 when API key is absent', async () => {
        const res = await worker.fetch(
            makeReqNoAuth('tools/call', { name: 'get_account_balance', arguments: {} }),
        );
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
        expect(body.error.message).toContain('STABILITY_AI_API_KEY');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('unknown/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

// ── generate_image ────────────────────────────────────────────────────────────

describe('generate_image', () => {
    it('returns base64 image with metadata', async () => {
        mockFetch.mockResolvedValueOnce(imageApiOk('abc123base64imagedata'));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: { prompt: 'a red fox running through a forest' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.image_base64).toBe('abc123base64imagedata');
        expect(result.finish_reason).toBe('SUCCESS');
        expect(result.seed).toBe(42);
        expect(result.data_uri).toMatch(/^data:image\/png;base64,/);
    });

    it('uses sd3.5-large as default model', async () => {
        mockFetch.mockResolvedValueOnce(imageApiOk('img_base64'));
        await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: { prompt: 'a mountain' },
        }));
        // Check FormData was sent (POST request with body)
        const [, options] = mockFetch.mock.calls[0];
        expect(options.method).toBe('POST');
        expect(options.headers['Authorization']).toBe('Bearer test_stability_key');
    });

    it('posts to the sd3 endpoint', async () => {
        mockFetch.mockResolvedValueOnce(imageApiOk('img_base64'));
        await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: { prompt: 'test' },
        }));
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/v2beta/stable-image/generate/sd3');
    });

    it('includes negative_prompt when provided', async () => {
        mockFetch.mockResolvedValueOnce(imageApiOk('img_base64'));
        await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: {
                prompt: 'a mountain',
                negative_prompt: 'blurry, low quality',
                aspect_ratio: '16:9',
                output_format: 'jpeg',
            },
        }));
        const [, options] = mockFetch.mock.calls[0];
        const formData = options.body as FormData;
        expect(formData.get('negative_prompt')).toBe('blurry, low quality');
        expect(formData.get('aspect_ratio')).toBe('16:9');
        expect(formData.get('output_format')).toBe('jpeg');
    });

    it('returns -32603 when prompt is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(new Response('{"name":"bad_request"}', { status: 400 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image',
            arguments: { prompt: 'test' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('400');
    });
});

// ── generate_image_core ───────────────────────────────────────────────────────

describe('generate_image_core', () => {
    it('posts to the core endpoint', async () => {
        mockFetch.mockResolvedValueOnce(imageApiOk('img_base64'));
        await worker.fetch(makeReq('tools/call', {
            name: 'generate_image_core',
            arguments: { prompt: 'a forest', style_preset: 'cinematic' },
        }));
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/v2beta/stable-image/generate/core');
        const formData = options.body as FormData;
        expect(formData.get('style_preset')).toBe('cinematic');
    });

    it('returns base64 image result', async () => {
        mockFetch.mockResolvedValueOnce(imageApiOk('core_image_base64'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image_core',
            arguments: { prompt: 'ocean sunset' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.image_base64).toBe('core_image_base64');
        expect(result.output_format).toBe('png');
    });

    it('returns -32603 when prompt is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image_core',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── generate_image_ultra ──────────────────────────────────────────────────────

describe('generate_image_ultra', () => {
    it('posts to the ultra endpoint', async () => {
        mockFetch.mockResolvedValueOnce(imageApiOk('ultra_base64'));
        await worker.fetch(makeReq('tools/call', {
            name: 'generate_image_ultra',
            arguments: { prompt: 'a grand cathedral', aspect_ratio: '9:16' },
        }));
        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/v2beta/stable-image/generate/ultra');
        const formData = options.body as FormData;
        expect(formData.get('aspect_ratio')).toBe('9:16');
    });

    it('returns -32603 when prompt is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'generate_image_ultra',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── upscale_image ─────────────────────────────────────────────────────────────

describe('upscale_image', () => {
    it('posts to the fast upscale endpoint with image blob', async () => {
        mockFetch.mockResolvedValueOnce(imageApiOk('upscaled_base64'));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'upscale_image',
            arguments: {
                image_base64: TINY_PNG_BASE64,
                prompt: 'sharp details',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.image_base64).toBe('upscaled_base64');

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/v2beta/stable-image/upscale/fast');
        const formData = options.body as FormData;
        expect(formData.get('prompt')).toBe('sharp details');
        expect(formData.get('image')).toBeDefined();
    });

    it('returns -32603 when image_base64 is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'upscale_image',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── remove_background ─────────────────────────────────────────────────────────

describe('remove_background', () => {
    it('posts to remove-background endpoint', async () => {
        mockFetch.mockResolvedValueOnce(imageApiOk('nobg_base64'));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'remove_background',
            arguments: { image_base64: TINY_PNG_BASE64 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.image_base64).toBe('nobg_base64');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/v2beta/stable-image/edit/remove-background');
    });

    it('returns -32603 when image_base64 is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'remove_background',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── image_to_video ────────────────────────────────────────────────────────────

describe('image_to_video', () => {
    it('returns generation_id and in-progress status', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 'gen_vid_abc123' }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'image_to_video',
            arguments: {
                image_base64: TINY_PNG_BASE64,
                motion_bucket_id: 200,
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.generation_id).toBe('gen_vid_abc123');
        expect(result.status).toBe('in-progress');
        expect(result.message).toContain('get_video_result');

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/v2beta/image-to-video');
        const formData = options.body as FormData;
        expect(formData.get('motion_bucket_id')).toBe('200');
    });

    it('returns -32603 when image_base64 is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'image_to_video',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── get_video_result ──────────────────────────────────────────────────────────

describe('get_video_result', () => {
    it('returns in-progress when API returns 202', async () => {
        mockFetch.mockResolvedValueOnce(new Response(null, { status: 202 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_video_result',
            arguments: { generation_id: 'gen_vid_abc123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.status).toBe('in-progress');
    });

    it('returns base64 video when complete', async () => {
        const videoBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
        mockFetch.mockResolvedValueOnce(new Response(videoBytes, {
            status: 200,
            headers: { 'Content-Type': 'video/mp4' },
        }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_video_result',
            arguments: { generation_id: 'gen_vid_abc123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.status).toBe('complete');
        expect(result.video_base64).toBeDefined();
        expect(result.content_type).toBe('video/mp4');
        expect(result.data_uri).toMatch(/^data:video\/mp4;base64,/);
    });

    it('returns -32603 when generation_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_video_result',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── search_and_replace ────────────────────────────────────────────────────────

describe('search_and_replace', () => {
    it('posts to search-and-replace endpoint with correct fields', async () => {
        mockFetch.mockResolvedValueOnce(imageApiOk('replaced_image_base64'));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_and_replace',
            arguments: {
                image_base64: TINY_PNG_BASE64,
                search_prompt: 'the car',
                prompt: 'a red Ferrari',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.image_base64).toBe('replaced_image_base64');

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/v2beta/stable-image/edit/search-and-replace');
        const formData = options.body as FormData;
        expect(formData.get('search_prompt')).toBe('the car');
        expect(formData.get('prompt')).toBe('a red Ferrari');
    });

    it('returns -32603 when required params are missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_and_replace',
            arguments: { image_base64: TINY_PNG_BASE64, prompt: 'a dog' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── inpaint ───────────────────────────────────────────────────────────────────

describe('inpaint', () => {
    it('posts to inpaint endpoint with image and mask', async () => {
        mockFetch.mockResolvedValueOnce(imageApiOk('inpainted_base64'));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'inpaint',
            arguments: {
                image_base64: TINY_PNG_BASE64,
                mask_base64: TINY_PNG_BASE64,
                prompt: 'a window with curtains',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.image_base64).toBe('inpainted_base64');

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain('/v2beta/stable-image/edit/inpaint');
        const formData = options.body as FormData;
        expect(formData.get('prompt')).toBe('a window with curtains');
        expect(formData.get('image')).toBeDefined();
        expect(formData.get('mask')).toBeDefined();
    });

    it('returns -32603 when required params are missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'inpaint',
            arguments: { image_base64: TINY_PNG_BASE64, prompt: 'something' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

// ── get_account_balance ───────────────────────────────────────────────────────

describe('get_account_balance', () => {
    it('returns credits balance', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ credits: 1523.75 }));

        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_account_balance',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.credits).toBe(1523.75);
    });

    it('requests the balance endpoint', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ credits: 100 }));
        await worker.fetch(makeReq('tools/call', {
            name: 'get_account_balance',
            arguments: {},
        }));
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/v1/user/balance');
    });
});
