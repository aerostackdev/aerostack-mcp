import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'test_heygen_api_key_abc123xyz';

function makeRequest(method: string, body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://worker.example.com/', {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
}

function withSecret(headers: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-HEYGEN-API-KEY': API_KEY, ...headers };
}

function mockOk(data: unknown) {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(data), { status: 200 }));
}

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol tests ─────────────────────────────────────────────────────────────

describe('GET health check', () => {
    it('returns status ok with 7 tools', async () => {
        const res = await worker.fetch(new Request('https://worker.example.com/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-heygen');
        expect(body.tools).toBe(7);
    });
});

describe('initialize', () => {
    it('returns protocolVersion 2024-11-05', async () => {
        const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'initialize' }));
        const body = await res.json() as { result: { protocolVersion: string } };
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns all 7 tools', async () => {
        const res = await worker.fetch(makeRequest('POST', { jsonrpc: '2.0', id: 2, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(7);
    });
});

describe('missing secret', () => {
    it('returns -32001 when HEYGEN_API_KEY is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'list_avatars', arguments: {} },
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32001);
    });
});

describe('unknown tool', () => {
    it('returns -32601 for unknown tool name', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'clone_avatar', arguments: {} },
        }, withSecret()));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

describe('unknown method', () => {
    it('returns -32601 for unknown JSON-RPC method', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 5, method: 'resources/list',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

// ── Tool tests ─────────────────────────────────────────────────────────────────

describe('list_avatars', () => {
    it('calls HeyGen avatars endpoint using X-Api-Key header', async () => {
        const mockData = {
            data: { avatars: [{ avatar_id: 'av_001', avatar_name: 'Emma', gender: 'female' }] },
        };
        mockOk(mockData);

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: { name: 'list_avatars', arguments: {} },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('Emma');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/v2/avatars'),
            expect.objectContaining({ headers: expect.objectContaining({ 'X-Api-Key': API_KEY }) }),
        );
    });
});

describe('create_video', () => {
    it('creates video with avatar and voice', async () => {
        mockOk({ data: { video_id: 'vid_new123' }, error: null });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 11, method: 'tools/call',
            params: {
                name: 'create_video',
                arguments: { avatar_id: 'av_001', voice_id: 'voice_001', input_text: 'Hello world' },
            },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('vid_new123');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/v2/video/generate'),
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('returns error when required fields are missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 12, method: 'tools/call',
            params: { name: 'create_video', arguments: { avatar_id: 'av_001' } },
        }, withSecret()));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('voice_id');
    });
});

describe('get_video_status', () => {
    it('fetches video status with video_id as query param', async () => {
        mockOk({ data: { video_id: 'vid_abc', status: 'completed', video_url: 'https://files.heygen.ai/vid_abc.mp4' } });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 13, method: 'tools/call',
            params: { name: 'get_video_status', arguments: { video_id: 'vid_abc' } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('completed');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('video_id=vid_abc'),
            expect.anything(),
        );
    });
});

describe('get_remaining_quota', () => {
    it('calls the remaining quota endpoint', async () => {
        mockOk({ data: { remaining_quota: 50 } });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 14, method: 'tools/call',
            params: { name: 'get_remaining_quota', arguments: {} },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('remaining_quota');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/v2/user/remaining_quota'),
            expect.anything(),
        );
    });
});
