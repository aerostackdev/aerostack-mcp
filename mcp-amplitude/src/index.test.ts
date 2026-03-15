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
    'X-Mcp-Secret-AMPLITUDE-API-KEY': 'test_api_key',
    'X-Mcp-Secret-AMPLITUDE-SECRET-KEY': 'test_secret_key',
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
        expect(body.server).toBe('amplitude-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('amplitude-mcp');
        expect(body.result.serverInfo.version).toBe('1.0.0');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns exactly 8 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(8);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('track_event');
        expect(names).toContain('identify_user');
        expect(names).toContain('get_user_activity');
        expect(names).toContain('list_cohorts');
        expect(names).toContain('get_cohort_members');
        expect(names).toContain('get_chart_data');
        expect(names).toContain('get_funnel_data');
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
            name: 'list_cohorts',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('track_event', () => {
    it('tracks an event successfully', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ code: 200, events_ingested: 1 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'track_event',
            arguments: {
                user_id: 'user123',
                event_type: 'Sign Up',
                event_properties: { plan: 'pro' },
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.code).toBe(200);
        expect(result.events_ingested).toBe(1);
    });

    it('includes optional time and user_properties', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ code: 200, events_ingested: 1 }));
        await worker.fetch(makeReq('tools/call', {
            name: 'track_event',
            arguments: {
                user_id: 'user123',
                event_type: 'Purchase',
                time: 1700000000000,
                user_properties: { plan: 'enterprise' },
            },
        }));
        const fetchCall = mockFetch.mock.calls[0];
        const fetchBody = JSON.parse(fetchCall[1].body);
        expect(fetchBody.events[0].time).toBe(1700000000000);
        expect(fetchBody.events[0].user_properties).toEqual({ plan: 'enterprise' });
    });

    it('returns -32603 when user_id is missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'track_event',
            arguments: { event_type: 'Sign Up' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(new Response('Bad request', { status: 400 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'track_event',
            arguments: { user_id: 'user123', event_type: 'Test' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('identify_user', () => {
    it('identifies user successfully', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ code: 200 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'identify_user',
            arguments: {
                user_id: 'user123',
                user_properties: { email: 'user@example.com', plan: 'pro' },
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.code).toBe(200);
    });

    it('uses form-urlencoded with base64 identification', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ code: 200 }));
        await worker.fetch(makeReq('tools/call', {
            name: 'identify_user',
            arguments: { user_id: 'user123', user_properties: { email: 'x@y.com' } },
        }));
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].headers['Content-Type']).toBe('application/x-www-form-urlencoded');
        const fetchBody = fetchCall[1].body as string;
        expect(fetchBody).toContain('api_key=');
        expect(fetchBody).toContain('identification=');
    });

    it('returns -32603 when user_properties missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'identify_user',
            arguments: { user_id: 'user123' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_user_activity', () => {
    it('returns user events', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            events: [
                { event_type: 'Sign Up', event_time: '2024-01-01' },
                { event_type: 'Purchase', event_time: '2024-01-02' },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_user_activity',
            arguments: { user: 'user123', limit: 10 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.events).toHaveLength(2);
        expect(result.events[0].event_type).toBe('Sign Up');
    });

    it('returns -32603 when user missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_user_activity',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_cohorts', () => {
    it('returns mapped cohorts', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            cohorts: [
                { id: 'cohort1', name: 'Power Users', size: 500, description: 'Active users', lastMod: '2024-01-01' },
                { id: 'cohort2', name: 'Churned', size: 200, lastMod: '2024-01-02' },
            ],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_cohorts',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('cohort1');
        expect(result[0].name).toBe('Power Users');
        expect(result[0].size).toBe(500);
    });

    it('returns empty array when no cohorts', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ cohorts: [] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_cohorts',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toEqual([]);
    });
});

describe('get_chart_data', () => {
    it('returns chart series data', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            data: {
                series: [[10, 20, 30]],
                xValues: ['2024-01-01', '2024-01-02', '2024-01-03'],
            },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_chart_data',
            arguments: {
                event_type: 'Sign Up',
                start: '20240101',
                end: '20240103',
                m: 'uniques',
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.data.series).toHaveLength(1);
        expect(result.data.xValues).toHaveLength(3);
    });

    it('uses default metric uniques when not specified', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ data: { series: [], xValues: [] } }));
        await worker.fetch(makeReq('tools/call', {
            name: 'get_chart_data',
            arguments: { event_type: 'Page View', start: '20240101', end: '20240131' },
        }));
        const fetchCall = mockFetch.mock.calls[0];
        const url = new URL(fetchCall[0]);
        expect(url.searchParams.get('m')).toBe('uniques');
    });

    it('returns -32603 when event_type missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_chart_data',
            arguments: { start: '20240101', end: '20240131' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('export_events', () => {
    it('returns export metadata without making API call', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'export_events',
            arguments: { start: '20240101', end: '20240131' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.message).toBe('Export initiated');
        expect(result.start).toBe('20240101');
        expect(result.end).toBe('20240131');
        expect(result.note).toContain('zipped');
        // No fetch should have been made
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns -32603 when start missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'export_events',
            arguments: { end: '20240131' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});
