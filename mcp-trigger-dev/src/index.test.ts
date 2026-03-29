import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const API_KEY = 'tr_dev_test_trigger_api_key_abc123';

function makeRequest(method: string, body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://worker.example.com/', {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });
}

function withSecret(headers: Record<string, string> = {}) {
    return { 'X-Mcp-Secret-TRIGGER-DEV-API-KEY': API_KEY, ...headers };
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
        expect(body.server).toBe('mcp-trigger-dev');
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
    it('returns -32001 when TRIGGER_DEV_API_KEY is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'list_runs', arguments: {} },
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32001);
    });
});

describe('unknown tool', () => {
    it('returns -32601 for unknown tool name', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'trigger_task', arguments: {} },
        }, withSecret()));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

describe('unknown method', () => {
    it('returns -32601 for unknown JSON-RPC method', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 5, method: 'prompts/list',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});

// ── Tool tests ─────────────────────────────────────────────────────────────────

describe('list_runs', () => {
    it('calls Trigger.dev runs endpoint and returns results', async () => {
        const mockData = {
            data: [{ id: 'run_abc123', status: 'COMPLETED', taskIdentifier: 'my-task' }],
        };
        mockOk(mockData);

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: { name: 'list_runs', arguments: { limit: 10 } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('run_abc123');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/runs?limit=10'),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${API_KEY}` }) }),
        );
    });
});

describe('get_run', () => {
    it('fetches a single run by ID', async () => {
        mockOk({ id: 'run_xyz789', status: 'FAILED', output: { error: 'Timeout' } });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 11, method: 'tools/call',
            params: { name: 'get_run', arguments: { run_id: 'run_xyz789' } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('FAILED');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/runs/run_xyz789'),
            expect.anything(),
        );
    });

    it('returns error when run_id is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 12, method: 'tools/call',
            params: { name: 'get_run', arguments: {} },
        }, withSecret()));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('run_id');
    });
});

describe('create_schedule', () => {
    it('creates a cron schedule for a task', async () => {
        mockOk({ id: 'sched_001', taskIdentifier: 'cleanup-task', cron: '0 0 * * *', timezone: 'UTC' });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 13, method: 'tools/call',
            params: {
                name: 'create_schedule',
                arguments: { task: 'cleanup-task', cron: '0 0 * * *', timezone: 'UTC' },
            },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('cleanup-task');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/schedules'),
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('returns error when task is missing', async () => {
        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 14, method: 'tools/call',
            params: { name: 'create_schedule', arguments: { cron: '0 * * * *' } },
        }, withSecret()));
        const body = await res.json() as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('task');
    });
});

describe('cancel_run', () => {
    it('sends POST to cancel endpoint', async () => {
        mockOk({ id: 'run_abc123', status: 'CANCELLED' });

        const res = await worker.fetch(makeRequest('POST', {
            jsonrpc: '2.0', id: 15, method: 'tools/call',
            params: { name: 'cancel_run', arguments: { run_id: 'run_abc123' } },
        }, withSecret()));

        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(body.result.content[0].text).toContain('CANCELLED');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/runs/run_abc123/cancel'),
            expect.objectContaining({ method: 'POST' }),
        );
    });
});
