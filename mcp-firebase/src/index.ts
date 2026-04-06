/**
 * Firebase MCP Worker
 * Implements MCP protocol over HTTP for Firebase operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   FIREBASE_PROJECT_ID         → header: X-Mcp-Secret-FIREBASE-PROJECT-ID
 *   FIREBASE_SERVICE_ACCOUNT_KEY → header: X-Mcp-Secret-FIREBASE-SERVICE-ACCOUNT-KEY
 *
 * APIs used:
 *   Firestore:        https://firestore.googleapis.com/v1/projects/{projectId}/databases/(default)/documents
 *   Firebase Auth:    https://identitytoolkit.googleapis.com/v1/projects/{projectId}
 *   FCM v1:           https://fcm.googleapis.com/v1/projects/{projectId}/messages:send
 */

// ── RPC helpers ───────────────────────────────────────────────────────────────

function rpcOk(id: number | string, result: unknown) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: { 'Content-Type': 'application/json' },
    });
}

function rpcErr(id: number | string | null, code: number, message: string) {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

// ── Tools definition ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Firebase credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    // ── Firestore ────────────────────────────────────────────────────────────
    {
        name: 'get_document',
        description: 'Get a Firestore document by collection and document ID. Returns parsed fields as a plain JS object.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'Firestore collection name (e.g. "users")' },
                document_id: { type: 'string', description: 'Document ID within the collection' },
            },
            required: ['collection', 'document_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'set_document',
        description: 'Create or overwrite a Firestore document. Completely replaces the document if it already exists.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'Firestore collection name' },
                document_id: { type: 'string', description: 'Document ID to create or overwrite' },
                fields: { type: 'object', description: 'Key-value pairs to store as document fields' },
            },
            required: ['collection', 'document_id', 'fields'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_document',
        description: 'Partially update specific fields of a Firestore document without overwriting other fields.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'Firestore collection name' },
                document_id: { type: 'string', description: 'Document ID to update' },
                fields: { type: 'object', description: 'Fields to update (only these fields are changed)' },
            },
            required: ['collection', 'document_id', 'fields'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_document',
        description: 'Delete a Firestore document by collection and document ID.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'Firestore collection name' },
                document_id: { type: 'string', description: 'Document ID to delete' },
            },
            required: ['collection', 'document_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'query_collection',
        description: 'Query documents in a Firestore collection with optional field filtering. Returns array of matching documents.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'Firestore collection name to query' },
                field: { type: 'string', description: 'Field name to filter on (optional)' },
                operator: {
                    type: 'string',
                    enum: ['EQUAL', 'LESS_THAN', 'GREATER_THAN', 'ARRAY_CONTAINS'],
                    description: 'Comparison operator for field filter (optional)',
                },
                value: { description: 'Value to compare against (optional, used with field and operator)' },
                limit: { type: 'number', description: 'Maximum documents to return (default 20)' },
            },
            required: ['collection'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_documents',
        description: 'List documents in a Firestore collection with pagination support.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'Firestore collection name' },
                limit: { type: 'number', description: 'Maximum documents to return (default 20)' },
                page_token: { type: 'string', description: 'Pagination token from previous response (optional)' },
            },
            required: ['collection'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Firebase Auth ─────────────────────────────────────────────────────────
    {
        name: 'list_users',
        description: 'List Firebase Auth users in the project. Returns uid, email, displayName, disabled, and createdAt.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Maximum users to return (default 20, max 500)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_user',
        description: 'Get a Firebase Auth user profile by UID or email address.',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Firebase user UID (provide uid or email, not both)' },
                email: { type: 'string', description: 'User email address (provide uid or email, not both)' },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_user',
        description: 'Create a new Firebase Auth user with email and password.',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Email address for the new user' },
                password: { type: 'string', description: 'Password for the new user (min 6 characters)' },
                display_name: { type: 'string', description: 'Display name for the user (optional)' },
                disabled: { type: 'boolean', description: 'Create user in disabled state (default false)' },
            },
            required: ['email', 'password'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'disable_user',
        description: 'Disable or re-enable a Firebase Auth user account by UID.',
        inputSchema: {
            type: 'object',
            properties: {
                uid: { type: 'string', description: 'Firebase user UID to update' },
                disabled: { type: 'boolean', description: 'Set to true to disable, false to re-enable' },
            },
            required: ['uid', 'disabled'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── FCM Push ──────────────────────────────────────────────────────────────
    {
        name: 'send_push_notification',
        description: 'Send a push notification to a single device via Firebase Cloud Messaging (FCM v1).',
        inputSchema: {
            type: 'object',
            properties: {
                token: { type: 'string', description: 'FCM device registration token' },
                title: { type: 'string', description: 'Notification title' },
                body: { type: 'string', description: 'Notification body text' },
                data: {
                    type: 'object',
                    description: 'Optional key-value string pairs to send as data payload',
                    additionalProperties: { type: 'string' },
                },
                image_url: { type: 'string', description: 'Optional image URL to show in the notification' },
            },
            required: ['token', 'title', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_multicast_push',
        description: 'Send a push notification to multiple devices (up to 500 tokens). Returns per-token success/failure results.',
        inputSchema: {
            type: 'object',
            properties: {
                tokens: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of FCM device registration tokens (max 500)',
                },
                title: { type: 'string', description: 'Notification title' },
                body: { type: 'string', description: 'Notification body text' },
                data: {
                    type: 'object',
                    description: 'Optional key-value string pairs to send as data payload',
                    additionalProperties: { type: 'string' },
                },
            },
            required: ['tokens', 'title', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── JWT / OAuth helpers ───────────────────────────────────────────────────────

/** Base64url encode a Uint8Array or ArrayBuffer */
function base64url(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let str = '';
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Strip PEM headers and decode base64 to ArrayBuffer */
function pemToArrayBuffer(pem: string): ArrayBuffer {
    const b64 = pem
        .replace(/-----BEGIN[^-]*-----/g, '')
        .replace(/-----END[^-]*-----/g, '')
        .replace(/\s+/g, '');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

interface ServiceAccountKey {
    client_email: string;
    private_key: string;
}

/**
 * Generate a Google OAuth 2.0 access token from a service account key JSON string.
 * Uses Web Crypto API for JWT signing (RS256) — works in Cloudflare Workers.
 */
export async function getAccessToken(serviceAccountKeyJson: string): Promise<string> {
    const sa: ServiceAccountKey = JSON.parse(serviceAccountKeyJson);
    const { client_email, private_key } = sa;

    // Import the RSA private key
    const keyBuffer = pemToArrayBuffer(private_key);
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        keyBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign'],
    );

    const now = Math.floor(Date.now() / 1000);

    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    };

    const enc = new TextEncoder();
    const headerB64 = base64url(enc.encode(JSON.stringify(header)));
    const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
    const signingInput = `${headerB64}.${payloadB64}`;

    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        enc.encode(signingInput),
    );

    const jwt = `${signingInput}.${base64url(signature)}`;

    // Exchange JWT for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });

    if (!tokenRes.ok) {
        const text = await tokenRes.text();
        throw new Error(`Failed to get access token: ${tokenRes.status} ${text}`);
    }

    const tokenData = await tokenRes.json() as { access_token: string };
    return tokenData.access_token;
}

// ── Firestore field conversion ────────────────────────────────────────────────

type FirestoreValue =
    | { stringValue: string }
    | { integerValue: string }
    | { doubleValue: number }
    | { booleanValue: boolean }
    | { nullValue: null }
    | { arrayValue: { values?: FirestoreValue[] } }
    | { mapValue: { fields?: Record<string, FirestoreValue> } };

/** Convert a plain JS value to Firestore REST API field value format */
function toFirestoreValue(value: unknown): FirestoreValue {
    if (value === null || value === undefined) {
        return { nullValue: null };
    }
    if (typeof value === 'boolean') {
        return { booleanValue: value };
    }
    if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            return { integerValue: String(value) };
        }
        return { doubleValue: value };
    }
    if (typeof value === 'string') {
        return { stringValue: value };
    }
    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map(toFirestoreValue) } };
    }
    if (typeof value === 'object') {
        const fields: Record<string, FirestoreValue> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            fields[k] = toFirestoreValue(v);
        }
        return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
}

/** Convert a plain JS object to Firestore REST API fields format */
function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(obj)) {
        fields[k] = toFirestoreValue(v);
    }
    return fields;
}

/** Convert a single Firestore REST API field value to a plain JS value */
function fromFirestoreValue(val: FirestoreValue): unknown {
    if ('nullValue' in val) return null;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return Number(val.integerValue);
    if ('doubleValue' in val) return val.doubleValue;
    if ('stringValue' in val) return val.stringValue;
    if ('arrayValue' in val) {
        return (val.arrayValue.values ?? []).map(fromFirestoreValue);
    }
    if ('mapValue' in val) {
        return fromFirestoreFields(val.mapValue.fields ?? {});
    }
    return null;
}

/** Convert Firestore REST API fields object to a plain JS object */
function fromFirestoreFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
        obj[k] = fromFirestoreValue(v);
    }
    return obj;
}

// ── Firebase API helper ───────────────────────────────────────────────────────

async function firebaseRequest(
    method: string,
    url: string,
    accessToken: string,
    body?: unknown,
    queryParams?: Record<string, string>,
): Promise<unknown> {
    let fullUrl = url;
    if (queryParams && Object.keys(queryParams).length > 0) {
        const params = new URLSearchParams(queryParams);
        fullUrl = `${url}?${params}`;
    }

    const opts: RequestInit = {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    };
    if (body !== undefined) {
        opts.body = JSON.stringify(body);
    }

    const res = await fetch(fullUrl, opts);

    // 200 with no body or 204
    if (res.status === 204) return { success: true };

    const text = await res.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Firebase HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        const errData = data as { error?: { message?: string; status?: string } };
        const msg = errData?.error?.message ?? text;
        const status = errData?.error?.status ?? '';
        if (res.status === 401 || res.status === 403) throw new Error(`Firebase auth error — check your service account key and project permissions: ${msg}`);
        if (res.status === 404) throw new Error(`Not found — ${msg}`);
        if (status === 'ALREADY_EXISTS') throw new Error(`Document already exists: ${msg}`);
        throw new Error(`Firebase API error ${res.status}: ${msg}`);
    }

    return data;
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    projectId: string,
    accessToken: string,
): Promise<unknown> {
    const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const authBase = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
    const fcmBase = `https://fcm.googleapis.com/v1/projects/${projectId}`;

    switch (name) {

        case '_ping': {
            const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases`, {
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            });
            if (!res.ok) throw new Error(`Firebase API ${res.status}: ${await res.text()}`);
            return { connected: true, project: projectId };
        }

        // ── Firestore ─────────────────────────────────────────────────────────

        case 'get_document': {
            const url = `${firestoreBase}/${args.collection}/${args.document_id}`;
            const data = await firebaseRequest('GET', url, accessToken) as {
                name: string;
                fields?: Record<string, FirestoreValue>;
                createTime?: string;
                updateTime?: string;
            };
            const docId = String(data.name).split('/').pop();
            return {
                id: docId,
                fields: fromFirestoreFields(data.fields ?? {}),
                createTime: data.createTime,
                updateTime: data.updateTime,
            };
        }

        case 'set_document': {
            const url = `${firestoreBase}/${args.collection}/${args.document_id}`;
            const fsFields = toFirestoreFields(args.fields as Record<string, unknown>);
            const data = await firebaseRequest('PATCH', url, accessToken, { fields: fsFields }) as {
                name: string;
                fields?: Record<string, FirestoreValue>;
                updateTime?: string;
            };
            const docId = String(data.name).split('/').pop();
            return {
                id: docId,
                fields: fromFirestoreFields(data.fields ?? {}),
                updateTime: data.updateTime,
            };
        }

        case 'update_document': {
            const fieldsObj = args.fields as Record<string, unknown>;
            const fieldPaths = Object.keys(fieldsObj);
            const url = `${firestoreBase}/${args.collection}/${args.document_id}`;
            const fsFields = toFirestoreFields(fieldsObj);
            const queryParams: Record<string, string> = {};
            fieldPaths.forEach((fp, i) => {
                queryParams[`updateMask.fieldPaths[${i}]`] = fp;
            });
            const data = await firebaseRequest('PATCH', url, accessToken, { fields: fsFields }, queryParams) as {
                name: string;
                fields?: Record<string, FirestoreValue>;
                updateTime?: string;
            };
            const docId = String(data.name).split('/').pop();
            return {
                id: docId,
                fields: fromFirestoreFields(data.fields ?? {}),
                updateTime: data.updateTime,
            };
        }

        case 'delete_document': {
            const url = `${firestoreBase}/${args.collection}/${args.document_id}`;
            await firebaseRequest('DELETE', url, accessToken);
            return { success: true, deleted: `${args.collection}/${args.document_id}` };
        }

        case 'query_collection': {
            const limit = Number(args.limit ?? 20);
            const url = `${firestoreBase}/${args.collection}:runQuery`;

            const structuredQuery: Record<string, unknown> = {
                from: [{ collectionId: args.collection }],
                limit,
            };

            if (args.field && args.operator) {
                const fieldValue = toFirestoreValue(args.value);
                structuredQuery.where = {
                    fieldFilter: {
                        field: { fieldPath: args.field },
                        op: args.operator,
                        value: fieldValue,
                    },
                };
            }

            const results = await firebaseRequest('POST', url, accessToken, { structuredQuery }) as Array<{
                document?: {
                    name: string;
                    fields?: Record<string, FirestoreValue>;
                    createTime?: string;
                    updateTime?: string;
                };
            }>;

            return results
                .filter((r) => r.document)
                .map((r) => {
                    const doc = r.document!;
                    return {
                        id: doc.name.split('/').pop(),
                        fields: fromFirestoreFields(doc.fields ?? {}),
                        createTime: doc.createTime,
                        updateTime: doc.updateTime,
                    };
                });
        }

        case 'list_documents': {
            const limit = Number(args.limit ?? 20);
            const queryParams: Record<string, string> = { pageSize: String(limit) };
            if (args.page_token) queryParams.pageToken = String(args.page_token);
            const url = `${firestoreBase}/${args.collection}`;
            const data = await firebaseRequest('GET', url, accessToken, undefined, queryParams) as {
                documents?: Array<{
                    name: string;
                    fields?: Record<string, FirestoreValue>;
                    createTime?: string;
                    updateTime?: string;
                }>;
                nextPageToken?: string;
            };
            const docs = (data.documents ?? []).map((doc) => ({
                id: doc.name.split('/').pop(),
                fields: fromFirestoreFields(doc.fields ?? {}),
                createTime: doc.createTime,
                updateTime: doc.updateTime,
            }));
            return {
                documents: docs,
                nextPageToken: data.nextPageToken ?? null,
            };
        }

        // ── Firebase Auth ─────────────────────────────────────────────────────

        case 'list_users': {
            const limit = Math.min(Number(args.limit ?? 20), 500);
            const url = `${authBase}/accounts:query`;
            const data = await firebaseRequest('POST', url, accessToken, {
                returnUserInfo: true,
                limit,
            }) as {
                userInfo?: Array<{
                    localId: string;
                    email?: string;
                    displayName?: string;
                    disabled?: boolean;
                    createdAt?: string;
                    emailVerified?: boolean;
                }>;
            };
            return (data.userInfo ?? []).map((u) => ({
                uid: u.localId,
                email: u.email ?? null,
                displayName: u.displayName ?? null,
                disabled: u.disabled ?? false,
                emailVerified: u.emailVerified ?? false,
                createdAt: u.createdAt ? new Date(Number(u.createdAt)).toISOString() : null,
            }));
        }

        case 'get_user': {
            if (!args.uid && !args.email) {
                throw new Error('Provide either uid or email to look up a user');
            }
            const url = `${authBase}/accounts:lookup`;
            const payload: Record<string, unknown> = {};
            if (args.uid) payload.localId = [args.uid];
            else if (args.email) payload.email = [args.email];

            const data = await firebaseRequest('POST', url, accessToken, payload) as {
                users?: Array<{
                    localId: string;
                    email?: string;
                    displayName?: string;
                    disabled?: boolean;
                    createdAt?: string;
                    emailVerified?: boolean;
                    lastLoginAt?: string;
                    photoUrl?: string;
                    providerUserInfo?: Array<{ providerId: string }>;
                }>;
            };
            if (!data.users || data.users.length === 0) {
                throw new Error('User not found');
            }
            const u = data.users[0];
            return {
                uid: u.localId,
                email: u.email ?? null,
                displayName: u.displayName ?? null,
                disabled: u.disabled ?? false,
                emailVerified: u.emailVerified ?? false,
                photoUrl: u.photoUrl ?? null,
                createdAt: u.createdAt ? new Date(Number(u.createdAt)).toISOString() : null,
                lastLoginAt: u.lastLoginAt ? new Date(Number(u.lastLoginAt)).toISOString() : null,
                providers: (u.providerUserInfo ?? []).map((p) => p.providerId),
            };
        }

        case 'create_user': {
            const url = `${authBase}/accounts`;
            const payload: Record<string, unknown> = {
                email: args.email,
                password: args.password,
                disabled: args.disabled ?? false,
            };
            if (args.display_name) payload.displayName = args.display_name;

            const data = await firebaseRequest('POST', url, accessToken, payload) as {
                localId: string;
                email?: string;
                displayName?: string;
                disabled?: boolean;
            };
            return {
                uid: data.localId,
                email: data.email ?? args.email,
                displayName: data.displayName ?? null,
                disabled: data.disabled ?? false,
            };
        }

        case 'disable_user': {
            const url = `${authBase}/accounts:update`;
            const data = await firebaseRequest('POST', url, accessToken, {
                localId: args.uid,
                disableUser: args.disabled,
            }) as {
                localId: string;
                email?: string;
                disabled?: boolean;
            };
            return {
                uid: data.localId,
                email: data.email ?? null,
                disabled: data.disabled ?? args.disabled,
                action: args.disabled ? 'disabled' : 're-enabled',
            };
        }

        // ── FCM Push ──────────────────────────────────────────────────────────

        case 'send_push_notification': {
            const url = `${fcmBase}/messages:send`;
            const notification: Record<string, unknown> = {
                title: args.title,
                body: args.body,
            };
            if (args.image_url) notification.image = args.image_url;

            const message: Record<string, unknown> = {
                token: args.token,
                notification,
            };
            if (args.data) message.data = args.data;

            const data = await firebaseRequest('POST', url, accessToken, { message }) as { name: string };
            return {
                success: true,
                messageName: data.name,
                token: args.token,
            };
        }

        case 'send_multicast_push': {
            const tokens = args.tokens as string[];
            const url = `${fcmBase}/messages:send`;

            const notification: Record<string, unknown> = {
                title: args.title,
                body: args.body,
            };

            const results = await Promise.all(
                tokens.map(async (token) => {
                    const message: Record<string, unknown> = {
                        token,
                        notification,
                    };
                    if (args.data) message.data = args.data;

                    try {
                        const data = await firebaseRequest('POST', url, accessToken, { message }) as { name: string };
                        return { token, success: true, messageId: data.name };
                    } catch (e: unknown) {
                        const err = e instanceof Error ? e.message : 'Unknown error';
                        return { token, success: false, error: err };
                    }
                }),
            );

            const successCount = results.filter((r) => r.success).length;
            return {
                total: tokens.length,
                successCount,
                failureCount: tokens.length - successCount,
                results,
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Worker entry ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-firebase', version: '1.0.0', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: number | string; method: string; params?: Record<string, unknown> };
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-firebase', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

            const projectId = request.headers.get('X-Mcp-Secret-FIREBASE-PROJECT-ID');
            if (!projectId) {
                return rpcErr(id, -32001, 'Missing FIREBASE_PROJECT_ID — add your Firebase project ID to workspace secrets');
            }

            const serviceAccountKeyJson = request.headers.get('X-Mcp-Secret-FIREBASE-SERVICE-ACCOUNT-KEY');
            if (!serviceAccountKeyJson) {
                return rpcErr(id, -32001, 'Missing FIREBASE_SERVICE_ACCOUNT_KEY — add your Firebase service account key JSON to workspace secrets');
            }

            try {
                const accessToken = await getAccessToken(serviceAccountKeyJson);
                const result = await callTool(toolName, toolArgs, projectId, accessToken);
                return rpcOk(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                });
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
