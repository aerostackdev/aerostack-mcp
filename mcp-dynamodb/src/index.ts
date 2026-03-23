/**
 * mcp-dynamodb — Amazon DynamoDB MCP Server
 *
 * Query, put, update, delete, scan, and manage items in DynamoDB tables.
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 */

import {
    DynamoDBClient,
    ListTablesCommand,
    DescribeTableCommand,
    QueryCommand,
    ScanCommand,
    PutItemCommand,
    GetItemCommand,
    DeleteItemCommand,
    UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify AWS DynamoDB connectivity by listing tables. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    },
    {
        name: 'list_tables',
        description: 'List all DynamoDB tables in the AWS account with optional pagination',
        inputSchema: {
            type: 'object' as const,
            properties: {
                limit: { type: 'number', description: 'Maximum number of tables to return (default: 100)' },
            },
            required: [] as string[],
        },
    },
    {
        name: 'describe_table',
        description: 'Get detailed information about a DynamoDB table — key schema, indexes, item count, size, and billing mode',
        inputSchema: {
            type: 'object' as const,
            properties: {
                table: { type: 'string', description: 'DynamoDB table name' },
            },
            required: ['table'],
        },
    },
    {
        name: 'get_item',
        description: 'Retrieve a single item from a DynamoDB table by its primary key (partition key + optional sort key)',
        inputSchema: {
            type: 'object' as const,
            properties: {
                table: { type: 'string', description: 'DynamoDB table name' },
                key: { type: 'object', description: 'Primary key as JSON object (e.g. {"userId": "abc123"} or {"pk": "user#1", "sk": "profile"})' },
            },
            required: ['table', 'key'],
        },
    },
    {
        name: 'put_item',
        description: 'Insert or replace an item in a DynamoDB table. Provide the full item as a JSON object including the primary key.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                table: { type: 'string', description: 'DynamoDB table name' },
                item: { type: 'object', description: 'Full item as JSON object including primary key fields (e.g. {"userId": "abc", "name": "Alice", "age": 30})' },
            },
            required: ['table', 'item'],
        },
    },
    {
        name: 'query',
        description: 'Query items from a DynamoDB table using a key condition expression on the partition key and optional sort key filter',
        inputSchema: {
            type: 'object' as const,
            properties: {
                table: { type: 'string', description: 'DynamoDB table name' },
                key_condition: { type: 'string', description: 'Key condition expression (e.g. "pk = :pk AND sk BEGINS_WITH :prefix")' },
                expression_values: { type: 'object', description: 'Expression attribute values as JSON (e.g. {":pk": "user#1", ":prefix": "order#"})' },
                expression_names: { type: 'object', description: 'Expression attribute name mappings for reserved words (e.g. {"#s": "status"})' },
                filter: { type: 'string', description: 'Additional filter expression applied after the query (e.g. "#s = :active")' },
                index: { type: 'string', description: 'Global or local secondary index name to query' },
                limit: { type: 'number', description: 'Maximum number of items to return (default: 50, max: 500)' },
                scan_forward: { type: 'boolean', description: 'Sort order: true = ascending (default), false = descending' },
            },
            required: ['table', 'key_condition', 'expression_values'],
        },
    },
    {
        name: 'scan',
        description: 'Scan an entire DynamoDB table or index with optional filter expression. Use sparingly — prefer query when possible.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                table: { type: 'string', description: 'DynamoDB table name' },
                filter: { type: 'string', description: 'Filter expression (e.g. "age > :min AND #s = :active")' },
                expression_values: { type: 'object', description: 'Expression attribute values' },
                expression_names: { type: 'object', description: 'Expression attribute name mappings for reserved words' },
                index: { type: 'string', description: 'Secondary index name to scan' },
                limit: { type: 'number', description: 'Maximum number of items to return (default: 50, max: 500)' },
            },
            required: ['table'],
        },
    },
    {
        name: 'update_item',
        description: 'Update specific attributes of an existing item using an update expression (SET, REMOVE, ADD, DELETE operations)',
        inputSchema: {
            type: 'object' as const,
            properties: {
                table: { type: 'string', description: 'DynamoDB table name' },
                key: { type: 'object', description: 'Primary key of the item to update' },
                update_expression: { type: 'string', description: 'Update expression (e.g. "SET #n = :name, age = :age REMOVE old_field")' },
                expression_values: { type: 'object', description: 'Expression attribute values' },
                expression_names: { type: 'object', description: 'Expression attribute name mappings' },
                condition: { type: 'string', description: 'Condition expression — update only if condition is met (e.g. "attribute_exists(pk)")' },
            },
            required: ['table', 'key', 'update_expression', 'expression_values'],
        },
    },
    {
        name: 'delete_item',
        description: 'Delete a single item from a DynamoDB table by its primary key',
        inputSchema: {
            type: 'object' as const,
            properties: {
                table: { type: 'string', description: 'DynamoDB table name' },
                key: { type: 'object', description: 'Primary key of the item to delete' },
                condition: { type: 'string', description: 'Condition expression — delete only if condition is met' },
            },
            required: ['table', 'key'],
        },
    },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function makeClient(accessKeyId: string, secretAccessKey: string, region: string): DynamoDBClient {
    return new DynamoDBClient({
        region,
        credentials: { accessKeyId, secretAccessKey },
    });
}

/** Marshall expression values — convert plain JS values to DynamoDB AttributeValue format */
function marshallValues(vals: Record<string, unknown> | undefined): Record<string, any> | undefined {
    if (!vals) return undefined;
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(vals)) {
        result[k] = marshall({ _: v })['_'];
    }
    return result;
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    ddb: DynamoDBClient,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const { TableNames } = await ddb.send(new ListTablesCommand({ Limit: 5 }));
            return text(`Connected to DynamoDB. Found ${TableNames?.length ?? 0}+ table(s).`);
        }

        case 'list_tables': {
            const limit = Math.min(Number(args.limit ?? 100), 100);
            const { TableNames } = await ddb.send(new ListTablesCommand({ Limit: limit }));
            return json({ tables: TableNames ?? [], count: TableNames?.length ?? 0 });
        }

        case 'describe_table': {
            const table = args.table as string;
            const { Table } = await ddb.send(new DescribeTableCommand({ TableName: table }));
            if (!Table) throw new Error(`Table "${table}" not found`);
            return json({
                name: Table.TableName,
                status: Table.TableStatus,
                key_schema: Table.KeySchema?.map((k) => ({ attribute: k.AttributeName, type: k.KeyType })),
                item_count: Table.ItemCount,
                size_bytes: Table.TableSizeBytes,
                billing_mode: Table.BillingModeSummary?.BillingMode,
                gsi: Table.GlobalSecondaryIndexes?.map((i) => ({
                    name: i.IndexName,
                    key_schema: i.KeySchema?.map((k) => ({ attribute: k.AttributeName, type: k.KeyType })),
                    status: i.IndexStatus,
                })),
                lsi: Table.LocalSecondaryIndexes?.map((i) => ({
                    name: i.IndexName,
                    key_schema: i.KeySchema?.map((k) => ({ attribute: k.AttributeName, type: k.KeyType })),
                })),
                created: Table.CreationDateTime?.toISOString(),
            });
        }

        case 'get_item': {
            const table = args.table as string;
            const key = args.key as Record<string, unknown>;
            const { Item } = await ddb.send(new GetItemCommand({
                TableName: table,
                Key: marshall(key),
            }));
            if (!Item) return json({ found: false, item: null });
            return json({ found: true, item: unmarshall(Item) });
        }

        case 'put_item': {
            const table = args.table as string;
            const item = args.item as Record<string, unknown>;
            await ddb.send(new PutItemCommand({
                TableName: table,
                Item: marshall(item, { removeUndefinedValues: true }),
            }));
            return text(`Item written to "${table}"`);
        }

        case 'query': {
            const table = args.table as string;
            const limit = Math.min(Number(args.limit ?? 50), 500);
            const { Items, Count, ScannedCount } = await ddb.send(new QueryCommand({
                TableName: table,
                IndexName: args.index as string | undefined,
                KeyConditionExpression: args.key_condition as string,
                FilterExpression: args.filter as string | undefined,
                ExpressionAttributeValues: marshallValues(args.expression_values as Record<string, unknown>),
                ExpressionAttributeNames: args.expression_names as Record<string, string> | undefined,
                Limit: limit,
                ScanIndexForward: args.scan_forward !== false,
            }));
            const items = (Items ?? []).map((i) => unmarshall(i));
            return json({ items, count: Count, scanned: ScannedCount });
        }

        case 'scan': {
            const table = args.table as string;
            const limit = Math.min(Number(args.limit ?? 50), 500);
            const { Items, Count, ScannedCount } = await ddb.send(new ScanCommand({
                TableName: table,
                IndexName: args.index as string | undefined,
                FilterExpression: args.filter as string | undefined,
                ExpressionAttributeValues: marshallValues(args.expression_values as Record<string, unknown>),
                ExpressionAttributeNames: args.expression_names as Record<string, string> | undefined,
                Limit: limit,
            }));
            const items = (Items ?? []).map((i) => unmarshall(i));
            return json({ items, count: Count, scanned: ScannedCount });
        }

        case 'update_item': {
            const table = args.table as string;
            const key = args.key as Record<string, unknown>;
            const { Attributes } = await ddb.send(new UpdateItemCommand({
                TableName: table,
                Key: marshall(key),
                UpdateExpression: args.update_expression as string,
                ExpressionAttributeValues: marshallValues(args.expression_values as Record<string, unknown>),
                ExpressionAttributeNames: args.expression_names as Record<string, string> | undefined,
                ConditionExpression: args.condition as string | undefined,
                ReturnValues: 'ALL_NEW',
            }));
            return json({ updated: true, item: Attributes ? unmarshall(Attributes) : null });
        }

        case 'delete_item': {
            const table = args.table as string;
            const key = args.key as Record<string, unknown>;
            await ddb.send(new DeleteItemCommand({
                TableName: table,
                Key: marshall(key),
                ConditionExpression: args.condition as string | undefined,
            }));
            return text(`Deleted item from "${table}"`);
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ─── Worker Entry ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-dynamodb', version: '1.0.0' });
        }
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
        try {
            body = (await request.json()) as typeof body;
        } catch {
            return rpcErr(null, -32700, 'Parse error');
        }

        const { id, method, params } = body;

        if (method === 'initialize') {
            return rpcOk(id, {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'mcp-dynamodb', version: '1.0.0' },
            });
        }

        if (method === 'tools/list') {
            return rpcOk(id, { tools: TOOLS });
        }

        if (method === 'tools/call') {
            const accessKeyId = request.headers.get('X-Mcp-Secret-AWS-ACCESS-KEY-ID');
            const secretAccessKey = request.headers.get('X-Mcp-Secret-AWS-SECRET-ACCESS-KEY');
            const region = request.headers.get('X-Mcp-Secret-AWS-REGION') || 'us-east-1';

            if (!accessKeyId || !secretAccessKey) {
                return rpcErr(id, -32001, 'Missing AWS credentials — add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to your workspace secrets');
            }

            const ddb = makeClient(accessKeyId, secretAccessKey, region);
            const { name, arguments: toolArgs = {} } = (params ?? {}) as {
                name: string;
                arguments?: Record<string, unknown>;
            };

            try {
                const result = await callTool(name, toolArgs, ddb);
                return rpcOk(id, result);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
