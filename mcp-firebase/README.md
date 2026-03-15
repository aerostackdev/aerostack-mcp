# mcp-firebase

MCP server for Firebase — Firestore CRUD, Firebase Auth user management, and FCM push notifications.

Deployed as a Cloudflare Worker. Integrates with the Aerostack gateway for secret injection.

---

## Secrets

| Secret | Header | Description |
|--------|--------|-------------|
| `FIREBASE_PROJECT_ID` | `X-Mcp-Secret-FIREBASE-PROJECT-ID` | Your Firebase project ID (e.g. `my-app-12345`) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | `X-Mcp-Secret-FIREBASE-SERVICE-ACCOUNT-KEY` | Full JSON string of your service account key file |

### How to get your service account key

1. Go to [Firebase Console](https://console.firebase.google.com/) → Your Project
2. Navigate to **Project Settings** → **Service accounts**
3. Click **Generate new private key** → Download the JSON file
4. Add the entire JSON content as the `FIREBASE_SERVICE_ACCOUNT_KEY` secret in your workspace

The service account needs the following IAM roles:
- **Cloud Datastore User** — for Firestore read/write
- **Firebase Authentication Admin** — for Auth user management
- **Firebase Cloud Messaging Admin** — for FCM push notifications

---

## Tools

### Firestore (6 tools)

| Tool | Description |
|------|-------------|
| `get_document` | Get a document by collection and document ID. Returns parsed fields. |
| `set_document` | Create or overwrite a document completely. |
| `update_document` | Partially update specific fields without overwriting others. |
| `delete_document` | Delete a document by collection and document ID. |
| `query_collection` | Query documents with optional field filtering (EQUAL, LESS_THAN, GREATER_THAN, ARRAY_CONTAINS). |
| `list_documents` | List documents in a collection with pagination support. |

### Firebase Auth (4 tools)

| Tool | Description |
|------|-------------|
| `list_users` | List Firebase Auth users (uid, email, displayName, disabled, createdAt). |
| `get_user` | Get a user profile by UID or email address. |
| `create_user` | Create a new user with email and password. |
| `disable_user` | Disable or re-enable a user account by UID. |

### FCM Push Notifications (2 tools)

| Tool | Description |
|------|-------------|
| `send_push_notification` | Send a push notification to a single device token. Supports title, body, image, and data payload. |
| `send_multicast_push` | Send a push notification to multiple device tokens (up to 500). Returns per-token success/failure results. |

---

## Architecture

- Pure `fetch()` calls — zero npm runtime dependencies
- OAuth 2.0 access tokens are generated per-request using the service account key via JWT signing (Web Crypto API / RS256)
- Secrets are injected by the Aerostack gateway via `X-Mcp-Secret-*` headers — never hardcoded
- Implements JSON-RPC 2.0 (MCP protocol): `initialize`, `tools/list`, `tools/call`
- GET requests return a health check JSON response
