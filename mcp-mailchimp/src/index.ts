/**
 * Mailchimp MCP Worker
 * Implements MCP protocol over HTTP for Mailchimp Marketing API v3.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   MAILCHIMP_API_KEY       → X-Mcp-Secret-MAILCHIMP-API-KEY       (full API key like "abc123-us6")
 *   MAILCHIMP_SERVER_PREFIX → X-Mcp-Secret-MAILCHIMP-SERVER-PREFIX  (optional, e.g. "us6" — extracted from key if absent)
 *
 * Auth format: Basic btoa("anystring:{api_key}")
 * — Mailchimp accepts any username; password is the API key.
 *
 * Covers: Audiences (4), Members (5), Campaigns (4), Tags (2) = 15 tools total
 */

// ── Pure-JS MD5 ───────────────────────────────────────────────────────────────

function md5(input: string): string {
    function safeAdd(x: number, y: number): number {
        const lsw = (x & 0xffff) + (y & 0xffff);
        const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xffff);
    }
    function bitRotateLeft(num: number, cnt: number): number {
        return (num << cnt) | (num >>> (32 - cnt));
    }
    function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
        return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
    }
    function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
        return md5cmn((b & c) | (~b & d), a, b, x, s, t);
    }
    function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
        return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
    }
    function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
        return md5cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
        return md5cmn(c ^ (b | ~d), a, b, x, s, t);
    }
    function ucs2decode(str: string): number[] {
        const output: number[] = [];
        let i = 0;
        while (i < str.length) {
            const value = str.charCodeAt(i++);
            if (value >= 0xd800 && value <= 0xdbff && i < str.length) {
                const extra = str.charCodeAt(i++);
                if ((extra & 0xfc00) === 0xdc00) {
                    output.push(((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000);
                } else {
                    output.push(value);
                    i--;
                }
            } else {
                output.push(value);
            }
        }
        return output;
    }
    function utf8Encode(str: string): number[] {
        const output: number[] = [];
        for (const cp of ucs2decode(str)) {
            if (cp < 128) {
                output.push(cp);
            } else if (cp < 2048) {
                output.push((cp >> 6) | 192);
                output.push((cp & 63) | 128);
            } else if (cp < 55296 || (cp >= 57344 && cp < 65536)) {
                output.push((cp >> 12) | 224);
                output.push(((cp >> 6) & 63) | 128);
                output.push((cp & 63) | 128);
            } else {
                output.push((cp >> 18) | 240);
                output.push(((cp >> 12) & 63) | 128);
                output.push(((cp >> 6) & 63) | 128);
                output.push((cp & 63) | 128);
            }
        }
        return output;
    }
    function wordsToMd5(
        m: number[], l: number,
        a: number, b: number, c: number, d: number,
    ): number[] {
        m[l >> 5] |= 0x80 << (l % 32);
        m[(((l + 64) >>> 9) << 4) + 14] = l;
        let aa = a; let bb = b; let cc = c; let dd = d;
        for (let i = 0; i < m.length; i += 16) {
            const oA = aa; const oB = bb; const oC = cc; const oD = dd;
            aa = md5ff(aa, bb, cc, dd, m[i],      7,  -680876936); dd = md5ff(dd, aa, bb, cc, m[i+1],  12, -389564586);
            cc = md5ff(cc, dd, aa, bb, m[i+2],   17,  606105819);  bb = md5ff(bb, cc, dd, aa, m[i+3],  22, -1044525330);
            aa = md5ff(aa, bb, cc, dd, m[i+4],    7,  -176418897); dd = md5ff(dd, aa, bb, cc, m[i+5],  12,  1200080426);
            cc = md5ff(cc, dd, aa, bb, m[i+6],   17, -1473231341); bb = md5ff(bb, cc, dd, aa, m[i+7],  22,  -45705983);
            aa = md5ff(aa, bb, cc, dd, m[i+8],    7,  1770035416); dd = md5ff(dd, aa, bb, cc, m[i+9],  12, -1958414417);
            cc = md5ff(cc, dd, aa, bb, m[i+10],  17,       -42063); bb = md5ff(bb, cc, dd, aa, m[i+11], 22, -1990404162);
            aa = md5ff(aa, bb, cc, dd, m[i+12],   7,  1804603682); dd = md5ff(dd, aa, bb, cc, m[i+13], 12,   -40341101);
            cc = md5ff(cc, dd, aa, bb, m[i+14],  17, -1502002290); bb = md5ff(bb, cc, dd, aa, m[i+15], 22,  1236535329);
            aa = md5gg(aa, bb, cc, dd, m[i+1],    5,  -165796510); dd = md5gg(dd, aa, bb, cc, m[i+6],   9, -1069501632);
            cc = md5gg(cc, dd, aa, bb, m[i+11],  14,   643717713); bb = md5gg(bb, cc, dd, aa, m[i],    20,  -373897302);
            aa = md5gg(aa, bb, cc, dd, m[i+5],    5,  -701558691); dd = md5gg(dd, aa, bb, cc, m[i+10],  9,   38016083);
            cc = md5gg(cc, dd, aa, bb, m[i+15],  14,  -660478335); bb = md5gg(bb, cc, dd, aa, m[i+4],  20,  -405537848);
            aa = md5gg(aa, bb, cc, dd, m[i+9],    5,   568446438); dd = md5gg(dd, aa, bb, cc, m[i+14],  9, -1019803690);
            cc = md5gg(cc, dd, aa, bb, m[i+3],   14,  -187363961); bb = md5gg(bb, cc, dd, aa, m[i+8],  20,  1163531501);
            aa = md5gg(aa, bb, cc, dd, m[i+13],   5, -1444681467); dd = md5gg(dd, aa, bb, cc, m[i+2],   9,  -51403784);
            cc = md5gg(cc, dd, aa, bb, m[i+7],   14,  1735328473); bb = md5gg(bb, cc, dd, aa, m[i+12], 20, -1926607734);
            aa = md5hh(aa, bb, cc, dd, m[i+5],    4,    -378558); dd = md5hh(dd, aa, bb, cc, m[i+8],  11, -2022574463);
            cc = md5hh(cc, dd, aa, bb, m[i+11],  16,  1839030562); bb = md5hh(bb, cc, dd, aa, m[i+14], 23,  -35309556);
            aa = md5hh(aa, bb, cc, dd, m[i+1],    4, -1530992060); dd = md5hh(dd, aa, bb, cc, m[i+4],  11,  1272893353);
            cc = md5hh(cc, dd, aa, bb, m[i+7],   16,  -155497632); bb = md5hh(bb, cc, dd, aa, m[i+10], 23, -1094730640);
            aa = md5hh(aa, bb, cc, dd, m[i+13],   4,   681279174); dd = md5hh(dd, aa, bb, cc, m[i],    11,  -358537222);
            cc = md5hh(cc, dd, aa, bb, m[i+3],   16,  -722521979); bb = md5hh(bb, cc, dd, aa, m[i+6],  23,   76029189);
            aa = md5hh(aa, bb, cc, dd, m[i+9],    4,  -640364487); dd = md5hh(dd, aa, bb, cc, m[i+12], 11,  -421815835);
            cc = md5hh(cc, dd, aa, bb, m[i+15],  16,   530742520); bb = md5hh(bb, cc, dd, aa, m[i+2],  23,  -995338651);
            aa = md5ii(aa, bb, cc, dd, m[i],      6,  -198630844); dd = md5ii(dd, aa, bb, cc, m[i+7],  10,  1126891415);
            cc = md5ii(cc, dd, aa, bb, m[i+14],  15, -1416354905); bb = md5ii(bb, cc, dd, aa, m[i+5],  21,  -57434055);
            aa = md5ii(aa, bb, cc, dd, m[i+12],   6,  1700485571); dd = md5ii(dd, aa, bb, cc, m[i+3],  10, -1894986606);
            cc = md5ii(cc, dd, aa, bb, m[i+10],  15,    -1051523); bb = md5ii(bb, cc, dd, aa, m[i+1],  21, -2054922799);
            aa = md5ii(aa, bb, cc, dd, m[i+8],    6,  1873313359); dd = md5ii(dd, aa, bb, cc, m[i+15], 10,  -30611744);
            cc = md5ii(cc, dd, aa, bb, m[i+6],   15, -1560198380); bb = md5ii(bb, cc, dd, aa, m[i+13], 21,  1309151649);
            aa = md5ii(aa, bb, cc, dd, m[i+4],    6,  -145523070); dd = md5ii(dd, aa, bb, cc, m[i+11], 10, -1120210379);
            cc = md5ii(cc, dd, aa, bb, m[i+2],   15,   718787259); bb = md5ii(bb, cc, dd, aa, m[i+9],  21,  -343485551);
            aa = safeAdd(aa, oA); bb = safeAdd(bb, oB);
            cc = safeAdd(cc, oC); dd = safeAdd(dd, oD);
        }
        return [aa, bb, cc, dd];
    }
    function bytesToWords(bytes: number[]): number[] {
        const words: number[] = [];
        for (let i = 0; i < bytes.length; i++) {
            words[i >> 2] |= bytes[i] << ((i % 4) * 8);
        }
        return words;
    }
    function wordsToHex(words: number[]): string {
        let hex = '';
        for (let i = 0; i < words.length * 4; i++) {
            hex += ('0' + ((words[i >> 2] >> ((i % 4) * 8)) & 0xff).toString(16)).slice(-2);
        }
        return hex;
    }
    const bytes = utf8Encode(input);
    const words = bytesToWords(bytes);
    const [a, b, c, d] = wordsToMd5(words, bytes.length * 8, 1732584193, -271733879, -1732584194, 271733878);
    return wordsToHex([a, b, c, d]);
}

function subscriberHash(email: string): string {
    return md5(email.toLowerCase().trim());
}

// ── TypeScript interfaces ─────────────────────────────────────────────────────

interface MCList {
    id: string; name: string; status: string;
    stats: { member_count: number; unsubscribe_count: number; open_rate: number; click_rate: number };
    date_created: string; list_rating: number;
    contact: { company: string; address1: string; city: string; state: string; zip: string; country: string };
    campaign_defaults: { from_name: string; from_email: string; subject: string; language: string };
    permission_reminder: string; email_type_option: boolean;
}

interface MCMember {
    id: string; email_address: string; unique_email_id: string;
    status: string; merge_fields: Record<string, unknown>;
    tags: Array<{ id: number; name: string }>;
    list_id: string; timestamp_signup: string; last_changed: string;
    stats: { avg_open_rate: number; avg_click_rate: number };
}

interface MCCampaign {
    id: string; type: string; status: string; emails_sent: number;
    send_time: string; content_type: string;
    recipients: { list_id: string; list_name: string; recipient_count: number };
    settings: {
        subject_line: string; preview_text: string; title: string;
        from_name: string; reply_to: string; use_conversation: boolean;
    };
    tracking: { opens: boolean; html_clicks: boolean; text_clicks: boolean };
    report_summary?: {
        opens: number; unique_opens: number; open_rate: number;
        clicks: number; unique_clicks: number; click_rate: number;
        subscriber_clicks: number;
    };
    create_time: string; archive_url: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function toolOk(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

function getServerPrefix(apiKey: string, serverPrefix?: string | null): string {
    if (serverPrefix) return serverPrefix;
    const parts = apiKey.split('-');
    return parts[parts.length - 1] || 'us1';
}

function getBaseUrl(apiKey: string, serverPrefix?: string | null): string {
    const server = getServerPrefix(apiKey, serverPrefix);
    return `https://${server}.api.mailchimp.com/3.0`;
}

async function mcApi(
    path: string,
    authHeader: string,
    baseUrl: string,
    method = 'GET',
    body?: unknown,
): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Handle 204 No Content
    if (res.status === 204) {
        return null;
    }

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
        data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        throw new Error(`Mailchimp HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
        // Mailchimp error shape: { title, status, detail, instance }
        const title = typeof data.title === 'string' ? data.title : '';
        const detail = typeof data.detail === 'string' ? data.detail : '';
        const errors = Array.isArray(data.errors)
            ? (data.errors as Array<{ field: string; message: string }>)
                .map(e => `${e.field}: ${e.message}`)
                .join('; ')
            : '';
        const fullDetail = [detail, errors].filter(Boolean).join(' — ');

        switch (res.status) {
            case 401:
                throw new Error(
                    'Authentication failed — verify MAILCHIMP_API_KEY is correct. The API key should look like "abc123-us6".',
                );
            case 403:
                throw new Error(
                    'Permission denied — your Mailchimp account lacks access to this resource',
                );
            case 404:
                throw new Error(
                    `Not found — check that the ID is correct: ${fullDetail || title}`,
                );
            case 422:
                throw new Error(`Validation error: ${fullDetail || title}`);
            case 429:
                throw new Error(
                    'Rate limited — Mailchimp allows 10 concurrent connections. Please retry after a moment.',
                );
            default:
                throw new Error(`Mailchimp HTTP ${res.status}: ${fullDetail || title || text}`);
        }
    }

    return data;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    // ── Group 1 — Audiences / Lists (4 tools) ────────────────────────────────

    {
        name: 'list_audiences',
        description: 'List all Mailchimp audiences (lists) in the account. Returns audience name, subscriber counts, open/click rates, and campaign defaults.',
        inputSchema: {
            type: 'object',
            properties: {
                count: {
                    type: 'number',
                    description: 'Number of audiences to return (default 20, max 1000)',
                },
                offset: {
                    type: 'number',
                    description: 'Pagination offset (default 0)',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_audience',
        description: 'Get full details of a specific Mailchimp audience (list) — subscriber count, contact info, campaign defaults, stats.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Mailchimp list/audience ID (e.g. "abc123def")',
                },
            },
            required: ['list_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_audience',
        description: 'Create a new Mailchimp audience (mailing list). Requires contact information and campaign defaults for compliance.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'The name of the audience (e.g. "Newsletter subscribers")',
                },
                permission_reminder: {
                    type: 'string',
                    description: 'Opt-in reminder for subscribers (e.g. "You signed up on our website")',
                },
                email_type_option: {
                    type: 'boolean',
                    description: 'Whether to allow subscribers to choose email format (HTML or text). Default false.',
                },
                contact_company: {
                    type: 'string',
                    description: 'Company name for the list contact (required by Mailchimp CAN-SPAM)',
                },
                contact_address1: {
                    type: 'string',
                    description: 'Street address for the list contact',
                },
                contact_city: {
                    type: 'string',
                    description: 'City for the list contact',
                },
                contact_state: {
                    type: 'string',
                    description: 'State/province for the list contact (2-letter code for US)',
                },
                contact_zip: {
                    type: 'string',
                    description: 'ZIP/postal code for the list contact',
                },
                contact_country: {
                    type: 'string',
                    description: '2-letter ISO country code for the list contact (e.g. "US")',
                },
                from_name: {
                    type: 'string',
                    description: 'Default "From Name" for campaigns sent to this list',
                },
                from_email: {
                    type: 'string',
                    description: 'Default "From Email" for campaigns sent to this list',
                },
                subject: {
                    type: 'string',
                    description: 'Default subject line for campaigns',
                },
                language: {
                    type: 'string',
                    description: 'Default language for this audience (e.g. "en")',
                },
            },
            required: ['name', 'permission_reminder', 'contact_company', 'contact_address1', 'contact_city', 'contact_state', 'contact_zip', 'contact_country', 'from_name', 'from_email', 'subject', 'language'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_audience_stats',
        description: 'Get growth history and statistics for a Mailchimp audience — subscriber gains/losses per month.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Mailchimp list/audience ID',
                },
                count: {
                    type: 'number',
                    description: 'Number of growth history months to return (default 12)',
                },
            },
            required: ['list_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // ── Group 2 — Members / Subscribers (5 tools) ────────────────────────────

    {
        name: 'list_members',
        description: 'List members of a Mailchimp audience with optional status filter. Returns email, status, merge fields, and tags.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Mailchimp list/audience ID',
                },
                count: {
                    type: 'number',
                    description: 'Number of members to return (default 20, max 1000)',
                },
                offset: {
                    type: 'number',
                    description: 'Pagination offset (default 0)',
                },
                status: {
                    type: 'string',
                    enum: ['subscribed', 'unsubscribed', 'cleaned', 'pending', 'transactional'],
                    description: 'Filter by member status (default: subscribed)',
                },
            },
            required: ['list_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_member',
        description: 'Get details for a specific subscriber by email address. Returns status, merge fields, tags, and engagement stats.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Mailchimp list/audience ID',
                },
                email: {
                    type: 'string',
                    description: 'Subscriber email address (MD5 hash computed automatically)',
                },
            },
            required: ['list_id', 'email'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_member',
        description: 'Add or update a subscriber in a Mailchimp audience. Uses PUT (upsert) — creates if new, updates if existing.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Mailchimp list/audience ID',
                },
                email: {
                    type: 'string',
                    description: 'Subscriber email address',
                },
                status: {
                    type: 'string',
                    enum: ['subscribed', 'pending'],
                    description: 'Subscription status. "subscribed" = confirmed opt-in, "pending" = sends confirmation email',
                },
                merge_fields: {
                    type: 'object',
                    description: 'Merge field values (e.g. { "FNAME": "John", "LNAME": "Doe" })',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags to apply to this member (e.g. ["customer", "vip"])',
                },
            },
            required: ['list_id', 'email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'update_member',
        description: 'Update an existing subscriber in a Mailchimp audience — change status, merge fields, or other attributes.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Mailchimp list/audience ID',
                },
                email: {
                    type: 'string',
                    description: 'Subscriber email address',
                },
                status: {
                    type: 'string',
                    enum: ['subscribed', 'unsubscribed', 'cleaned', 'pending'],
                    description: 'New subscription status',
                },
                merge_fields: {
                    type: 'object',
                    description: 'Merge field values to update (e.g. { "FNAME": "Jane" })',
                },
            },
            required: ['list_id', 'email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'unsubscribe_member',
        description: 'Unsubscribe a member from a Mailchimp audience. Sets their status to "unsubscribed" — they will no longer receive campaigns.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Mailchimp list/audience ID',
                },
                email: {
                    type: 'string',
                    description: 'Subscriber email address to unsubscribe',
                },
            },
            required: ['list_id', 'email'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // ── Group 3 — Campaigns (4 tools) ────────────────────────────────────────

    {
        name: 'list_campaigns',
        description: 'List Mailchimp campaigns with optional status and audience filters. Returns campaign settings, status, send time, and report summary.',
        inputSchema: {
            type: 'object',
            properties: {
                count: {
                    type: 'number',
                    description: 'Number of campaigns to return (default 20)',
                },
                status: {
                    type: 'string',
                    enum: ['save', 'paused', 'schedule', 'sending', 'sent'],
                    description: 'Filter by campaign status',
                },
                list_id: {
                    type: 'string',
                    description: 'Filter campaigns by audience/list ID',
                },
            },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_campaign',
        description: 'Get full details of a specific Mailchimp campaign — settings, status, recipients, tracking options, and report summary.',
        inputSchema: {
            type: 'object',
            properties: {
                campaign_id: {
                    type: 'string',
                    description: 'Mailchimp campaign ID (e.g. "abc123def")',
                },
            },
            required: ['campaign_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_campaign',
        description: 'Create a new Mailchimp campaign. Use type "regular" for standard HTML campaigns, "plaintext" for text-only, "rss" for RSS-based.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['regular', 'plaintext', 'rss'],
                    description: 'Campaign type: regular=HTML email, plaintext=text only, rss=RSS-driven content',
                },
                list_id: {
                    type: 'string',
                    description: 'Audience/list ID to send the campaign to',
                },
                subject_line: {
                    type: 'string',
                    description: 'Campaign subject line (visible in inbox)',
                },
                from_name: {
                    type: 'string',
                    description: '"From" name shown to recipients',
                },
                reply_to: {
                    type: 'string',
                    description: 'Reply-to email address',
                },
                title: {
                    type: 'string',
                    description: 'Internal campaign title (for your reference only, not shown to recipients)',
                },
            },
            required: ['type', 'list_id', 'subject_line', 'from_name', 'reply_to'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_campaign',
        description: 'Send a ready Mailchimp campaign immediately. The campaign must have content set and be in a sendable state. This action is irreversible.',
        inputSchema: {
            type: 'object',
            properties: {
                campaign_id: {
                    type: 'string',
                    description: 'Mailchimp campaign ID to send',
                },
            },
            required: ['campaign_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // ── Group 4 — Tags (2 tools) ──────────────────────────────────────────────

    {
        name: 'list_tags',
        description: 'List tags for a Mailchimp audience with optional name filter. Returns tag names and subscriber counts.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Mailchimp list/audience ID',
                },
                name: {
                    type: 'string',
                    description: 'Filter tags by name (partial match)',
                },
                count: {
                    type: 'number',
                    description: 'Number of tags to return (default 20)',
                },
            },
            required: ['list_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'add_tags_to_member',
        description: 'Add or remove tags for a specific subscriber. Use status "active" to add a tag, "inactive" to remove it.',
        inputSchema: {
            type: 'object',
            properties: {
                list_id: {
                    type: 'string',
                    description: 'Mailchimp list/audience ID',
                },
                email: {
                    type: 'string',
                    description: 'Subscriber email address',
                },
                tags: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Tag name' },
                            status: {
                                type: 'string',
                                enum: ['active', 'inactive'],
                                description: '"active" adds the tag, "inactive" removes it',
                            },
                        },
                        required: ['name', 'status'],
                    },
                    description: 'Tags to add or remove (e.g. [{ name: "vip", status: "active" }])',
                },
            },
            required: ['list_id', 'email', 'tags'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    authHeader: string,
    baseUrl: string,
): Promise<unknown> {
    switch (name) {

        // ── Audiences / Lists ─────────────────────────────────────────────────

        case 'list_audiences': {
            const count = (args.count as number) ?? 20;
            const offset = (args.offset as number) ?? 0;
            const data = await mcApi(
                `/lists?count=${count}&offset=${offset}`,
                authHeader, baseUrl,
            ) as { lists: MCList[]; total_items: number };
            return {
                total: data.total_items ?? 0,
                audiences: (data.lists ?? []).map(l => ({
                    id: l.id,
                    name: l.name,
                    status: l.status,
                    member_count: l.stats?.member_count,
                    unsubscribe_count: l.stats?.unsubscribe_count,
                    open_rate: l.stats?.open_rate,
                    click_rate: l.stats?.click_rate,
                    date_created: l.date_created,
                })),
            };
        }

        case 'get_audience': {
            validateRequired(args, ['list_id']);
            const data = await mcApi(
                `/lists/${args.list_id as string}`,
                authHeader, baseUrl,
            ) as MCList;
            return {
                id: data.id,
                name: data.name,
                status: data.status,
                stats: data.stats,
                contact: data.contact,
                campaign_defaults: data.campaign_defaults,
                permission_reminder: data.permission_reminder,
                email_type_option: data.email_type_option,
                date_created: data.date_created,
                list_rating: data.list_rating,
            };
        }

        case 'create_audience': {
            validateRequired(args, ['name', 'permission_reminder', 'contact_company', 'contact_address1', 'contact_city', 'contact_state', 'contact_zip', 'contact_country', 'from_name', 'from_email', 'subject', 'language']);
            const body = {
                name: args.name,
                permission_reminder: args.permission_reminder,
                email_type_option: (args.email_type_option as boolean) ?? false,
                contact: {
                    company: args.contact_company,
                    address1: args.contact_address1,
                    city: args.contact_city,
                    state: args.contact_state,
                    zip: args.contact_zip,
                    country: args.contact_country,
                },
                campaign_defaults: {
                    from_name: args.from_name,
                    from_email: args.from_email,
                    subject: args.subject,
                    language: args.language,
                },
            };
            const data = await mcApi('/lists', authHeader, baseUrl, 'POST', body) as MCList;
            return {
                list_id: data.id,
                name: data.name,
                date_created: data.date_created,
            };
        }

        case 'get_audience_stats': {
            validateRequired(args, ['list_id']);
            const count = (args.count as number) ?? 12;
            const data = await mcApi(
                `/lists/${args.list_id as string}/growth-history?count=${count}`,
                authHeader, baseUrl,
            ) as {
                history: Array<{
                    month: string;
                    existing: number;
                    imports: number;
                    optins: number;
                }>;
                total_items: number;
            };
            return {
                list_id: args.list_id,
                total_months: data.total_items ?? 0,
                history: data.history ?? [],
            };
        }

        // ── Members / Subscribers ─────────────────────────────────────────────

        case 'list_members': {
            validateRequired(args, ['list_id']);
            const count = (args.count as number) ?? 20;
            const offset = (args.offset as number) ?? 0;
            const status = (args.status as string) ?? 'subscribed';
            const data = await mcApi(
                `/lists/${args.list_id as string}/members?count=${count}&offset=${offset}&status=${status}`,
                authHeader, baseUrl,
            ) as { members: MCMember[]; total_items: number };
            return {
                total: data.total_items ?? 0,
                members: (data.members ?? []).map(m => ({
                    id: m.id,
                    email_address: m.email_address,
                    status: m.status,
                    merge_fields: m.merge_fields,
                    tags: m.tags,
                    last_changed: m.last_changed,
                    stats: m.stats,
                })),
            };
        }

        case 'get_member': {
            validateRequired(args, ['list_id', 'email']);
            const hash = subscriberHash(args.email as string);
            const data = await mcApi(
                `/lists/${args.list_id as string}/members/${hash}`,
                authHeader, baseUrl,
            ) as MCMember;
            return {
                id: data.id,
                email_address: data.email_address,
                status: data.status,
                merge_fields: data.merge_fields,
                tags: data.tags,
                list_id: data.list_id,
                timestamp_signup: data.timestamp_signup,
                last_changed: data.last_changed,
                stats: data.stats,
            };
        }

        case 'add_member': {
            validateRequired(args, ['list_id', 'email']);
            const hash = subscriberHash(args.email as string);
            const body: Record<string, unknown> = {
                email_address: args.email,
                status: (args.status as string) ?? 'subscribed',
            };
            if (args.merge_fields) body.merge_fields = args.merge_fields;
            if (args.tags) {
                body.tags = (args.tags as string[]).map(t => ({ name: t, status: 'active' }));
            }

            const data = await mcApi(
                `/lists/${args.list_id as string}/members/${hash}`,
                authHeader, baseUrl, 'PUT', body,
            ) as MCMember;
            return {
                id: data.id,
                email_address: data.email_address,
                status: data.status,
                list_id: data.list_id,
                last_changed: data.last_changed,
            };
        }

        case 'update_member': {
            validateRequired(args, ['list_id', 'email']);
            const hash = subscriberHash(args.email as string);
            const body: Record<string, unknown> = {};
            if (args.status !== undefined) body.status = args.status;
            if (args.merge_fields !== undefined) body.merge_fields = args.merge_fields;

            const data = await mcApi(
                `/lists/${args.list_id as string}/members/${hash}`,
                authHeader, baseUrl, 'PATCH', body,
            ) as MCMember;
            return {
                id: data.id,
                email_address: data.email_address,
                status: data.status,
                last_changed: data.last_changed,
            };
        }

        case 'unsubscribe_member': {
            validateRequired(args, ['list_id', 'email']);
            const hash = subscriberHash(args.email as string);
            const data = await mcApi(
                `/lists/${args.list_id as string}/members/${hash}`,
                authHeader, baseUrl, 'PATCH',
                { status: 'unsubscribed' },
            ) as MCMember;
            return {
                email_address: data.email_address,
                status: data.status,
                unsubscribed: data.status === 'unsubscribed',
                last_changed: data.last_changed,
            };
        }

        // ── Campaigns ─────────────────────────────────────────────────────────

        case 'list_campaigns': {
            const count = (args.count as number) ?? 20;
            let path = `/campaigns?count=${count}&sort_field=create_time&sort_dir=DESC`;
            if (args.status) path += `&status=${args.status as string}`;
            if (args.list_id) path += `&list_id=${args.list_id as string}`;

            const data = await mcApi(path, authHeader, baseUrl) as { campaigns: MCCampaign[]; total_items: number };
            return {
                total: data.total_items ?? 0,
                campaigns: (data.campaigns ?? []).map(c => ({
                    id: c.id,
                    type: c.type,
                    status: c.status,
                    subject_line: c.settings?.subject_line,
                    title: c.settings?.title,
                    from_name: c.settings?.from_name,
                    list_id: c.recipients?.list_id,
                    list_name: c.recipients?.list_name,
                    emails_sent: c.emails_sent,
                    send_time: c.send_time,
                    create_time: c.create_time,
                    report_summary: c.report_summary,
                })),
            };
        }

        case 'get_campaign': {
            validateRequired(args, ['campaign_id']);
            const data = await mcApi(
                `/campaigns/${args.campaign_id as string}`,
                authHeader, baseUrl,
            ) as MCCampaign;
            return {
                id: data.id,
                type: data.type,
                status: data.status,
                settings: data.settings,
                recipients: data.recipients,
                tracking: data.tracking,
                emails_sent: data.emails_sent,
                send_time: data.send_time,
                create_time: data.create_time,
                archive_url: data.archive_url,
                report_summary: data.report_summary,
            };
        }

        case 'create_campaign': {
            validateRequired(args, ['type', 'list_id', 'subject_line', 'from_name', 'reply_to']);
            const body: Record<string, unknown> = {
                type: args.type,
                recipients: { list_id: args.list_id },
                settings: {
                    subject_line: args.subject_line,
                    from_name: args.from_name,
                    reply_to: args.reply_to,
                    ...(args.title ? { title: args.title } : {}),
                },
            };
            const data = await mcApi('/campaigns', authHeader, baseUrl, 'POST', body) as MCCampaign;
            return {
                campaign_id: data.id,
                type: data.type,
                status: data.status,
                subject_line: data.settings?.subject_line,
                list_id: data.recipients?.list_id,
                create_time: data.create_time,
            };
        }

        case 'send_campaign': {
            validateRequired(args, ['campaign_id']);
            await mcApi(
                `/campaigns/${args.campaign_id as string}/actions/send`,
                authHeader, baseUrl, 'POST',
            );
            return {
                campaign_id: args.campaign_id,
                sent: true,
                note: 'Campaign has been queued for delivery',
            };
        }

        // ── Tags ──────────────────────────────────────────────────────────────

        case 'list_tags': {
            validateRequired(args, ['list_id']);
            const count = (args.count as number) ?? 20;
            let path = `/lists/${args.list_id as string}/tag-search?count=${count}`;
            if (args.name) path += `&name=${encodeURIComponent(args.name as string)}`;

            const data = await mcApi(path, authHeader, baseUrl) as {
                tags: Array<{ id: number; name: string; member_count: number }>;
                total_items: number;
            };
            return {
                list_id: args.list_id,
                total: data.total_items ?? 0,
                tags: data.tags ?? [],
            };
        }

        case 'add_tags_to_member': {
            validateRequired(args, ['list_id', 'email', 'tags']);
            const hash = subscriberHash(args.email as string);
            await mcApi(
                `/lists/${args.list_id as string}/members/${hash}/tags`,
                authHeader, baseUrl, 'POST',
                { tags: args.tags },
            );
            return {
                email: args.email,
                tags_updated: true,
                tags: args.tags,
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        // Health check
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-mailchimp', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        // Parse JSON-RPC body
        let body: { jsonrpc: string; id: number | string; method: string; params?: unknown };
        try {
            body = await request.json() as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error — invalid JSON');
        }

        const { id, method, params } = body;

        // ── Protocol methods ──────────────────────────────────────────────────

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-mailchimp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'notifications/initialized') {
            return rpcOk(id, {});
        }

        if (method !== 'tools/call') {
            return rpcErr(id, -32601, `Method not found: ${method}`);
        }

        // ── tools/call ────────────────────────────────────────────────────────

        // Extract secrets from headers
        const apiKey = request.headers.get('X-Mcp-Secret-MAILCHIMP-API-KEY');
        const serverPrefix = request.headers.get('X-Mcp-Secret-MAILCHIMP-SERVER-PREFIX');

        if (!apiKey) {
            return rpcErr(
                id,
                -32001,
                'Missing required secrets — add MAILCHIMP_API_KEY to workspace secrets. Key format: "abc123-us6" (found in Mailchimp Account → Extras → API keys)',
            );
        }

        const baseUrl = getBaseUrl(apiKey, serverPrefix);
        const authHeader = `Basic ${btoa(`anystring:${apiKey}`)}`;

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        try {
            const result = await callTool(toolName, args, authHeader, baseUrl);
            return rpcOk(id, toolOk(result));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.startsWith('Missing required parameter:')) {
                return rpcErr(id, -32603, msg);
            }
            return rpcErr(id, -32603, msg);
        }
    },
};
