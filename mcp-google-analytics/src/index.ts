/**
 * mcp-google-analytics — Google Analytics 4 MCP Server
 *
 * Run reports, query real-time data, list dimensions/metrics, funnel and pivot reports.
 * Uses GA4 Data API v1beta directly (no npm SDK) for minimal bundle size on Workers.
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 */

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify Google Analytics connectivity by fetching property metadata. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'run_report',
        description: 'Run a standard GA4 report with dimensions, metrics, date ranges, filters, and ordering. Returns tabular analytics data.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                dimensions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Dimension names to group by (e.g. ["date", "country", "pagePath"])',
                },
                metrics: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Metric names to return (e.g. ["activeUsers", "sessions", "screenPageViews"])',
                },
                start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format, or relative like "7daysAgo", "30daysAgo", "yesterday" (default: "28daysAgo")' },
                end_date: { type: 'string', description: 'End date in YYYY-MM-DD format, or "today", "yesterday" (default: "today")' },
                dimension_filter: {
                    type: 'object',
                    description: 'Optional dimension filter object. Example: {"filter":{"fieldName":"country","stringFilter":{"value":"United States"}}}',
                },
                metric_filter: {
                    type: 'object',
                    description: 'Optional metric filter object. Example: {"filter":{"fieldName":"activeUsers","numericFilter":{"operation":"GREATER_THAN","value":{"int64Value":"100"}}}}',
                },
                order_bys: {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Order results. Example: [{"metric":{"metricName":"activeUsers"},"desc":true}] or [{"dimension":{"dimensionName":"date"}}]',
                },
                limit: { type: 'number', description: 'Maximum number of rows to return (default: 100, max: 10000)' },
                offset: { type: 'number', description: 'Row offset for pagination (default: 0)' },
            },
            required: ['metrics'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_realtime_report',
        description: 'Get a real-time report from GA4 showing currently active users, dimensions, and metrics from the last 30 minutes.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                dimensions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Real-time dimension names (e.g. ["country", "city", "unifiedScreenName"])',
                },
                metrics: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Real-time metric names (e.g. ["activeUsers", "screenPageViews"]) (default: ["activeUsers"])',
                },
                dimension_filter: {
                    type: 'object',
                    description: 'Optional dimension filter for real-time data',
                },
                metric_filter: {
                    type: 'object',
                    description: 'Optional metric filter for real-time data',
                },
                limit: { type: 'number', description: 'Maximum rows to return (default: 100)' },
            },
            required: [] as string[],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_metadata',
        description: 'List all available dimensions and metrics for a GA4 property, including custom definitions. Useful for discovering what data you can query.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                filter: { type: 'string', description: 'Optional text filter to search dimension/metric names and descriptions (case-insensitive)' },
            },
            required: [] as string[],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'run_funnel_report',
        description: 'Run a funnel report to analyze user drop-off across a sequence of steps. Each step defines an event or condition users must match.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                steps: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Step name (e.g. "Add to Cart")' },
                            filterExpression: { type: 'object', description: 'Filter expression for this step' },
                        },
                    },
                    description: 'Funnel steps in order. Each step needs a name and filterExpression. Example: [{"name":"Page View","filterExpression":{"eventFilter":{"eventName":"page_view"}}},{"name":"Purchase","filterExpression":{"eventFilter":{"eventName":"purchase"}}}]',
                },
                start_date: { type: 'string', description: 'Start date (default: "28daysAgo")' },
                end_date: { type: 'string', description: 'End date (default: "today")' },
                dimensions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional breakdown dimensions (e.g. ["deviceCategory"])',
                },
                is_open_funnel: { type: 'boolean', description: 'If true, users can enter at any step. If false (default), users must enter at step 1.' },
            },
            required: ['steps'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'run_pivot_report',
        description: 'Run a pivot report that creates a cross-tabulation of dimensions and metrics. Like a pivot table in a spreadsheet.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                dimensions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'All dimension names used in the report (e.g. ["country", "deviceCategory"])',
                },
                metrics: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Metric names (e.g. ["sessions", "activeUsers"])',
                },
                pivots: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            fieldNames: { type: 'array', items: { type: 'string' }, description: 'Dimensions to pivot on' },
                            limit: { type: 'number', description: 'Max columns for this pivot' },
                            orderBys: { type: 'array', items: { type: 'object' }, description: 'Ordering for pivot values' },
                        },
                    },
                    description: 'Pivot definitions. Example: [{"fieldNames":["country"],"limit":5},{"fieldNames":["deviceCategory"],"limit":3}]',
                },
                start_date: { type: 'string', description: 'Start date (default: "28daysAgo")' },
                end_date: { type: 'string', description: 'End date (default: "today")' },
                dimension_filter: { type: 'object', description: 'Optional dimension filter' },
                limit: { type: 'number', description: 'Maximum rows (default: 100)' },
            },
            required: ['dimensions', 'metrics', 'pivots'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function rpcOk(id: unknown, result: unknown) {
    return Response.json({ jsonrpc: '2.0', id, result });
}

function rpcErr(id: unknown, code: number, message: string) {
    return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

/** Get an OAuth2 access token from a Google Service Account JSON key. */
async function getAccessToken(serviceAccountJson: string): Promise<string> {
    const sa = JSON.parse(serviceAccountJson);
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = btoa(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    }));
    const signInput = `${header}.${claim}`;

    // Import RSA private key
    const pemContent = sa.private_key
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');
    const keyData = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', keyData,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign'],
    );

    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5', cryptoKey,
        new TextEncoder().encode(signInput),
    );
    const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const jwt = `${header}.${claim}.${sig}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = (await res.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) throw new Error(`Token error: ${tokenData.error || 'unknown'}`);
    return tokenData.access_token;
}

const GA4_BASE = 'https://analyticsdata.googleapis.com/v1beta';

async function ga4Fetch(token: string, path: string, method = 'GET', body?: unknown): Promise<any> {
    const res = await fetch(`${GA4_BASE}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json() as any;
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data;
}

/** Parse GA4 report rows into a flat array of objects. */
function parseRows(
    dimensionHeaders: { name: string }[],
    metricHeaders: { name: string }[],
    rows: any[] | undefined,
): Record<string, string>[] {
    if (!rows) return [];
    return rows.map((row: any) => {
        const obj: Record<string, string> = {};
        (row.dimensionValues ?? []).forEach((v: any, i: number) => {
            obj[dimensionHeaders[i]?.name ?? `dim_${i}`] = v.value;
        });
        (row.metricValues ?? []).forEach((v: any, i: number) => {
            obj[metricHeaders[i]?.name ?? `metric_${i}`] = v.value;
        });
        return obj;
    });
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    token: string,
    propertyId: string,
): Promise<unknown> {
    const property = `properties/${propertyId}`;

    switch (name) {
        case '_ping': {
            const data = await ga4Fetch(token, `/${property}/metadata`);
            const dimCount = data.dimensions?.length ?? 0;
            const metricCount = data.metrics?.length ?? 0;
            return text(`Connected to GA4 property "${propertyId}". Found ${dimCount} dimensions and ${metricCount} metrics available.`);
        }

        case 'run_report': {
            const limit = Math.min(Number(args.limit ?? 100), 10000);
            const body: Record<string, unknown> = {
                dateRanges: [{
                    startDate: (args.start_date as string) || '28daysAgo',
                    endDate: (args.end_date as string) || 'today',
                }],
                metrics: ((args.metrics as string[]) || []).map((m: string) => ({ name: m })),
                limit,
                offset: Number(args.offset ?? 0),
            };

            if (args.dimensions) {
                body.dimensions = ((args.dimensions as string[]) || []).map((d: string) => ({ name: d }));
            }
            if (args.dimension_filter) body.dimensionFilter = args.dimension_filter;
            if (args.metric_filter) body.metricFilter = args.metric_filter;
            if (args.order_bys) body.orderBys = args.order_bys;

            const data = await ga4Fetch(token, `/${property}:runReport`, 'POST', body);
            const dimensionHeaders = (data.dimensionHeaders ?? []) as { name: string }[];
            const metricHeaders = (data.metricHeaders ?? []) as { name: string }[];
            const rows = parseRows(dimensionHeaders, metricHeaders, data.rows);

            return json({
                rows,
                count: rows.length,
                total_rows: Number(data.rowCount ?? rows.length),
                metadata: {
                    dimensions: dimensionHeaders.map((h: { name: string }) => h.name),
                    metrics: metricHeaders.map((h: { name: string }) => h.name),
                },
            });
        }

        case 'get_realtime_report': {
            const limit = Math.min(Number(args.limit ?? 100), 10000);
            const body: Record<string, unknown> = {
                metrics: ((args.metrics as string[]) || ['activeUsers']).map((m: string) => ({ name: m })),
                limit,
            };

            if (args.dimensions) {
                body.dimensions = ((args.dimensions as string[]) || []).map((d: string) => ({ name: d }));
            }
            if (args.dimension_filter) body.dimensionFilter = args.dimension_filter;
            if (args.metric_filter) body.metricFilter = args.metric_filter;

            const data = await ga4Fetch(token, `/${property}:runRealtimeReport`, 'POST', body);
            const dimensionHeaders = (data.dimensionHeaders ?? []) as { name: string }[];
            const metricHeaders = (data.metricHeaders ?? []) as { name: string }[];
            const rows = parseRows(dimensionHeaders, metricHeaders, data.rows);

            return json({
                rows,
                count: rows.length,
                total_rows: Number(data.rowCount ?? rows.length),
                metadata: {
                    dimensions: dimensionHeaders.map((h: { name: string }) => h.name),
                    metrics: metricHeaders.map((h: { name: string }) => h.name),
                },
            });
        }

        case 'get_metadata': {
            const data = await ga4Fetch(token, `/${property}/metadata`);
            const filter = ((args.filter as string) || '').toLowerCase();

            let dimensions = (data.dimensions ?? []).map((d: any) => ({
                name: d.apiName,
                display_name: d.uiName,
                description: d.description,
                category: d.category,
                custom: d.customDefinition ?? false,
            }));
            let metrics = (data.metrics ?? []).map((m: any) => ({
                name: m.apiName,
                display_name: m.uiName,
                description: m.description,
                category: m.category,
                type: m.type,
                custom: m.customDefinition ?? false,
            }));

            if (filter) {
                dimensions = dimensions.filter((d: any) =>
                    d.name.toLowerCase().includes(filter) ||
                    d.display_name?.toLowerCase().includes(filter) ||
                    d.description?.toLowerCase().includes(filter)
                );
                metrics = metrics.filter((m: any) =>
                    m.name.toLowerCase().includes(filter) ||
                    m.display_name?.toLowerCase().includes(filter) ||
                    m.description?.toLowerCase().includes(filter)
                );
            }

            return json({
                dimensions,
                metrics,
                dimension_count: dimensions.length,
                metric_count: metrics.length,
            });
        }

        case 'run_funnel_report': {
            const steps = (args.steps as any[]) || [];
            if (steps.length < 2) throw new Error('Funnel requires at least 2 steps');

            const body: Record<string, unknown> = {
                dateRanges: [{
                    startDate: (args.start_date as string) || '28daysAgo',
                    endDate: (args.end_date as string) || 'today',
                }],
                funnel: {
                    isOpenFunnel: args.is_open_funnel === true,
                    steps: steps.map((s: any) => ({
                        name: s.name,
                        filterExpression: s.filterExpression,
                    })),
                },
            };

            if (args.dimensions) {
                body.funnelBreakdown = {
                    breakdownDimension: { name: (args.dimensions as string[])[0] },
                };
            }

            const data = await ga4Fetch(token, `/${property}:runFunnelReport`, 'POST', body);
            const funnelTable = data.funnelTable;

            if (!funnelTable) {
                return json({ steps: [], message: 'No funnel data returned' });
            }

            const subHeaders = (funnelTable.subHeaders ?? []) as { name: string }[];
            const funnelRows = (funnelTable.rows ?? []).map((row: any) => {
                const obj: Record<string, string> = {};
                (row.dimensionValues ?? []).forEach((v: any, i: number) => {
                    const headerName = i === 0 ? 'funnelStepName' : `dimension_${i}`;
                    obj[headerName] = v.value;
                });
                (row.metricValues ?? []).forEach((v: any, i: number) => {
                    obj[subHeaders[i]?.name ?? `metric_${i}`] = v.value;
                });
                return obj;
            });

            return json({
                funnel_steps: funnelRows,
                count: funnelRows.length,
            });
        }

        case 'run_pivot_report': {
            const limit = Math.min(Number(args.limit ?? 100), 10000);
            const body: Record<string, unknown> = {
                dateRanges: [{
                    startDate: (args.start_date as string) || '28daysAgo',
                    endDate: (args.end_date as string) || 'today',
                }],
                dimensions: ((args.dimensions as string[]) || []).map((d: string) => ({ name: d })),
                metrics: ((args.metrics as string[]) || []).map((m: string) => ({ name: m })),
                pivots: ((args.pivots as any[]) || []).map((p: any) => ({
                    fieldNames: (p.fieldNames || []).map((f: string) => f),
                    limit: p.limit ?? 10,
                    orderBys: p.orderBys,
                })),
                limit,
            };

            if (args.dimension_filter) body.dimensionFilter = args.dimension_filter;

            const data = await ga4Fetch(token, `/${property}:runPivotReport`, 'POST', body);
            const dimensionHeaders = (data.dimensionHeaders ?? []) as { name: string }[];
            const metricHeaders = (data.metricHeaders ?? []) as { name: string }[];
            const pivotHeaders = (data.pivotHeaders ?? []) as any[];

            const rows = (data.rows ?? []).map((row: any) => {
                const obj: Record<string, string> = {};
                (row.dimensionValues ?? []).forEach((v: any, i: number) => {
                    obj[dimensionHeaders[i]?.name ?? `dim_${i}`] = v.value;
                });
                (row.metricValues ?? []).forEach((v: any, i: number) => {
                    obj[metricHeaders[i]?.name ?? `metric_${i}`] = v.value;
                });
                return obj;
            });

            return json({
                rows,
                count: rows.length,
                total_rows: Number(data.rowCount ?? rows.length),
                pivot_headers: pivotHeaders,
                metadata: {
                    dimensions: dimensionHeaders.map((h: { name: string }) => h.name),
                    metrics: metricHeaders.map((h: { name: string }) => h.name),
                },
            });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ─── Worker Entry ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-google-analytics', version: '1.0.0' });
        }
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = (await request.json()) as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-google-analytics', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const saJson = request.headers.get('X-Mcp-Secret-GOOGLE-SERVICE-ACCOUNT-JSON');
            const propertyId = request.headers.get('X-Mcp-Secret-GA4-PROPERTY-ID');

            if (!saJson) {
                return rpcErr(id, -32001, 'Missing GOOGLE_SERVICE_ACCOUNT_JSON secret — add your service account key JSON to workspace secrets');
            }
            if (!propertyId) {
                return rpcErr(id, -32001, 'Missing GA4_PROPERTY_ID secret — add your GA4 property ID (numeric) to workspace secrets');
            }

            let token: string;
            try {
                token = await getAccessToken(saJson);
            } catch (e: unknown) {
                return rpcErr(id, -32001, `Failed to authenticate: ${e instanceof Error ? e.message : 'unknown error'}`);
            }

            const { name, arguments: toolArgs = {} } = (params ?? {}) as {
                name: string;
                arguments?: Record<string, unknown>;
            };

            try {
                const result = await callTool(name, toolArgs, token, propertyId);
                return rpcOk(id, result);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
