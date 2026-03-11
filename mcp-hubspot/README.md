# mcp-hubspot — HubSpot MCP Server

HubSpot is a CRM and marketing platform for managing customer relationships. This MCP server enables managing contacts, deals, and companies via natural language.

Deployed as a standalone Cloudflare Worker. Secrets are injected at runtime by the Aerostack gateway via `X-Mcp-Secret-*` headers.

## Tools

| Tool | Description |
|------|-------------|
| search_contacts | Search contacts by name or email |
| get_contact | Get a contact by ID with all properties |
| create_contact | Create a new contact |
| list_deals | List deals with optional stage filter |
| create_deal | Create a new deal in a pipeline |
| list_companies | List companies in the CRM |
| search_companies | Search companies by name or domain |

## Secrets Required

| Variable | Header | Description |
|----------|--------|-------------|
| HUBSPOT_ACCESS_TOKEN | X-Mcp-Secret-HUBSPOT-ACCESS-TOKEN | HubSpot private app access token |

## Usage

Health check:

```bash
curl https://mcp-hubspot.<your-domain>/health
```

Initialize:

```bash
curl -X POST https://mcp-hubspot.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

List tools:

```bash
curl -X POST https://mcp-hubspot.<your-domain> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST https://mcp-hubspot.<your-domain> \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-HUBSPOT-ACCESS-TOKEN: <your-token>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_contacts","arguments":{"query":"john"}}}'
```

## Deploy

```bash
cd MCP/mcp-hubspot
npm run deploy
```
