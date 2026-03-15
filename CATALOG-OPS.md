# MCP Catalog Operations

## How the catalog works

`MCP-list.json` is the source of truth for the marketplace catalog.
The filesystem (`mcp-{service}/` dirs and `proxy/{service}/` dirs) drives tier and status.
Run `npm run sync-catalog` after any add/remove/retire operation.

The sync is **idempotent** — running it multiple times produces the same result.
`status: "deprecated"` is a manual flag and is **never overwritten** by the sync.

---

## Checking catalog status

```bash
npm run catalog-status
```

Output example:
```
MCP Catalog Status
==================
✅ Build (live):      37 workers
🔗 Proxy (live):      14 proxies
⏳ Pending:          603 entries
❌ Deprecated:         0 entries
──────────────────────────────────────
Total:               654 entries

Build Workers (from filesystem):
  ✅ mcp-airtable              (12 tools)
  ✅ mcp-slack                 (8 tools)
  ...

Proxy Services (from proxy/ directory):
  🔗 cloudflare      → https://mcp.cloudflare.com/mcp
  🔗 github          → https://api.githubcopilot.com/mcp/
  ...
```

---

## Operations

### Add a new Worker

1. Create `MCP/mcp-{service}/` with all required files:
   - `src/index.ts` — Worker code (TOOLS array + callTool handler)
   - `aerostack.toml` — deploy config
   - `package.json` — dependencies
   - `tsconfig.json`
2. Run sync to update the catalog:
   ```bash
   npm run sync-catalog
   ```
3. Deploy to Cloudflare:
   ```bash
   cd MCP/mcp-{service} && npx wrangler deploy
   ```

### Add a proxy (service has an official hosted MCP endpoint)

1. Create `MCP/proxy/{service}/proxy.json` with required fields (see format below).
2. Create `MCP/proxy/{service}/README.md` with usage instructions.
3. Run sync to update the catalog:
   ```bash
   npm run sync-catalog
   ```

### Retire a Worker to proxy (service launched their own hosted MCP)

1. Create `MCP/proxy/{service}/proxy.json` + `README.md`.
2. Delete `MCP/mcp-{service}/` directory.
3. Undeploy from Cloudflare:
   ```bash
   npx wrangler delete --name mcp-{service}
   ```
4. Run sync — catalog entry flips from `build` to `proxy`:
   ```bash
   npm run sync-catalog
   ```

### Retire a service entirely

1. Manually set `"status": "deprecated"` in `MCP-list.json` for that entry.
2. Delete the directory if it exists.
3. The sync script will **preserve** the deprecated status and never overwrite it.

### Update a Worker (add/change tools)

1. Edit `MCP/mcp-{service}/src/index.ts`.
2. Run tests:
   ```bash
   cd MCP/mcp-{service} && npm test
   ```
3. Deploy:
   ```bash
   npx wrangler deploy
   ```
4. **No catalog sync needed** — code changes don't affect catalog metadata.
5. If you added new tools, update the `description` in `MCP-list.json` manually.

### Preview what sync will change (dry run)

```bash
npm run sync-catalog:dry-run
```

---

## Sync rules reference

| Filesystem state | Catalog action |
|------------------|----------------|
| `mcp-{service}/src/index.ts` exists | Set `tier: "build"`, `status: "live"` |
| `proxy/{service}/proxy.json` exists | Set `tier: "proxy"`, `status: "live"`, copy `proxy_url`, `auth_type`, `env_vars` |
| Neither dir nor proxy, was `"live"` | Set `status: "pending"` |
| Neither dir nor proxy, was `"deprecated"` | **Leave unchanged** |
| Neither dir nor proxy, was `"pending"` | Leave unchanged |
| Not in catalog at all | Add new minimal entry |

---

## Proxy.json format

```json
{
  "id": "github",
  "name": "GitHub",
  "tier": "proxy",
  "status": "live",
  "proxy_url": "https://api.githubcopilot.com/mcp/",
  "auth_type": "bearer",
  "category": "Developer Tools",
  "description": "GitHub repos, PRs, issues, branches, code search via GitHub's official hosted MCP",
  "env_vars": [
    {
      "key": "GITHUB_PERSONAL_ACCESS_TOKEN",
      "required": true,
      "secret": true,
      "description": "GitHub Personal Access Token with required scopes",
      "how_to_set": "github.com → Settings → Developer settings → Personal access tokens → Generate new token"
    }
  ]
}
```

Fields:

| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | Unique slug, lowercase, hyphenated |
| `name` | Yes | Human-readable display name |
| `tier` | Yes | Always `"proxy"` |
| `status` | Yes | Always `"live"` |
| `proxy_url` | Yes | The MCP endpoint URL |
| `auth_type` | Yes | `"bearer"`, `"oauth"`, `"apikey"`, or `"none"` |
| `category` | Yes | Matches a category from `MCP-list.json` |
| `description` | Yes | One-line description |
| `env_vars` | Yes | Array of env var objects (can be empty `[]`) |

---

## MCP-list.json entry schema

Catalog entries have this shape:

```json
{
  "id": "slack",
  "npm": "@modelcontextprotocol/server-slack",
  "category": "Communication",
  "status": "live",
  "tier": "build",
  "env_vars": ["SLACK_BOT_TOKEN"],
  "description": "Slack channels, messages, users, search"
}
```

Proxy entries additionally have:
```json
{
  "proxy_url": "https://mcp.stripe.com",
  "auth_type": "bearer",
  "name": "Stripe"
}
```

The `env_vars` field may be either:
- A flat string array: `["API_KEY", "BASE_URL"]` (older format)
- An object array with full metadata (newer format, used in `proxy.json` files)

The sync script preserves whichever format is present unless the proxy.json has richer object-format env_vars.

---

## File locations

```
MCP/
├── MCP-list.json          ← Master catalog (source of truth)
├── package.json           ← npm scripts: sync-catalog, catalog-status
├── scripts/
│   ├── sync-catalog.mjs   ← Sync filesystem → catalog
│   ├── catalog-status.mjs ← Human-readable status report
│   └── mcp-sync.sh        ← Git sync (CI/CD, pushes to aerostack-mcp repo)
├── mcp-{service}/         ← Built Cloudflare Workers
│   └── src/index.ts       ← Must exist for worker to be counted
└── proxy/
    └── {service}/
        ├── proxy.json     ← Required: proxy endpoint config
        └── README.md      ← Recommended: usage docs
```
