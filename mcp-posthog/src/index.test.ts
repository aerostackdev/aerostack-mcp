import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://mcp-posthog.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function withSecrets(extra: Record<string, string> = {}) {
    return {
        'X-Mcp-Secret-POSTHOG-API-KEY': 'phx_mock_api_key',
        'X-Mcp-Secret-POSTHOG-PROJECT-ID': '12345',
        'X-Mcp-Secret-POSTHOG-PROJECT-API-KEY': 'phc_mock_project_key',
        ...extra,
    };
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(makeRequest(body, headers ?? withSecrets()));
    return res.json() as Promise<any>;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockCaptureOk = { status: 1 };
const mockDecideOk = {
    featureFlags: { 'new-ui': true, 'beta-feature': false },
    featureFlagPayloads: { 'new-ui': 'variant-a' },
};
const mockPersonsList = {
    results: [
        {
            id: 'p1',
            distinct_ids: ['user_123'],
            properties: { email: 'test@example.com', name: 'Test User' },
            created_at: '2024-01-01T00:00:00Z',
        },
    ],
};
const mockPerson = {
    id: 'p1',
    distinct_ids: ['user_123'],
    properties: { email: 'test@example.com' },
    created_at: '2024-01-01T00:00:00Z',
};
const mockFeatureFlags = {
    results: [
        { id: 1, key: 'new-ui', name: 'New UI', active: true, filters: { rollout_percentage: 50 } },
        { id: 2, key: 'beta', name: 'Beta', active: false, filters: { rollout_percentage: 0 } },
    ],
};
const mockInsights = {
    results: [
        { id: 1, name: 'Pageviews', insight: 'TRENDS', created_at: '2024-01-01T00:00:00Z' },
    ],
};
const mockCohorts = {
    results: [
        { id: 1, name: 'Active Users', count: 500, created_at: '2024-01-01T00:00:00Z' },
    ],
};
const mockExperiments = {
    results: [
        {
            id: 1,
            name: 'Button Color Test',
            feature_flag_key: 'btn-color',
            status: 'running',
            start_date: '2024-01-01T00:00:00Z',
            end_date: null,
        },
    ],
};

// ── Protocol tests ────────────────────────────────────────────────────────────

describe('Protocol', () => {
    it('GET /health returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-posthog.workers.dev/health', { method: 'GET' }));
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('posthog-mcp');
    });

    it('initialize returns protocol info', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        expect(data.result.protocolVersion).toBe('2024-11-05');
        expect(data.result.serverInfo.name).toBe('posthog-mcp');
        expect(data.result.capabilities.tools).toBeDefined();
    });

    it('tools/list returns all 9 tools', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        expect(data.result.tools).toHaveLength(9);
        const names = data.result.tools.map((t: any) => t.name);
        expect(names).toContain('capture_event');
        expect(names).toContain('identify_user');
        expect(names).toContain('get_feature_flags');
        expect(names).toContain('list_persons');
        expect(names).toContain('get_person');
        expect(names).toContain('list_feature_flags');
        expect(names).toContain('get_insights');
        expect(names).toContain('list_cohorts');
        expect(names).toContain('get_experiments');
    });

    it('unknown method returns -32601', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 3, method: 'unknown/method', params: {} });
        expect(data.error.code).toBe(-32601);
    });

    it('invalid JSON-RPC version returns -32600', async () => {
        const data = await rpc({ jsonrpc: '1.0', id: 4, method: 'initialize', params: {} });
        expect(data.error.code).toBe(-32600);
    });

    it('non-POST non-health returns 405', async () => {
        const res = await worker.fetch(new Request('https://mcp-posthog.workers.dev/', { method: 'PUT' }));
        expect(res.status).toBe(405);
    });

    it('missing secrets returns -32001', async () => {
        const data = await rpc(
            { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_persons', arguments: {} } },
            {},
        );
        expect(data.error.code).toBe(-32001);
        expect(data.error.message).toContain('Missing required secrets');
    });
});

// ── Tool tests ────────────────────────────────────────────────────────────────

describe('capture_event', () => {
    it('captures an event successfully', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCaptureOk));
        const data = await rpc({
            jsonrpc: '2.0', id: 10, method: 'tools/call',
            params: { name: 'capture_event', arguments: { distinct_id: 'user_123', event: 'page_viewed', properties: { page: '/home' } } },
        });
        expect(data.result.content[0].type).toBe('text');
        const result = JSON.parse(data.result.content[0].text);
        expect(result.status).toBe(1);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/capture/'),
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('includes timestamp when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCaptureOk));
        await rpc({
            jsonrpc: '2.0', id: 11, method: 'tools/call',
            params: {
                name: 'capture_event',
                arguments: { distinct_id: 'user_123', event: 'signed_up', timestamp: '2024-01-01T00:00:00Z' },
            },
        });
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.timestamp).toBe('2024-01-01T00:00:00Z');
    });

    it('returns error for missing distinct_id', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 12, method: 'tools/call',
            params: { name: 'capture_event', arguments: { event: 'page_viewed' } },
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('distinct_id');
    });

    it('returns error for missing event', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 13, method: 'tools/call',
            params: { name: 'capture_event', arguments: { distinct_id: 'user_123' } },
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('event');
    });
});

describe('identify_user', () => {
    it('identifies a user with properties', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCaptureOk));
        const data = await rpc({
            jsonrpc: '2.0', id: 20, method: 'tools/call',
            params: {
                name: 'identify_user',
                arguments: { distinct_id: 'user_123', properties: { name: 'Alice', plan: 'pro' } },
            },
        });
        expect(data.result.content[0].type).toBe('text');
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.event).toBe('$identify');
        expect(callBody.properties.$set).toEqual({ name: 'Alice', plan: 'pro' });
    });

    it('returns error for missing distinct_id', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 21, method: 'tools/call',
            params: { name: 'identify_user', arguments: {} },
        });
        expect(data.error.code).toBe(-32603);
    });
});

describe('get_feature_flags', () => {
    it('returns feature flags for a user', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockDecideOk));
        const data = await rpc({
            jsonrpc: '2.0', id: 30, method: 'tools/call',
            params: { name: 'get_feature_flags', arguments: { distinct_id: 'user_123' } },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.featureFlags).toEqual({ 'new-ui': true, 'beta-feature': false });
        expect(result.featureFlagPayloads).toEqual({ 'new-ui': 'variant-a' });
    });

    it('includes person_properties in request when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockDecideOk));
        await rpc({
            jsonrpc: '2.0', id: 31, method: 'tools/call',
            params: {
                name: 'get_feature_flags',
                arguments: { distinct_id: 'user_123', person_properties: { plan: 'pro' } },
            },
        });
        const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(callBody.person_properties).toEqual({ plan: 'pro' });
    });

    it('returns error for missing distinct_id', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 32, method: 'tools/call',
            params: { name: 'get_feature_flags', arguments: {} },
        });
        expect(data.error.code).toBe(-32603);
    });
});

describe('list_persons', () => {
    it('returns list of persons', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockPersonsList));
        const data = await rpc({
            jsonrpc: '2.0', id: 40, method: 'tools/call',
            params: { name: 'list_persons', arguments: { limit: 5 } },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('p1');
        expect(result[0].distinct_ids).toEqual(['user_123']);
    });

    it('includes search param when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockPersonsList));
        await rpc({
            jsonrpc: '2.0', id: 41, method: 'tools/call',
            params: { name: 'list_persons', arguments: { search: 'alice@example.com' } },
        });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('search=alice%40example.com');
    });
});

describe('get_person', () => {
    it('returns a specific person', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockPerson));
        const data = await rpc({
            jsonrpc: '2.0', id: 50, method: 'tools/call',
            params: { name: 'get_person', arguments: { person_id: 'p1' } },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('p1');
    });

    it('returns error for missing person_id', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 51, method: 'tools/call',
            params: { name: 'get_person', arguments: {} },
        });
        expect(data.error.code).toBe(-32603);
    });
});

describe('list_feature_flags', () => {
    it('returns all feature flags', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockFeatureFlags));
        const data = await rpc({
            jsonrpc: '2.0', id: 60, method: 'tools/call',
            params: { name: 'list_feature_flags', arguments: {} },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(2);
        expect(result[0].key).toBe('new-ui');
        expect(result[0].rollout_percentage).toBe(50);
    });

    it('filters active flags when active=true', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockFeatureFlags));
        const data = await rpc({
            jsonrpc: '2.0', id: 61, method: 'tools/call',
            params: { name: 'list_feature_flags', arguments: { active: true } },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].key).toBe('new-ui');
    });
});

describe('get_insights', () => {
    it('returns insights list', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockInsights));
        const data = await rpc({
            jsonrpc: '2.0', id: 70, method: 'tools/call',
            params: { name: 'get_insights', arguments: { insight: 'TRENDS', limit: 5 } },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Pageviews');
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('insight=TRENDS');
        expect(url).toContain('limit=5');
    });
});

describe('list_cohorts', () => {
    it('returns all cohorts', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockCohorts));
        const data = await rpc({
            jsonrpc: '2.0', id: 80, method: 'tools/call',
            params: { name: 'list_cohorts', arguments: {} },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Active Users');
        expect(result[0].count).toBe(500);
    });
});

describe('get_experiments', () => {
    it('returns all experiments', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(mockExperiments));
        const data = await rpc({
            jsonrpc: '2.0', id: 90, method: 'tools/call',
            params: { name: 'get_experiments', arguments: {} },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Button Color Test');
        expect(result[0].feature_flag_key).toBe('btn-color');
        expect(result[0].status).toBe('running');
    });
});

describe('unknown tool', () => {
    it('returns -32603 for unknown tool', async () => {
        const data = await rpc({
            jsonrpc: '2.0', id: 99, method: 'tools/call',
            params: { name: 'nonexistent_tool', arguments: {} },
        });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Unknown tool');
    });
});
