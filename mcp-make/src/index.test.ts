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
function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ message }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-MAKE-API-KEY': 'test_api_key',
            'X-Mcp-Secret-MAKE-REGION': 'eu1',
            'X-Mcp-Secret-MAKE-TEAM-ID': '123',
        },
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

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('GET /', () => {
    it('returns status ok with tool count', async () => {
        const req = new Request('http://localhost/', { method: 'GET' });
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-make');
        expect(body.tools).toBe(7);
    });
});

describe('initialize', () => {
    it('returns correct protocolVersion and serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-make');
        expect(body.result.serverInfo.version).toBe('1.0.0');
    });
});

describe('tools/list', () => {
    it('returns exactly 7 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(7);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_scenarios');
        expect(names).toContain('run_scenario');
        expect(names).toContain('list_teams');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('unknown/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('missing auth', () => {
    it('returns -32001 when no MAKE-API-KEY header', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_scenarios',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });

    it('returns -32001 when MAKE-REGION missing', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-MAKE-API-KEY': 'test_key',
                'X-Mcp-Secret-MAKE-TEAM-ID': '123',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_scenarios', arguments: {} } }),
        });
        const res = await worker.fetch(req);
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_scenarios', () => {
    it('returns scenarios array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            scenarios: [{ id: 1, name: 'My Scenario', isEnabled: true }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_scenarios',
            arguments: { limit: 10 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(1);
        expect(result[0].name).toBe('My Scenario');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(401, 'Unauthorized'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_scenarios',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_scenario', () => {
    it('returns scenario details', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            scenario: { id: 42, name: 'Test Scenario', isEnabled: false },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_scenario',
            arguments: { scenario_id: '42' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe(42);
        expect(result.name).toBe('Test Scenario');
    });
});

describe('run_scenario', () => {
    it('returns success with execution_id', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ executionId: 'exec_abc' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'run_scenario',
            arguments: { scenario_id: '42' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.execution_id).toBe('exec_abc');
    });
});

describe('activate_scenario', () => {
    it('returns updated scenario', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ scenario: { id: 42, isEnabled: true } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'activate_scenario',
            arguments: { scenario_id: '42' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.isEnabled).toBe(true);
    });
});

describe('list_executions', () => {
    it('returns executions array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            executions: [{ id: 'e1', status: 'success', timestamp: '2024-01-01' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_executions',
            arguments: { scenario_id: '42' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('e1');
    });
});

describe('list_teams', () => {
    it('returns teams array', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            teams: [{ id: 1, name: 'Engineering' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_teams',
            arguments: { org_id: '99' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Engineering');
    });
});
