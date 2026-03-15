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
    return Promise.resolve(new Response(JSON.stringify({ error: { message } }), {
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
            'X-Mcp-Secret-AIRTABLE-API-KEY': 'test_key_abc',
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

// ── Health check ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
    it('returns status ok', async () => {
        const req = new Request('http://localhost/health');
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('airtable-mcp');
    });
});

// ── Protocol ──────────────────────────────────────────────────────────────────

describe('initialize', () => {
    it('returns correct serverInfo', async () => {
        const res = await worker.fetch(makeReq('initialize'));
        const body = await res.json() as any;
        expect(body.result.serverInfo.name).toBe('airtable-mcp');
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
        expect(names).toContain('list_bases');
        expect(names).toContain('list_tables');
        expect(names).toContain('list_records');
        expect(names).toContain('get_record');
        expect(names).toContain('create_record');
        expect(names).toContain('update_record');
        expect(names).toContain('search_records');
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
    it('returns -32001 when no AIRTABLE-API-KEY header', async () => {
        const res = await worker.fetch(makeReqNoAuth('tools/call', {
            name: 'list_bases',
            arguments: {},
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32001);
    });
});

// ── Tools: happy paths ────────────────────────────────────────────────────────

describe('list_bases', () => {
    it('returns mapped bases', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            bases: [{ id: 'appXXX', name: 'My Base', permissionLevel: 'create' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_bases',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('appXXX');
        expect(result[0].name).toBe('My Base');
        expect(result[0].permission_level).toBe('create');
    });

    it('returns empty array when bases is missing', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({}));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_bases',
            arguments: {},
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toEqual([]);
    });
});

describe('list_tables', () => {
    it('returns mapped tables', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            tables: [{
                id: 'tblXXX',
                name: 'Contacts',
                primaryFieldId: 'fld1',
                fields: [{ id: 'fldXXX', name: 'Name', type: 'singleLineText' }],
                views: [{}],
            }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_tables',
            arguments: { base_id: 'appXXX' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('tblXXX');
        expect(result[0].name).toBe('Contacts');
        expect(result[0].fields).toHaveLength(1);
        expect(result[0].views_count).toBe(1);
    });

    it('returns -32603 on Airtable API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(422, 'INVALID_REQUEST_BODY'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_tables',
            arguments: { base_id: 'invalid' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('list_records', () => {
    it('returns mapped records with has_more', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            records: [{ id: 'recXXX', fields: { Name: 'Alice', Email: 'alice@test.com' }, createdTime: '2024-01-01' }],
            offset: 'someOffset',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_records',
            arguments: { base_id: 'appXXX', table_name: 'Contacts' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.records).toHaveLength(1);
        expect(result.records[0].id).toBe('recXXX');
        expect(result.records[0].fields.Name).toBe('Alice');
        expect(result.has_more).toBe(true);
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(422, 'Invalid filter'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'list_records',
            arguments: { base_id: 'appXXX', table_name: 'Contacts' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('get_record', () => {
    it('returns mapped record', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'recXXX',
            fields: { Name: 'Alice' },
            createdTime: '2024-01-01',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_record',
            arguments: { base_id: 'appXXX', table_name: 'Contacts', record_id: 'recXXX' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('recXXX');
        expect(result.fields.Name).toBe('Alice');
        expect(result.created_time).toBe('2024-01-01');
    });

    it('returns -32603 on 404', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(404, 'Record not found'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'get_record',
            arguments: { base_id: 'appXXX', table_name: 'Contacts', record_id: 'recBAD' },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('create_record', () => {
    it('returns new record', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'recNEW',
            fields: { Name: 'Bob' },
            createdTime: '2024-01-01',
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_record',
            arguments: { base_id: 'appXXX', table_name: 'Contacts', fields: { Name: 'Bob' } },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('recNEW');
        expect(result.fields.Name).toBe('Bob');
    });

    it('returns -32603 on 422 INVALID_REQUEST_BODY', async () => {
        mockFetch.mockResolvedValueOnce(new Response(
            JSON.stringify({ error: { type: 'INVALID_REQUEST_BODY', message: 'Field does not exist' } }),
            { status: 422, headers: { 'Content-Type': 'application/json' } }
        ));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'create_record',
            arguments: { base_id: 'appXXX', table_name: 'Contacts', fields: { BadField: 'x' } },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
        expect(body.error.message).toContain('Field does not exist');
    });
});

describe('update_record', () => {
    it('returns updated record', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            id: 'recXXX',
            fields: { Name: 'Alice Updated' },
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_record',
            arguments: { base_id: 'appXXX', table_name: 'Contacts', record_id: 'recXXX', fields: { Name: 'Alice Updated' } },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result.id).toBe('recXXX');
        expect(result.fields.Name).toBe('Alice Updated');
    });

    it('returns -32603 on API error', async () => {
        mockFetch.mockResolvedValueOnce(apiErr(403, 'Forbidden'));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'update_record',
            arguments: { base_id: 'appXXX', table_name: 'Contacts', record_id: 'recXXX', fields: { Name: 'x' } },
        }));
        const body = await res.json() as any;
        expect(body.error.code).toBe(-32603);
    });
});

describe('search_records', () => {
    it('returns filtered records', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({
            records: [{ id: 'recXXX', fields: { Name: 'Alice', Email: 'alice@test.com' }, createdTime: '2024-01-01' }],
        }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_records',
            arguments: { base_id: 'appXXX', table_name: 'Contacts', search_field: 'Name', search_value: 'Alice' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('recXXX');
    });

    it('returns empty array when no matches', async () => {
        mockFetch.mockResolvedValueOnce(apiOk({ records: [] }));
        const res = await worker.fetch(makeReq('tools/call', {
            name: 'search_records',
            arguments: { base_id: 'appXXX', table_name: 'Contacts', search_field: 'Name', search_value: 'Nonexistent' },
        }));
        const body = await res.json() as any;
        const result = JSON.parse(body.result.content[0].text);
        expect(result).toEqual([]);
    });
});

// ── E2E (skipped in CI) ───────────────────────────────────────────────────────

describe.skip('E2E — real Airtable API', () => {
    it('lists real bases', async () => {
        // Requires AIRTABLE_API_KEY in env
    });
});
