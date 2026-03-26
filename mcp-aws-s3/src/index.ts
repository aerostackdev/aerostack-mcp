/**
 * mcp-aws-s3 — Amazon S3 MCP Server
 *
 * List buckets, upload, download, delete, copy, and manage objects in Amazon S3.
 * Secrets injected via X-Mcp-Secret-* headers by Aerostack gateway.
 */

import {
    S3Client,
    ListBucketsCommand,
    ListObjectsV2Command,
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand,
    CopyObjectCommand,
    HeadObjectCommand,
    CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: '_ping',
        description: 'Verify AWS S3 connectivity by listing buckets. Used internally by Aerostack to validate credentials.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_buckets',
        description: 'List all S3 buckets in the AWS account with name, region, and creation date',
        inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'list_objects',
        description: 'List objects in an S3 bucket with optional prefix filter, delimiter for folder-like navigation, and pagination',
        inputSchema: {
            type: 'object' as const,
            properties: {
                bucket: { type: 'string', description: 'S3 bucket name' },
                prefix: { type: 'string', description: 'Filter objects by key prefix (e.g. "images/" for folder listing)' },
                delimiter: { type: 'string', description: 'Delimiter for folder grouping (typically "/")' },
                max_keys: { type: 'number', description: 'Maximum number of objects to return (default: 100, max: 1000)' },
                continuation_token: { type: 'string', description: 'Token for paginating to the next page of results' },
            },
            required: ['bucket'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'get_object',
        description: 'Download an object from S3 and return its content as text. For binary files, returns a pre-signed download URL instead.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                bucket: { type: 'string', description: 'S3 bucket name' },
                key: { type: 'string', description: 'Object key (file path) in the bucket' },
            },
            required: ['bucket', 'key'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'put_object',
        description: 'Upload a text or JSON object to S3 with optional content type and metadata',
        inputSchema: {
            type: 'object' as const,
            properties: {
                bucket: { type: 'string', description: 'S3 bucket name' },
                key: { type: 'string', description: 'Object key (file path) to create or overwrite' },
                body: { type: 'string', description: 'Content to upload as the object body' },
                content_type: { type: 'string', description: 'MIME content type (default: text/plain)' },
                metadata: { type: 'object', description: 'Key-value metadata to attach to the object' },
            },
            required: ['bucket', 'key', 'body'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'delete_object',
        description: 'Delete an object from an S3 bucket by key',
        inputSchema: {
            type: 'object' as const,
            properties: {
                bucket: { type: 'string', description: 'S3 bucket name' },
                key: { type: 'string', description: 'Object key (file path) to delete' },
            },
            required: ['bucket', 'key'],
        },
        annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
        name: 'copy_object',
        description: 'Copy an object from one location to another within or across S3 buckets',
        inputSchema: {
            type: 'object' as const,
            properties: {
                source_bucket: { type: 'string', description: 'Source bucket name' },
                source_key: { type: 'string', description: 'Source object key' },
                dest_bucket: { type: 'string', description: 'Destination bucket name' },
                dest_key: { type: 'string', description: 'Destination object key' },
            },
            required: ['source_bucket', 'source_key', 'dest_bucket', 'dest_key'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
    },
    {
        name: 'head_object',
        description: 'Get metadata for an S3 object without downloading it — size, content type, last modified, ETag, and custom metadata',
        inputSchema: {
            type: 'object' as const,
            properties: {
                bucket: { type: 'string', description: 'S3 bucket name' },
                key: { type: 'string', description: 'Object key (file path)' },
            },
            required: ['bucket', 'key'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'presign_url',
        description: 'Generate a pre-signed URL for temporary access to an S3 object (upload or download) without sharing credentials',
        inputSchema: {
            type: 'object' as const,
            properties: {
                bucket: { type: 'string', description: 'S3 bucket name' },
                key: { type: 'string', description: 'Object key (file path)' },
                operation: { type: 'string', description: 'Operation type: "get" for download or "put" for upload (default: "get")' },
                expires_in: { type: 'number', description: 'URL expiration time in seconds (default: 3600, max: 604800)' },
            },
            required: ['bucket', 'key'],
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
    },
    {
        name: 'create_bucket',
        description: 'Create a new S3 bucket in the configured AWS region',
        inputSchema: {
            type: 'object' as const,
            properties: {
                bucket: { type: 'string', description: 'Bucket name to create (must be globally unique, lowercase, 3-63 chars)' },
            },
            required: ['bucket'],
        },
        annotations: { readOnlyHint: false, destructiveHint: false },
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

function makeClient(accessKeyId: string, secretAccessKey: string, region: string): S3Client {
    return new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
    });
}

const TEXT_TYPES = new Set([
    'text/', 'application/json', 'application/xml', 'application/javascript',
    'application/x-yaml', 'application/toml', 'application/csv',
]);

function isTextContent(contentType: string | undefined): boolean {
    if (!contentType) return false;
    return [...TEXT_TYPES].some((t) => contentType.startsWith(t));
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

async function callTool(
    name: string,
    args: Record<string, unknown>,
    s3: S3Client,
): Promise<unknown> {
    switch (name) {
        case '_ping': {
            const { Buckets } = await s3.send(new ListBucketsCommand({}));
            return text(`Connected to AWS S3. Found ${Buckets?.length ?? 0} bucket(s).`);
        }

        case 'list_buckets': {
            const { Buckets } = await s3.send(new ListBucketsCommand({}));
            const buckets = (Buckets ?? []).map((b) => ({
                name: b.Name,
                created: b.CreationDate?.toISOString(),
            }));
            return json({ buckets, count: buckets.length });
        }

        case 'list_objects': {
            const bucket = args.bucket as string;
            const maxKeys = Math.min(Number(args.max_keys ?? 100), 1000);
            const { Contents, CommonPrefixes, IsTruncated, NextContinuationToken } = await s3.send(
                new ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: args.prefix as string | undefined,
                    Delimiter: args.delimiter as string | undefined,
                    MaxKeys: maxKeys,
                    ContinuationToken: args.continuation_token as string | undefined,
                }),
            );
            const objects = (Contents ?? []).map((o) => ({
                key: o.Key,
                size: o.Size,
                last_modified: o.LastModified?.toISOString(),
                etag: o.ETag,
            }));
            const folders = (CommonPrefixes ?? []).map((p) => p.Prefix);
            return json({
                objects,
                folders,
                count: objects.length,
                is_truncated: IsTruncated,
                next_token: NextContinuationToken,
            });
        }

        case 'get_object': {
            const bucket = args.bucket as string;
            const key = args.key as string;
            const { Body, ContentType, ContentLength } = await s3.send(
                new GetObjectCommand({ Bucket: bucket, Key: key }),
            );
            if (isTextContent(ContentType) && ContentLength && ContentLength < 1_000_000) {
                const content = await Body?.transformToString();
                return json({ key, content_type: ContentType, size: ContentLength, content });
            }
            // Binary or large file — return pre-signed URL
            const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
            return json({ key, content_type: ContentType, size: ContentLength, download_url: url, note: 'Binary/large file — use the download_url (valid for 1 hour)' });
        }

        case 'put_object': {
            const bucket = args.bucket as string;
            const key = args.key as string;
            const body = args.body as string;
            const contentType = (args.content_type as string) || 'text/plain';
            await s3.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: body,
                    ContentType: contentType,
                    Metadata: args.metadata as Record<string, string> | undefined,
                }),
            );
            return text(`Uploaded "${key}" to bucket "${bucket}" (${body.length} bytes, ${contentType})`);
        }

        case 'delete_object': {
            const bucket = args.bucket as string;
            const key = args.key as string;
            await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
            return text(`Deleted "${key}" from bucket "${bucket}"`);
        }

        case 'copy_object': {
            const srcBucket = args.source_bucket as string;
            const srcKey = args.source_key as string;
            const destBucket = args.dest_bucket as string;
            const destKey = args.dest_key as string;
            await s3.send(
                new CopyObjectCommand({
                    Bucket: destBucket,
                    Key: destKey,
                    CopySource: `${srcBucket}/${srcKey}`,
                }),
            );
            return text(`Copied "${srcBucket}/${srcKey}" → "${destBucket}/${destKey}"`);
        }

        case 'head_object': {
            const bucket = args.bucket as string;
            const key = args.key as string;
            const { ContentType, ContentLength, LastModified, ETag, Metadata } = await s3.send(
                new HeadObjectCommand({ Bucket: bucket, Key: key }),
            );
            return json({
                key,
                content_type: ContentType,
                size: ContentLength,
                last_modified: LastModified?.toISOString(),
                etag: ETag,
                metadata: Metadata,
            });
        }

        case 'presign_url': {
            const bucket = args.bucket as string;
            const key = args.key as string;
            const operation = (args.operation as string) || 'get';
            const expiresIn = Math.min(Number(args.expires_in ?? 3600), 604800);
            const command = operation === 'put'
                ? new PutObjectCommand({ Bucket: bucket, Key: key })
                : new GetObjectCommand({ Bucket: bucket, Key: key });
            const url = await getSignedUrl(s3, command, { expiresIn });
            return json({ url, operation, expires_in: expiresIn, bucket, key });
        }

        case 'create_bucket': {
            const bucket = args.bucket as string;
            await s3.send(new CreateBucketCommand({ Bucket: bucket }));
            return text(`Created bucket "${bucket}"`);
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ─── Worker Entry ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'GET') {
            return Response.json({ status: 'ok', server: 'mcp-aws-s3', version: '1.0.0' });
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
                serverInfo: { name: 'mcp-aws-s3', version: '1.0.0' },
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

            const s3 = makeClient(accessKeyId, secretAccessKey, region);
            const { name, arguments: toolArgs = {} } = (params ?? {}) as {
                name: string;
                arguments?: Record<string, unknown>;
            };

            try {
                const result = await callTool(name, toolArgs, s3);
                return rpcOk(id, result);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Tool execution failed';
                return rpcErr(id, -32603, msg);
            }
        }

        return rpcErr(id, -32601, `Method not found: ${method}`);
    },
};
