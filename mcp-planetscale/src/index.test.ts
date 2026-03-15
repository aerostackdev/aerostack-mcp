import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}
function apiErr(status: number, message = 'Error') {
    return Promise.resolve(new Response(JSON.stringify({ error: { message } }), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

function makeReq(method: string, params?: unknown) {
    return new Request('http://localhost/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Mcp-Secret-PLANETSCALE-TOKEN': 'svc_token_id:svc_token_secret',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-planetscale', () => {
    describe('GET /health', () => {
        it('returns status ok', async () => {
            const req = new Request('http://localhost/health', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('planetscale-mcp');
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('planetscale-mcp');
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
            expect(names).toContain('list_databases');
            expect(names).toContain('get_database');
            expect(names).toContain('list_branches');
            expect(names).toContain('get_branch');
            expect(names).toContain('create_branch');
            expect(names).toContain('list_deploy_requests');
            expect(names).toContain('create_deploy_request');
        });
    });

    describe('unknown method', () => {
        it('returns -32601', async () => {
            const res = await worker.fetch(makeReq('unknown/method'));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32601);
        });
    });

    describe('missing auth secret', () => {
        it('returns -32001 when token missing', async () => {
            const req = new Request('http://localhost/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_databases', arguments: { org: 'myorg' } } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('list_databases', () => {
        it('happy path returns databases', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                data: [{ id: 'db_1', name: 'mydb', state: 'ready', region: { slug: 'us-east' }, created_at: '2024-01-01', html_url: 'https://app.planetscale.com/org/mydb' }]
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_databases', arguments: { org: 'myorg' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data).toHaveLength(1);
            expect(data[0].name).toBe('mydb');
            expect(data[0].state).toBe('ready');
        });

        it('returns -32603 on PlanetScale 404 not found', async () => {
            mockFetch.mockReturnValueOnce(Promise.resolve(new Response(
                JSON.stringify({ code: 'not_found', message: 'Organization not found' }),
                { status: 404, headers: { 'Content-Type': 'application/json' } }
            )));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_databases', arguments: { org: 'bad_org' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });

        it('returns -32603 on 401 unauthorized', async () => {
            mockFetch.mockReturnValueOnce(apiErr(401, 'Unauthorized'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_databases', arguments: { org: 'myorg' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('get_database', () => {
        it('happy path returns database details', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ id: 'db_1', name: 'mydb', state: 'ready', html_url: 'https://app.planetscale.com/org/mydb' }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_database', arguments: { org: 'myorg', database: 'mydb' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.name).toBe('mydb');
            expect(data.url).toBe('https://app.planetscale.com/org/mydb');
        });

        it('returns -32603 on 404', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'Database not found'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_database', arguments: { org: 'myorg', database: 'bad' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('list_branches', () => {
        it('happy path returns branches', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                data: [{ id: 'br_1', name: 'main', production: true, ready: true, created_at: '2024-01-01' }]
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_branches', arguments: { org: 'myorg', database: 'mydb' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data[0].name).toBe('main');
            expect(data[0].production).toBe(true);
        });

        it('returns -32603 on API error', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'Database not found'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_branches', arguments: { org: 'myorg', database: 'bad' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('get_branch', () => {
        it('happy path returns branch details', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ id: 'br_1', name: 'main', production: true, ready: true }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_branch', arguments: { org: 'myorg', database: 'mydb', branch: 'main' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.name).toBe('main');
            expect(data.production).toBe(true);
        });

        it('returns -32603 on 404', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'Branch not found'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_branch', arguments: { org: 'myorg', database: 'mydb', branch: 'bad' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('create_branch', () => {
        it('happy path creates branch', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ id: 'br_2', name: 'feature-branch', production: false, ready: false, created_at: '2024-01-01' }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'create_branch', arguments: { org: 'myorg', database: 'mydb', name: 'feature-branch' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.name).toBe('feature-branch');
            expect(data.production).toBe(false);
        });

        it('returns -32603 on conflict', async () => {
            mockFetch.mockReturnValueOnce(apiErr(422, 'Branch name already exists'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'create_branch', arguments: { org: 'myorg', database: 'mydb', name: 'main' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('list_deploy_requests', () => {
        it('happy path returns deploy requests', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                data: [{ id: 'dr_1', number: 1, state: 'open', branch: 'feature-branch', into_branch: 'main', created_at: '2024-01-01' }]
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_deploy_requests', arguments: { org: 'myorg', database: 'mydb' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data[0].number).toBe(1);
            expect(data[0].state).toBe('open');
        });

        it('returns -32603 on API error', async () => {
            mockFetch.mockReturnValueOnce(apiErr(404, 'Not found'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_deploy_requests', arguments: { org: 'myorg', database: 'bad' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('create_deploy_request', () => {
        it('happy path creates deploy request', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ id: 'dr_2', number: 2, state: 'open', branch: 'feature-branch' }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'create_deploy_request', arguments: { org: 'myorg', database: 'mydb', branch: 'feature-branch' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.number).toBe(2);
            expect(data.branch).toBe('feature-branch');
        });

        it('returns -32603 on API error', async () => {
            mockFetch.mockReturnValueOnce(apiErr(422, 'Cannot create deploy request'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'create_deploy_request', arguments: { org: 'myorg', database: 'mydb', branch: 'bad' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe.skip('E2E', () => {
        it('list_databases with real PlanetScale token', async () => {
            // Requires PLANETSCALE_TOKEN env var — skip in CI
        });
    });
});
