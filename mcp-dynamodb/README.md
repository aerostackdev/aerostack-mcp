# mcp-dynamodb — Amazon DynamoDB MCP Server

> Query, put, update, delete, and scan items in Amazon DynamoDB tables — AI-native NoSQL database access for any agent.

Give your AI agents full access to Amazon DynamoDB. List tables, inspect schemas and indexes, query by partition key with sort key filters, scan with expressions, and perform CRUD operations — all through natural language.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-dynamodb`

---

## What You Can Do

- List all DynamoDB tables in your account
- Inspect table schemas, key definitions, GSIs, LSIs, and billing mode
- Get items by primary key (partition + sort key)
- Query items using key conditions with optional sort key ranges
- Scan tables with filter expressions
- Put (insert/replace) items with full attribute control
- Update specific attributes using SET, REMOVE, ADD, DELETE expressions
- Delete items by primary key with optional conditions
- Query global and local secondary indexes

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify DynamoDB connectivity by listing tables |
| `list_tables` | List all DynamoDB tables in the account |
| `describe_table` | Get table info — key schema, indexes, item count, size, billing |
| `get_item` | Retrieve a single item by primary key |
| `put_item` | Insert or replace an item with full attributes |
| `query` | Query items by key condition with filters and index support |
| `scan` | Scan entire table or index with optional filter expression |
| `update_item` | Update specific attributes with SET/REMOVE expressions |
| `delete_item` | Delete a single item by primary key |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `AWS_ACCESS_KEY_ID` | Yes | AWS IAM access key with DynamoDB permissions | console.aws.amazon.com → IAM → Users → Security credentials → Create access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS IAM secret key (shown once at creation) | Created with the access key above |
| `AWS_REGION` | No | AWS region (default: us-east-1) | The region where your DynamoDB tables are located |

> **Recommended IAM Policy:** Attach `AmazonDynamoDBFullAccess` for full access, or scope to specific tables with a custom policy.

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"DynamoDB"** and click **Add to Workspace**
3. Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `AWS_REGION` under **Project → Secrets**

### Example Prompts

```
"List all my DynamoDB tables"
"Describe the Users table and show me its key schema and indexes"
"Get the user with userId = 'abc123' from the Users table"
"Query all orders for customer 'cust-42' from the last 30 days"
"Scan the Products table for items where price > 100"
"Update the user 'abc123' — set name to 'Alice' and remove old_field"
```

### Direct API Call

```bash
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-dynamodb \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-AWS-ACCESS-KEY-ID: AKIA...' \
  -H 'X-Mcp-Secret-AWS-SECRET-ACCESS-KEY: wJalr...' \
  -H 'X-Mcp-Secret-AWS-REGION: us-east-1' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_tables","arguments":{}}}'
```

## Security Notes

- AWS credentials are injected at the Aerostack gateway layer — never stored in the worker
- Query and scan results are limited to 500 items maximum per call
- Use condition expressions on update/delete to prevent accidental overwrites
- Consider scoping IAM policies to specific tables and operations

## License

MIT
