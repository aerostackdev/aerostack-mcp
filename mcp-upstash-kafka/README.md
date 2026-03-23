# mcp-upstash-kafka — Upstash Kafka MCP Server

> Produce and consume messages, manage topics, and inspect stats on Upstash serverless Kafka.

Upstash Kafka is a serverless Kafka service with a REST API — no brokers to manage, pay only for what you use. This MCP server lets your AI agents produce messages to topics, consume from consumer groups, create and delete topics, and check topic statistics, all through the Upstash Kafka REST interface.

**Live endpoint:** `https://mcp.aerostack.dev/s/navin/mcp-upstash-kafka`

---

## What You Can Do

- Produce messages to Kafka topics from agent workflows — triggered by signups, payments, alerts, or any event
- Consume messages from topics using consumer groups to process event streams
- Batch-produce multiple messages in a single call for high-throughput scenarios
- List, create, and delete topics to manage your Kafka cluster
- Inspect topic statistics to monitor partition counts, retention, and throughput

## Available Tools

| Tool | Description |
|------|-------------|
| `_ping` | Verify Upstash Kafka credentials by listing topics (used by Aerostack) |
| `produce` | Send a message to a Kafka topic with optional partition key |
| `produce_batch` | Send multiple messages to one or more topics in a single request |
| `consume` | Read messages from a topic using a consumer group |
| `list_topics` | List all Kafka topics in the cluster |
| `create_topic` | Create a new topic with configurable partitions and retention |
| `delete_topic` | Delete a topic (irreversible) |
| `get_topic_stats` | Get statistics for a topic (partitions, retention, config) |

## Configuration

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `UPSTASH_KAFKA_REST_URL` | Yes | Upstash Kafka REST API URL | [console.upstash.com](https://console.upstash.com) → **Kafka** → select your cluster → **REST API** section → copy the **UPSTASH_KAFKA_REST_URL** |
| `UPSTASH_KAFKA_REST_USERNAME` | Yes | REST API username for authentication | Same page → copy **UPSTASH_KAFKA_REST_USERNAME** |
| `UPSTASH_KAFKA_REST_PASSWORD` | Yes | REST API password for authentication | Same page → copy **UPSTASH_KAFKA_REST_PASSWORD** |

## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"Upstash Kafka"** and click **Add to Workspace**
3. Add your `UPSTASH_KAFKA_REST_URL`, `UPSTASH_KAFKA_REST_USERNAME`, and `UPSTASH_KAFKA_REST_PASSWORD` under **Project → Secrets**

Once added, every AI agent in your workspace can call Kafka tools automatically — no per-user setup needed.

### Example Prompts

```
"Send a message to the 'user-signups' topic with the payload { name: 'Alice', plan: 'pro' }"
"Read the latest messages from the 'order-events' topic using consumer group 'analytics'"
"List all Kafka topics in our cluster"
"Create a new topic called 'notifications' with 3 partitions and 30-day retention"
"Get stats for the 'payment-events' topic"
"Delete the 'test-topic' topic"
```

### Direct API Call

```bash
# Produce a message
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-upstash-kafka \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-UPSTASH-KAFKA-REST-URL: https://your-cluster.upstash.io' \
  -H 'X-Mcp-Secret-UPSTASH-KAFKA-REST-USERNAME: your-username' \
  -H 'X-Mcp-Secret-UPSTASH-KAFKA-REST-PASSWORD: your-password' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"produce","arguments":{"topic":"user-signups","value":"{\"name\":\"Alice\",\"plan\":\"pro\"}"}}}'

# Consume messages
curl -X POST https://mcp.aerostack.dev/s/navin/mcp-upstash-kafka \
  -H 'Content-Type: application/json' \
  -H 'X-Mcp-Secret-UPSTASH-KAFKA-REST-URL: https://your-cluster.upstash.io' \
  -H 'X-Mcp-Secret-UPSTASH-KAFKA-REST-USERNAME: your-username' \
  -H 'X-Mcp-Secret-UPSTASH-KAFKA-REST-PASSWORD: your-password' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"consume","arguments":{"topic":"user-signups","group":"my-consumer-group"}}}'
```

## License

MIT
