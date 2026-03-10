# mcp-google-calendar

Google Calendar MCP server for Aerostack. Runs as a Cloudflare Worker, exposes Google Calendar operations via the MCP protocol (JSON-RPC 2.0 over HTTP).

## Tools

| Tool | Description | Method |
|------|-------------|--------|
| `list_calendars` | List all calendars for the authenticated user | GET |
| `list_events` | List events in a calendar with optional time range | GET |
| `get_event` | Get details of a specific event | GET |
| `create_event` | Create a new calendar event | POST |
| `update_event` | Update an existing event (partial) | PATCH |
| `delete_event` | Delete a calendar event | DELETE |
| `quick_add` | Quick-add an event from natural language text | POST |

## Secrets

| Env Var | Header | Description |
|---------|--------|-------------|
| `GOOGLE_ACCESS_TOKEN` | `X-Mcp-Secret-GOOGLE-ACCESS-TOKEN` | Google OAuth2 access token |

Secrets are injected by the Aerostack gateway via request headers. Never hardcode tokens in source.

## API

**Base URL:** `https://www.googleapis.com/calendar/v3`

### Health Check

```bash
curl https://<worker-url>/health
```

### Initialize

```bash
curl -X POST https://<worker-url> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

### List Tools

```bash
curl -X POST https://<worker-url> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### List Calendars

```bash
curl -X POST https://<worker-url> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_calendars","arguments":{}}}'
```

### List Events

```bash
curl -X POST https://<worker-url> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_events","arguments":{"calendarId":"primary","timeMin":"2024-01-01T00:00:00Z","maxResults":5}}}'
```

### Create Event

```bash
curl -X POST https://<worker-url> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"create_event","arguments":{"summary":"Team Standup","startDateTime":"2024-06-15T09:00:00-07:00","endDateTime":"2024-06-15T09:30:00-07:00","timeZone":"America/Los_Angeles","attendees":["alice@example.com"]}}}'
```

### Quick Add

```bash
curl -X POST https://<worker-url> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"quick_add","arguments":{"text":"Lunch with Bob at noon tomorrow"}}}'
```

### Delete Event

```bash
curl -X POST https://<worker-url> \
  -H "Content-Type: application/json" \
  -H "X-Mcp-Secret-GOOGLE-ACCESS-TOKEN: <token>" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"delete_event","arguments":{"eventId":"<event-id>"}}}'
```

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # esbuild bundle
npm run deploy   # build + deploy to Aerostack
```

## Deploy

```bash
aerostack deploy mcp --slug google-calendar
```
