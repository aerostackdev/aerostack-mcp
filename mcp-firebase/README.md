# mcp-firebase — Firebase MCP Server

> Read and write Firestore documents, manage Auth users, and send push notifications.

Firebase is Google's app development platform powering millions of mobile and web apps. This MCP server covers three of its most-used services: Firestore (document database), Firebase Auth (user management), and FCM (push notifications) — letting your AI agents read live app data, manage user accounts, and push notifications directly without touching your app's backend code.

**Live endpoint:** `https://mcp.aerostack.dev/s/aerostack/mcp-firebase`

---

## What You Can Do

- Query and update Firestore documents and collections — great for agents that need to read or modify your app's live data
- List, create, or disable Firebase Auth users to handle account management requests from support workflows
- Send targeted push notifications to individual devices or multicast to up to 500 tokens at once from automation pipelines
- Run complex Firestore queries with field filters to find documents matching specific criteria

## Available Tools

| Tool | Description |
|------|-------------|
| `get_document` | Get a Firestore document by collection and document ID |
| `set_document` | Create or overwrite a document completely |
| `update_document` | Partially update specific fields without overwriting others |
| `delete_document` | Delete a document by collection and document ID |
| `query_collection` | Query documents with field filtering (EQUAL, LESS_THAN, GREATER_THAN, ARRAY_CONTAINS) |
| `list_documents` | List documents in a collection with pagination support |
| `list_users` | List Firebase Auth users (uid, email, displayName, disabled, createdAt) |
| `get_user` | Get a user profile by UID or email address |
| `create_user` | Create a new user with email and password |
| `disable_user` | Disable or re-enable a user account by UID |
| `send_push_notification` | Send a push notification to a single device token |
| `send_multicast_push` | Send a push notification to multiple device tokens (up to 500) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `FIREBASE_PROJECT_ID` | Yes | Your Firebase project ID (e.g. `my-app-12345`) | [console.firebase.google.com](https://console.firebase.google.com) → Your Project → **Project Settings** → **General** → copy **Project ID** |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Yes | Full JSON of your service account key file | [console.firebase.google.com](https://console.firebase.google.com) → Your Project → **Project Settings** → **Service accounts** → **Generate new private key** → paste the entire JSON file content |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Firebase"** and click **Add to Workspace**
3. Add `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT_KEY` under **Project → Secrets**

Once added, every AI agent in your workspace can call Firebase tools automatically — no per-user setup needed.

### Example Prompts

```
"Get the document at users/usr_abc123 from Firestore"
"Find all orders in the orders collection where status equals pending"
"Send a push notification to device token abc123 with title Order Shipped and body Your package is on the way"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/mcp-firebase \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-FIREBASE-PROJECT-ID: your-project-id' \
  -H 'X-Mcp-Secret-FIREBASE-SERVICE-ACCOUNT-KEY: {"type":"service_account",...}' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_users","arguments":{}}}'
```

## License

MIT
