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

function apiErr(text: string, status = 400) {
    return Promise.resolve(new Response(text, { status }));
}

function chatResponse(content: string, model = 'sonar', citations: string[] = []) {
    return {
        id: 'resp_1',
        model,
        choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
        citations,
        usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
    };
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-PERPLEXITY-API-KEY': 'test_pplx_key',
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

// ── Health ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
    it('returns status ok', async () => {
        const req = new Request('http://localhost/health');
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-perplexity');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('mcp-perplexity');
        expect(body.result.serverInfo.version).toBe('1.0.0');
        expect(body.result.protocolVersion).toBe('2024-11-05');
    });
});

describe('tools/list', () => {
    it('returns 8 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(8);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('search');
        expect(names).toContain('chat');
        expect(names).toContain('deep_research');
        expect(names).toContain('search_with_reasoning');
        expect(names).toContain('search_recent');
        expect(names).toContain('search_domains');
        expect(names).toContain('get_models');
        expect(names).toContain('check_usage');
    });
});

describe('unknown method', () => {
    it('returns -32601', async () => {
        const res = await worker.fetch(makeReq('unknown/method'));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32601);
    });
});

describe('non-POST request', () => {
    it('returns 405', async () => {
        const req = new Request('http://localhost/', { method: 'DELETE' });
        const res = await worker.fetch(req);
        expect(res.status).toBe(405);
    });
});

describe('missing auth', () => {
    it('returns -32001 when no secret present', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'search',
            arguments: { query: 'test' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

describe('parse error', () => {
    it('returns -32700 on invalid JSON', async () => {
        const req = new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'bad json',
        });
        const res = await worker.fetch(req);
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32700);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('search', () => {
    it('returns answer and citations', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse(
            'The capital of France is Paris.',
            'sonar',
            ['https://en.wikipedia.org/wiki/Paris'],
        )));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search',
            arguments: { query: 'What is the capital of France?' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.answer).toBe('The capital of France is Paris.');
        expect(result.citations).toHaveLength(1);
        expect(result.citations[0]).toContain('wikipedia');
    });

    it('uses Bearer authorization', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('answer')));
        await worker.fetch(makeReq('tools/call', {
            name: 'search',
            arguments: { query: 'test' },
        }));
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[1].headers['Authorization']).toBe('Bearer test_pplx_key');
    });

    it('includes system prompt in messages when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('answer')));
        await worker.fetch(makeReq('tools/call', {
            name: 'search',
            arguments: { query: 'test query', system_prompt: 'You are a helpful assistant.' },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.messages[0].role).toBe('system');
        expect(fetchBody.messages[0].content).toBe('You are a helpful assistant.');
        expect(fetchBody.messages[1].role).toBe('user');
    });

    it('omits system message when system_prompt not provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('answer')));
        await worker.fetch(makeReq('tools/call', {
            name: 'search',
            arguments: { query: 'test query' },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.messages).toHaveLength(1);
        expect(fetchBody.messages[0].role).toBe('user');
    });

    it('passes search_domain_filter', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('answer')));
        await worker.fetch(makeReq('tools/call', {
            name: 'search',
            arguments: { query: 'test', search_domain_filter: ['reddit.com', '-facebook.com'] },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.search_domain_filter).toEqual(['reddit.com', '-facebook.com']);
    });

    it('passes search_recency_filter', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('answer')));
        await worker.fetch(makeReq('tools/call', {
            name: 'search',
            arguments: { query: 'latest news', search_recency_filter: 'day' },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.search_recency_filter).toBe('day');
    });

    it('uses sonar-pro model when specified', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('answer', 'sonar-pro')));
        await worker.fetch(makeReq('tools/call', {
            name: 'search',
            arguments: { query: 'test', model: 'sonar-pro' },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.model).toBe('sonar-pro');
    });

    it('returns -32603 when query missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr('Unauthorized', 401));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search',
            arguments: { query: 'test' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('chat', () => {
    it('returns multi-turn response', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('I can help with that.')));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {
                messages: [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi there!' },
                    { role: 'user', content: 'Can you help me?' },
                ],
            },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.content).toBe('I can help with that.');
        expect(result.finish_reason).toBe('stop');
    });

    it('prepends system prompt when provided', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('response')));
        await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {
                messages: [{ role: 'user', content: 'hello' }],
                system_prompt: 'Be concise.',
            },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.messages[0].role).toBe('system');
        expect(fetchBody.messages[0].content).toBe('Be concise.');
    });

    it('returns -32603 when messages missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'chat',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('deep_research', () => {
    it('uses sonar-deep-research model', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse(
            'Comprehensive research findings about quantum computing.',
            'sonar-deep-research',
        )));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'deep_research',
            arguments: { query: 'Explain quantum computing advances in 2024' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.answer).toContain('quantum');
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.model).toBe('sonar-deep-research');
    });

    it('extracts thinking from <think> tags', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse(
            '<think>Let me analyze this step by step...</think>\n\nFinal answer about quantum computing.',
            'sonar-deep-research',
        )));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'deep_research',
            arguments: { query: 'test' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.thinking).toContain('step by step');
        expect(result.answer).toContain('Final answer');
        expect(result.answer).not.toContain('<think>');
    });

    it('returns null thinking when no <think> block present', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('Direct answer.')));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'deep_research',
            arguments: { query: 'test' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.thinking).toBeNull();
        expect(result.answer).toBe('Direct answer.');
    });

    it('returns -32603 when query missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'deep_research',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('search_with_reasoning', () => {
    it('uses sonar-reasoning model and extracts reasoning', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse(
            '<think>Step 1: Identify the question. Step 2: Research the answer.</think>\n\nThe answer is 42.',
            'sonar-reasoning',
        )));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_with_reasoning',
            arguments: { query: 'What is the meaning of life?' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.answer).toBe('The answer is 42.');
        expect(result.reasoning).toContain('Step 1');
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.model).toBe('sonar-reasoning');
    });

    it('returns -32603 when query missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_with_reasoning',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('search_recent', () => {
    it('passes search_recency_filter as time_range', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('Latest news today.')));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_recent',
            arguments: { query: 'latest AI news', time_range: 'day' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.answer).toBe('Latest news today.');
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.search_recency_filter).toBe('day');
    });

    it('returns -32603 when time_range missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_recent',
            arguments: { query: 'news' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('search_domains', () => {
    it('combines include and exclude domains into filter', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('Filtered search results.')));
        await worker.fetch(makeReq('tools/call', {
            name: 'search_domains',
            arguments: {
                query: 'programming tutorials',
                include_domains: ['github.com', 'stackoverflow.com'],
                exclude_domains: ['facebook.com'],
            },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.search_domain_filter).toContain('github.com');
        expect(fetchBody.search_domain_filter).toContain('stackoverflow.com');
        expect(fetchBody.search_domain_filter).toContain('-facebook.com');
    });

    it('works with only include_domains', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('Results from Reddit.')));
        await worker.fetch(makeReq('tools/call', {
            name: 'search_domains',
            arguments: { query: 'test', include_domains: ['reddit.com'] },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.search_domain_filter).toEqual(['reddit.com']);
    });

    it('works with only exclude_domains', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('Results without Facebook.')));
        await worker.fetch(makeReq('tools/call', {
            name: 'search_domains',
            arguments: { query: 'test', exclude_domains: ['facebook.com', 'twitter.com'] },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.search_domain_filter).toEqual(['-facebook.com', '-twitter.com']);
    });

    it('omits filter when no domains specified', async () => {
        mockFetch.mockResolvedValueOnce(apiOk(chatResponse('Unfiltered results.')));
        await worker.fetch(makeReq('tools/call', {
            name: 'search_domains',
            arguments: { query: 'test' },
        }));
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.search_domain_filter).toBeUndefined();
    });

    it('returns -32603 when query missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_domains',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_models', () => {
    it('returns hardcoded models list without API call', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.models).toHaveLength(5);
        const ids = result.models.map((m: any) => m.id);
        expect(ids).toContain('sonar');
        expect(ids).toContain('sonar-pro');
        expect(ids).toContain('sonar-reasoning');
        expect(ids).toContain('sonar-reasoning-pro');
        expect(ids).toContain('sonar-deep-research');
        // No fetch should be made
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns models with pricing info', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_models',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        const sonar = result.models.find((m: any) => m.id === 'sonar');
        expect(sonar.pricing).toBeDefined();
        expect(sonar.context_length).toBe(127072);
        expect(sonar.description).toBeTruthy();
    });
});

describe('check_usage', () => {
    it('makes minimal request and returns usage', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            ...chatResponse('', 'sonar'),
            usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'check_usage',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.usage.total_tokens).toBe(6);
        expect(result.note).toContain('perplexity.ai/account');
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody.model).toBe('sonar');
        expect(fetchBody.max_tokens).toBe(1);
    });
});
