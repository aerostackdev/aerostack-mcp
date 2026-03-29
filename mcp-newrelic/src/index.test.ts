import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Mock fetch globally — all New Relic calls POST to a single GraphQL endpoint
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Constants ─────────────────────────────────────────────────────────────────

const API_KEY = 'test_nr_user_api_key_abc123';
const ACCOUNT_ID = 1234567;
const ENTITY_GUID = 'MTIzNDU2N3xBUE18QVBQTElDQVRJT058MTIzNDU2Nzg5';
const DASHBOARD_GUID = 'MTIzNDU2N3xWSVp8REFTSEJPQVJEFDE2NzQ4ODk1';
const POLICY_ID = '8901234';
const INCIDENT_ID = 'inc_abc123';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockEntity = {
    guid: ENTITY_GUID,
    name: 'my-production-app',
    accountId: ACCOUNT_ID,
    entityType: 'APPLICATION',
    alertSeverity: 'NOT_ALERTING',
};

const mockEntityWithTags = {
    ...mockEntity,
    tags: [
        { key: 'environment', values: ['production'] },
        { key: 'team', values: ['platform'] },
    ],
};

const mockUser = {
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    id: 9876543,
};

const mockAccount = {
    id: ACCOUNT_ID,
    name: 'My Org Production',
};

const mockDashboard = {
    guid: DASHBOARD_GUID,
    name: 'APM Overview',
    accountId: ACCOUNT_ID,
    entityType: 'DASHBOARD',
};

const mockAlertPolicy = {
    id: POLICY_ID,
    name: 'Production Alerts',
    incidentPreference: 'PER_CONDITION',
};

const mockAlertCondition = {
    id: 'cond_001',
    name: 'High Error Rate',
    enabled: true,
    policyId: POLICY_ID,
    nrql: { query: "SELECT percentage(count(*), WHERE error IS true) FROM Transaction" },
};

const mockIncident = {
    incidentId: INCIDENT_ID,
    state: 'ACTIVATED',
    createdAt: '2026-03-28T10:00:00Z',
    closedAt: null,
    title: 'High error rate on production-api',
};

const mockNrqlResults = [{ 'count(*)': 42500 }];

// ── Response helpers ──────────────────────────────────────────────────────────

function nrOk(data: unknown) {
    return Promise.resolve(new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    }));
}

function nrGraphQLError(messages: string[]) {
    return Promise.resolve(new Response(
        JSON.stringify({ errors: messages.map(m => ({ message: m })) }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
}

function nrHttpErr(status: number, body: string) {
    return Promise.resolve(new Response(body, { status }));
}

// ── Request builders ──────────────────────────────────────────────────────────

function makeReq(
    method: string,
    params?: unknown,
    missingSecrets: string[] = [],
) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!missingSecrets.includes('apiKey')) {
        headers['X-Mcp-Secret-NEW-RELIC-API-KEY'] = API_KEY;
    }
    return new Request('http://localhost/', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

function makeToolReq(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    return makeReq('tools/call', { name: toolName, arguments: args }, missingSecrets);
}

async function callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    missingSecrets: string[] = [],
) {
    const req = makeToolReq(toolName, args, missingSecrets);
    const res = await worker.fetch(req);
    return res.json() as Promise<{
        jsonrpc: string;
        id: number;
        result?: { content: [{ type: string; text: string }] };
        error?: { code: number; message: string };
    }>;
}

async function getToolResult(toolName: string, args: Record<string, unknown> = {}) {
    const body = await callTool(toolName, args);
    expect(body.error).toBeUndefined();
    expect(body.result).toBeDefined();
    return JSON.parse(body.result!.content[0].text);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol layer ────────────────────────────────────────────────────────────

describe('Protocol layer', () => {
    it('GET / returns status ok with server mcp-newrelic and tools 21', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'GET' }));
        const body = await res.json() as { status: string; server: string; tools: number };
        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-newrelic');
        expect(body.tools).toBe(21);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('http://localhost/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error -32700', async () => {
        const res = await worker.fetch(new Request('http://localhost/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json{{{',
        }));
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32700);
    });

    it('initialize returns correct protocolVersion and serverInfo', async () => {
        const req = makeReq('initialize');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { protocolVersion: string; serverInfo: { name: string } }
        };
        expect(body.result.protocolVersion).toBe('2024-11-05');
        expect(body.result.serverInfo.name).toBe('mcp-newrelic');
    });

    it('tools/list returns exactly 21 tools with name, description, inputSchema', async () => {
        const req = makeReq('tools/list');
        const res = await worker.fetch(req);
        const body = await res.json() as {
            result: { tools: Array<{ name: string; description: string; inputSchema: unknown }> }
        };
        expect(body.result.tools).toHaveLength(21);
        for (const tool of body.result.tools) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
        }
    });

    it('unknown method returns -32601', async () => {
        const req = makeReq('unknown/method');
        const res = await worker.fetch(req);
        const body = await res.json() as { error: { code: number } };
        expect(body.error.code).toBe(-32601);
    });

    it('unknown tool name returns -32601', async () => {
        mockFetch.mockReturnValueOnce(nrOk({}));
        const body = await callTool('nonexistent_tool', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32601);
        expect(body.error!.message).toContain('nonexistent_tool');
    });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing API key returns -32001 with NEW_RELIC_API_KEY in message', async () => {
        const body = await callTool('list_accounts', {}, ['apiKey']);
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32001);
        expect(body.error!.message).toContain('NEW_RELIC_API_KEY');
    });

    it('sets API-Key header (not Authorization Bearer) on every request', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { accounts: [mockAccount] } }));
        await callTool('list_accounts', {});
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const headers = init.headers as Record<string, string>;
        expect(headers['API-Key']).toBe(API_KEY);
        expect(headers['Authorization']).toBeUndefined();
    });

    it('all requests POST to https://api.newrelic.com/graphql', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { user: mockUser } }));
        await callTool('get_current_user', {});
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.newrelic.com/graphql');
    });

    it('Content-Type is application/json on every request', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { user: mockUser } }));
        await callTool('get_current_user', {});
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const headers = init.headers as Record<string, string>;
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('GraphQL errors array causes -32603 with error message', async () => {
        mockFetch.mockReturnValueOnce(nrGraphQLError(['Unauthorized: invalid API key']));
        const body = await callTool('list_accounts', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
        expect(body.error!.message).toContain('Unauthorized');
    });

    it('HTTP 403 causes -32603 error', async () => {
        mockFetch.mockReturnValueOnce(nrHttpErr(403, 'Forbidden'));
        const body = await callTool('list_accounts', {});
        expect(body.error).toBeDefined();
        expect(body.error!.code).toBe(-32603);
    });
});

// ── _ping ─────────────────────────────────────────────────────────────────────

describe('_ping', () => {
    it('_ping returns user info via get_current_user', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { user: mockUser } }));
        const result = await getToolResult('get_current_user', {});
        expect(result.actor.user.email).toBe('jane.doe@example.com');
        expect(result.actor.user.name).toBe('Jane Doe');
    });
});

// ── Group 1 — Entities ────────────────────────────────────────────────────────

describe('list_entities', () => {
    it('returns entity list for APPLICATION type', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            actor: { entitySearch: { results: { entities: [mockEntity], nextCursor: null } } },
        }));
        const result = await getToolResult('list_entities', { entity_type: 'APPLICATION' });
        expect(result.actor.entitySearch.results.entities).toHaveLength(1);
        expect(result.actor.entitySearch.results.entities[0].guid).toBe(ENTITY_GUID);
    });

    it('sends entity_type in query variable', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { entitySearch: { results: { entities: [] } } } }));
        await callTool('list_entities', { entity_type: 'HOST' });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { query: string } };
        expect(reqBody.variables.query).toContain("type = 'HOST'");
    });

    it('includes name_filter in query variable when provided', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { entitySearch: { results: { entities: [] } } } }));
        await callTool('list_entities', { entity_type: 'APPLICATION', name_filter: 'payment-service' });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { query: string } };
        expect(reqBody.variables.query).toContain('payment-service');
    });

    it('sends limit variable (default 25)', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { entitySearch: { results: { entities: [] } } } }));
        await callTool('list_entities', { entity_type: 'HOST' });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { limit: number } };
        expect(reqBody.variables.limit).toBe(25);
    });

    it('missing entity_type returns validation error', async () => {
        const body = await callTool('list_entities', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('entity_type');
    });
});

describe('get_entity', () => {
    it('returns entity details with tags', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { entity: mockEntityWithTags } }));
        const result = await getToolResult('get_entity', { guid: ENTITY_GUID });
        expect(result.actor.entity.guid).toBe(ENTITY_GUID);
        expect(result.actor.entity.tags).toHaveLength(2);
    });

    it('sends guid in variables', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { entity: mockEntityWithTags } }));
        await callTool('get_entity', { guid: ENTITY_GUID });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { guid: string } };
        expect(reqBody.variables.guid).toBe(ENTITY_GUID);
    });

    it('missing guid returns validation error', async () => {
        const body = await callTool('get_entity', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('guid');
    });
});

describe('search_entities', () => {
    it('returns entities matching name search', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            actor: { entitySearch: { results: { entities: [mockEntity] } } },
        }));
        const result = await getToolResult('search_entities', { name: 'production' });
        expect(result.actor.entitySearch.results.entities).toHaveLength(1);
    });

    it('wraps name in LIKE wildcard query', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { entitySearch: { results: { entities: [] } } } }));
        await callTool('search_entities', { name: 'api-gateway' });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { query: string } };
        expect(reqBody.variables.query).toContain('%api-gateway%');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('search_entities', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('get_golden_metrics', () => {
    it('returns golden metrics for entity', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            actor: {
                entity: {
                    guid: ENTITY_GUID,
                    name: 'my-production-app',
                    goldenMetrics: {
                        metrics: [
                            { query: 'SELECT average(duration) FROM Transaction', title: 'Response Time', unit: 'MS', name: 'responseTime' },
                            { query: 'SELECT rate(count(*), 1 minute) FROM Transaction', title: 'Throughput', unit: 'REQUESTS_PER_MINUTE', name: 'throughput' },
                        ],
                    },
                },
            },
        }));
        const result = await getToolResult('get_golden_metrics', { guid: ENTITY_GUID });
        expect(result.actor.entity.goldenMetrics.metrics).toHaveLength(2);
        expect(result.actor.entity.goldenMetrics.metrics[0].title).toBe('Response Time');
    });

    it('sends guid in variables', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { entity: { goldenMetrics: { metrics: [] } } } }));
        await callTool('get_golden_metrics', { guid: ENTITY_GUID });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { guid: string } };
        expect(reqBody.variables.guid).toBe(ENTITY_GUID);
    });
});

describe('get_entity_tags', () => {
    it('returns tags for entity', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            actor: {
                entity: {
                    guid: ENTITY_GUID,
                    name: 'my-production-app',
                    tags: [{ key: 'environment', values: ['production'] }],
                },
            },
        }));
        const result = await getToolResult('get_entity_tags', { guid: ENTITY_GUID });
        expect(result.actor.entity.tags).toHaveLength(1);
        expect(result.actor.entity.tags[0].key).toBe('environment');
    });

    it('sends guid in variables', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { entity: { tags: [] } } }));
        await callTool('get_entity_tags', { guid: ENTITY_GUID });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { guid: string } };
        expect(reqBody.variables.guid).toBe(ENTITY_GUID);
    });
});

// ── Group 2 — NRQL Queries ────────────────────────────────────────────────────

describe('run_nrql', () => {
    it('executes NRQL and returns results', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            actor: { account: { nrql: { results: mockNrqlResults } } },
        }));
        const result = await getToolResult('run_nrql', {
            account_id: ACCOUNT_ID,
            nrql: 'SELECT count(*) FROM Transaction SINCE 1 hour ago',
        });
        expect(result.actor.account.nrql.results[0]['count(*)']).toBe(42500);
    });

    it('sends accountId and nrql in variables', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { nrql: { results: [] } } } }));
        const nrqlQuery = 'SELECT average(duration) FROM Transaction SINCE 30 minutes ago';
        await callTool('run_nrql', { account_id: ACCOUNT_ID, nrql: nrqlQuery });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { accountId: number; nrql: string } };
        expect(reqBody.variables.accountId).toBe(ACCOUNT_ID);
        expect(reqBody.variables.nrql).toBe(nrqlQuery);
    });

    it('missing account_id returns validation error', async () => {
        const body = await callTool('run_nrql', { nrql: 'SELECT count(*) FROM Transaction' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('account_id');
    });

    it('missing nrql returns validation error', async () => {
        const body = await callTool('run_nrql', { account_id: ACCOUNT_ID });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('nrql');
    });
});

describe('run_nrql_timeseries', () => {
    it('appends TIMESERIES if not present in query', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { nrql: { results: [] } } } }));
        await callTool('run_nrql_timeseries', {
            account_id: ACCOUNT_ID,
            nrql: 'SELECT count(*) FROM Transaction SINCE 1 hour ago',
        });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { nrql: string } };
        expect(reqBody.variables.nrql).toContain('TIMESERIES');
    });

    it('does NOT duplicate TIMESERIES if already present', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { nrql: { results: [] } } } }));
        const nrqlWithTs = 'SELECT count(*) FROM Transaction SINCE 1 hour ago TIMESERIES';
        await callTool('run_nrql_timeseries', { account_id: ACCOUNT_ID, nrql: nrqlWithTs });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { nrql: string } };
        const tsCount = (reqBody.variables.nrql.match(/TIMESERIES/gi) || []).length;
        expect(tsCount).toBe(1);
    });

    it('returns timeseries results', async () => {
        const tsResults = [
            { beginTimeSeconds: 1711620000, 'count(*)': 100 },
            { beginTimeSeconds: 1711620060, 'count(*)': 120 },
        ];
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { nrql: { results: tsResults } } } }));
        const result = await getToolResult('run_nrql_timeseries', {
            account_id: ACCOUNT_ID,
            nrql: 'SELECT count(*) FROM Transaction SINCE 1 hour ago',
        });
        expect(result.actor.account.nrql.results).toHaveLength(2);
    });
});

describe('query_apm_metrics', () => {
    it('builds APM NRQL query with app_name', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { nrql: { results: [] } } } }));
        await callTool('query_apm_metrics', { account_id: ACCOUNT_ID, app_name: 'checkout-service' });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { nrql: string; accountId: number } };
        expect(reqBody.variables.nrql).toContain('checkout-service');
        expect(reqBody.variables.nrql).toContain('Transaction');
        expect(reqBody.variables.nrql).toContain('duration');
        expect(reqBody.variables.accountId).toBe(ACCOUNT_ID);
    });

    it('uses default since of "1 hour ago" when not specified', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { nrql: { results: [] } } } }));
        await callTool('query_apm_metrics', { account_id: ACCOUNT_ID, app_name: 'my-app' });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { nrql: string } };
        expect(reqBody.variables.nrql).toContain('1 hour ago');
    });

    it('uses custom since when provided', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { nrql: { results: [] } } } }));
        await callTool('query_apm_metrics', { account_id: ACCOUNT_ID, app_name: 'my-app', since: '30 minutes ago' });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { nrql: string } };
        expect(reqBody.variables.nrql).toContain('30 minutes ago');
    });
});

describe('query_error_rate', () => {
    it('builds error rate NRQL with app_name', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { nrql: { results: [{ 'Error Rate (%)': 2.5 }] } } } }));
        const result = await getToolResult('query_error_rate', { account_id: ACCOUNT_ID, app_name: 'payment-api' });
        expect(result.actor.account.nrql.results[0]['Error Rate (%)']).toBe(2.5);
    });

    it('NRQL contains error and app_name', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { nrql: { results: [] } } } }));
        await callTool('query_error_rate', { account_id: ACCOUNT_ID, app_name: 'payment-api' });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { nrql: string } };
        expect(reqBody.variables.nrql).toContain('error');
        expect(reqBody.variables.nrql).toContain('payment-api');
    });
});

describe('query_infrastructure', () => {
    it('builds infra NRQL query with host_name', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { nrql: { results: [{ 'CPU (%)': 45.2, 'Memory (%)': 67.8 }] } } } }));
        const result = await getToolResult('query_infrastructure', { account_id: ACCOUNT_ID, host_name: 'prod-web-01' });
        expect(result.actor.account.nrql.results[0]['CPU (%)']).toBe(45.2);
        expect(result.actor.account.nrql.results[0]['Memory (%)']).toBe(67.8);
    });

    it('NRQL contains SystemSample and host_name', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { nrql: { results: [] } } } }));
        await callTool('query_infrastructure', { account_id: ACCOUNT_ID, host_name: 'prod-web-01' });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { nrql: string } };
        expect(reqBody.variables.nrql).toContain('SystemSample');
        expect(reqBody.variables.nrql).toContain('prod-web-01');
        expect(reqBody.variables.nrql).toContain('cpuPercent');
        expect(reqBody.variables.nrql).toContain('memoryUsedPercent');
    });
});

// ── Group 3 — Dashboards ──────────────────────────────────────────────────────

describe('list_dashboards', () => {
    it('returns list of dashboards', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            actor: { entitySearch: { results: { entities: [mockDashboard] } } },
        }));
        const result = await getToolResult('list_dashboards', {});
        expect(result.actor.entitySearch.results.entities).toHaveLength(1);
        expect(result.actor.entitySearch.results.entities[0].entityType).toBe('DASHBOARD');
    });

    it('query variable is type=DASHBOARD', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { entitySearch: { results: { entities: [] } } } }));
        await callTool('list_dashboards', {});
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { query: string } };
        expect(reqBody.variables.query).toContain("type = 'DASHBOARD'");
    });

    it('includes name_filter in query when provided', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { entitySearch: { results: { entities: [] } } } }));
        await callTool('list_dashboards', { name_filter: 'APM' });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { query: string } };
        expect(reqBody.variables.query).toContain('APM');
    });
});

describe('get_dashboard', () => {
    it('returns dashboard with pages', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            actor: {
                entity: {
                    ...mockDashboard,
                    pages: [{ guid: 'page-guid-1', name: 'Overview', widgets: [{ id: 'w1', title: 'Error Rate' }] }],
                },
            },
        }));
        const result = await getToolResult('get_dashboard', { guid: DASHBOARD_GUID });
        expect(result.actor.entity.pages).toHaveLength(1);
        expect(result.actor.entity.pages[0].widgets[0].title).toBe('Error Rate');
    });

    it('sends guid in variables', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { entity: { ...mockDashboard, pages: [] } } }));
        await callTool('get_dashboard', { guid: DASHBOARD_GUID });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { guid: string } };
        expect(reqBody.variables.guid).toBe(DASHBOARD_GUID);
    });

    it('missing guid returns validation error', async () => {
        const body = await callTool('get_dashboard', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('guid');
    });
});

describe('create_dashboard', () => {
    it('sends dashboardCreate mutation with accountId and name', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            dashboardCreate: {
                entityResult: { guid: DASHBOARD_GUID, name: 'My New Dashboard' },
                errors: [],
            },
        }));
        const result = await getToolResult('create_dashboard', { account_id: ACCOUNT_ID, name: 'My New Dashboard' });
        expect(result.dashboardCreate.entityResult.name).toBe('My New Dashboard');
    });

    it('sends accountId and name as variables', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ dashboardCreate: { entityResult: { guid: DASHBOARD_GUID, name: 'Test' }, errors: [] } }));
        await callTool('create_dashboard', { account_id: ACCOUNT_ID, name: 'Test Dashboard' });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { accountId: number; name: string } };
        expect(reqBody.variables.accountId).toBe(ACCOUNT_ID);
        expect(reqBody.variables.name).toBe('Test Dashboard');
    });

    it('missing account_id returns validation error', async () => {
        const body = await callTool('create_dashboard', { name: 'Test' });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('account_id');
    });

    it('missing name returns validation error', async () => {
        const body = await callTool('create_dashboard', { account_id: ACCOUNT_ID });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('name');
    });
});

describe('delete_dashboard', () => {
    it('deletes dashboard and returns status', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ dashboardDelete: { status: 'SUCCESS', errors: [] } }));
        const result = await getToolResult('delete_dashboard', { guid: DASHBOARD_GUID });
        expect(result.dashboardDelete.status).toBe('SUCCESS');
    });

    it('sends guid in variables', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ dashboardDelete: { status: 'SUCCESS', errors: [] } }));
        await callTool('delete_dashboard', { guid: DASHBOARD_GUID });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { guid: string } };
        expect(reqBody.variables.guid).toBe(DASHBOARD_GUID);
    });

    it('missing guid returns validation error', async () => {
        const body = await callTool('delete_dashboard', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('guid');
    });
});

// ── Group 4 — Alerts ──────────────────────────────────────────────────────────

describe('list_alert_policies', () => {
    it('returns list of alert policies', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            actor: { account: { alerts: { policiesSearch: { policies: [mockAlertPolicy] } } } },
        }));
        const result = await getToolResult('list_alert_policies', { account_id: ACCOUNT_ID });
        expect(result.actor.account.alerts.policiesSearch.policies).toHaveLength(1);
        expect(result.actor.account.alerts.policiesSearch.policies[0].name).toBe('Production Alerts');
    });

    it('sends accountId in variables', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { alerts: { policiesSearch: { policies: [] } } } } }));
        await callTool('list_alert_policies', { account_id: ACCOUNT_ID });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { accountId: number } };
        expect(reqBody.variables.accountId).toBe(ACCOUNT_ID);
    });

    it('missing account_id returns validation error', async () => {
        const body = await callTool('list_alert_policies', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('account_id');
    });
});

describe('get_alert_conditions', () => {
    it('returns NRQL alert conditions for policy', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            actor: { account: { alerts: { nrqlConditionsSearch: { nrqlConditions: [mockAlertCondition] } } } },
        }));
        const result = await getToolResult('get_alert_conditions', { account_id: ACCOUNT_ID, policy_id: POLICY_ID });
        expect(result.actor.account.alerts.nrqlConditionsSearch.nrqlConditions).toHaveLength(1);
        expect(result.actor.account.alerts.nrqlConditionsSearch.nrqlConditions[0].name).toBe('High Error Rate');
    });

    it('sends accountId and policyId in variables', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { alerts: { nrqlConditionsSearch: { nrqlConditions: [] } } } } }));
        await callTool('get_alert_conditions', { account_id: ACCOUNT_ID, policy_id: POLICY_ID });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { accountId: number; policyId: string } };
        expect(reqBody.variables.accountId).toBe(ACCOUNT_ID);
        expect(reqBody.variables.policyId).toBe(POLICY_ID);
    });

    it('missing policy_id returns validation error', async () => {
        const body = await callTool('get_alert_conditions', { account_id: ACCOUNT_ID });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('policy_id');
    });
});

describe('list_incidents', () => {
    it('returns active incidents', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            actor: { account: { aiAlerts: { incidentSearch: { incidents: [mockIncident] } } } },
        }));
        const result = await getToolResult('list_incidents', { account_id: ACCOUNT_ID });
        expect(result.actor.account.aiAlerts.incidentSearch.incidents).toHaveLength(1);
        expect(result.actor.account.aiAlerts.incidentSearch.incidents[0].state).toBe('ACTIVATED');
    });

    it('defaults to ACTIVATED state when not specified', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { aiAlerts: { incidentSearch: { incidents: [] } } } } }));
        await callTool('list_incidents', { account_id: ACCOUNT_ID });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { state: string } };
        expect(reqBody.variables.state).toBe('ACTIVATED');
    });

    it('uses custom state when provided', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { aiAlerts: { incidentSearch: { incidents: [] } } } } }));
        await callTool('list_incidents', { account_id: ACCOUNT_ID, state: 'CLOSED' });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { state: string } };
        expect(reqBody.variables.state).toBe('CLOSED');
    });
});

describe('get_incident_details', () => {
    it('returns detailed incident info', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            actor: {
                account: {
                    aiAlerts: { incidentSearch: { incidents: [{ ...mockIncident, isCorrelated: false }] } },
                },
            },
        }));
        const result = await getToolResult('get_incident_details', { account_id: ACCOUNT_ID, incident_id: INCIDENT_ID });
        expect(result.actor.account.aiAlerts.incidentSearch.incidents[0].incidentId).toBe(INCIDENT_ID);
    });

    it('sends accountId and incidentId in variables', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: { aiAlerts: { incidentSearch: { incidents: [] } } } } }));
        await callTool('get_incident_details', { account_id: ACCOUNT_ID, incident_id: INCIDENT_ID });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { accountId: number; incidentId: string } };
        expect(reqBody.variables.accountId).toBe(ACCOUNT_ID);
        expect(reqBody.variables.incidentId).toBe(INCIDENT_ID);
    });

    it('missing incident_id returns validation error', async () => {
        const body = await callTool('get_incident_details', { account_id: ACCOUNT_ID });
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('incident_id');
    });
});

// ── Group 5 — Accounts & Users ────────────────────────────────────────────────

describe('list_accounts', () => {
    it('returns all accessible accounts', async () => {
        mockFetch.mockReturnValueOnce(nrOk({
            actor: { accounts: [mockAccount, { id: 7654321, name: 'My Org Staging' }] },
        }));
        const result = await getToolResult('list_accounts', {});
        expect(result.actor.accounts).toHaveLength(2);
        expect(result.actor.accounts[0].id).toBe(ACCOUNT_ID);
        expect(result.actor.accounts[0].name).toBe('My Org Production');
    });

    it('sends correct query (no variables needed)', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { accounts: [] } }));
        await callTool('list_accounts', {});
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { query: string; variables: Record<string, unknown> };
        expect(reqBody.query).toContain('accounts');
        expect(reqBody.query).toContain('id');
        expect(reqBody.query).toContain('name');
    });
});

describe('get_current_user', () => {
    it('returns authenticated user info', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { user: mockUser } }));
        const result = await getToolResult('get_current_user', {});
        expect(result.actor.user.name).toBe('Jane Doe');
        expect(result.actor.user.email).toBe('jane.doe@example.com');
        expect(result.actor.user.id).toBe(9876543);
    });

    it('sends user query with name, email, id fields', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { user: mockUser } }));
        await callTool('get_current_user', {});
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { query: string };
        expect(reqBody.query).toContain('user');
        expect(reqBody.query).toContain('email');
        expect(reqBody.query).toContain('id');
    });
});

describe('get_account_info', () => {
    it('returns account details by id', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: mockAccount } }));
        const result = await getToolResult('get_account_info', { account_id: ACCOUNT_ID });
        expect(result.actor.account.id).toBe(ACCOUNT_ID);
        expect(result.actor.account.name).toBe('My Org Production');
    });

    it('sends accountId in variables', async () => {
        mockFetch.mockReturnValueOnce(nrOk({ actor: { account: mockAccount } }));
        await callTool('get_account_info', { account_id: ACCOUNT_ID });
        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        const reqBody = JSON.parse(init.body as string) as { variables: { accountId: number } };
        expect(reqBody.variables.accountId).toBe(ACCOUNT_ID);
    });

    it('missing account_id returns validation error', async () => {
        const body = await callTool('get_account_info', {});
        expect(body.error).toBeDefined();
        expect(body.error!.message).toContain('account_id');
    });
});
