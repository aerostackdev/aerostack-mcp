# mcp-ghost

MCP server for [Ghost](https://ghost.org) — manage posts, pages, and members via the Ghost Admin API with JWT authentication.

## Tools (9)

| Tool | Description |
|------|-------------|
| `list_posts` | List posts (filter by status: published/draft/scheduled) |
| `get_post` | Get a specific post with full HTML content |
| `create_post` | Create a new post (draft or published) |
| `update_post` | Update post fields (requires updated_at for conflict detection) |
| `delete_post` | Delete a post permanently |
| `publish_post` | Publish a draft post (shortcut for update with status=published) |
| `list_pages` | List pages (filter by status) |
| `list_members` | List members (filter by email) |
| `create_member` | Create a new member with optional labels |

## Required Secrets

| Secret Header | Description |
|---------------|-------------|
| `X-Mcp-Secret-GHOST-URL` | Full Ghost URL (e.g. `https://myblog.ghost.io`) — no trailing slash |
| `X-Mcp-Secret-GHOST-ADMIN-API-KEY` | Admin API key in format `{id}:{secret}` |

## Auth

Ghost Admin API uses JWT authentication:
1. Split the Admin API key on `:` to get `id` and `hexSecret`
2. Create a JWT signed with HMAC-SHA256 using the hex-decoded secret
3. JWT header includes `kid: id`, payload has 5-minute expiry with `aud: '/admin/'`
4. Attach as `Authorization: Ghost {jwt}`

## Deploy

```bash
cd MCP/mcp-ghost
npm install
wrangler deploy
```
