#!/usr/bin/env node
/**
 * MCP Catalog Status Report
 * Prints a human-readable snapshot of the catalog's current state.
 *
 * Usage:
 *   node scripts/catalog-status.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(__dirname, '..');
const CATALOG_PATH = join(MCP_ROOT, 'MCP-list.json');
const PROXY_DIR = join(MCP_ROOT, 'proxy');

// ── Load catalog ──────────────────────────────────────────────────────────────
const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));

// ── Bucket by status + tier ───────────────────────────────────────────────────
const liveBuild = catalog.filter(e => e.status === 'live' && e.tier === 'build');
const liveProxy = catalog.filter(e => e.status === 'live' && e.tier === 'proxy');
const pending = catalog.filter(e => e.status === 'pending');
const deprecated = catalog.filter(e => e.status === 'deprecated');

// ── Count tools per worker from src/index.ts ──────────────────────────────────
function countTools(slug) {
  const indexPath = join(MCP_ROOT, 'mcp-' + slug, 'src', 'index.ts');
  if (!existsSync(indexPath)) return null;
  try {
    const src = readFileSync(indexPath, 'utf8');
    // Count occurrences of `name:` inside the TOOLS array block
    // Simple heuristic: count `    name:` or `  name:` lines in TOOLS
    const toolsMatch = src.match(/(?:const|let|var)\s+TOOLS\s*[=:][^[]*\[([\s\S]*?)\];/);
    if (toolsMatch) {
      const toolsBlock = toolsMatch[1];
      const nameMatches = toolsBlock.match(/\bname\s*:/g);
      return nameMatches ? nameMatches.length : 0;
    }
    // Fallback: count all `name:` occurrences with a string value in context
    const fallback = (src.match(/^\s+name:\s+['"`]/mg) || []).length;
    return fallback || null;
  } catch {
    return null;
  }
}

// ── Discover worker dirs ──────────────────────────────────────────────────────
function discoverWorkerSlugs() {
  const entries = readdirSync(MCP_ROOT, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && e.name.startsWith('mcp-'))
    .map(e => e.name.slice('mcp-'.length))
    .filter(slug => existsSync(join(MCP_ROOT, 'mcp-' + slug, 'src', 'index.ts')));
}

// ── Discover proxies ──────────────────────────────────────────────────────────
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
    } catch {
      // skip malformed
    }
  }
  return result;
}

const workerSlugs = discoverWorkerSlugs();
const proxyEntries = discoverProxies();

// ── Print report ──────────────────────────────────────────────────────────────
const BAR = '─'.repeat(38);

console.log('');
console.log('MCP Catalog Status');
console.log('==================');
console.log(`✅ Build (live):     ${String(liveBuild.length).padStart(3)} workers`);
console.log(`🔗 Proxy (live):     ${String(liveProxy.length).padStart(3)} proxies`);
console.log(`⏳ Pending:          ${String(pending.length).padStart(3)} entries`);
console.log(`❌ Deprecated:       ${String(deprecated.length).padStart(3)} entries`);
console.log(BAR);
console.log(`Total:               ${String(catalog.length).padStart(3)} entries`);
console.log('');

// ── Build Workers detail ───────────────────────────────────────────────────────
console.log('Build Workers (from filesystem):');
for (const slug of workerSlugs.sort()) {
  const toolCount = countTools(slug);
  const toolStr = toolCount !== null ? `(${toolCount} tools)` : '(tools: unknown)';
  const label = ('mcp-' + slug).padEnd(26);
  console.log(`  ✅ ${label} ${toolStr}`);
}

if (workerSlugs.length === 0) {
  console.log('  (none found)');
}

// Check if any catalog "live build" entries don't have a dir
const orphanedLiveBuild = liveBuild.filter(e => {
  // Try to find a worker dir for this catalog entry
  const idSlug = e.id.replace(/-mcp$/, '');
  return !workerSlugs.includes(idSlug) && !workerSlugs.some(s => s === e.id || e.id.includes(s) || s.includes(e.id));
});
if (orphanedLiveBuild.length > 0) {
  console.log('');
  console.log('  ⚠️  Catalog live+build entries with NO matching directory:');
  for (const e of orphanedLiveBuild) {
    console.log(`     ${e.id}`);
  }
  console.log('  → Run `npm run sync-catalog` to reconcile');
}

console.log('');

// ── Proxy Services detail ─────────────────────────────────────────────────────
console.log('Proxy Services (from proxy/ directory):');
for (const { slug, data } of proxyEntries.sort((a, b) => a.slug.localeCompare(b.slug))) {
  const url = data.proxy_url || '(no url)';
  const label = slug.padEnd(14);
  console.log(`  🔗 ${label} → ${url}`);
}

if (proxyEntries.length === 0) {
  console.log('  (none found)');
}

// Check if any catalog "live proxy" entries don't have a proxy dir
const proxySlugs = proxyEntries.map(p => p.slug);
const proxyIds = proxyEntries.map(p => p.data.id).filter(Boolean);
const orphanedLiveProxy = liveProxy.filter(e => {
  return !proxySlugs.includes(e.id) && !proxyIds.includes(e.id) &&
    !proxySlugs.some(s => s === e.id || e.id.includes(s) || s.includes(e.id));
});
if (orphanedLiveProxy.length > 0) {
  console.log('');
  console.log('  ⚠️  Catalog live+proxy entries with NO matching proxy/ dir:');
  for (const e of orphanedLiveProxy) {
    console.log(`     ${e.id} → ${e.proxy_url || '(no url)'}`);
  }
  console.log('  → Run `npm run sync-catalog` to reconcile or add the proxy dir');
}

console.log('');

// ── Pending summary by category ───────────────────────────────────────────────
if (pending.length > 0) {
  const byCategory = {};
  for (const e of pending) {
    const cat = e.category || 'Uncategorized';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  console.log('Pending by Category (top 10):');
  for (const [cat, count] of sorted.slice(0, 10)) {
    console.log(`  ⏳ ${cat.padEnd(28)} ${count}`);
  }
  if (sorted.length > 10) {
    console.log(`  ... and ${sorted.length - 10} more categories`);
  }
  console.log('');
}

// ── Deprecated ────────────────────────────────────────────────────────────────
if (deprecated.length > 0) {
  console.log('Deprecated:');
  for (const e of deprecated) {
    console.log(`  ❌ ${e.id}`);
  }
  console.log('');
}

// ── Sync hint ─────────────────────────────────────────────────────────────────
const catalogLiveBuildIds = new Set(liveBuild.map(e => e.id));
const fsWorkerCount = workerSlugs.length;
const catalogBuildLiveCount = liveBuild.length;

if (fsWorkerCount !== catalogBuildLiveCount) {
  console.log(`⚠️  Filesystem has ${fsWorkerCount} worker dirs but catalog has ${catalogBuildLiveCount} live+build entries.`);
  console.log('   Run `npm run sync-catalog` to sync.');
  console.log('');
}
