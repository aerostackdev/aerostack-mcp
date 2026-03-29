import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TOKEN = 'test-surveymonkey-token';
const AUTH_HEADERS = { 'X-Mcp-Secret-SURVEYMONKEY-ACCESS-TOKEN': TOKEN };

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

function mockApiResponse(data: unknown, status = 200) {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(data), { status }));
}

beforeEach(() => { mockFetch.mockReset(); });

describe('Infrastructure', () => {
    it('GET /health returns ok', async () => {
        const res = await worker.fetch(new Request('http://localhost/health'));
        const body = await res.json() as { status: string };
        expect(body.status).toBe('ok');
    });

    it('GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns -32700', async () => {
        const req = new Request('http://localhost/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'notjson{' });
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns server info', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        const body = await res.json() as { result: { serverInfo: { name: string } } };
        expect(body.result.serverInfo.name).toBe('mcp-surveymonkey');
    });

    it('tools/list returns 12 tools', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: unknown[] } };
        expect(body.result.tools).toHaveLength(12);
    });

    it('unknown method returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 3, method: 'unk/method' }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('tools/call without token returns -32001', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_surveys', arguments: {} } }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32001);
    });

    it('all tools have annotations', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 5, method: 'tools/list' }));
        const body = await res.json() as { result: { tools: Array<{ annotations: unknown }> } };
        for (const tool of body.result.tools) {
            expect(tool.annotations).toBeDefined();
        }
    });
});

describe('list_surveys', () => {
    it('returns surveys', async () => {
        mockApiResponse({ data: [{ id: 'sv_1', title: 'Customer Feedback' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_surveys', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).data).toHaveLength(1);
    });

    it('passes pagination', async () => {
        mockApiResponse({ data: [] });
        await worker.fetch(makeReq({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'list_surveys', arguments: { page: 2, per_page: 10 } } }, AUTH_HEADERS));
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.any(Object));
    });
});

describe('get_survey', () => {
    it('returns survey', async () => {
        mockApiResponse({ id: 'sv_1', title: 'NPS Survey' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'get_survey', arguments: { surveyId: 'sv_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('sv_1');
    });

    it('errors without surveyId', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'get_survey', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_survey', () => {
    it('creates survey', async () => {
        mockApiResponse({ id: 'sv_new', title: 'New Survey' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'create_survey', arguments: { title: 'New Survey' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('sv_new');
        expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST' }));
    });

    it('errors without title', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'create_survey', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_survey_details', () => {
    it('returns full details', async () => {
        mockApiResponse({ id: 'sv_1', pages: [] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'get_survey_details', arguments: { surveyId: 'sv_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('sv_1');
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/details'), expect.any(Object));
    });
});

describe('create_page', () => {
    it('creates page', async () => {
        mockApiResponse({ id: 'pg_1', title: 'Section 1' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'create_page', arguments: { surveyId: 'sv_1', title: 'Section 1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('pg_1');
    });
});

describe('create_question', () => {
    it('creates question', async () => {
        mockApiResponse({ id: 'q_1', family: 'single_choice' });
        const res = await worker.fetch(makeReq({
            jsonrpc: '2.0', id: 18, method: 'tools/call',
            params: { name: 'create_question', arguments: { surveyId: 'sv_1', pageId: 'pg_1', family: 'single_choice', subtype: 'vertical', heading: 'How satisfied are you?' } },
        }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('q_1');
    });

    it('errors without required fields', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'create_question', arguments: { surveyId: 'sv_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_collectors', () => {
    it('returns collectors', async () => {
        mockApiResponse({ data: [{ id: 'col_1', type: 'weblink' }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'list_collectors', arguments: { surveyId: 'sv_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).data).toHaveLength(1);
    });
});

describe('create_collector', () => {
    it('creates collector', async () => {
        mockApiResponse({ id: 'col_new', url: 'https://www.surveymonkey.com/r/abc' });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'create_collector', arguments: { surveyId: 'sv_1', name: 'Main Link' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).id).toBe('col_new');
    });
});

describe('list_responses', () => {
    it('returns responses', async () => {
        mockApiResponse({ data: [{ id: 'r_1', total_time: 120 }] });
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'list_responses', arguments: { collectorId: 'col_1' } } }, AUTH_HEADERS));
        const body = await res.json() as { result: { content: Array<{ text: string }> } };
        expect(JSON.parse(body.result.content[0].text).data).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/collectors/col_1/responses'), expect.any(Object));
    });
});

describe('unknown tool', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq({ jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'bad_tool', arguments: {} } }, AUTH_HEADERS));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });
});
