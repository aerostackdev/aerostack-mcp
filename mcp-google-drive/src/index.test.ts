import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

// Helper to build a POST request
function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('https://mcp.example.com/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

const AUTH_HEADER = { 'X-Mcp-Secret-GOOGLE-ACCESS-TOKEN': 'test_access_token' };

// --- Mock fetch ---
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockJsonResponse(data: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
        })
    );
}

function mockBinaryResponse(data: Uint8Array, status = 200) {
    return Promise.resolve(
        new Response(data.buffer, {
            status,
            headers: { 'Content-Type': 'application/pdf' },
        })
    );
}

beforeEach(() => {
    mockFetch.mockReset();
});

// ── Protocol Tests ───────────────────────────────────────────────────────────

describe('Protocol', () => {
    it('GET /health returns status ok', async () => {
        const req = new Request('https://mcp.example.com/health', { method: 'GET' });
        const res = await worker.fetch(req);
        expect(res.status).toBe(200);
        const json = await res.json() as any;
        expect(json.status).toBe('ok');
        expect(json.server).toBe('google-drive-mcp');
    });

    it('non-POST methods return 405', async () => {
        const req = new Request('https://mcp.example.com/', { method: 'PUT' });
        const res = await worker.fetch(req);
        expect(res.status).toBe(405);
    });

    it('invalid JSON returns parse error', async () => {
        const req = new Request('https://mcp.example.com/', {
            method: 'POST',
            body: 'not json',
        });
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.error.code).toBe(-32700);
    });

    it('initialize returns server info', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.result.protocolVersion).toBe('2024-11-05');
        expect(json.result.serverInfo.name).toBe('google-drive-mcp');
    });

    it('tools/list returns all 10 tools', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.result.tools).toHaveLength(10);
        const names = json.result.tools.map((t: any) => t.name);
        expect(names).toContain('list_files');
        expect(names).toContain('get_file_metadata');
        expect(names).toContain('search_files');
        expect(names).toContain('create_folder');
        expect(names).toContain('move_file');
        expect(names).toContain('copy_file');
        expect(names).toContain('delete_file');
        expect(names).toContain('share_file');
        expect(names).toContain('export_file_as_pdf');
        expect(names).toContain('list_shared_drives');
    });

    it('unknown method returns -32601', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 3, method: 'unknown/method' });
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.error.code).toBe(-32601);
    });

    it('missing secret returns -32001 error', async () => {
        const req = makeRequest({
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'list_files', arguments: {} },
        });
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.error.code).toBe(-32001);
        expect(json.error.message).toContain('GOOGLE_ACCESS_TOKEN');
    });
});

// ── Tool Tests ───────────────────────────────────────────────────────────────

describe('Tool: list_files', () => {
    it('lists files without folder filter', async () => {
        const files = [
            { id: 'f1', name: 'doc.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: '1024', modifiedTime: '2024-01-01T00:00:00Z', webViewLink: 'https://drive.google.com/file/f1', parents: ['root'] },
        ];
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ files }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'list_files', arguments: {} } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.result.content[0].type).toBe('text');
        const result = JSON.parse(json.result.content[0].text);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('f1');
    });

    it('passes folder_id in q parameter', async () => {
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'list_files', arguments: { folder_id: 'folder123' } } }, AUTH_HEADER);
        await worker.fetch(req);

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        // URLSearchParams encodes spaces as +, so decode with URL-style decoding
        const decodedUrl = calledUrl.replace(/\+/g, ' ');
        expect(decodeURIComponent(decodedUrl)).toContain("'folder123' in parents");
        expect(decodeURIComponent(decodedUrl)).toContain('trashed=false');
    });

    it('passes mime_type filter', async () => {
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'list_files', arguments: { mime_type: 'application/vnd.google-apps.spreadsheet' } } }, AUTH_HEADER);
        await worker.fetch(req);

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(decodeURIComponent(calledUrl)).toContain('mimeType=');
    });
});

describe('Tool: get_file_metadata', () => {
    it('returns file metadata', async () => {
        const file = { id: 'f1', name: 'report.pdf', mimeType: 'application/pdf', size: '2048', modifiedTime: '2024-01-01T00:00:00Z', webViewLink: 'https://drive.google.com/file/f1', parents: ['root'], description: 'Annual report' };
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(file), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'get_file_metadata', arguments: { file_id: 'f1' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.id).toBe('f1');
        expect(result.description).toBe('Annual report');
    });
});

describe('Tool: search_files', () => {
    it('searches by query', async () => {
        const files = [{ id: 'f2', name: 'budget.xlsx', mimeType: 'application/vnd.ms-excel' }];
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ files }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 30, method: 'tools/call', params: { name: 'search_files', arguments: { query: 'budget' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result[0].name).toBe('budget.xlsx');

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(decodeURIComponent(calledUrl)).toContain('budget');
        expect(decodeURIComponent(calledUrl)).toContain('trashed=false');
    });
});

describe('Tool: create_folder', () => {
    it('creates a folder and returns metadata', async () => {
        const created = { id: 'folder1', name: 'New Folder' };
        const withLink = { id: 'folder1', name: 'New Folder', webViewLink: 'https://drive.google.com/folder/folder1' };
        mockFetch
            .mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify(withLink), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 40, method: 'tools/call', params: { name: 'create_folder', arguments: { name: 'New Folder' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.id).toBe('folder1');
        expect(result.webViewLink).toContain('folder1');
    });
});

describe('Tool: move_file', () => {
    it('moves file to new parent', async () => {
        const moved = { id: 'f1', name: 'doc.docx', parents: ['newParent'] };
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(moved), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 50, method: 'tools/call', params: { name: 'move_file', arguments: { file_id: 'f1', new_parent_id: 'newParent', current_parent_id: 'oldParent' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.parents).toContain('newParent');

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('addParents=newParent');
        expect(calledUrl).toContain('removeParents=oldParent');
    });
});

describe('Tool: copy_file', () => {
    it('copies a file', async () => {
        const copy = { id: 'f1copy', name: 'Copy of report.pdf' };
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(copy), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 60, method: 'tools/call', params: { name: 'copy_file', arguments: { file_id: 'f1' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.id).toBe('f1copy');
    });

    it('copies with custom name', async () => {
        const copy = { id: 'f1copy', name: 'Q4 Report' };
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(copy), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 61, method: 'tools/call', params: { name: 'copy_file', arguments: { file_id: 'f1', name: 'Q4 Report' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.name).toBe('Q4 Report');
    });
});

describe('Tool: delete_file', () => {
    it('deletes a file', async () => {
        // vitest node env does not support status 204 in Response constructor; use 200 with empty body
        mockFetch.mockResolvedValueOnce(new Response('', { status: 200 }));

        const req = makeRequest({ jsonrpc: '2.0', id: 70, method: 'tools/call', params: { name: 'delete_file', arguments: { file_id: 'f1' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.deleted).toBe(true);
        expect(result.file_id).toBe('f1');
    });
});

describe('Tool: share_file', () => {
    it('shares with a user', async () => {
        const perm = { id: 'perm1', role: 'reader', type: 'user' };
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(perm), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 80, method: 'tools/call', params: { name: 'share_file', arguments: { file_id: 'f1', email: 'user@example.com' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.role).toBe('reader');
        expect(result.type).toBe('user');
    });

    it('makes file public when no email', async () => {
        const perm = { id: 'perm2', role: 'reader', type: 'anyone' };
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(perm), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 81, method: 'tools/call', params: { name: 'share_file', arguments: { file_id: 'f1' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.type).toBe('anyone');
    });
});

describe('Tool: export_file_as_pdf', () => {
    it('exports file as base64 PDF', async () => {
        const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF header
        mockFetch.mockResolvedValueOnce(
            new Response(pdfBytes.buffer, { status: 200, headers: { 'Content-Type': 'application/pdf' } })
        );

        const req = makeRequest({ jsonrpc: '2.0', id: 90, method: 'tools/call', params: { name: 'export_file_as_pdf', arguments: { file_id: 'doc1' } } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result.file_id).toBe('doc1');
        expect(result.format).toBe('pdf');
        expect(result.size_bytes).toBe(4);
        expect(typeof result.base64).toBe('string');
        expect(result.base64).toBe(btoa('%PDF'));

        const calledUrl = mockFetch.mock.calls[0][0] as string;
        expect(calledUrl).toContain('export');
        expect(calledUrl).toContain('application%2Fpdf');
    });
});

describe('Tool: list_shared_drives', () => {
    it('lists shared drives', async () => {
        const drives = [{ id: 'drive1', name: 'Engineering', createdTime: '2024-01-01T00:00:00Z' }];
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ drives }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const req = makeRequest({ jsonrpc: '2.0', id: 100, method: 'tools/call', params: { name: 'list_shared_drives', arguments: {} } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        const result = JSON.parse(json.result.content[0].text);
        expect(result[0].name).toBe('Engineering');
    });
});

describe('Error handling', () => {
    it('returns -32603 when API call fails', async () => {
        mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

        const req = makeRequest({ jsonrpc: '2.0', id: 200, method: 'tools/call', params: { name: 'list_files', arguments: {} } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.error.code).toBe(-32603);
        expect(json.error.message).toContain('401');
    });

    it('returns -32603 for unknown tool', async () => {
        const req = makeRequest({ jsonrpc: '2.0', id: 201, method: 'tools/call', params: { name: 'nonexistent_tool', arguments: {} } }, AUTH_HEADER);
        const res = await worker.fetch(req);
        const json = await res.json() as any;
        expect(json.error.code).toBe(-32603);
        expect(json.error.message).toContain('Unknown tool');
    });
});
