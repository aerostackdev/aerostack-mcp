#!/usr/bin/env node
/**
 * Patch readme field in DB for all MCPs that have a README.md on disk.
 * Uses the same PATCH endpoint as deploy-all.mjs.
 *
 * Usage:
 *   node scripts/patch-readmes.mjs [--dry-run] [--only mcp-adyen,mcp-foo]
 *
 * The script:
 *   1. Fetches all MCPs from the community API to get their IDs
 *   2. For each MCP with a README.md, PATCHes the readme field
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

const DRY_RUN = process.argv.includes('--dry-run');
const onlyArg = process.argv.indexOf('--only');
const onlyList = onlyArg !== -1 ? (process.argv[onlyArg + 1] ?? '').split(',').filter(Boolean) : [];

const API_BASE = process.env.AEROSTACK_API_BASE ?? 'https://api.aerostack.dev';

// API key
let API_KEY = process.env.AEROSTACK_API_KEY;
if (!API_KEY) {
  const credFile = `${homedir()}/.aerostack/credentials.json`;
  if (existsSync(credFile)) {
    API_KEY = JSON.parse(readFileSync(credFile, 'utf8')).api_key;
  }
}
if (!API_KEY && !DRY_RUN) {
  console.error('❌ AEROSTACK_API_KEY not set.');
  process.exit(1);
}

// ── Fetch MCP ID map (slug → id) ──────────────────────────────────────────────

async function fetchAllMcpIds() {
  const map = {};
  let page = 1;
  const limit = 100;

  while (true) {
    const res = await fetch(`${API_BASE}/api/community/mcp?page=${page}&limit=${limit}&profile=aerostack`, {
      headers: { 'X-API-Key': API_KEY },
    });
    if (!res.ok) throw new Error(`Failed to fetch MCP list page ${page}: HTTP ${res.status}`);
    const data = await res.json();

    const items = data.servers ?? data.items ?? data.data ?? data.mcps ?? data ?? [];
    if (!Array.isArray(items) || items.length === 0) break;

    for (const item of items) {
      // API returns @aerostack/mcp-adyen — strip prefix to get bare slug
      const rawSlug = item.slug ?? item.name ?? '';
      const slug = rawSlug.replace(/^@[^/]+\//, '');
      const id   = item.id ?? item.mcp_server_id;
      if (slug && id) map[slug] = id;
    }

    if (items.length < limit) break;
    page++;
  }

  return map;
}

// ── Patch readme ──────────────────────────────────────────────────────────────

async function patchReadme(id, readme) {
  const res = await fetch(`${API_BASE}/api/community/mcp/${id}`, {
    method: 'PATCH',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ readme }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PATCH HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('📋 Fetching MCP ID map from API...');
let idMap = {};
if (!DRY_RUN) {
  idMap = await fetchAllMcpIds();
  console.log(`   Found ${Object.keys(idMap).length} MCPs in registry\n`);
} else {
  console.log('   (dry-run: skipping API fetch)\n');
}

const dirs = readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name.startsWith('mcp-'))
  .map(d => d.name)
  .filter(d => onlyList.length === 0 || onlyList.includes(d))
  .sort();

const results = { ok: [], notFound: [], failed: [], skipped: [] };

for (const slug of dirs) {
  const dirPath    = join(ROOT, slug);
  const readmePath = join(dirPath, 'README.md');

  if (!existsSync(readmePath)) {
    results.skipped.push(slug);
    continue;
  }

  const readme = readFileSync(readmePath, 'utf8');
  const id     = idMap[slug];

  if (DRY_RUN) {
    console.log(`✓ ${slug} — readme ${readme.length} chars (dry-run)`);
    results.ok.push(slug);
    continue;
  }

  if (!id) {
    console.log(`⏭  ${slug} — not found in registry (slug mismatch?)`);
    results.notFound.push(slug);
    continue;
  }

  try {
    await patchReadme(id, readme);
    console.log(`✅ ${slug} → patched (${readme.length} chars)`);
    results.ok.push(slug);
  } catch (e) {
    console.error(`❌ ${slug} — ${e.message}`);
    results.failed.push({ slug, reason: e.message });
  }

  // Small delay to avoid hammering the API
  await new Promise(r => setTimeout(r, 50));
}

console.log('\n─────────────────────────────────────────');
console.log(`✅ Patched:    ${results.ok.length}`);
console.log(`⏭  Not found: ${results.notFound.length}`);
console.log(`⏭  No README: ${results.skipped.length}`);
console.log(`❌ Failed:    ${results.failed.length}`);

if (results.notFound.length) {
  console.log('\nNot found in registry:');
  for (const s of results.notFound) console.log(`  • ${s}`);
}

if (results.failed.length) {
  console.log('\nFailed:');
  for (const { slug, reason } of results.failed) console.log(`  • ${slug}: ${reason}`);
  process.exit(1);
}
