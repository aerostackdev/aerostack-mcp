# Aerostack MCP Catalog

Community-built MCP (Model Context Protocol) servers hosted on Cloudflare's edge infrastructure via [Aerostack](https://aerostack.dev).

**One endpoint. All your tools. No local processes.**

Add any of these servers to your Aerostack workspace and they're instantly available to Claude, Cursor, Windsurf, and any other MCP-compatible AI client — no npm, no local config, no environment variables on your machine.

---

## Available Servers

| Service | Category | Tools | Secrets Required |
|---|---|---|---|
| ✅ [Cloudflare](./mcp-cloudflare/) | Infrastructure | Workers, KV, R2, D1 | `CF_API_TOKEN`, `CF_ACCOUNT_ID` |
| ✅ [GitHub](./mcp-github/) | Developer Tools | Repos, Issues, PRs | `GITHUB_TOKEN` |
| ✅ [Notion](./mcp-notion/) | Productivity | Pages, Databases, Search | `NOTION_TOKEN` |
| ✅ [Slack](./mcp-slack/) | Communication | Channels, Messages, Search | `SLACK_BOT_TOKEN` |
| ✅ [Linear](./mcp-linear/) | Project Mgmt | Issues, Projects, Teams | `LINEAR_API_KEY` |
| ✅ [Stripe](./mcp-stripe/) | Payments | Customers, Invoices, Subscriptions | `STRIPE_SECRET_KEY` |
| ✅ [Shopify](./mcp-shopify/) | E-commerce | Products, Orders, Customers | `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_SHOP_DOMAIN` |
| ✅ [Jira](./mcp-jira/) | Project Mgmt | Issues, Projects, Transitions | `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_DOMAIN` |
| ✅ [Airtable](./mcp-airtable/) | Databases | Records, Tables, Bases | `AIRTABLE_API_KEY` |
| ✅ [Resend](./mcp-resend/) | Email | Send, List, Domains | `RESEND_API_KEY` |
| ✅ [Twilio](./mcp-twilio/) | SMS | Send SMS, List Messages | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |
| ✅ [HubSpot](./mcp-hubspot/) | CRM | Contacts, Deals, Companies | `HUBSPOT_ACCESS_TOKEN` |
| ✅ [Supabase](./mcp-supabase/) | Database | Select, Insert, Update, Delete, RPC, Storage | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| ✅ [Vercel](./mcp-vercel/) | Infrastructure | Projects, Deployments, Domains, Env Vars | `VERCEL_TOKEN` |
| ✅ [Sentry](./mcp-sentry/) | Monitoring | Orgs, Projects, Issues, Events, Releases | `SENTRY_AUTH_TOKEN` |
| ✅ [Google Calendar](./mcp-google-calendar/) | Productivity | Calendars, Events, CRUD, Quick Add | `GOOGLE_ACCESS_TOKEN` |
| ✅ [Figma](./mcp-figma/) | Design | Files, Nodes, Comments, Components, Styles, Images | `FIGMA_ACCESS_TOKEN` |
| ✅ [OpenAI](./mcp-openai/) | AI | Chat, Models, Embeddings, Images, Moderation | `OPENAI_API_KEY` |
| ✅ [PlanetScale](./mcp-planetscale/) | Database | Databases, Branches, Deploy Requests | `PLANETSCALE_TOKEN` |
| ✅ [Railway](./mcp-railway/) | Infrastructure | Projects, Services, Deployments, Logs, Variables | `RAILWAY_API_TOKEN` |

**Want a server that's not listed?** [Open an issue →](https://github.com/aerostackdev/aerostack-mcp/issues/new?labels=request&template=server_request.md)

---

## Using These Servers

Sign up at [aerostack.dev](https://aerostack.dev) and add any of these servers to your workspace in one click. Secrets are encrypted and injected at request time — your API keys stay in Aerostack's secure vault, not in config files on your machine.

Once added, paste a single endpoint into your AI client:

```json
// ~/.cursor/mcp.json  |  Claude Desktop  |  Windsurf
{
  "mcpServers": {
    "aerostack": {
      "url": "https://aerostack.run/api/gateway/ws/YOUR_WORKSPACE_SLUG",
      "headers": {
        "Authorization": "Bearer mwt_YOUR_WORKSPACE_TOKEN"
      }
    }
  }
}
```

All tools from all your servers, namespaced automatically — `notion__search`, `slack__post_message`, `stripe__list_customers`, etc.

---

## How It Works

Each server is a tiny Cloudflare Worker that:

1. Accepts JSON-RPC 2.0 POST requests
2. Reads secrets from `X-Mcp-Secret-*` headers (injected by the Aerostack gateway)
3. Calls the target API with your credentials
4. Returns tool results as MCP-formatted content

There are no runtime dependencies, no npm packages, and no cold start delay. Just pure `fetch()` calls at the edge.

---

## Contributing

We welcome contributions — new servers, more tools, bug fixes, better error messages.

### Adding a new server

1. Fork this repo
2. Copy the template: `cp -r mcp-github mcp-YOUR_SERVICE`
3. Edit `mcp-YOUR_SERVICE/src/index.ts` — implement the `TOOLS` array and `callTool()` function
4. Update `mcp-YOUR_SERVICE/aerostack.toml` with the correct worker name
5. Test locally: `cd mcp-YOUR_SERVICE && aerostack dev`
6. Submit a PR describing what the server does and which API it wraps

### Adding tools to an existing server

Open `mcp-{slug}/src/index.ts`, add a new entry to the `TOOLS` array, and implement the case in `callTool()`. Submit a PR.

### Template structure

```typescript
// Every server follows this exact pattern:

const TOOLS = [
    {
        name: 'tool_name',
        description: 'What this tool does',
        inputSchema: {
            type: 'object',
            properties: {
                param: { type: 'string', description: '...' },
            },
            required: ['param'],
        },
    },
];

async function callTool(name: string, args: Record<string, unknown>, token: string) {
    switch (name) {
        case 'tool_name': {
            const res = await fetch('https://api.example.com/endpoint', {
                headers: { Authorization: `Bearer ${token}` },
            });
            return res.json();
        }
    }
}
```

### Testing locally

Install the [Aerostack CLI](https://aerostack.dev/docs/cli) once — no wrangler, no extra config:

```bash
npm install -g aerostack
```

Then:

```bash
cd mcp-YOUR_SERVICE
aerostack dev

# In another terminal:
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-YOUR-TOKEN: test_token_here" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

To deploy to Aerostack's hosted catalog:

```bash
aerostack deploy mcp --slug YOUR_SERVICE
```

---

## Is This Your Company's MCP?

If you work at Notion, Slack, Stripe, or any other company with a server in this catalog — you can **claim it** and take over maintenance.

Claiming gives you:
- Your company's verified profile on the Aerostack Hub marketplace
- Full control over the server (code, tools, versioning)
- Option to add paid access tiers (Phase 5)
- Your branding instead of "by Aerostack"

To claim: email **mcp@aerostack.dev** with your company domain and we'll verify and transfer ownership within 48 hours.

---

## MCP Protocol

All servers implement [MCP 2024-11-05](https://spec.modelcontextprotocol.io) over HTTP (JSON-RPC 2.0):

- `POST /` — handle `initialize`, `tools/list`, `tools/call`
- `GET /health` — health check
- Secrets via `X-Mcp-Secret-{ENV_VAR_NAME}` headers

---

## License

MIT — free to use, fork, and modify.
