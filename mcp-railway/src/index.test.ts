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
            'X-Mcp-Secret-RAILWAY-API-TOKEN': 'test_token_123',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
}

describe('mcp-railway', () => {
    describe('GET /health', () => {
        it('returns status ok', async () => {
            const req = new Request('http://localhost/health', { method: 'GET' });
            const res = await worker.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json() as any;
            expect(body.status).toBe('ok');
            expect(body.server).toBe('railway-mcp');
        });
    });

    describe('initialize', () => {
        it('returns correct serverInfo', async () => {
            const res = await worker.fetch(makeReq('initialize'));
            const body = await res.json() as any;
            expect(body.result.serverInfo.name).toBe('railway-mcp');
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
            expect(names).toContain('list_projects');
            expect(names).toContain('get_project');
            expect(names).toContain('list_services');
            expect(names).toContain('list_deployments');
            expect(names).toContain('get_deployment_logs');
            expect(names).toContain('list_variables');
            expect(names).toContain('redeploy_service');
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
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } }),
            });
            const res = await worker.fetch(req);
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32001);
        });
    });

    describe('list_projects', () => {
        it('happy path returns projects', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                data: {
                    me: {
                        projects: {
                            edges: [{ node: { id: 'proj_1', name: 'My App', description: 'desc', createdAt: '2024-01-01', updatedAt: '2024-01-02' } }]
                        }
                    }
                }
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_projects', arguments: {} }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data).toHaveLength(1);
            expect(data[0].id).toBe('proj_1');
            expect(data[0].name).toBe('My App');
        });

        it('returns -32603 on Railway GraphQL error', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ errors: [{ message: 'Not found' }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_projects', arguments: {} }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });

        it('returns -32603 on HTTP error', async () => {
            mockFetch.mockReturnValueOnce(apiErr(401, 'Unauthorized'));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_projects', arguments: {} }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('get_project', () => {
        it('happy path returns project details', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                data: {
                    project: {
                        id: 'proj_1', name: 'My App', description: 'desc', createdAt: '2024-01-01',
                        environments: { edges: [{ node: { id: 'env_1', name: 'production' } }] },
                        services: { edges: [{ node: { id: 'svc_1', name: 'web' } }] },
                    }
                }
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_project', arguments: { id: 'proj_1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.id).toBe('proj_1');
            expect(data.environments).toHaveLength(1);
            expect(data.services).toHaveLength(1);
        });

        it('returns -32603 on GraphQL error', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ errors: [{ message: 'Project not found' }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_project', arguments: { id: 'bad_id' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('list_services', () => {
        it('happy path returns services', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                data: {
                    project: {
                        services: {
                            edges: [{ node: { id: 'svc_1', name: 'web', createdAt: '2024-01-01', updatedAt: '2024-01-01' } }]
                        }
                    }
                }
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_services', arguments: { projectId: 'proj_1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data[0].id).toBe('svc_1');
        });

        it('returns -32603 on GraphQL error', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ errors: [{ message: 'Not found' }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_services', arguments: { projectId: 'bad' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('list_deployments', () => {
        it('happy path returns deployments', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                data: {
                    deployments: {
                        edges: [{ node: { id: 'dep_1', status: 'SUCCESS', createdAt: '2024-01-01' } }]
                    }
                }
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_deployments', arguments: { serviceId: 'svc_1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data[0].id).toBe('dep_1');
            expect(data[0].status).toBe('SUCCESS');
        });

        it('returns -32603 on GraphQL error', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ errors: [{ message: 'Service not found' }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_deployments', arguments: { serviceId: 'bad' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('get_deployment_logs', () => {
        it('happy path returns logs', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                data: { deploymentLogs: [{ timestamp: '2024-01-01', message: 'Server started', severity: 'INFO' }] }
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_deployment_logs', arguments: { deploymentId: 'dep_1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data[0].message).toBe('Server started');
        });

        it('returns -32603 on GraphQL error', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ errors: [{ message: 'Deployment not found' }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'get_deployment_logs', arguments: { deploymentId: 'bad' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('list_variables', () => {
        it('happy path returns variables', async () => {
            mockFetch.mockReturnValueOnce(apiOk({
                data: { variables: { PORT: '3000', NODE_ENV: 'production' } }
            }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_variables', arguments: { projectId: 'proj_1', environmentId: 'env_1', serviceId: 'svc_1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data).toHaveLength(2);
            const portVar = data.find((v: any) => v.key === 'PORT');
            expect(portVar.value).toBe('3000');
        });

        it('returns -32603 on GraphQL error', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ errors: [{ message: 'Not found' }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'list_variables', arguments: { projectId: 'p', environmentId: 'e', serviceId: 's' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe('redeploy_service', () => {
        it('happy path triggers redeploy', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ data: { serviceInstanceRedeploy: true } }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'redeploy_service', arguments: { serviceId: 'svc_1', environmentId: 'env_1' } }));
            const body = await res.json() as any;
            const data = JSON.parse(body.result.content[0].text);
            expect(data.success).toBe(true);
        });

        it('returns -32603 on GraphQL error', async () => {
            mockFetch.mockReturnValueOnce(apiOk({ errors: [{ message: 'Service not found' }] }));
            const res = await worker.fetch(makeReq('tools/call', { name: 'redeploy_service', arguments: { serviceId: 'bad', environmentId: 'env_1' } }));
            const body = await res.json() as any;
            expect(body.error.code).toBe(-32603);
        });
    });

    describe.skip('E2E', () => {
        it('list_projects with real Railway token', async () => {
            // Requires RAILWAY_API_TOKEN env var — skip in CI
        });
    });
});
