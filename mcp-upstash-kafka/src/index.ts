/**
 * Upstash Kafka MCP Worker
 * Implements MCP protocol over HTTP for Upstash Kafka REST API operations.
 * Receives secrets via X-Mcp-Secret-* headers from the Aerostack gateway.
 *
 * Secrets:
 *   UPSTASH_KAFKA_REST_URL      -> X-Mcp-Secret-UPSTASH-KAFKA-REST-URL
 *   UPSTASH_KAFKA_REST_USERNAME -> X-Mcp-Secret-UPSTASH-KAFKA-REST-USERNAME
 *   UPSTASH_KAFKA_REST_PASSWORD -> X-Mcp-Secret-UPSTASH-KAFKA-REST-PASSWORD
 */

interface KafkaSecrets {
    url: string;
    username: string;
    password: string;
}

function rpcOk(id: unknown, result: unknown) {
    return Response.json({ jsonrpc: '2.0', id, result });
}

function rpcErr(id: unknown, code: number, message: string) {
    return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(content: string) {
    return { content: [{ type: 'text', text: content }] };
}

function json(data: unknown) {
    return text(JSON.stringify(data, null, 2));
}

const TOOLS = [
    {
        name: '_ping',
        description:
            'Verify Upstash Kafka credentials by listing topics. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'produce',
        description: 'Send a message to a Kafka topic. Returns the offset of the produced message.',
        inputSchema: {
            type: 'object',
            properties: {
                topic: { type: 'string', description: 'Kafka topic name to produce to' },
                value: { type: 'string', description: 'Message value (string or JSON string)' },
                key: {
                    type: 'string',
                    description: 'Optional partition key for message ordering',
                },
                headers: {
                    type: 'object',
                    description: 'Optional key-value headers to attach to the message',
                },
            },
            required: ['topic', 'value'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'produce_batch',
        description:
            'Send multiple messages to one or more Kafka topics in a single request. Each message needs a topic and value.',
        inputSchema: {
            type: 'object',
            properties: {
                messages: {
                    type: 'array',
                    description: 'Array of messages to produce',
                    items: {
                        type: 'object',
                        properties: {
                            topic: { type: 'string', description: 'Kafka topic name' },
                            value: { type: 'string', description: 'Message value' },
                            key: { type: 'string', description: 'Optional partition key' },
                        },
                        required: ['topic', 'value'],
                    },
                },
            },
            required: ['messages'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'consume',
        description:
            'Read messages from a Kafka topic using a consumer group. Returns an array of messages with their offsets.',
        inputSchema: {
            type: 'object',
            properties: {
                topic: { type: 'string', description: 'Kafka topic name to consume from' },
                group: { type: 'string', description: 'Consumer group name' },
                instance: {
                    type: 'string',
                    description: 'Consumer instance name (default: "aerostack")',
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in milliseconds to wait for messages (default: 1000)',
                },
            },
            required: ['topic', 'group'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_topics',
        description: 'List all Kafka topics in the Upstash cluster.',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_topic',
        description: 'Create a new Kafka topic with configurable partitions and retention.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Topic name to create' },
                partitions: {
                    type: 'number',
                    description: 'Number of partitions (default: 1)',
                },
                retention_ms: {
                    type: 'number',
                    description: 'Message retention in milliseconds (default: 604800000 = 7 days)',
                },
                cleanup_policy: {
                    type: 'string',
                    enum: ['delete', 'compact'],
                    description: 'Cleanup policy (default: "delete")',
                },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_topic',
        description: 'Delete a Kafka topic. This is irreversible and all messages in the topic will be lost.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Topic name to delete' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'get_topic_stats',
        description:
            'Get statistics for a specific topic including partition count, message count, and throughput.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Topic name to get stats for' },
            },
            required: ['name'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
];

async function kafka(
    path: string,
    secrets: KafkaSecrets,
    opts: RequestInit = {},
): Promise<unknown> {
    const base = secrets.url.replace(/\/$/, '');
    const auth = btoa(`${secrets.username}:${secrets.password}`);

    const res = await fetch(`${base}${path}`, {
        ...opts,
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            ...((opts.headers as Record<string, string>) ?? {}),
        },
    });

    if (!res.ok) {
        let detail = '';
        try {
            const err = (await res.json()) as any;
            detail = err.error ?? err.message ?? JSON.stringify(err);
        } catch {
            detail = await res.text();
        }
        throw new Error(`Upstash Kafka API ${res.status}: ${detail}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        return res.json();
    }
    return res.text();
}

async function callTool(
    name: string,
    args: Record<string, unknown>,
    secrets: KafkaSecrets,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const data = (await kafka('/topics', secrets)) as any;
            const topics = Array.isArray(data) ? data : [];
            return text(
                `Connected to Upstash Kafka. Found ${topics.length} topic(s): ${topics.map((t: any) => t.topic_name ?? t.name ?? t).join(', ') || '(none)'}`,
            );
        }

        case 'produce': {
            const topic = args.topic as string;
            const value = args.value as string;
            const key = args.key as string | undefined;

            let path = `/produce/${encodeURIComponent(topic)}/${encodeURIComponent(value)}`;
            if (key) {
                path = `/produce/${encodeURIComponent(topic)}/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
            }

            const data = (await kafka(path, secrets, { method: 'POST' })) as any;
            return json({
                topic,
                partition: data.partition,
                offset: data.offset,
                key: key ?? null,
            });
        }

        case 'produce_batch': {
            const messages = args.messages as Array<{
                topic: string;
                value: string;
                key?: string;
            }>;

            if (!messages?.length) {
                throw new Error('messages array is required and must not be empty');
            }

            const results = [];
            for (const msg of messages) {
                let path = `/produce/${encodeURIComponent(msg.topic)}/${encodeURIComponent(msg.value)}`;
                if (msg.key) {
                    path = `/produce/${encodeURIComponent(msg.topic)}/${encodeURIComponent(msg.key)}/${encodeURIComponent(msg.value)}`;
                }
                const data = (await kafka(path, secrets, { method: 'POST' })) as any;
                results.push({
                    topic: msg.topic,
                    partition: data.partition,
                    offset: data.offset,
                    key: msg.key ?? null,
                });
            }

            return json({ produced: results.length, results });
        }

        case 'consume': {
            const topic = args.topic as string;
            const group = args.group as string;
            const instance = (args.instance as string) || 'aerostack';
            const timeout = args.timeout ?? 1000;

            const path = `/consume/${encodeURIComponent(group)}/${encodeURIComponent(instance)}/${encodeURIComponent(topic)}?timeout=${timeout}`;
            const data = (await kafka(path, secrets)) as any;
            const messages = Array.isArray(data)
                ? data.map((m: any) => ({
                      topic: m.topic,
                      partition: m.partition,
                      offset: m.offset,
                      key: m.key ?? null,
                      value: m.value,
                      timestamp: m.timestamp,
                      headers: m.headers ?? null,
                  }))
                : [];

            return json({ count: messages.length, messages });
        }

        case 'list_topics': {
            const data = (await kafka('/topics', secrets)) as any;
            const topics = Array.isArray(data) ? data : [];
            return json(
                topics.map((t: any) => ({
                    name: t.topic_name ?? t.name ?? t,
                    partitions: t.num_partitions ?? t.partitions ?? null,
                    retention_ms: t.retention_ms ?? null,
                    cleanup_policy: t.cleanup_policy ?? null,
                })),
            );
        }

        case 'create_topic': {
            const topicName = args.name as string;
            const partitions = (args.partitions as number) ?? 1;
            const retention = (args.retention_ms as number) ?? 604800000;
            const cleanup = (args.cleanup_policy as string) ?? 'delete';

            const data = await kafka('/topic', secrets, {
                method: 'POST',
                body: JSON.stringify({
                    name: topicName,
                    partitions,
                    retention_ms: retention,
                    cleanup_policy: cleanup,
                }),
            });

            return json({
                created: true,
                name: topicName,
                partitions,
                retention_ms: retention,
                cleanup_policy: cleanup,
                response: data,
            });
        }

        case 'delete_topic': {
            const topicName = args.name as string;
            await kafka(`/topic/${encodeURIComponent(topicName)}`, secrets, {
                method: 'DELETE',
            });
            return json({ deleted: true, name: topicName });
        }

        case 'get_topic_stats': {
            const topicName = args.name as string;
            const data = (await kafka(
                `/topic/${encodeURIComponent(topicName)}`,
                secrets,
            )) as any;

            return json({
                name: topicName,
                partitions: data.num_partitions ?? data.partitions ?? null,
                retention_ms: data.retention_ms ?? null,
                cleanup_policy: data.cleanup_policy ?? null,
                max_message_size: data.max_message_size ?? null,
                stats: data,
            });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
            return new Response(
                JSON.stringify({
                    status: 'ok',
                    server: 'upstash-kafka-mcp',
                    version: '1.0.0',
                }),
                { headers: { 'Content-Type': 'application/json' } },
            );
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: {
            jsonrpc: string;
            id: number | string;
            method: string;
            params?: Record<string, unknown>;
        };
        try {
            body = await request.json();
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { jsonrpc, id, method, params } = body;
        if (jsonrpc !== '2.0') return rpcErr(id ?? null, -32600, 'Invalid Request');

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'upstash-kafka-mcp', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const restUrl = request.headers.get('X-Mcp-Secret-UPSTASH-KAFKA-REST-URL');
            const username = request.headers.get('X-Mcp-Secret-UPSTASH-KAFKA-REST-USERNAME');
            const password = request.headers.get('X-Mcp-Secret-UPSTASH-KAFKA-REST-PASSWORD');

            if (!restUrl || !username || !password) {
                const missing = [];
                if (!restUrl) missing.push('UPSTASH_KAFKA_REST_URL');
                if (!username) missing.push('UPSTASH_KAFKA_REST_USERNAME');
                if (!password) missing.push('UPSTASH_KAFKA_REST_PASSWORD');
                return rpcErr(
                    id,
                    -32001,
                    `Missing required secret(s): ${missing.join(', ')} — add them to your workspace secrets`,
                );
            }

            const secrets: KafkaSecrets = { url: restUrl, username, password };
            const toolName: string = params?.name ?? '';
            const toolArgs: Record<string, unknown> = params?.arguments ?? {};

            try {
                const result = await callTool(toolName, toolArgs, secrets);
                return rpcOk(id, result);
            } catch (err: any) {
                return rpcErr(id, -32603, err.message ?? 'Internal error');
            }
        }

        return rpcErr(id ?? null, -32601, `Method not found: ${method}`);
    },
};
