import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Mock crypto.subtle for getAccessToken ─────────────────────────────────────
// Web Crypto RS256 signing won't work with fake PEM keys in the Node test env.
// We stub crypto.subtle so JWT signing succeeds without real keys.
// The actual OAuth token exchange is exercised via the mocked fetch response.
const fakeCryptoKey = {} as CryptoKey;
vi.stubGlobal('crypto', {
    subtle: {
        importKey: vi.fn().mockResolvedValue(fakeCryptoKey),
        sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer),
    },
});

function apiOk(data: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

function apiErr(status: number, message = 'Error', errorBody?: unknown) {
    const body = errorBody ?? { error: { message, status: 'UNKNOWN' } };
    return Promise.resolve(new Response(JSON.stringify(body), {
        status, headers: { 'Content-Type': 'application/json' },
    }));
}

beforeEach(() => { mockFetch.mockReset(); });

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://mcp-firebase.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

/** Service account key JSON for tests (fake, but structurally valid for mocking) */
const FAKE_SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'test@test-project.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nfakekey\n-----END PRIVATE KEY-----\n',
});

function withTokens(headers: Record<string, string> = {}) {
    return {
        'X-Mcp-Secret-FIREBASE-PROJECT-ID': 'test-project',
        'X-Mcp-Secret-FIREBASE-SERVICE-ACCOUNT-KEY': FAKE_SERVICE_ACCOUNT,
        ...headers,
    };
}

/** Mock the OAuth token exchange (called first by getAccessToken) */
function mockOAuthToken() {
    mockFetch.mockResolvedValueOnce(apiOk({ access_token: 'mock-access-token', token_type: 'Bearer', expires_in: 3600 }));
}

async function rpc(body: unknown, headers?: Record<string, string>) {
    const res = await worker.fetch(makeRequest(body, headers ?? withTokens()));
    return res.json() as Promise<any>;
}

async function rpcTool(toolName: string, toolArgs: Record<string, unknown>, headers?: Record<string, string>) {
    return rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: toolName, arguments: toolArgs } }, headers);
}

// ── Mock Firestore documents ──────────────────────────────────────────────────

const mockFirestoreDoc = {
    name: 'projects/test-project/databases/(default)/documents/users/user123',
    fields: {
        name: { stringValue: 'Alice' },
        age: { integerValue: '30' },
        active: { booleanValue: true },
    },
    createTime: '2024-01-01T00:00:00Z',
    updateTime: '2024-01-02T00:00:00Z',
};

const mockFirestoreDoc2 = {
    name: 'projects/test-project/databases/(default)/documents/users/user456',
    fields: {
        name: { stringValue: 'Bob' },
        age: { integerValue: '25' },
        active: { booleanValue: false },
    },
    createTime: '2024-01-03T00:00:00Z',
    updateTime: '2024-01-04T00:00:00Z',
};

// ── Mock Firebase Auth users ──────────────────────────────────────────────────

const mockAuthUser = {
    localId: 'uid123',
    email: 'alice@example.com',
    displayName: 'Alice Smith',
    disabled: false,
    emailVerified: true,
    createdAt: '1704067200000', // 2024-01-01
    lastLoginAt: '1704153600000',
    providerUserInfo: [{ providerId: 'password' }],
};

// ── Protocol tests ────────────────────────────────────────────────────────────

describe('Protocol', () => {
    it('GET / health check returns status ok', async () => {
        const res = await worker.fetch(new Request('https://mcp-firebase.workers.dev/', { method: 'GET' }));
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.status).toBe('ok');
        expect(body.server).toBe('mcp-firebase');
        expect(body.tools).toBe(12);
    });

    it('initialize returns protocol info', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, {});
        expect(data.result.protocolVersion).toBe('2024-11-05');
        expect(data.result.serverInfo.name).toBe('mcp-firebase');
    });

    it('tools/list returns exactly 12 tools', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {});
        expect(data.result.tools).toHaveLength(12);
        const names = data.result.tools.map((t: any) => t.name);
        expect(names).toContain('get_document');
        expect(names).toContain('set_document');
        expect(names).toContain('query_collection');
        expect(names).toContain('list_documents');
        expect(names).toContain('list_users');
        expect(names).toContain('send_push_notification');
        expect(names).toContain('send_multicast_push');
    });

    it('unknown method returns -32601', async () => {
        const data = await rpc({ jsonrpc: '2.0', id: 2, method: 'unknown/method' }, {});
        expect(data.error.code).toBe(-32601);
    });

    it('parse error returns -32700', async () => {
        const res = await worker.fetch(new Request('https://mcp-firebase.workers.dev/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-json{',
        }));
        const data = await res.json() as any;
        expect(data.error.code).toBe(-32700);
    });

    it('non-POST non-GET returns 405', async () => {
        const res = await worker.fetch(new Request('https://mcp-firebase.workers.dev/', { method: 'DELETE' }));
        expect(res.status).toBe(405);
    });
});

// ── Auth tests ────────────────────────────────────────────────────────────────

describe('Auth', () => {
    it('missing FIREBASE_PROJECT_ID returns -32001', async () => {
        const data = await rpcTool('get_document', { collection: 'users', document_id: 'u1' }, {
            'X-Mcp-Secret-FIREBASE-SERVICE-ACCOUNT-KEY': FAKE_SERVICE_ACCOUNT,
        });
        expect(data.error.code).toBe(-32001);
        expect(data.error.message).toContain('FIREBASE_PROJECT_ID');
    });

    it('missing FIREBASE_SERVICE_ACCOUNT_KEY returns -32001', async () => {
        const data = await rpcTool('get_document', { collection: 'users', document_id: 'u1' }, {
            'X-Mcp-Secret-FIREBASE-PROJECT-ID': 'test-project',
        });
        expect(data.error.code).toBe(-32001);
        expect(data.error.message).toContain('FIREBASE_SERVICE_ACCOUNT_KEY');
    });
});

// ── Tool: get_document ────────────────────────────────────────────────────────

describe('Tool: get_document', () => {
    it('returns parsed document fields', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk(mockFirestoreDoc));

        const data = await rpcTool('get_document', { collection: 'users', document_id: 'user123' });
        expect(data.result.content[0].type).toBe('text');
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('user123');
        expect(result.fields.name).toBe('Alice');
        expect(result.fields.age).toBe(30);
        expect(result.fields.active).toBe(true);
    });

    it('calls correct Firestore URL', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk(mockFirestoreDoc));

        await rpcTool('get_document', { collection: 'users', document_id: 'user123' });

        // First call is OAuth token, second is the Firestore API call
        const [url] = mockFetch.mock.calls[1];
        expect(url).toContain('firestore.googleapis.com');
        expect(url).toContain('users/user123');
    });

    it('404 maps to -32603 not found error', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiErr(404, 'Document not found'));

        const data = await rpcTool('get_document', { collection: 'users', document_id: 'missing' });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('Not found');
    });
});

// ── Tool: set_document ────────────────────────────────────────────────────────

describe('Tool: set_document', () => {
    it('creates or overwrites document and returns parsed fields', async () => {
        mockOAuthToken();
        const updatedDoc = {
            ...mockFirestoreDoc,
            fields: {
                name: { stringValue: 'Charlie' },
                score: { doubleValue: 9.5 },
                tags: { arrayValue: { values: [{ stringValue: 'admin' }] } },
            },
        };
        mockFetch.mockResolvedValueOnce(apiOk(updatedDoc));

        const data = await rpcTool('set_document', {
            collection: 'users',
            document_id: 'user123',
            fields: { name: 'Charlie', score: 9.5, tags: ['admin'] },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('user123');
        expect(result.fields.name).toBe('Charlie');
        expect(result.fields.score).toBe(9.5);
        expect(result.fields.tags).toEqual(['admin']);
    });

    it('sends PATCH request with Firestore field format', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk(mockFirestoreDoc));

        await rpcTool('set_document', {
            collection: 'products',
            document_id: 'prod1',
            fields: { price: 29, available: true },
        });

        const [, opts] = mockFetch.mock.calls[1];
        expect(opts.method).toBe('PATCH');
        const body = JSON.parse(opts.body);
        expect(body.fields.price).toEqual({ integerValue: '29' });
        expect(body.fields.available).toEqual({ booleanValue: true });
    });
});

// ── Tool: update_document ─────────────────────────────────────────────────────

describe('Tool: update_document', () => {
    it('sends PATCH with updateMask query param', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk(mockFirestoreDoc));

        await rpcTool('update_document', {
            collection: 'users',
            document_id: 'user123',
            fields: { name: 'Updated Name' },
        });

        const [url] = mockFetch.mock.calls[1];
        expect(url).toContain('updateMask.fieldPaths');
        expect(url).toContain('name');
    });

    it('returns parsed updated document', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk(mockFirestoreDoc));

        const data = await rpcTool('update_document', {
            collection: 'users',
            document_id: 'user123',
            fields: { name: 'Alice' },
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.id).toBe('user123');
        expect(result.fields.name).toBe('Alice');
    });
});

// ── Tool: delete_document ─────────────────────────────────────────────────────

describe('Tool: delete_document', () => {
    it('returns success on 200 empty response', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const data = await rpcTool('delete_document', { collection: 'users', document_id: 'user123' });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.deleted).toBe('users/user123');
    });

    it('sends DELETE request to correct URL', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));

        await rpcTool('delete_document', { collection: 'orders', document_id: 'order456' });

        const [url, opts] = mockFetch.mock.calls[1];
        expect(opts.method).toBe('DELETE');
        expect(url).toContain('orders/order456');
    });
});

// ── Tool: query_collection ────────────────────────────────────────────────────

describe('Tool: query_collection', () => {
    it('queries and returns array of documents', async () => {
        mockOAuthToken();
        const queryResult = [
            { document: mockFirestoreDoc },
            { document: mockFirestoreDoc2 },
        ];
        mockFetch.mockResolvedValueOnce(apiOk(queryResult));

        const data = await rpcTool('query_collection', { collection: 'users', limit: 10 });
        const result = JSON.parse(data.result.content[0].text);
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('user123');
        expect(result[0].fields.name).toBe('Alice');
        expect(result[1].id).toBe('user456');
    });

    it('sends field filter when field/operator/value provided', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk([{ document: mockFirestoreDoc }]));

        await rpcTool('query_collection', {
            collection: 'users',
            field: 'active',
            operator: 'EQUAL',
            value: true,
        });

        const [, opts] = mockFetch.mock.calls[1];
        const body = JSON.parse(opts.body);
        expect(body.structuredQuery.where.fieldFilter.field.fieldPath).toBe('active');
        expect(body.structuredQuery.where.fieldFilter.op).toBe('EQUAL');
    });

    it('filters out results without a document field', async () => {
        mockOAuthToken();
        // Firestore runQuery can return rows without a `document` (e.g. skipped entries)
        mockFetch.mockResolvedValueOnce(apiOk([
            { document: mockFirestoreDoc },
            { skippedResults: 1 }, // no document field
        ]));

        const data = await rpcTool('query_collection', { collection: 'users' });
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(1);
    });
});

// ── Tool: list_documents ──────────────────────────────────────────────────────

describe('Tool: list_documents', () => {
    it('returns documents array and nextPageToken', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({
            documents: [mockFirestoreDoc, mockFirestoreDoc2],
            nextPageToken: 'tok123',
        }));

        const data = await rpcTool('list_documents', { collection: 'users', limit: 2 });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.documents).toHaveLength(2);
        expect(result.nextPageToken).toBe('tok123');
        expect(result.documents[0].id).toBe('user123');
    });

    it('returns null nextPageToken when no more pages', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({ documents: [mockFirestoreDoc] }));

        const data = await rpcTool('list_documents', { collection: 'users' });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.nextPageToken).toBeNull();
    });
});

// ── Tool: list_users ──────────────────────────────────────────────────────────

describe('Tool: list_users', () => {
    it('returns mapped user list', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({ userInfo: [mockAuthUser] }));

        const data = await rpcTool('list_users', {});
        const result = JSON.parse(data.result.content[0].text);
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].uid).toBe('uid123');
        expect(result[0].email).toBe('alice@example.com');
        expect(result[0].displayName).toBe('Alice Smith');
        expect(result[0].disabled).toBe(false);
        expect(result[0].emailVerified).toBe(true);
    });

    it('returns empty array when no users', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({}));

        const data = await rpcTool('list_users', {});
        const result = JSON.parse(data.result.content[0].text);
        expect(result).toHaveLength(0);
    });
});

// ── Tool: get_user ────────────────────────────────────────────────────────────

describe('Tool: get_user', () => {
    it('looks up user by uid', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({ users: [mockAuthUser] }));

        const data = await rpcTool('get_user', { uid: 'uid123' });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.uid).toBe('uid123');
        expect(result.email).toBe('alice@example.com');
        expect(result.providers).toContain('password');

        const [, opts] = mockFetch.mock.calls[1];
        const body = JSON.parse(opts.body);
        expect(body.localId).toEqual(['uid123']);
    });

    it('looks up user by email', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({ users: [mockAuthUser] }));

        const data = await rpcTool('get_user', { email: 'alice@example.com' });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.uid).toBe('uid123');

        const [, opts] = mockFetch.mock.calls[1];
        const body = JSON.parse(opts.body);
        expect(body.email).toEqual(['alice@example.com']);
    });

    it('returns error when neither uid nor email provided', async () => {
        mockOAuthToken();

        const data = await rpcTool('get_user', {});
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('uid or email');
    });

    it('returns error when user not found', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({ users: [] }));

        const data = await rpcTool('get_user', { uid: 'nonexistent' });
        expect(data.error.code).toBe(-32603);
        expect(data.error.message).toContain('not found');
    });
});

// ── Tool: create_user ─────────────────────────────────────────────────────────

describe('Tool: create_user', () => {
    it('creates user and returns uid', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({
            localId: 'newuid456',
            email: 'newuser@example.com',
            displayName: null,
            disabled: false,
        }));

        const data = await rpcTool('create_user', {
            email: 'newuser@example.com',
            password: 'secret123',
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.uid).toBe('newuid456');
        expect(result.email).toBe('newuser@example.com');
    });

    it('includes display_name in request when provided', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({
            localId: 'uid789',
            email: 'user@example.com',
            displayName: 'Test User',
        }));

        await rpcTool('create_user', {
            email: 'user@example.com',
            password: 'secret',
            display_name: 'Test User',
        });

        const [, opts] = mockFetch.mock.calls[1];
        const body = JSON.parse(opts.body);
        expect(body.displayName).toBe('Test User');
    });
});

// ── Tool: disable_user ────────────────────────────────────────────────────────

describe('Tool: disable_user', () => {
    it('disables user and returns action', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({
            localId: 'uid123',
            email: 'alice@example.com',
            disabled: true,
        }));

        const data = await rpcTool('disable_user', { uid: 'uid123', disabled: true });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.uid).toBe('uid123');
        expect(result.disabled).toBe(true);
        expect(result.action).toBe('disabled');
    });

    it('re-enables user when disabled=false', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({
            localId: 'uid123',
            email: 'alice@example.com',
            disabled: false,
        }));

        const data = await rpcTool('disable_user', { uid: 'uid123', disabled: false });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.action).toBe('re-enabled');
    });
});

// ── Tool: send_push_notification ──────────────────────────────────────────────

describe('Tool: send_push_notification', () => {
    it('sends notification and returns message name', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({ name: 'projects/test-project/messages/msg123' }));

        const data = await rpcTool('send_push_notification', {
            token: 'device-token-abc',
            title: 'Hello',
            body: 'World',
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.success).toBe(true);
        expect(result.messageName).toContain('messages/msg123');
        expect(result.token).toBe('device-token-abc');
    });

    it('includes image and data payload in FCM request', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({ name: 'projects/test-project/messages/msg456' }));

        await rpcTool('send_push_notification', {
            token: 'device-token-xyz',
            title: 'Sale',
            body: 'Check it out',
            image_url: 'https://example.com/image.png',
            data: { orderId: '123', type: 'promo' },
        });

        const [url, opts] = mockFetch.mock.calls[1];
        expect(url).toContain('fcm.googleapis.com');
        expect(url).toContain('messages:send');
        const body = JSON.parse(opts.body);
        expect(body.message.notification.image).toBe('https://example.com/image.png');
        expect(body.message.data.orderId).toBe('123');
    });
});

// ── Tool: send_multicast_push ─────────────────────────────────────────────────

describe('Tool: send_multicast_push', () => {
    it('sends to multiple tokens and returns aggregated results', async () => {
        mockOAuthToken();
        // One response per token (FCM v1 sends individually)
        mockFetch.mockResolvedValueOnce(apiOk({ name: 'projects/test-project/messages/m1' }));
        mockFetch.mockResolvedValueOnce(apiOk({ name: 'projects/test-project/messages/m2' }));

        const data = await rpcTool('send_multicast_push', {
            tokens: ['token-a', 'token-b'],
            title: 'Broadcast',
            body: 'Hello everyone',
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.total).toBe(2);
        expect(result.successCount).toBe(2);
        expect(result.failureCount).toBe(0);
        expect(result.results).toHaveLength(2);
        expect(result.results[0].success).toBe(true);
        expect(result.results[0].token).toBe('token-a');
    });

    it('captures per-token failures without throwing', async () => {
        mockOAuthToken();
        mockFetch.mockResolvedValueOnce(apiOk({ name: 'projects/test-project/messages/m1' }));
        mockFetch.mockResolvedValueOnce(apiErr(404, 'Registration token not registered'));

        const data = await rpcTool('send_multicast_push', {
            tokens: ['good-token', 'bad-token'],
            title: 'Test',
            body: 'Test body',
        });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.total).toBe(2);
        expect(result.successCount).toBe(1);
        expect(result.failureCount).toBe(1);
        const badResult = result.results.find((r: any) => r.token === 'bad-token');
        expect(badResult.success).toBe(false);
        expect(badResult.error).toBeDefined();
    });
});

// ── Firestore field conversion tests ─────────────────────────────────────────

describe('Firestore field conversion (integration)', () => {
    it('handles null, boolean, number, string, array, and nested object fields', async () => {
        mockOAuthToken();

        const complexDoc = {
            name: 'projects/test-project/databases/(default)/documents/items/item1',
            fields: {
                title: { stringValue: 'Widget' },
                count: { integerValue: '42' },
                price: { doubleValue: 9.99 },
                inStock: { booleanValue: true },
                deletedAt: { nullValue: null },
                tags: { arrayValue: { values: [{ stringValue: 'new' }, { stringValue: 'featured' }] } },
                meta: { mapValue: { fields: { source: { stringValue: 'import' } } } },
            },
            createTime: '2024-01-01T00:00:00Z',
            updateTime: '2024-01-01T00:00:00Z',
        };
        mockFetch.mockResolvedValueOnce(apiOk(complexDoc));

        const data = await rpcTool('get_document', { collection: 'items', document_id: 'item1' });
        const result = JSON.parse(data.result.content[0].text);
        expect(result.fields.title).toBe('Widget');
        expect(result.fields.count).toBe(42);
        expect(result.fields.price).toBe(9.99);
        expect(result.fields.inStock).toBe(true);
        expect(result.fields.deletedAt).toBeNull();
        expect(result.fields.tags).toEqual(['new', 'featured']);
        expect(result.fields.meta).toEqual({ source: 'import' });
    });
});

// ── E2E (skipped unless real credentials provided) ────────────────────────────

describe.skipIf(!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_SERVICE_ACCOUNT_KEY)('E2E', () => {
    it('health check works', async () => {
        const res = await worker.fetch(new Request('https://mcp-firebase.workers.dev/', { method: 'GET' }));
        expect(res.status).toBe(200);
    });
});
