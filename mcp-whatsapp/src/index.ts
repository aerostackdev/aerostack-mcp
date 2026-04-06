/**
 * WhatsApp Business MCP Worker
 * Meta Cloud API v20.0
 * Secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID
 * Headers: X-Mcp-Secret-WHATSAPP-ACCESS-TOKEN, X-Mcp-Secret-WHATSAPP-PHONE-NUMBER-ID, X-Mcp-Secret-WHATSAPP-BUSINESS-ACCOUNT-ID
 */

const META_BASE = 'https://graph.facebook.com/v20.0';

// ── TypeScript interfaces ────────────────────────────────────────────────────

interface MetaResponse<T = unknown> {
    data?: T;
    error?: { message: string; type: string; code: number; error_subcode?: number; fbtrace_id?: string };
}

interface WAMessage { id: string; }

interface WATemplate {
    id: string;
    name: string;
    status: string;
    category: string;
    language: string;
    components: WAComponent[];
}

interface WAComponent {
    type: string;
    format?: string;
    text?: string;
    buttons?: WAButton[];
}

interface WAButton {
    type: string;
    text: string;
    url?: string;
    phone_number?: string;
}

interface WABusinessProfile {
    messaging_product: string;
    address?: string;
    description?: string;
    email?: string;
    profile_picture_url?: string;
    websites?: string[];
    vertical?: string;
}

interface WAPhoneNumber {
    id: string;
    display_phone_number: string;
    verified_name: string;
    quality_rating: string;
    platform_type: string;
    throughput: { level: string };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function meta<T = unknown>(
    path: string,
    token: string,
    method: string = 'GET',
    body?: unknown,
): Promise<T> {
    const url = `${META_BASE}${path}`;
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
    };
    if (body !== undefined && (method === 'POST' || method === 'PUT')) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json = await res.json() as MetaResponse<T>;

    if (!res.ok || json.error) {
        const err = json.error;
        if (!err) throw new Error(`Meta API error ${res.status}`);
        const { code, error_subcode, message } = err;

        let clean: string;
        if (code === 190) {
            clean = 'Access token expired or invalid — regenerate in Meta Business Manager';
        } else if (code === 200) {
            clean = 'Permission denied — token needs whatsapp_business_messaging permission';
        } else if (code === 100 && error_subcode === 2494010) {
            clean = 'Phone number not in test allowlist — add recipient in Meta Dashboard under \'To\' numbers';
        } else if (code === 131030) {
            clean = 'Phone number not in allowlist — in test mode, add recipient to allowed numbers in Meta Dashboard';
        } else if (code === 131026) {
            clean = 'Message undeliverable — recipient may not have WhatsApp or number format is invalid';
        } else if (code === 131047) {
            clean = '24-hour window expired — must use send_template to contact this user (pre-approved templates only)';
        } else if (code === 132000) {
            clean = 'Template not found or not yet approved — check status with list_templates';
        } else if (code === 132001) {
            clean = 'Template language not found — verify language_code matches template language exactly';
        } else if (code === 132007) {
            clean = 'Template variable count mismatch — body_variables count must match {{N}} placeholders in template body';
        } else if (code === 133004) {
            clean = 'Phone number deregistered — number is not active on this WABA';
        } else if (code === 80007) {
            clean = 'Rate limit exceeded — upgrade messaging tier in Meta Business Manager or implement backoff';
        } else {
            clean = `Meta API error ${code}: ${message}`;
        }

        throw new Error(clean);
    }

    return (json.data !== undefined ? json.data : json) as T;
}

async function metaDirect<T = unknown>(
    path: string,
    token: string,
    method: string = 'GET',
    body?: unknown,
): Promise<T> {
    const url = `${META_BASE}${path}`;
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
    };
    if (body !== undefined && (method === 'POST' || method === 'PUT')) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json = await res.json() as MetaResponse<T> & T;

    if (!res.ok && (json as MetaResponse).error) {
        const err = (json as MetaResponse).error!;
        const { code, error_subcode, message } = err;

        let clean: string;
        if (code === 190) {
            clean = 'Access token expired or invalid — regenerate in Meta Business Manager';
        } else if (code === 200) {
            clean = 'Permission denied — token needs whatsapp_business_messaging permission';
        } else if (code === 100 && error_subcode === 2494010) {
            clean = 'Phone number not in test allowlist — add recipient in Meta Dashboard under \'To\' numbers';
        } else if (code === 131030) {
            clean = 'Phone number not in allowlist — in test mode, add recipient to allowed numbers in Meta Dashboard';
        } else if (code === 131026) {
            clean = 'Message undeliverable — recipient may not have WhatsApp or number format is invalid';
        } else if (code === 131047) {
            clean = '24-hour window expired — must use send_template to contact this user (pre-approved templates only)';
        } else if (code === 132000) {
            clean = 'Template not found or not yet approved — check status with list_templates';
        } else if (code === 132001) {
            clean = 'Template language not found — verify language_code matches template language exactly';
        } else if (code === 132007) {
            clean = 'Template variable count mismatch — body_variables count must match {{N}} placeholders in template body';
        } else if (code === 133004) {
            clean = 'Phone number deregistered — number is not active on this WABA';
        } else if (code === 80007) {
            clean = 'Rate limit exceeded — upgrade messaging tier in Meta Business Manager or implement backoff';
        } else {
            clean = `Meta API error ${code}: ${message}`;
        }

        throw new Error(clean);
    }

    return json as T;
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

function rpcOk(id: unknown, result: unknown): Response {
    return new Response(
        JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            },
        }),
        { headers: { 'Content-Type': 'application/json' } },
    );
}

function rpcErr(id: unknown, code: number, message: string): Response {
    return new Response(
        JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }),
        { headers: { 'Content-Type': 'application/json' } },
    );
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify WhatsApp credentials by calling a lightweight read endpoint. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    // Group 1 — Account & Profile
    {
        name: 'get_business_profile',
        description: 'Get the WhatsApp Business profile: name, description, address, email, website, category, and profile picture URL.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'update_business_profile',
        description: 'Update WhatsApp Business profile fields. Only provided fields are updated.',
        inputSchema: {
            type: 'object',
            properties: {
                description: { type: 'string', description: 'Business description (max 512 characters)' },
                address: { type: 'string', description: 'Business physical address' },
                email: { type: 'string', description: 'Business email address' },
                websites: { type: 'array', items: { type: 'string' }, description: 'Business website URLs (max 2)' },
                vertical: {
                    type: 'string',
                    enum: ['UNDEFINED', 'OTHER', 'AUTO', 'BEAUTY', 'APPAREL', 'EDU', 'ENTERTAIN', 'EVENT_PLAN', 'FINANCE', 'GROCERY', 'GOVT', 'HOTEL', 'HEALTH', 'NONPROFIT', 'PROF_SERVICES', 'RETAIL', 'TRAVEL', 'RESTAURANT', 'NOT_A_BIZ'],
                    description: 'Business industry category',
                },
            },
            required: [],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_phone_number_info',
        description: 'Get information about the WhatsApp Business phone number: display number, verified name, quality rating, platform type, and messaging throughput.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_account_info',
        description: 'Get WhatsApp Business Account (WABA) info: name, currency, timezone, template namespace. Requires WHATSAPP_BUSINESS_ACCOUNT_ID secret.',
        inputSchema: {
            type: 'object',
            properties: {},
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },

    // Group 2 — Session Messages
    {
        name: 'send_text',
        description: 'Send a text message to a WhatsApp user. Only works within 24h of the user messaging you (session window). For outbound contact use send_template.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: "Recipient phone in E.164 format WITHOUT the + sign (e.g. '15551234567' for US, '447911123456' for UK, '5511999998888' for Brazil)",
                },
                text: { type: 'string', description: 'Message body text (max 4096 characters)' },
                preview_url: { type: 'boolean', description: 'Show URL preview if text contains a link (default false)' },
            },
            required: ['to', 'text'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_image',
        description: 'Send an image message. Provide either image_url (publicly accessible HTTPS URL) or media_id from upload_media. Optional caption.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: "Recipient phone in E.164 format WITHOUT the + sign (e.g. '15551234567' for US, '447911123456' for UK, '5511999998888' for Brazil)",
                },
                image_url: { type: 'string', description: 'Publicly accessible HTTPS URL of the image (JPEG, PNG, or WebP)' },
                media_id: { type: 'string', description: 'Media ID from upload_media tool (alternative to image_url)' },
                caption: { type: 'string', description: 'Optional image caption (max 1024 characters)' },
            },
            required: ['to'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_document',
        description: 'Send a document/file message. Provide either document_url or media_id. Supports PDF, DOCX, XLSX, and other document types.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: "Recipient phone in E.164 format WITHOUT the + sign (e.g. '15551234567' for US, '447911123456' for UK, '5511999998888' for Brazil)",
                },
                document_url: { type: 'string', description: 'Publicly accessible HTTPS URL of the document' },
                media_id: { type: 'string', description: 'Media ID from upload_media tool (alternative to document_url)' },
                caption: { type: 'string', description: 'Optional document caption' },
                filename: { type: 'string', description: 'Filename shown to recipient (e.g. "invoice.pdf")' },
            },
            required: ['to'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_video',
        description: 'Send a video message. Provide either video_url or media_id. Supports MP4 format.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: "Recipient phone in E.164 format WITHOUT the + sign (e.g. '15551234567' for US, '447911123456' for UK, '5511999998888' for Brazil)",
                },
                video_url: { type: 'string', description: 'Publicly accessible HTTPS URL of the video (MP4)' },
                media_id: { type: 'string', description: 'Media ID from upload_media tool (alternative to video_url)' },
                caption: { type: 'string', description: 'Optional video caption' },
            },
            required: ['to'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_audio',
        description: 'Send an audio message or voice note. Provide either audio_url or media_id. Supports MP3 and OGG formats.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: "Recipient phone in E.164 format WITHOUT the + sign (e.g. '15551234567' for US, '447911123456' for UK, '5511999998888' for Brazil)",
                },
                audio_url: { type: 'string', description: 'Publicly accessible HTTPS URL of the audio (MP3 or OGG)' },
                media_id: { type: 'string', description: 'Media ID from upload_media tool (alternative to audio_url)' },
            },
            required: ['to'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_location',
        description: 'Send a location pin message with coordinates and optional place name/address.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: "Recipient phone in E.164 format WITHOUT the + sign (e.g. '15551234567' for US, '447911123456' for UK, '5511999998888' for Brazil)",
                },
                latitude: { type: 'number', description: 'Latitude coordinate (e.g. 37.7749)' },
                longitude: { type: 'number', description: 'Longitude coordinate (e.g. -122.4194)' },
                name: { type: 'string', description: 'Optional place name (e.g. "Aerostack HQ")' },
                address: { type: 'string', description: 'Optional address text shown below the pin' },
            },
            required: ['to', 'latitude', 'longitude'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_reaction',
        description: 'React to a received message with an emoji. The message_id must be the ID of the received message you want to react to.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: "Recipient phone in E.164 format WITHOUT the + sign (e.g. '15551234567' for US, '447911123456' for UK, '5511999998888' for Brazil)",
                },
                message_id: { type: 'string', description: 'ID of the received message to react to (from webhook payload)' },
                emoji: { type: 'string', description: 'A single emoji character to use as the reaction (e.g. "👍", "❤️", "😂")' },
            },
            required: ['to', 'message_id', 'emoji'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // Group 3 — Interactive Messages
    {
        name: 'send_buttons',
        description: 'Send an interactive message with up to 3 quick-reply buttons. Users tap a button instead of typing. Great for confirmations, choices, and surveys.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: "Recipient phone in E.164 format WITHOUT the + sign (e.g. '15551234567' for US, '447911123456' for UK, '5511999998888' for Brazil)",
                },
                body: { type: 'string', description: 'Main message body text shown above the buttons' },
                buttons: {
                    type: 'array',
                    description: '1-3 quick reply buttons',
                    maxItems: 3,
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'Button payload returned when tapped (max 256 chars)' },
                            title: { type: 'string', description: 'Button label shown to user (max 20 chars)' },
                        },
                        required: ['id', 'title'],
                    },
                },
                header: { type: 'string', description: 'Optional header text above the body' },
                footer: { type: 'string', description: 'Optional footer text below the buttons' },
            },
            required: ['to', 'body', 'buttons'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_list',
        description: 'Send an interactive list message. Users tap a button to open a scrollable list of options organized in sections. Max 10 rows total.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: "Recipient phone in E.164 format WITHOUT the + sign (e.g. '15551234567' for US, '447911123456' for UK, '5511999998888' for Brazil)",
                },
                body: { type: 'string', description: 'Main message text' },
                button_label: { type: 'string', description: 'Text on the button that opens the list (e.g. "View Options")' },
                sections: {
                    type: 'array',
                    description: '1 or more sections with rows (max 10 rows total across all sections)',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'Section header (recommended if multiple sections)' },
                            rows: {
                                type: 'array',
                                description: 'List items in this section',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string', description: 'Row payload returned on selection' },
                                        title: { type: 'string', description: 'Item title (max 24 chars)' },
                                        description: { type: 'string', description: 'Item description (max 72 chars, optional)' },
                                    },
                                    required: ['id', 'title'],
                                },
                            },
                        },
                        required: ['rows'],
                    },
                },
                header: { type: 'string', description: 'Optional header text' },
                footer: { type: 'string', description: 'Optional footer text' },
            },
            required: ['to', 'body', 'button_label', 'sections'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'send_cta_url',
        description: 'Send an interactive Call-to-Action message with a URL button. Users tap the button to open a URL.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: "Recipient phone in E.164 format WITHOUT the + sign (e.g. '15551234567' for US, '447911123456' for UK, '5511999998888' for Brazil)",
                },
                body: { type: 'string', description: 'Main message body text' },
                button_text: { type: 'string', description: 'Button label text (e.g. "Track Order", "View Invoice")' },
                url: { type: 'string', description: 'URL to open when button is tapped' },
                header: { type: 'string', description: 'Optional header text' },
                footer: { type: 'string', description: 'Optional footer text' },
            },
            required: ['to', 'body', 'button_text', 'url'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },

    // Group 4 — Template Messages
    {
        name: 'list_templates',
        description: 'List all message templates for the WhatsApp Business Account. Filter by status (APPROVED/PENDING/REJECTED/PAUSED). Requires WHATSAPP_BUSINESS_ACCOUNT_ID secret.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED'],
                    description: 'Filter templates by status. Omit to get all templates.',
                },
                limit: { type: 'number', description: 'Number of templates to return (default 20, max 100)' },
            },
            required: [],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_template',
        description: 'Get full details of a single message template by ID, including components, variables, rejection reason, and quality score.',
        inputSchema: {
            type: 'object',
            properties: {
                template_id: { type: 'string', description: 'Template ID (get from list_templates)' },
            },
            required: ['template_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'send_template',
        description: 'Send an approved template message to any WhatsApp user at any time (not limited by 24-hour window). Required for outbound contact and re-engagement.',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: "Recipient phone in E.164 format WITHOUT the + sign (e.g. '15551234567' for US, '447911123456' for UK, '5511999998888' for Brazil)",
                },
                template_name: { type: 'string', description: 'Approved template name (e.g. "order_confirmation")' },
                language_code: { type: 'string', description: 'Template language code (e.g. "en_US", "pt_BR", "es", "ar")' },
                header_variables: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Values for {{1}}, {{2}}... placeholders in the template HEADER component',
                },
                body_variables: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Values for {{1}}, {{2}}... placeholders in the template BODY component',
                },
                button_variables: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Values for dynamic URL buttons in the template',
                },
                header_media_url: {
                    type: 'string',
                    description: 'If the template header is IMAGE/VIDEO/DOCUMENT, provide the media URL here',
                },
            },
            required: ['to', 'template_name', 'language_code'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'create_template',
        description: 'Submit a new message template for Meta review (24-48h approval process). Requires WHATSAPP_BUSINESS_ACCOUNT_ID secret.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Template name (lowercase, underscores only, e.g. "order_confirmation")' },
                category: {
                    type: 'string',
                    enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
                    description: 'MARKETING=promotions, UTILITY=transactional/support, AUTHENTICATION=OTP codes',
                },
                language: { type: 'string', description: 'Template language code (e.g. "en_US", "pt_BR")' },
                body: { type: 'string', description: 'Body text (required). Use {{1}}, {{2}} etc. for variables. Supports *bold* and _italic_' },
                header: {
                    type: 'object',
                    description: 'Optional header component',
                    properties: {
                        format: { type: 'string', enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'], description: 'Header format' },
                        text: { type: 'string', description: 'Header text if format is TEXT. Use {{1}} for variables.' },
                    },
                    required: ['format'],
                },
                footer: { type: 'string', description: 'Optional footer text (no variables allowed in footer)' },
                buttons: {
                    type: 'array',
                    description: 'Optional CTA or Quick Reply buttons',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'], description: 'Button type' },
                            text: { type: 'string', description: 'Button label' },
                            url: { type: 'string', description: 'URL for URL button type' },
                            phone_number: { type: 'string', description: 'Phone number for PHONE_NUMBER type' },
                        },
                        required: ['type', 'text'],
                    },
                },
            },
            required: ['name', 'category', 'language', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_template',
        description: 'Delete a message template by name. Requires WHATSAPP_BUSINESS_ACCOUNT_ID secret.',
        inputSchema: {
            type: 'object',
            properties: {
                template_name: { type: 'string', description: 'Template name to delete (e.g. "old_promo_template")' },
            },
            required: ['template_name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },

    // Group 5 — Message Management
    {
        name: 'mark_as_read',
        description: 'Mark a received message as read, showing blue double-tick to the sender. Use the message_id from the incoming webhook payload.',
        inputSchema: {
            type: 'object',
            properties: {
                message_id: { type: 'string', description: 'ID of the received message to mark as read (from webhook payload, e.g. "wamid.xxx...")' },
            },
            required: ['message_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_message',
        description: 'Delete a sent message. Must be done within a time window after sending. Removes the message from the recipient\'s view.',
        inputSchema: {
            type: 'object',
            properties: {
                message_id: { type: 'string', description: 'ID of the sent message to delete (returned by send_* tools)' },
            },
            required: ['message_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    // Group 6 — Media
    {
        name: 'upload_media',
        description: 'Upload media to WhatsApp servers by providing a public URL. Returns a media_id that can be reused in send_image/send_video/send_document/send_audio.',
        inputSchema: {
            type: 'object',
            properties: {
                media_url: { type: 'string', description: 'Public HTTPS URL of the media to upload' },
                media_type: {
                    type: 'string',
                    enum: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'audio/mpeg', 'audio/ogg', 'application/pdf'],
                    description: 'MIME type of the media',
                },
            },
            required: ['media_url', 'media_type'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'get_media_url',
        description: 'Get the download URL for a media file received in a webhook. The URL expires in 5 minutes — download immediately.',
        inputSchema: {
            type: 'object',
            properties: {
                media_id: { type: 'string', description: 'Media ID from a webhook message payload' },
            },
            required: ['media_id'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'delete_media',
        description: 'Delete an uploaded media file from WhatsApp servers to free storage.',
        inputSchema: {
            type: 'object',
            properties: {
                media_id: { type: 'string', description: 'Media ID to delete (from upload_media or webhook)' },
            },
            required: ['media_id'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
];

// ── Tool implementations ──────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    phoneNumberId: string,
    wabaId: string,
    id: unknown,
): Promise<Response> {
    try {
        switch (name) {

            case '_ping': {
                await metaDirect(`/${phoneNumberId}?fields=id,display_phone_number`, token);
                return rpcOk(id, { content: [{ type: 'text', text: 'Connected to WhatsApp' }] });
            }

            // ── Group 1 — Account & Profile ──────────────────────────────────

            case 'get_business_profile': {
                const data = await metaDirect<WABusinessProfile & { name?: string }>(
                    `/${phoneNumberId}/whatsapp_business_profile?fields=messaging_product,address,description,email,profile_picture_url,websites,vertical`,
                    token,
                );
                return rpcOk(id, {
                    name: data.name ?? null,
                    description: data.description ?? null,
                    address: data.address ?? null,
                    email: data.email ?? null,
                    websites: data.websites ?? [],
                    category: data.vertical ?? null,
                    profile_picture_url: data.profile_picture_url ?? null,
                });
            }

            case 'update_business_profile': {
                const fields = ['description', 'address', 'email', 'websites', 'vertical'];
                const updated: Record<string, unknown> = { messaging_product: 'whatsapp' };
                const updatedKeys: string[] = [];
                for (const f of fields) {
                    if (args[f] !== undefined) {
                        updated[f] = args[f];
                        updatedKeys.push(f);
                    }
                }
                await metaDirect(
                    `/${phoneNumberId}/whatsapp_business_profile`,
                    token,
                    'POST',
                    updated,
                );
                return rpcOk(id, { success: true, updated_fields: updatedKeys });
            }

            case 'get_phone_number_info': {
                const data = await metaDirect<WAPhoneNumber & { last_onboarded_time?: string }>(
                    `/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,throughput,last_onboarded_time`,
                    token,
                );
                return rpcOk(id, {
                    id: data.id,
                    display_phone_number: data.display_phone_number,
                    verified_name: data.verified_name,
                    quality_rating: data.quality_rating,
                    platform_type: data.platform_type,
                    throughput_level: data.throughput?.level ?? null,
                    last_onboarded_time: data.last_onboarded_time ?? null,
                });
            }

            case 'get_account_info': {
                if (!wabaId) {
                    return rpcErr(id, -32002, 'WHATSAPP_BUSINESS_ACCOUNT_ID secret required for this tool — add it to workspace secrets');
                }
                const data = await metaDirect<{ id: string; name: string; currency: string; timezone_id: string; message_template_namespace?: string }>(
                    `/${wabaId}?fields=id,name,currency,timezone_id,message_template_namespace`,
                    token,
                );
                return rpcOk(id, {
                    id: data.id,
                    name: data.name,
                    currency: data.currency,
                    timezone_id: data.timezone_id,
                    template_namespace: data.message_template_namespace ?? null,
                });
            }

            // ── Group 2 — Session Messages ────────────────────────────────────

            case 'send_text': {
                validateRequired(args, ['to', 'text']);
                const data = await metaDirect<{ messages: WAMessage[] }>(
                    `/${phoneNumberId}/messages`,
                    token,
                    'POST',
                    {
                        messaging_product: 'whatsapp',
                        to: args.to,
                        type: 'text',
                        text: { body: args.text, preview_url: args.preview_url ?? false },
                    },
                );
                return rpcOk(id, {
                    message_id: data.messages[0].id,
                    to: args.to,
                    status: 'sent',
                });
            }

            case 'send_image': {
                validateRequired(args, ['to']);
                if (!args.image_url && !args.media_id) {
                    throw new Error('Provide either image_url or media_id');
                }
                const imageObj: Record<string, unknown> = args.image_url
                    ? { link: args.image_url }
                    : { id: args.media_id };
                if (args.caption) imageObj.caption = args.caption;
                const data = await metaDirect<{ messages: WAMessage[] }>(
                    `/${phoneNumberId}/messages`,
                    token,
                    'POST',
                    {
                        messaging_product: 'whatsapp',
                        to: args.to,
                        type: 'image',
                        image: imageObj,
                    },
                );
                return rpcOk(id, { message_id: data.messages[0].id, to: args.to, status: 'sent' });
            }

            case 'send_document': {
                validateRequired(args, ['to']);
                if (!args.document_url && !args.media_id) {
                    throw new Error('Provide either document_url or media_id');
                }
                const docObj: Record<string, unknown> = args.document_url
                    ? { link: args.document_url }
                    : { id: args.media_id };
                if (args.caption) docObj.caption = args.caption;
                if (args.filename) docObj.filename = args.filename;
                const data = await metaDirect<{ messages: WAMessage[] }>(
                    `/${phoneNumberId}/messages`,
                    token,
                    'POST',
                    {
                        messaging_product: 'whatsapp',
                        to: args.to,
                        type: 'document',
                        document: docObj,
                    },
                );
                return rpcOk(id, { message_id: data.messages[0].id, to: args.to, status: 'sent' });
            }

            case 'send_video': {
                validateRequired(args, ['to']);
                if (!args.video_url && !args.media_id) {
                    throw new Error('Provide either video_url or media_id');
                }
                const videoObj: Record<string, unknown> = args.video_url
                    ? { link: args.video_url }
                    : { id: args.media_id };
                if (args.caption) videoObj.caption = args.caption;
                const data = await metaDirect<{ messages: WAMessage[] }>(
                    `/${phoneNumberId}/messages`,
                    token,
                    'POST',
                    {
                        messaging_product: 'whatsapp',
                        to: args.to,
                        type: 'video',
                        video: videoObj,
                    },
                );
                return rpcOk(id, { message_id: data.messages[0].id, to: args.to, status: 'sent' });
            }

            case 'send_audio': {
                validateRequired(args, ['to']);
                if (!args.audio_url && !args.media_id) {
                    throw new Error('Provide either audio_url or media_id');
                }
                const audioObj: Record<string, unknown> = args.audio_url
                    ? { link: args.audio_url }
                    : { id: args.media_id };
                const data = await metaDirect<{ messages: WAMessage[] }>(
                    `/${phoneNumberId}/messages`,
                    token,
                    'POST',
                    {
                        messaging_product: 'whatsapp',
                        to: args.to,
                        type: 'audio',
                        audio: audioObj,
                    },
                );
                return rpcOk(id, { message_id: data.messages[0].id, to: args.to, status: 'sent' });
            }

            case 'send_location': {
                validateRequired(args, ['to', 'latitude', 'longitude']);
                const locationObj: Record<string, unknown> = {
                    latitude: args.latitude,
                    longitude: args.longitude,
                };
                if (args.name) locationObj.name = args.name;
                if (args.address) locationObj.address = args.address;
                const data = await metaDirect<{ messages: WAMessage[] }>(
                    `/${phoneNumberId}/messages`,
                    token,
                    'POST',
                    {
                        messaging_product: 'whatsapp',
                        to: args.to,
                        type: 'location',
                        location: locationObj,
                    },
                );
                return rpcOk(id, { message_id: data.messages[0].id, to: args.to, status: 'sent' });
            }

            case 'send_reaction': {
                validateRequired(args, ['to', 'message_id', 'emoji']);
                const data = await metaDirect<{ messages: WAMessage[] }>(
                    `/${phoneNumberId}/messages`,
                    token,
                    'POST',
                    {
                        messaging_product: 'whatsapp',
                        to: args.to,
                        type: 'reaction',
                        reaction: { message_id: args.message_id, emoji: args.emoji },
                    },
                );
                return rpcOk(id, {
                    message_id: data.messages[0].id,
                    reacted_to_message_id: args.message_id,
                    emoji: args.emoji,
                });
            }

            // ── Group 3 — Interactive Messages ────────────────────────────────

            case 'send_buttons': {
                validateRequired(args, ['to', 'body', 'buttons']);
                const buttons = args.buttons as Array<{ id: string; title: string }>;
                if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3) {
                    throw new Error('buttons must be an array of 1-3 items');
                }
                const interactive: Record<string, unknown> = {
                    type: 'button',
                    body: { text: args.body },
                    action: {
                        buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
                    },
                };
                if (args.header) interactive.header = { type: 'text', text: args.header };
                if (args.footer) interactive.footer = { text: args.footer };
                const data = await metaDirect<{ messages: WAMessage[] }>(
                    `/${phoneNumberId}/messages`,
                    token,
                    'POST',
                    {
                        messaging_product: 'whatsapp',
                        to: args.to,
                        type: 'interactive',
                        interactive,
                    },
                );
                return rpcOk(id, {
                    message_id: data.messages[0].id,
                    to: args.to,
                    status: 'sent',
                    button_count: buttons.length,
                });
            }

            case 'send_list': {
                validateRequired(args, ['to', 'body', 'button_label', 'sections']);
                const sections = args.sections as Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }>;
                const totalRows = sections.reduce((sum, s) => sum + (s.rows?.length ?? 0), 0);
                if (totalRows > 10) {
                    throw new Error('Total rows across all sections cannot exceed 10 (max 10 rows)');
                }
                const interactive: Record<string, unknown> = {
                    type: 'list',
                    body: { text: args.body },
                    action: {
                        button: args.button_label,
                        sections,
                    },
                };
                if (args.header) interactive.header = { type: 'text', text: args.header };
                if (args.footer) interactive.footer = { text: args.footer };
                const data = await metaDirect<{ messages: WAMessage[] }>(
                    `/${phoneNumberId}/messages`,
                    token,
                    'POST',
                    {
                        messaging_product: 'whatsapp',
                        to: args.to,
                        type: 'interactive',
                        interactive,
                    },
                );
                return rpcOk(id, {
                    message_id: data.messages[0].id,
                    to: args.to,
                    status: 'sent',
                    total_rows: totalRows,
                });
            }

            case 'send_cta_url': {
                validateRequired(args, ['to', 'body', 'button_text', 'url']);
                const interactive: Record<string, unknown> = {
                    type: 'cta_url',
                    body: { text: args.body },
                    action: {
                        name: 'cta_url',
                        parameters: { display_text: args.button_text, url: args.url },
                    },
                };
                if (args.header) interactive.header = { type: 'text', text: args.header };
                if (args.footer) interactive.footer = { text: args.footer };
                const data = await metaDirect<{ messages: WAMessage[] }>(
                    `/${phoneNumberId}/messages`,
                    token,
                    'POST',
                    {
                        messaging_product: 'whatsapp',
                        to: args.to,
                        type: 'interactive',
                        interactive,
                    },
                );
                return rpcOk(id, {
                    message_id: data.messages[0].id,
                    to: args.to,
                    status: 'sent',
                    url: args.url,
                });
            }

            // ── Group 4 — Template Messages ───────────────────────────────────

            case 'list_templates': {
                if (!wabaId) {
                    return rpcErr(id, -32002, 'WHATSAPP_BUSINESS_ACCOUNT_ID secret required for this tool — add it to workspace secrets');
                }
                const limit = Math.min(Number(args.limit ?? 20), 100);
                let path = `/${wabaId}/message_templates?fields=id,name,status,category,language,components&limit=${limit}`;
                if (args.status) path += `&status=${args.status}`;
                const data = await metaDirect<{ data: WATemplate[] }>(path, token);
                const templates = (data.data ?? []).map((t: WATemplate) => ({
                    id: t.id,
                    name: t.name,
                    status: t.status,
                    category: t.category,
                    language: t.language,
                    component_types: (t.components ?? []).map((c: WAComponent) => c.type),
                }));
                return rpcOk(id, templates);
            }

            case 'get_template': {
                validateRequired(args, ['template_id']);
                const data = await metaDirect<WATemplate & { rejected_reason?: string; quality_score?: unknown }>(
                    `/${args.template_id}?fields=id,name,status,category,language,components,rejected_reason,quality_score`,
                    token,
                );
                return rpcOk(id, {
                    id: data.id,
                    name: data.name,
                    status: data.status,
                    category: data.category,
                    language: data.language,
                    components: data.components,
                    rejected_reason: data.rejected_reason ?? null,
                    quality_score: data.quality_score ?? null,
                });
            }

            case 'send_template': {
                validateRequired(args, ['to', 'template_name', 'language_code']);
                const components: unknown[] = [];
                const headerVariables = args.header_variables as string[] | undefined;
                const bodyVariables = args.body_variables as string[] | undefined;
                const buttonVariables = args.button_variables as string[] | undefined;

                if (headerVariables && headerVariables.length > 0) {
                    components.push({
                        type: 'header',
                        parameters: headerVariables.map(v => ({ type: 'text', text: v })),
                    });
                } else if (args.header_media_url) {
                    components.push({
                        type: 'header',
                        parameters: [{ type: 'image', image: { link: args.header_media_url } }],
                    });
                }

                if (bodyVariables && bodyVariables.length > 0) {
                    components.push({
                        type: 'body',
                        parameters: bodyVariables.map(v => ({ type: 'text', text: v })),
                    });
                }

                if (buttonVariables && buttonVariables.length > 0) {
                    components.push({
                        type: 'button',
                        sub_type: 'url',
                        index: '0',
                        parameters: [{ type: 'text', text: buttonVariables[0] }],
                    });
                }

                const data = await metaDirect<{ messages: WAMessage[] }>(
                    `/${phoneNumberId}/messages`,
                    token,
                    'POST',
                    {
                        messaging_product: 'whatsapp',
                        to: args.to,
                        type: 'template',
                        template: {
                            name: args.template_name,
                            language: { code: args.language_code },
                            components,
                        },
                    },
                );
                return rpcOk(id, {
                    message_id: data.messages[0].id,
                    to: args.to,
                    template_name: args.template_name,
                    language_code: args.language_code,
                    status: 'sent',
                });
            }

            case 'create_template': {
                if (!wabaId) {
                    return rpcErr(id, -32002, 'WHATSAPP_BUSINESS_ACCOUNT_ID secret required for this tool — add it to workspace secrets');
                }
                validateRequired(args, ['name', 'category', 'language', 'body']);
                const components: unknown[] = [];

                const header = args.header as { format: string; text?: string } | undefined;
                if (header) {
                    const headerComp: Record<string, unknown> = { type: 'HEADER', format: header.format };
                    if (header.text) headerComp.text = header.text;
                    components.push(headerComp);
                }

                components.push({ type: 'BODY', text: args.body });

                if (args.footer) {
                    components.push({ type: 'FOOTER', text: args.footer });
                }

                const buttons = args.buttons as Array<{ type: string; text: string; url?: string; phone_number?: string }> | undefined;
                if (buttons && buttons.length > 0) {
                    components.push({
                        type: 'BUTTONS',
                        buttons: buttons.map(b => {
                            const btn: Record<string, unknown> = { type: b.type, text: b.text };
                            if (b.url) btn.url = b.url;
                            if (b.phone_number) btn.phone_number = b.phone_number;
                            return btn;
                        }),
                    });
                }

                const data = await metaDirect<{ id: string; status: string }>(
                    `/${wabaId}/message_templates`,
                    token,
                    'POST',
                    {
                        name: args.name,
                        category: args.category,
                        language: args.language,
                        components,
                    },
                );
                return rpcOk(id, {
                    id: data.id,
                    name: args.name,
                    status: 'PENDING',
                    category: args.category,
                    language: args.language,
                    message: 'Template submitted for Meta review (24-48h)',
                });
            }

            case 'delete_template': {
                if (!wabaId) {
                    return rpcErr(id, -32002, 'WHATSAPP_BUSINESS_ACCOUNT_ID secret required for this tool — add it to workspace secrets');
                }
                validateRequired(args, ['template_name']);
                await metaDirect(
                    `/${wabaId}/message_templates?name=${encodeURIComponent(args.template_name as string)}`,
                    token,
                    'DELETE',
                );
                return rpcOk(id, { success: true, deleted_template: args.template_name });
            }

            // ── Group 5 — Message Management ─────────────────────────────────

            case 'mark_as_read': {
                validateRequired(args, ['message_id']);
                await metaDirect(
                    `/${phoneNumberId}/messages`,
                    token,
                    'POST',
                    {
                        messaging_product: 'whatsapp',
                        status: 'read',
                        message_id: args.message_id,
                    },
                );
                return rpcOk(id, { success: true, message_id: args.message_id, status: 'read' });
            }

            case 'delete_message': {
                validateRequired(args, ['message_id']);
                await metaDirect(
                    `/${phoneNumberId}/messages/${args.message_id}`,
                    token,
                    'DELETE',
                );
                return rpcOk(id, { success: true, deleted_message_id: args.message_id });
            }

            case 'get_message_status': {
                return rpcOk(id, {
                    note: "Message delivery status (sent/delivered/read) is only available via webhooks. Configure your webhook URL in Meta Dashboard to receive status updates. Webhook events: messages.statuses[].status = 'sent'|'delivered'|'read'|'failed'",
                });
            }

            // ── Group 6 — Media ───────────────────────────────────────────────

            case 'upload_media': {
                validateRequired(args, ['media_url', 'media_type']);
                // Fetch the media binary from the provided URL
                const mediaRes = await fetch(args.media_url as string);
                if (!mediaRes.ok) {
                    throw new Error(`Failed to fetch media from URL: ${mediaRes.status} ${mediaRes.statusText}`);
                }
                const mediaBuffer = await mediaRes.arrayBuffer();
                const filename = (args.media_url as string).split('/').pop() ?? 'file';

                const formData = new FormData();
                formData.append('messaging_product', 'whatsapp');
                formData.append('type', args.media_type as string);
                formData.append('file', new Blob([mediaBuffer], { type: args.media_type as string }), filename);

                const uploadRes = await fetch(`${META_BASE}/${phoneNumberId}/media`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                });

                const uploadData = await uploadRes.json() as { id?: string; error?: { code: number; message: string } };
                if (!uploadRes.ok || uploadData.error) {
                    const err = uploadData.error;
                    throw new Error(err ? `Meta API error ${err.code}: ${err.message}` : `Upload failed: ${uploadRes.status}`);
                }

                return rpcOk(id, {
                    media_id: uploadData.id,
                    media_type: args.media_type,
                    note: 'Use this media_id in send_image/send_video/send_document/send_audio tools',
                });
            }

            case 'get_media_url': {
                validateRequired(args, ['media_id']);
                const data = await metaDirect<{ id: string; url: string; mime_type: string; sha256: string; file_size: number }>(
                    `/${args.media_id}`,
                    token,
                );
                return rpcOk(id, {
                    media_id: data.id,
                    url: data.url,
                    mime_type: data.mime_type,
                    sha256: data.sha256,
                    file_size: data.file_size,
                    note: 'URL expires in 5 minutes — download immediately',
                });
            }

            case 'delete_media': {
                validateRequired(args, ['media_id']);
                await metaDirect(`/${args.media_id}`, token, 'DELETE');
                return rpcOk(id, { success: true, deleted_media_id: args.media_id });
            }

            default:
                return rpcErr(id, -32601, `Unknown tool: ${name}`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return rpcErr(id, -32603, message);
    }
}

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return new Response(
                JSON.stringify({ status: 'ok', server: 'mcp-whatsapp', tools: TOOLS.length }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let rpc: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
        try {
            rpc = await request.json() as typeof rpc;
        } catch {
            return rpcErr(null, -32700, 'Parse error — invalid JSON');
        }

        const { id = null, method, params } = rpc;

        if (method === 'initialize') {
            return new Response(
                JSON.stringify({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'mcp-whatsapp', version: '1.0.0' },
                    },
                }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (method === 'tools/list') {
            return new Response(
                JSON.stringify({ jsonrpc: '2.0', id, result: { tools: TOOLS } }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (method === 'tools/call') {
            const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
            const toolName = p?.name ?? '';
            const toolArgs = p?.arguments ?? {};

            // Special case: get_message_status needs no auth
            if (toolName === 'get_message_status') {
                return callTool(toolName, toolArgs, '', '', '', id);
            }

            const token = request.headers.get('X-Mcp-Secret-WHATSAPP-ACCESS-TOKEN');
            const phoneNumberId = request.headers.get('X-Mcp-Secret-WHATSAPP-PHONE-NUMBER-ID');
            const wabaId = request.headers.get('X-Mcp-Secret-WHATSAPP-BUSINESS-ACCOUNT-ID') ?? '';

            if (!token || !phoneNumberId) {
                return rpcErr(id, -32001, 'Missing required secrets — add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to workspace secrets');
            }

            return callTool(toolName, toolArgs, token, phoneNumberId, wabaId, id);
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
