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

function apiText(text: string, status = 200) {
    return Promise.resolve(new Response(text, {
        status,
        headers: { 'Content-Type': 'text/plain' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-MIXPANEL-TOKEN': 'test_token',
    'X-Mcp-Secret-MIXPANEL-SERVICE-ACCOUNT-USERNAME': 'test_user',
    'X-Mcp-Secret-MIXPANEL-SERVICE-ACCOUNT-SECRET': 'test_secret',
    'X-Mcp-Secret-MIXPANEL-PROJECT-ID': '12345',
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
    it('returns status ok', async () => {
        const req = new Request('http://localhost/health');
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mixpanel-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mixpanel-mcp');
        expect(body.result.serverInfo.version).toBe('1.0.0');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns exactly 7 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(7);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('track_event');
        expect(names).toContain('set_user_properties');
        expect(names).toContain('increment_property');
        expect(names).toContain('get_user_profile');
        expect(names).toContain('get_insights_report');
        expect(names).toContain('get_funnel');
        expect(names).toContain('export_events');
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
    it('returns -32001 when no secrets present', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'get_user_profile',
            arguments: { distinct_id: 'user123' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('track_event', () => {
    it('tracks an event successfully', async () => {
        mockFetch.mockResolvedValueOnce(apiText('1'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'track_event',
            arguments: {
                distinct_id: 'user123',
                event: 'Sign Up',
                properties: { plan: 'pro' },
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
    });

    it('includes optional time in properties', async () => {
        mockFetch.mockResolvedValueOnce(apiText('1'));
        await worker.fetch(makeReq('tools/call', {
            name: 'track_event',
            arguments: { distinct_id: 'user123', event: 'Purchase', time: 1700000000 },
        }));
        const fetchBody = mockFetch.mock.calls[0][1].body as string;
        // The body is form-urlencoded with base64-encoded data
        expect(fetchBody).toContain('data=');
        const dataParam = fetchBody.split('data=')[1];
        const decoded = JSON.parse(atob(decodeURIComponent(dataParam)));
        expect(decoded[0].properties.time).toBe(1700000000);
    });

    it('returns -32603 when event is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'track_event',
            arguments: { distinct_id: 'user123' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('set_user_properties', () => {
    it('sets user properties successfully', async () => {
        mockFetch.mockResolvedValueOnce(apiText('1'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'set_user_properties',
            arguments: {
                distinct_id: 'user123',
                properties: { $email: 'user@example.com', $name: 'Alice' },
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
    });

    it('returns -32603 when properties missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'set_user_properties',
            arguments: { distinct_id: 'user123' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_user_profile', () => {
    it('returns user profile', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            results: [{
                $distinct_id: 'user123',
                $properties: { $email: 'user@example.com', $name: 'Alice' },
            }],
            status: 'ok',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_user_profile',
            arguments: { distinct_id: 'user123' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.distinct_id).toBe('user123');
        expect(result.properties.$email).toBe('user@example.com');
    });

    it('returns empty properties when user not found', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: [], status: 'ok' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_user_profile',
            arguments: { distinct_id: 'unknown' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.properties).toEqual({});
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_user_profile',
            arguments: { distinct_id: 'user123' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_insights_report', () => {
    it('returns insights data', async () => {
        const mockData = { data: { series: [10, 20, 30], dates: ['2024-01-01', '2024-01-02', '2024-01-03'] } };
        mockFetch.mockResolvedValueOnce(apiOk(mockData));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_insights_report',
            arguments: {
                from_date: '2024-01-01',
                to_date: '2024-01-03',
                event: 'Sign Up',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.data.series).toHaveLength(3);
    });

    it('returns -32603 when dates missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_insights_report',
            arguments: { event: 'Sign Up' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('increment_property', () => {
    it('increments property successfully', async () => {
        mockFetch.mockResolvedValueOnce(apiText('1'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'increment_property',
            arguments: { distinct_id: 'user123', property: 'login_count', value: 5 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
    });

    it('uses default value of 1 when value not provided', async () => {
        mockFetch.mockResolvedValueOnce(apiText('1'));
        await worker.fetch(makeReq('tools/call', {
            name: 'increment_property',
            arguments: { distinct_id: 'user123', property: 'login_count' },
        }));
        const fetchBody = mockFetch.mock.calls[0][1].body as string;
        const dataParam = fetchBody.split('data=')[1];
        const decoded = JSON.parse(atob(decodeURIComponent(dataParam)));
        expect(decoded[0].$add.login_count).toBe(1);
    });
});
