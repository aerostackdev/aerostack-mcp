# mcp-google-ads — Google Ads MCP Server

> Manage Google Ads campaigns, ad groups, keywords, and budgets through the Google Ads REST API v17 — fully automated by AI agents.

Google Ads is the world's largest digital advertising platform, used by millions of businesses to reach customers through search, display, video, and shopping ads. This MCP server gives your agents complete access to the Google Ads API v17: listing and inspecting campaigns, ad groups, and ads, pulling keyword performance metrics, executing custom GAQL queries, and reviewing account budgets.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-google-ads`

---

## What You Can Do

- List and inspect campaigns with performance metrics — impressions, clicks, cost, conversions, CTR
- Drill into ad groups and individual ads within any campaign
- Pull keyword-level quality scores and performance data for optimization
- Execute any custom GAQL query for advanced reporting and analysis
- Review account-level budget allocation and spend

## Available Tools

| Tool | Description |
|------|-------------|
| _ping | Health check — returns "pong" if the server is running and secrets are configured |
| list_campaigns | List campaigns with status filter, budget, bidding strategy, and performance metrics |
| get_campaign | Get full details of a specific campaign — status, budget, bidding, optimization score, metrics |
| list_ad_groups | List ad groups within a campaign with CPC bids and performance metrics |
| get_ad_group_ads | Get ads in an ad group — headlines, descriptions, final URLs, approval status, metrics |
| search_query | Execute a raw GAQL query for advanced reporting and custom data pulls |
| get_keyword_metrics | Get keyword performance — impressions, clicks, CPC, conversions, quality score |
| get_account_budget | Get account-level budget info — approved/proposed limits, amount served, billing setup |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| GOOGLE_ADS_DEVELOPER_TOKEN | Yes | API developer token for accessing the Google Ads API | [Google Ads](https://ads.google.com) → Tools & Settings → Setup → API Center |
| GOOGLE_ADS_CLIENT_ID | Yes | OAuth2 client ID for authentication | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth client ID |
| GOOGLE_ADS_CLIENT_SECRET | Yes | OAuth2 client secret for authentication | Same location as client ID |
| GOOGLE_ADS_REFRESH_TOKEN | Yes | OAuth2 refresh token for offline access | Obtained via OAuth2 consent flow with `https://www.googleapis.com/auth/adwords` scope |
| GOOGLE_ADS_CUSTOMER_ID | Yes | Google Ads customer ID (10 digits, no dashes) | [Google Ads](https://ads.google.com) → top-right corner shows your customer ID |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Google Ads"** and click **Add to Workspace**
3. Add your secrets under **Project → Secrets**:
   - `GOOGLE_ADS_DEVELOPER_TOKEN`
   - `GOOGLE_ADS_CLIENT_ID`
   - `GOOGLE_ADS_CLIENT_SECRET`
   - `GOOGLE_ADS_REFRESH_TOKEN`
   - `GOOGLE_ADS_CUSTOMER_ID`

Once added, every AI agent in your workspace can manage Google Ads automatically — no per-user setup needed.

### Example Prompts

```
"List all my active Google Ads campaigns and their spend for this month"
"Show me the top 10 keywords by clicks in ad group 123456789 over the last 30 days"
"Which campaigns have a CTR below 2%? I want to pause underperformers"
"Run a GAQL query to get daily cost breakdown for campaign 987654321 over the last 7 days"
"What's my account budget status — how much have I spent vs. my approved limit?"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-google-ads \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-GOOGLE-ADS-DEVELOPER-TOKEN: your-dev-token' \
  -H 'X-Mcp-Secret-GOOGLE-ADS-CLIENT-ID: your-client-id' \
  -H 'X-Mcp-Secret-GOOGLE-ADS-CLIENT-SECRET: your-client-secret' \
  -H 'X-Mcp-Secret-GOOGLE-ADS-REFRESH-TOKEN: your-refresh-token' \
  -H 'X-Mcp-Secret-GOOGLE-ADS-CUSTOMER-ID: 1234567890' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_campaigns","arguments":{"status":"ENABLED","limit":10}}}'
```

## License

MIT
