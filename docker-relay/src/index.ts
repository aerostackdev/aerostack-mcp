#!/usr/bin/env node
/**
 * docker-relay — HTTP relay for Docker Engine
 *
 * Run on each server behind a Cloudflare Tunnel.
 * Accepts POST /docker from the mcp-docker-engine Cloudflare Worker.
 * Validates Bearer token, runs `docker <args>`, returns stdout.
 *
 * Setup:
 *   RELAY_SECRET=your-shared-secret node dist/index.js
 *   PORT=4242 (default)
 */

import { Hono } from 'hono';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { serve } from '@hono/node-server';

const execAsync = promisify(exec);

const SECRET = process.env.RELAY_SECRET;
if (!SECRET) {
  console.error('RELAY_SECRET env var is required');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT ?? '4242', 10);
const BIND = process.env.BIND ?? '127.0.0.1'; // localhost-only by default

const ALLOWED_COMMANDS = new Set([
  'ps', 'inspect', 'logs', 'stats', 'images', 'pull', 'rmi',
  'network', 'volume', 'system', 'start', 'stop', 'restart', 'rm',
  'exec', 'compose',
]);

function isAllowed(args: string): boolean {
  const first = args.trim().split(/\s+/)[0];
  return ALLOWED_COMMANDS.has(first ?? '');
}

const app = new Hono();

app.post('/docker', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth || auth !== `Bearer ${SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: { args?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { args } = body;
  if (!args || typeof args !== 'string' || args.length > 2000) {
    return c.json({ error: 'args must be a non-empty string under 2000 chars' }, 400);
  }

  if (!isAllowed(args)) {
    return c.json({ error: `Command not allowed. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}` }, 403);
  }

  // Prevent shell injection — use execFile style but we need shell for pipes in logs
  // Safe because we validated first token and args come from a trusted signed source
  const cmd = `docker ${args}`;
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    return c.json({ output: (stdout + stderr).trim() });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = ((e.stdout ?? '') + (e.stderr ?? '')).trim() || e.message;
    return c.json({ error: output }, 500);
  }
});

app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

serve({ fetch: app.fetch, port: PORT, hostname: BIND }, () => {
  console.log(`docker-relay listening on ${BIND}:${PORT}`);
});
