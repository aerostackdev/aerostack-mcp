/**
 * Google Ads MCP Worker
 * Implements MCP protocol over HTTP for Google Ads REST API v17.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets required:
 *   GOOGLE_ADS_DEVELOPER_TOKEN  → X-Mcp-Secret-GOOGLE-ADS-DEVELOPER-TOKEN
 *   GOOGLE_ADS_CLIENT_ID        → X-Mcp-Secret-GOOGLE-ADS-CLIENT-ID
 *   GOOGLE_ADS_CLIENT_SECRET    → X-Mcp-Secret-GOOGLE-ADS-CLIENT-SECRET
 *   GOOGLE_ADS_REFRESH_TOKEN    → X-Mcp-Secret-GOOGLE-ADS-REFRESH-TOKEN
 *   GOOGLE_ADS_CUSTOMER_ID      → X-Mcp-Secret-GOOGLE-ADS-CUSTOMER-ID
 *
 * Auth: OAuth2 refresh flow → Bearer token
 * API base: https://googleads.googleapis.com/v17/
 *
 * Covers: Campaigns (2), Ad Groups (1), Ads (1), GAQL (1), Keywords (1), Budget (1), Ping (1) = 8 tools total
 */

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

function text(data: string) {
    return { content: [{ type: 'text', text: data }] };
}

function json(data: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function validateRequired(args: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (args[field] === undefined || args[field] === null || args[field] === '') {
            throw new Error(`Missing required parameter: ${field}`);
        }
    }
}

// ── OAuth2 token cache ───────────────────────────────────────────────────────

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + 60_000) {
        return cachedToken.accessToken;
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
        }).toString(),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(
            `OAuth2 token refresh failed (HTTP ${res.status}): ${text}. Verify GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_ADS_REFRESH_TOKEN are correct.`,
        );
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = {
        accessToken: data.access_token,
        expiresAt: now + data.expires_in * 1000,
    };
    return cachedToken.accessToken;
}

// ── Google Ads API caller ────────────────────────────────────────────────────

const BASE_URL = 'https://googleads.googleapis.com/v17';

function formatCustomerId(raw: string): string {
    // Strip dashes — API expects plain digits
    return raw.replace(/-/g, '');
}

async function gadsApi(
    path: string,
    accessToken: string,
    developerToken: string,
    method = 'GET',
    body?: unknown,
): Promise<unknown> {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const responseText = await res.text();
    let data: Record<string, unknown> = {};
    try {
        data = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
        throw new Error(`Google Ads HTTP ${res.status}: ${responseText}`);
    }

    if (!res.ok) {
        const error = data.error as Record<string, unknown> | undefined;
        const message = error?.message ?? responseText;
        const status = error?.status ?? res.status;

        switch (res.status) {
            case 401:
                throw new Error(
                    `Authentication failed (${status}): ${message}. Your OAuth2 token may have expired or credentials are incorrect.`,
                );
            case 403:
                throw new Error(
                    `Permission denied (${status}): ${message}. Verify your developer token is approved and customer ID is accessible.`,
                );
            case 404:
                throw new Error(`Not found (${status}): ${message}`);
            case 429:
                throw new Error(
                    `Rate limited — Google Ads API quota exceeded. Please retry after a moment.`,
                );
            default:
                throw new Error(`Google Ads HTTP ${res.status}: ${message}`);
        }
    }

    return data;
}

async function gadsSearch(
    customerId: string,
    query: string,
    accessToken: string,
    developerToken: string,
    pageSize = 100,
    pageToken?: string,
): Promise<unknown> {
    const body: Record<string, unknown> = {
        query,
        pageSize,
    };
    if (pageToken) body.pageToken = pageToken;

    return gadsApi(
        `/customers/${customerId}/googleAds:searchStream`,
        accessToken,
        developerToken,
        'POST',
        body,
    );
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Health check — returns "pong" if the server is running and secrets are configured.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'list_campaigns',
        description: 'List Google Ads campaigns in the account. Returns campaign name, status, budget, bidding strategy, and metrics. Optionally filter by status.',
        inputSchema: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['ENABLED', 'PAUSED', 'REMOVED'],
                    description: 'Filter campaigns by status (optional — returns all if omitted)',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of campaigns to return (default 50)',
                },
            },
        },
    },
    {
        name: 'get_campaign',
        description: 'Get detailed information about a specific Google Ads campaign — status, budget, bidding strategy, start/end dates, and performance metrics.',
        inputSchema: {
            type: 'object',
            properties: {
                campaign_id: {
                    type: 'string',
                    description: 'Google Ads campaign ID (numeric string, e.g. "123456789")',
                },
            },
            required: ['campaign_id'],
        },
    },
    {
        name: 'list_ad_groups',
        description: 'List ad groups within a campaign. Returns ad group name, status, CPC bid, and performance metrics.',
        inputSchema: {
            type: 'object',
            properties: {
                campaign_id: {
                    type: 'string',
                    description: 'Campaign ID to list ad groups for',
                },
                status: {
                    type: 'string',
                    enum: ['ENABLED', 'PAUSED', 'REMOVED'],
                    description: 'Filter ad groups by status (optional)',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of ad groups to return (default 50)',
                },
            },
            required: ['campaign_id'],
        },
    },
    {
        name: 'get_ad_group_ads',
        description: 'Get ads within a specific ad group. Returns ad type, headlines, descriptions, final URLs, and approval status.',
        inputSchema: {
            type: 'object',
            properties: {
                ad_group_id: {
                    type: 'string',
                    description: 'Ad group ID to list ads for',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of ads to return (default 50)',
                },
            },
            required: ['ad_group_id'],
        },
    },
    {
        name: 'search_query',
        description: 'Execute a raw Google Ads Query Language (GAQL) query. Use this for advanced reporting, custom metrics, or any data not covered by other tools. See https://developers.google.com/google-ads/api/fields/v17/overview for available fields.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'GAQL query string (e.g. "SELECT campaign.name, metrics.clicks FROM campaign WHERE metrics.clicks > 100 ORDER BY metrics.clicks DESC LIMIT 10")',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_keyword_metrics',
        description: 'Get performance metrics for keywords in an ad group — impressions, clicks, CTR, average CPC, conversions, and quality score.',
        inputSchema: {
            type: 'object',
            properties: {
                ad_group_id: {
                    type: 'string',
                    description: 'Ad group ID to get keyword metrics for',
                },
                date_range: {
                    type: 'string',
                    enum: ['LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS', 'THIS_MONTH', 'LAST_MONTH', 'ALL_TIME'],
                    description: 'Date range for metrics (default LAST_30_DAYS)',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of keywords to return (default 50)',
                },
            },
            required: ['ad_group_id'],
        },
    },
    {
        name: 'get_account_budget',
        description: 'Get account-level budget information — total budget, amount spent, pending proposals, and billing setup.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
];

// ── callTool ──────────────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    accessToken: string,
    developerToken: string,
    customerId: string,
): Promise<unknown> {
    switch (name) {

        case '_ping': {
            return text('pong — Google Ads MCP server is running');
        }

        // ── Campaigns ─────────────────────────────────────────────────────────

        case 'list_campaigns': {
            const limit = (args.limit as number) ?? 50;
            const statusFilter = args.status ? ` WHERE campaign.status = '${args.status as string}'` : '';
            const query = `SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                campaign.bidding_strategy_type,
                campaign.start_date,
                campaign.end_date,
                campaign_budget.amount_micros,
                campaign_budget.delivery_method,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.ctr,
                metrics.average_cpc
            FROM campaign${statusFilter}
            ORDER BY metrics.cost_micros DESC
            LIMIT ${limit}`;

            const data = await gadsSearch(customerId, query, accessToken, developerToken) as unknown[];
            const results = (data ?? []).flatMap((batch: unknown) => {
                const b = batch as { results?: unknown[] };
                return b.results ?? [];
            });

            return json({
                total: results.length,
                campaigns: results.map((r: unknown) => {
                    const row = r as Record<string, Record<string, unknown>>;
                    const c = row.campaign ?? {};
                    const b = row.campaignBudget ?? {};
                    const m = row.metrics ?? {};
                    return {
                        id: c.id,
                        name: c.name,
                        status: c.status,
                        channel_type: c.advertisingChannelType,
                        bidding_strategy: c.biddingStrategyType,
                        start_date: c.startDate,
                        end_date: c.endDate,
                        budget_micros: b.amountMicros,
                        budget_delivery: b.deliveryMethod,
                        impressions: m.impressions,
                        clicks: m.clicks,
                        cost_micros: m.costMicros,
                        conversions: m.conversions,
                        ctr: m.ctr,
                        average_cpc: m.averageCpc,
                    };
                }),
            });
        }

        case 'get_campaign': {
            validateRequired(args, ['campaign_id']);
            const campaignId = args.campaign_id as string;
            const query = `SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                campaign.advertising_channel_sub_type,
                campaign.bidding_strategy_type,
                campaign.start_date,
                campaign.end_date,
                campaign.serving_status,
                campaign.optimization_score,
                campaign_budget.amount_micros,
                campaign_budget.delivery_method,
                campaign_budget.period,
                campaign_budget.total_amount_micros,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.ctr,
                metrics.average_cpc,
                metrics.average_cpm,
                metrics.cost_per_conversion
            FROM campaign
            WHERE campaign.id = ${campaignId}
            LIMIT 1`;

            const data = await gadsSearch(customerId, query, accessToken, developerToken) as unknown[];
            const results = (data ?? []).flatMap((batch: unknown) => {
                const b = batch as { results?: unknown[] };
                return b.results ?? [];
            });

            if (results.length === 0) {
                throw new Error(`Campaign ${campaignId} not found`);
            }

            const row = results[0] as Record<string, Record<string, unknown>>;
            const c = row.campaign ?? {};
            const b = row.campaignBudget ?? {};
            const m = row.metrics ?? {};
            return json({
                id: c.id,
                name: c.name,
                status: c.status,
                serving_status: c.servingStatus,
                channel_type: c.advertisingChannelType,
                channel_sub_type: c.advertisingChannelSubType,
                bidding_strategy: c.biddingStrategyType,
                optimization_score: c.optimizationScore,
                start_date: c.startDate,
                end_date: c.endDate,
                budget: {
                    amount_micros: b.amountMicros,
                    delivery_method: b.deliveryMethod,
                    period: b.period,
                    total_amount_micros: b.totalAmountMicros,
                },
                metrics: {
                    impressions: m.impressions,
                    clicks: m.clicks,
                    cost_micros: m.costMicros,
                    conversions: m.conversions,
                    ctr: m.ctr,
                    average_cpc: m.averageCpc,
                    average_cpm: m.averageCpm,
                    cost_per_conversion: m.costPerConversion,
                },
            });
        }

        // ── Ad Groups ─────────────────────────────────────────────────────────

        case 'list_ad_groups': {
            validateRequired(args, ['campaign_id']);
            const campaignId = args.campaign_id as string;
            const limit = (args.limit as number) ?? 50;
            const statusFilter = args.status
                ? ` AND ad_group.status = '${args.status as string}'`
                : '';
            const query = `SELECT
                ad_group.id,
                ad_group.name,
                ad_group.status,
                ad_group.type,
                ad_group.cpc_bid_micros,
                campaign.id,
                campaign.name,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.ctr,
                metrics.average_cpc
            FROM ad_group
            WHERE campaign.id = ${campaignId}${statusFilter}
            ORDER BY metrics.cost_micros DESC
            LIMIT ${limit}`;

            const data = await gadsSearch(customerId, query, accessToken, developerToken) as unknown[];
            const results = (data ?? []).flatMap((batch: unknown) => {
                const b = batch as { results?: unknown[] };
                return b.results ?? [];
            });

            return json({
                campaign_id: campaignId,
                total: results.length,
                ad_groups: results.map((r: unknown) => {
                    const row = r as Record<string, Record<string, unknown>>;
                    const ag = row.adGroup ?? {};
                    const m = row.metrics ?? {};
                    return {
                        id: ag.id,
                        name: ag.name,
                        status: ag.status,
                        type: ag.type,
                        cpc_bid_micros: ag.cpcBidMicros,
                        impressions: m.impressions,
                        clicks: m.clicks,
                        cost_micros: m.costMicros,
                        conversions: m.conversions,
                        ctr: m.ctr,
                        average_cpc: m.averageCpc,
                    };
                }),
            });
        }

        // ── Ads ───────────────────────────────────────────────────────────────

        case 'get_ad_group_ads': {
            validateRequired(args, ['ad_group_id']);
            const adGroupId = args.ad_group_id as string;
            const limit = (args.limit as number) ?? 50;
            const query = `SELECT
                ad_group_ad.ad.id,
                ad_group_ad.ad.name,
                ad_group_ad.ad.type,
                ad_group_ad.ad.final_urls,
                ad_group_ad.ad.responsive_search_ad.headlines,
                ad_group_ad.ad.responsive_search_ad.descriptions,
                ad_group_ad.status,
                ad_group_ad.policy_summary.approval_status,
                ad_group.id,
                ad_group.name,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.ctr
            FROM ad_group_ad
            WHERE ad_group.id = ${adGroupId}
            ORDER BY metrics.impressions DESC
            LIMIT ${limit}`;

            const data = await gadsSearch(customerId, query, accessToken, developerToken) as unknown[];
            const results = (data ?? []).flatMap((batch: unknown) => {
                const b = batch as { results?: unknown[] };
                return b.results ?? [];
            });

            return json({
                ad_group_id: adGroupId,
                total: results.length,
                ads: results.map((r: unknown) => {
                    const row = r as Record<string, Record<string, unknown>>;
                    const aga = row.adGroupAd ?? {} as Record<string, unknown>;
                    const ad = (aga.ad ?? {}) as Record<string, unknown>;
                    const rsa = (ad.responsiveSearchAd ?? {}) as Record<string, unknown>;
                    const policy = (aga.policySummary ?? {}) as Record<string, unknown>;
                    const m = row.metrics ?? {};
                    return {
                        ad_id: ad.id,
                        name: ad.name,
                        type: ad.type,
                        status: aga.status,
                        approval_status: policy.approvalStatus,
                        final_urls: ad.finalUrls,
                        headlines: rsa.headlines,
                        descriptions: rsa.descriptions,
                        impressions: m.impressions,
                        clicks: m.clicks,
                        cost_micros: m.costMicros,
                        conversions: m.conversions,
                        ctr: m.ctr,
                    };
                }),
            });
        }

        // ── GAQL Search ───────────────────────────────────────────────────────

        case 'search_query': {
            validateRequired(args, ['query']);
            const query = args.query as string;
            const data = await gadsSearch(customerId, query, accessToken, developerToken) as unknown[];
            const results = (data ?? []).flatMap((batch: unknown) => {
                const b = batch as { results?: unknown[] };
                return b.results ?? [];
            });
            return json({
                total: results.length,
                results,
            });
        }

        // ── Keywords ──────────────────────────────────────────────────────────

        case 'get_keyword_metrics': {
            validateRequired(args, ['ad_group_id']);
            const adGroupId = args.ad_group_id as string;
            const dateRange = (args.date_range as string) ?? 'LAST_30_DAYS';
            const limit = (args.limit as number) ?? 50;
            const query = `SELECT
                ad_group_criterion.keyword.text,
                ad_group_criterion.keyword.match_type,
                ad_group_criterion.status,
                ad_group_criterion.quality_info.quality_score,
                ad_group_criterion.quality_info.creative_quality_score,
                ad_group_criterion.quality_info.post_click_quality_score,
                ad_group_criterion.quality_info.search_predicted_ctr,
                ad_group.id,
                ad_group.name,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.ctr,
                metrics.average_cpc
            FROM keyword_view
            WHERE ad_group.id = ${adGroupId}
                AND segments.date DURING ${dateRange}
            ORDER BY metrics.impressions DESC
            LIMIT ${limit}`;

            const data = await gadsSearch(customerId, query, accessToken, developerToken) as unknown[];
            const results = (data ?? []).flatMap((batch: unknown) => {
                const b = batch as { results?: unknown[] };
                return b.results ?? [];
            });

            return json({
                ad_group_id: adGroupId,
                date_range: dateRange,
                total: results.length,
                keywords: results.map((r: unknown) => {
                    const row = r as Record<string, Record<string, unknown>>;
                    const crit = row.adGroupCriterion ?? {} as Record<string, unknown>;
                    const kw = (crit.keyword ?? {}) as Record<string, unknown>;
                    const qi = (crit.qualityInfo ?? {}) as Record<string, unknown>;
                    const m = row.metrics ?? {};
                    return {
                        keyword: kw.text,
                        match_type: kw.matchType,
                        status: crit.status,
                        quality_score: qi.qualityScore,
                        creative_quality: qi.creativeQualityScore,
                        landing_page_quality: qi.postClickQualityScore,
                        predicted_ctr: qi.searchPredictedCtr,
                        impressions: m.impressions,
                        clicks: m.clicks,
                        cost_micros: m.costMicros,
                        conversions: m.conversions,
                        ctr: m.ctr,
                        average_cpc: m.averageCpc,
                    };
                }),
            });
        }

        // ── Account Budget ────────────────────────────────────────────────────

        case 'get_account_budget': {
            const query = `SELECT
                account_budget.id,
                account_budget.name,
                account_budget.status,
                account_budget.approved_spending_limit_micros,
                account_budget.approved_spending_limit_type,
                account_budget.proposed_spending_limit_micros,
                account_budget.proposed_spending_limit_type,
                account_budget.adjusted_spending_limit_micros,
                account_budget.adjusted_spending_limit_type,
                account_budget.amount_served_micros,
                account_budget.billing_setup,
                account_budget.purchase_order_number
            FROM account_budget
            ORDER BY account_budget.id DESC
            LIMIT 10`;

            const data = await gadsSearch(customerId, query, accessToken, developerToken) as unknown[];
            const results = (data ?? []).flatMap((batch: unknown) => {
                const b = batch as { results?: unknown[] };
                return b.results ?? [];
            });

            return json({
                total: results.length,
                budgets: results.map((r: unknown) => {
                    const row = r as Record<string, Record<string, unknown>>;
                    const ab = row.accountBudget ?? {};
                    return {
                        id: ab.id,
                        name: ab.name,
                        status: ab.status,
                        approved_spending_limit_micros: ab.approvedSpendingLimitMicros,
                        approved_spending_limit_type: ab.approvedSpendingLimitType,
                        proposed_spending_limit_micros: ab.proposedSpendingLimitMicros,
                        proposed_spending_limit_type: ab.proposedSpendingLimitType,
                        adjusted_spending_limit_micros: ab.adjustedSpendingLimitMicros,
                        adjusted_spending_limit_type: ab.adjustedSpendingLimitType,
                        amount_served_micros: ab.amountServedMicros,
                        billing_setup: ab.billingSetup,
                        purchase_order_number: ab.purchaseOrderNumber,
                    };
                }),
            });
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
                JSON.stringify({ status: 'ok', server: 'mcp-google-ads', tools: TOOLS.length }),
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
                serverInfo: { name: 'mcp-google-ads', version: '1.0.0' },
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
        const developerToken = request.headers.get('X-Mcp-Secret-GOOGLE-ADS-DEVELOPER-TOKEN');
        const clientId = request.headers.get('X-Mcp-Secret-GOOGLE-ADS-CLIENT-ID');
        const clientSecret = request.headers.get('X-Mcp-Secret-GOOGLE-ADS-CLIENT-SECRET');
        const refreshToken = request.headers.get('X-Mcp-Secret-GOOGLE-ADS-REFRESH-TOKEN');
        const rawCustomerId = request.headers.get('X-Mcp-Secret-GOOGLE-ADS-CUSTOMER-ID');

        const toolParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = toolParams.name;
        const args = toolParams.arguments ?? {};

        // _ping does not require secrets
        if (toolName === '_ping') {
            const configured = !!(developerToken && clientId && clientSecret && refreshToken && rawCustomerId);
            try {
                const result = await callTool(toolName, args, '', '', '');
                if (configured) {
                    return rpcOk(id, text('pong — Google Ads MCP server is running, all secrets configured'));
                }
                return rpcOk(id, result);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return rpcErr(id, -32603, msg);
            }
        }

        if (!developerToken || !clientId || !clientSecret || !refreshToken || !rawCustomerId) {
            const missing: string[] = [];
            if (!developerToken) missing.push('GOOGLE_ADS_DEVELOPER_TOKEN');
            if (!clientId) missing.push('GOOGLE_ADS_CLIENT_ID');
            if (!clientSecret) missing.push('GOOGLE_ADS_CLIENT_SECRET');
            if (!refreshToken) missing.push('GOOGLE_ADS_REFRESH_TOKEN');
            if (!rawCustomerId) missing.push('GOOGLE_ADS_CUSTOMER_ID');
            return rpcErr(
                id,
                -32001,
                `Missing required secrets: ${missing.join(', ')}. Add them to your workspace secrets.`,
            );
        }

        const customerId = formatCustomerId(rawCustomerId);

        try {
            const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
            const result = await callTool(toolName, args, accessToken, developerToken, customerId);
            return rpcOk(id, result);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.startsWith('Missing required parameter:')) {
                return rpcErr(id, -32603, msg);
            }
            return rpcErr(id, -32603, msg);
        }
    },
};
