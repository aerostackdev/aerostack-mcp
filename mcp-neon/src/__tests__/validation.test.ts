/**
 * Unit tests for MCP Neon tool argument validation.
 * Tests that missing/invalid args return clear error messages
 * instead of crashing with TypeError.
 */
import { describe, it, expect } from 'vitest';
import worker from '../index';

/** Helper: send a tools/call JSON-RPC request to the worker */
async function callTool(name: string, args: Record<string, unknown> = {}) {
    const response = await worker.fetch(
        new Request('http://localhost', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Mcp-Secret-DATABASE-URL': 'postgresql://fake:fake@fake.neon.tech/fakedb?sslmode=require',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name, arguments: args },
            }),
        }),
    );
    return response.json() as Promise<{
        jsonrpc: string;
        id: unknown;
        result?: { content: Array<{ type: string; text: string }> };
        error?: { code: number; message: string };
    }>;
}

/** Extract the text from a successful tool result */
function resultText(data: Awaited<ReturnType<typeof callTool>>): string {
    return data.result?.content?.[0]?.text ?? '';
}

describe('update — argument validation', () => {
    it('returns error when values is missing', async () => {
        const data = await callTool('update', { table: 'users', where: 'id = 1' });
        expect(data.error).toBeUndefined();
        expect(resultText(data)).toContain('Error: "values" is required');
    });

    it('returns error when values is null', async () => {
        const data = await callTool('update', { table: 'users', values: null, where: 'id = 1' });
        expect(data.error).toBeUndefined();
        expect(resultText(data)).toContain('Error: "values" is required');
    });

    it('returns error when values is empty object', async () => {
        const data = await callTool('update', { table: 'users', values: {}, where: 'id = 1' });
        expect(data.error).toBeUndefined();
        expect(resultText(data)).toContain('Error: "values" is required');
    });

    it('returns error when where is missing', async () => {
        const data = await callTool('update', { table: 'users', values: { email: 'x@y.com' } });
        expect(data.error).toBeUndefined();
        expect(resultText(data)).toContain('Error: "where" is required');
    });

    it('returns error when table is missing', async () => {
        const data = await callTool('update', { values: { email: 'x@y.com' }, where: 'id = 1' });
        expect(data.error).toBeUndefined();
        expect(resultText(data)).toContain('Error: "table" is required');
    });

    it('returns error when all args are missing', async () => {
        const data = await callTool('update', {});
        expect(data.error).toBeUndefined();
        expect(resultText(data)).toContain('Error:');
    });
});

describe('delete — argument validation', () => {
    it('returns error when where is missing', async () => {
        const data = await callTool('delete', { table: 'users' });
        expect(data.error).toBeUndefined();
        expect(resultText(data)).toContain('Error: "where" is required');
    });

    it('returns error when table is missing', async () => {
        const data = await callTool('delete', { where: 'id = 1' });
        expect(data.error).toBeUndefined();
        expect(resultText(data)).toContain('Error: "table" is required');
    });

    it('returns error when all args are missing', async () => {
        const data = await callTool('delete', {});
        expect(data.error).toBeUndefined();
        expect(resultText(data)).toContain('Error:');
    });
});

describe('insert — argument validation', () => {
    it('returns error when table is missing', async () => {
        const data = await callTool('insert', { rows: [{ name: 'Alice' }] });
        expect(data.error).toBeUndefined();
        expect(resultText(data)).toContain('Error: "table" is required');
    });

    it('returns error when rows is missing', async () => {
        const data = await callTool('insert', { table: 'users' });
        expect(data.error).toBeUndefined();
        expect(resultText(data)).toContain('Error: "rows" is required');
    });
});

describe('run_sql — argument validation', () => {
    it('returns error when query is missing', async () => {
        const data = await callTool('run_sql', {});
        expect(data.error).toBeUndefined();
        expect(resultText(data)).toContain('Error: "query" is required');
    });
});
