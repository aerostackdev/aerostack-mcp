#!/usr/bin/env node
/**
 * MCP Catalog Sync Script
 * Syncs filesystem state (mcp-{service}/ dirs and proxy/{service}/proxy.json)
 * into MCP-list.json.
 *
 * Usage:
 *   node scripts/sync-catalog.mjs [--dry-run]
 *
 * Rules:
 *   - mcp-{service}/ dir found  → tier: "build", status: "live"
 *   - proxy/{service}/proxy.json found → tier: "proxy", status: "live", proxy_url from file
 *   - Entry in catalog with no dir or proxy, status was "live" → set "pending"
 *   - status: "deprecated" is NEVER touched (manual flag)
 *   - Idempotent: running twice produces the same result
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(__dirname, '..');
const CATALOG_PATH = join(MCP_ROOT, 'MCP-list.json');
const PROXY_DIR = join(MCP_ROOT, 'proxy');

const isDryRun = process.argv.includes('--dry-run');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Given a worker slug (e.g. "slack", "google-calendar"), find the best matching
 * entry in the catalog. Strategy:
 *  1. Exact match on id
 *  2. Match on id = slug + "-mcp"
 *  3. Match on id where removing "-mcp" suffix equals slug
 *  4. Match on id that contains the slug (only if unique)
 */
function findCatalogEntry(catalog, slug) {
  // 1. Exact id match
  let match = catalog.find(e => e.id === slug);
  if (match) return match;

  // 2. slug + "-mcp" suffix
  match = catalog.find(e => e.id === slug + '-mcp');
  if (match) return match;

  // 3. id without "-mcp" suffix equals slug
  match = catalog.find(e => e.id.replace(/-mcp$/, '') === slug);
  if (match) return match;

  // 4. Substring — only if a single unambiguous match
  const subs = catalog.filter(e => e.id.includes(slug) || slug.includes(e.id));
  if (subs.length === 1) return subs[0];

  return null;
}

/**
 * Discover all mcp-{service} directories under MCP_ROOT.
 * Returns an array of slugs (the part after "mcp-").
 */
function discoverWorkers() {
  const entries = readdirSync(MCP_ROOT, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && e.name.startsWith('mcp-'))
    .map(e => e.name.slice('mcp-'.length)) // "mcp-slack" → "slack"
    .filter(slug => {
      // Only count as valid worker if src/index.ts exists
      const indexPath = join(MCP_ROOT, 'mcp-' + slug, 'src', 'index.ts');
      return existsSync(indexPath);
    });
}

/**
 * Discover all proxy/{service}/proxy.json files under PROXY_DIR.
 * Returns array of { slug, data } objects.
 */
function discoverProxies() {
  if (!existsSync(PROXY_DIR)) return [];

  const entries = readdirSync(PROXY_DIR, { withFileTypes: true });
  const result = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const proxyFile = join(PROXY_DIR, entry.name, 'proxy.json');
    if (!existsSync(proxyFile)) continue;

    try {
      const data = JSON.parse(readFileSync(proxyFile, 'utf8'));
      result.push({ slug: entry.name, data });
    } catch (err) {
      console.warn(`  ⚠️  Failed to parse ${proxyFile}: ${err.message}`);
    }
  }

  return result;
}

/**
 * Generate a minimal new catalog entry for a Worker that isn't in the catalog yet.
 */
function newWorkerEntry(slug) {
  return {
    id: slug,
    category: 'Uncategorized',
    status: 'live',
    env_vars: [],
    description: `${slug} MCP Worker`,
    tier: 'build',
  };
}

/**
 * Generate a minimal new catalog entry from a proxy.json file.
 */
function newProxyEntry(proxyData) {
  return {
    id: proxyData.id || proxyData.name?.toLowerCase().replace(/\s+/g, '-'),
    category: proxyData.category || 'Uncategorized',
    status: 'live',
    env_vars: proxyData.env_vars || [],
    description: proxyData.description || '',
    tier: 'proxy',
    proxy_url: proxyData.proxy_url || '',
    name: proxyData.name,
    auth_type: proxyData.auth_type,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('');
console.log('MCP Catalog Sync');
console.log('================');
if (isDryRun) console.log('DRY RUN — no files will be written\n');

// Load catalog
const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
console.log(`Loaded catalog: ${catalog.length} entries`);

// Discover filesystem state
const workerSlugs = discoverWorkers();
const proxies = discoverProxies();
console.log(`Found ${workerSlugs.length} Worker directories with src/index.ts`);
console.log(`Found ${proxies.length} proxy entries`);
console.log('');

// Track which catalog entries are "claimed" by a dir or proxy file
// Key: catalog entry index → boolean
const claimed = new Set();

let buildUpdated = 0;
let proxyUpdated = 0;
let newEntries = 0;
let setPending = 0;

// ── Step 1: Process Worker directories ───────────────────────────────────────
console.log('Processing Worker directories...');

for (const slug of workerSlugs) {
  const entry = findCatalogEntry(catalog, slug);

  if (entry) {
    const idx = catalog.indexOf(entry);
    claimed.add(idx);

    const wasLive = entry.status === 'live' && entry.tier === 'build';

    // Only update tier and status — preserve everything else
    entry.tier = 'build';
    entry.status = 'live';

    if (!wasLive) {
      console.log(`  ✅ Updated  mcp-${slug} → id:${entry.id} [build, live]`);
      buildUpdated++;
    } else {
      console.log(`  ✓  No change mcp-${slug} → id:${entry.id} [already build, live]`);
    }
  } else {
    // Not in catalog — add a new entry
    const newEntry = newWorkerEntry(slug);
    catalog.push(newEntry);
    claimed.add(catalog.length - 1);
    console.log(`  ➕ Added    mcp-${slug} as new entry id:${slug} [build, live]`);
    newEntries++;
    buildUpdated++;
  }
}

// ── Step 2: Process proxy files ───────────────────────────────────────────────
console.log('');
console.log('Processing proxy entries...');

for (const { slug, data } of proxies) {
  // The proxy.json id might differ from the dir name (e.g. atlassian/proxy.json id:"atlassian")
  // Try matching by proxy data id first, then by dir slug
  let entry = data.id ? catalog.find(e => e.id === data.id) : null;
  if (!entry) entry = findCatalogEntry(catalog, slug);

  if (entry) {
    const idx = catalog.indexOf(entry);
    claimed.add(idx);

    const wasProxyLive = entry.status === 'live' && entry.tier === 'proxy';

    entry.tier = 'proxy';
    entry.status = 'live';
    if (data.proxy_url) entry.proxy_url = data.proxy_url;
    if (data.auth_type) entry.auth_type = data.auth_type;
    if (data.name && !entry.name) entry.name = data.name;
    // Merge env_vars from proxy.json if the catalog entry has the old flat string[] format
    if (data.env_vars && Array.isArray(data.env_vars) && data.env_vars.length > 0) {
      // Only overwrite if proxy.json has richer (object) env_vars
      const hasObjects = data.env_vars.some(v => typeof v === 'object');
      if (hasObjects) {
        entry.env_vars = data.env_vars;
      }
    }

    if (!wasProxyLive) {
      console.log(`  🔗 Updated  proxy/${slug} → id:${entry.id} [proxy, live, ${entry.proxy_url}]`);
      proxyUpdated++;
    } else {
      console.log(`  ✓  No change proxy/${slug} → id:${entry.id} [already proxy, live]`);
    }
  } else {
    // Not in catalog — add from proxy.json data
    const newEntry = newProxyEntry(data);
    catalog.push(newEntry);
    claimed.add(catalog.length - 1);
    console.log(`  ➕ Added    proxy/${slug} as new entry id:${newEntry.id} [proxy, live]`);
    newEntries++;
    proxyUpdated++;
  }
}

// ── Step 3: Demote unclaimed "live" entries back to "pending" ─────────────────
console.log('');
console.log('Checking for removed services...');

for (let i = 0; i < catalog.length; i++) {
  if (claimed.has(i)) continue;
  const entry = catalog[i];

  if (entry.status === 'deprecated') {
    // Never touch deprecated — manual flag
    continue;
  }

  if (entry.status === 'live') {
    console.log(`  ⚠️  Demoting  id:${entry.id} — was live but no dir/proxy found → pending`);
    entry.status = 'pending';
    setPending++;
  }
  // If already "pending" — leave as-is
}

// ── Step 4: Write updated catalog ─────────────────────────────────────────────
if (!isDryRun) {
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  console.log('');
  console.log(`✅ Wrote updated catalog to ${CATALOG_PATH}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log('Summary');
console.log('-------');
console.log(`  Build entries updated/confirmed:  ${buildUpdated + (workerSlugs.length - buildUpdated - newEntries < 0 ? 0 : workerSlugs.length - newEntries)}`);
console.log(`  Build entries updated to live:    ${buildUpdated}`);
console.log(`  Proxy entries updated/confirmed:  ${proxies.length}`);
console.log(`  Proxy entries updated to live:    ${proxyUpdated}`);
console.log(`  New entries added to catalog:     ${newEntries}`);
console.log(`  Entries demoted back to pending:  ${setPending}`);
console.log(`  Total catalog entries now:        ${catalog.length}`);
console.log('');

// Final counts
const liveBuild = catalog.filter(e => e.status === 'live' && e.tier === 'build').length;
const liveProxy = catalog.filter(e => e.status === 'live' && e.tier === 'proxy').length;
const pending = catalog.filter(e => e.status === 'pending').length;
const deprecated = catalog.filter(e => e.status === 'deprecated').length;
console.log(`  Live (build):  ${liveBuild}`);
console.log(`  Live (proxy):  ${liveProxy}`);
console.log(`  Pending:       ${pending}`);
console.log(`  Deprecated:    ${deprecated}`);
console.log('');

if (isDryRun) {
  console.log('DRY RUN complete — no files written.');
}
