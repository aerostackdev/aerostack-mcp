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

function apiNoContent() {
    return Promise.resolve(new Response(null, { status: 204 }));
}

beforeEach(() => { mockFetch.mockReset(); });

const TEST_HEADERS = {
    'Content-Type': 'application/json',
    'X-Mcp-Secret-HARVEST-ACCESS-TOKEN': 'test_token',
    'X-Mcp-Secret-HARVEST-ACCOUNT-ID': 'acct_456',
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
    it('returns ok', async () => {
        const res = await worker.fetch(new Request('http://localhost/health'));
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('harvest-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('harvest-mcp');
    });
});

describe('tools/list', () => {
    it('returns 16 tools', async () => {
        const res = await worker.fetch(makeReq('tools/list'));
        const body = await res.json() as any;
        expect(body.result.tools).toHaveLength(16);
        const names = body.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_time_entries');
        expect(names).toContain('list_reports_time');
        expect(names).toContain('get_current_user');
    });
});

describe('missing auth', () => {
    it('returns -32001', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', { name: 'list_time_entries', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools ─────────────────────────────────────────────────────────────────────

describe('list_time_entries', () => {
    it('returns time entries', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            time_entries: [{ id: 1, hours: 2.5, project: { name: 'Big Project' } }],
            total_pages: 1,
            total_entries: 1,
        }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_time_entries', arguments: { from: '2024-01-01', to: '2024-01-31' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.time_entries).toHaveLength(1);
        expect(result.time_entries[0].hours).toBe(2.5);
    });

    it('includes Harvest-Account-Id header', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ time_entries: [] }));
        await worker.fetch(makeReq('tools/call', { name: 'list_time_entries', arguments: {} }));
        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Harvest-Account-Id']).toBe('acct_456');
    });
});

describe('create_time_entry', () => {
    it('creates time entry', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 2, hours: 3, project: { name: 'Test' } }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_time_entry',
            arguments: { project_id: 101, task_id: 201, spent_date: '2024-03-15', hours: 3 },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.hours).toBe(3);
    });

    it('returns -32603 when project_id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_time_entry',
            arguments: { task_id: 1, spent_date: '2024-01-01', hours: 1 },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });

    it('returns -32603 when hours missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_time_entry',
            arguments: { project_id: 1, task_id: 1, spent_date: '2024-01-01' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('update_time_entry', () => {
    it('updates time entry', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 2, hours: 4, notes: 'Updated' }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_time_entry',
            arguments: { id: '2', hours: 4, notes: 'Updated' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.hours).toBe(4);
    });

    it('returns -32603 when id missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'update_time_entry', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('delete_time_entry', () => {
    it('deletes time entry (204)', async () => {
        mockFetch.mockResolvedValueOnce(apiNoContent());
        const res = await worker.fetch(makeReq('tools/call', { name: 'delete_time_entry', arguments: { id: '2' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.success).toBe(true);
    });
});

describe('stop_timer / restart_timer', () => {
    it('stops timer', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 3, is_running: false }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'stop_timer', arguments: { id: '3' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.is_running).toBe(false);
    });

    it('restarts timer', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 3, is_running: true }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'restart_timer', arguments: { id: '3' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.is_running).toBe(true);
    });
});

describe('list_projects', () => {
    it('returns projects', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ projects: [{ id: 101, name: 'Big Project' }], total_pages: 1 }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_projects', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.projects[0].name).toBe('Big Project');
    });
});

describe('create_project', () => {
    it('creates project', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 102, name: 'New Project', is_billable: true }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_project',
            arguments: { client_id: 1, name: 'New Project', bill_by: 'Project' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.name).toBe('New Project');
    });

    it('returns -32603 when bill_by missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_project', arguments: { client_id: 1, name: 'X' } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_client', () => {
    it('creates client', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 5, name: 'Acme Corp', currency: 'USD' }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_client', arguments: { name: 'Acme Corp' } }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.name).toBe('Acme Corp');
    });

    it('returns -32603 when name missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'create_client', arguments: {} }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_reports_time', () => {
    it('returns time report', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ results: [{ project: { name: 'P1' }, total_hours: 40 }], total_hours: 40 }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_reports_time',
            arguments: { from: '2024-01-01', to: '2024-01-31' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.total_hours).toBe(40);
    });

    it('returns -32603 when from missing', async () => {
        const res = await worker.fetch(makeReq('tools/call', { name: 'list_reports_time', arguments: { to: '2024-01-31' } }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_current_user', () => {
    it('returns current user', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ id: 1, email: 'dev@co.com', first_name: 'Dev', is_admin: true }));
        const res = await worker.fetch(makeReq('tools/call', { name: 'get_current_user', arguments: {} }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.email).toBe('dev@co.com');
    });
});
