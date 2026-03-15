#!/usr/bin/env node
/**
 * Test script: deploy ONE mcp to staging and print the API response.
 * Usage: node scripts/test-deploy-one.mjs mcp-airtable
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const slug = process.argv[2] ?? 'mcp-airtable';
const env  = process.argv[3] ?? 'staging';

const { api_key } = JSON.parse(readFileSync(`${homedir()}/.aerostack/credentials.json`, 'utf8'));

const workerCode = readFileSync(`${slug}/dist/index.js`);

const form = new FormData();
form.append('worker', new Blob([workerCode], { type: 'application/javascript' }), 'worker.js');
form.append('slug', slug);
form.append('env', env);

console.log(`→ Deploying ${slug} to ${env}...`);

const res = await fetch('https://api.aerostack.dev/api/v1/cli/deploy/mcp', {
  method: 'POST',
  headers: { 'X-API-Key': api_key },
  body: form,
});

const text = await res.text();
console.log(`← Status: ${res.status}`);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
