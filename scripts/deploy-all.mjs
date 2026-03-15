#!/usr/bin/env node
/**
 * Deploy all MCP servers to Aerostack.
 *
 * Usage:
 *   AEROSTACK_API_KEY=ak_... DEPLOY_ENV=staging node scripts/deploy-all.mjs
 *   AEROSTACK_API_KEY=ak_... DEPLOY_ENV=production node scripts/deploy-all.mjs
 *
 * Options:
 *   --only mcp-airtable,mcp-slack   deploy specific MCPs only
 *   --skip mcp-airtable             skip specific MCPs
 *   --dry-run                       build only, skip API upload
 */
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

// ── Config ────────────────────────────────────────────────────────────────────

const ENV     = process.env.DEPLOY_ENV ?? 'staging';
const DRY_RUN = process.argv.includes('--dry-run');

// API key: env var (CI) or local credentials file (local dev)
let API_KEY = process.env.AEROSTACK_API_KEY;
if (!API_KEY) {
  const credFile = `${homedir()}/.aerostack/credentials.json`;
  if (existsSync(credFile)) {
    API_KEY = JSON.parse(readFileSync(credFile, 'utf8')).api_key;
  }
}
if (!API_KEY && !DRY_RUN) {
  console.error('❌ AEROSTACK_API_KEY not set. Run `aerostack login` or export the env var.');
  process.exit(1);
}

// --only / --skip filters
const onlyArg  = process.argv.indexOf('--only');
const onlyList = onlyArg !== -1 ? process.argv[onlyArg + 1]?.split(',') ?? [] : [];
const skipArg  = process.argv.indexOf('--skip');
const skipList = skipArg !== -1 ? process.argv[skipArg + 1]?.split(',') ?? [] : [];

const API_BASE = 'https://api.aerostack.dev';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseToml(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^(\w+)\s*=\s*"(.+?)"/);
    if (m) result[m[1]] = m[2];
  }
  return result;
}

function buildMcp(dirPath, entryPath, outFile) {
  mkdirSync(join(dirPath, 'dist'), { recursive: true });
  execSync(
    `npx esbuild "${entryPath}" --bundle --outfile="${outFile}" --format=esm --minify --external:node:* --external:cloudflare:*`,
    { stdio: 'pipe' }
  );
}

async function deployMcp(slug, outFile) {
  const workerCode = readFileSync(outFile);
  const form = new FormData();
  form.append('worker', new Blob([workerCode], { type: 'application/javascript' }), 'worker.js');
  form.append('slug', slug);
  form.append('env', ENV);

  const res = await fetch(`${API_BASE}/api/v1/cli/deploy/mcp`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY },
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const dirs = readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name.startsWith('mcp-'))
  .map(d => d.name)
  .filter(d => onlyList.length === 0 || onlyList.includes(d))
  .filter(d => !skipList.includes(d))
  .sort();

console.log(`\n🚀 Aerostack MCP Deploy`);
console.log(`   env:      ${ENV}${DRY_RUN ? ' (dry-run)' : ''}`);
console.log(`   servers:  ${dirs.length}\n`);

const results = { ok: [], failed: [], skipped: [] };

for (const dir of dirs) {
  const dirPath   = join(ROOT, dir);
  const tomlPath  = join(dirPath, 'aerostack.toml');
  const entryPath = join(dirPath, 'src/index.ts');
  const outFile   = join(dirPath, 'dist/index.js');

  if (!existsSync(tomlPath) || !existsSync(entryPath)) {
    console.log(`⏭  ${dir} — skipped (missing aerostack.toml or src/index.ts)`);
    results.skipped.push(dir);
    continue;
  }

  const toml = parseToml(readFileSync(tomlPath, 'utf8'));
  const slug = toml.name ?? dir;

  process.stdout.write(`🔨 ${slug} — building...`);
  try {
    buildMcp(dirPath, entryPath, outFile);
    process.stdout.write(' built');
  } catch (e) {
    process.stdout.write('\n');
    console.error(`❌ ${slug} — build failed: ${e.message}`);
    results.failed.push({ slug, reason: 'build: ' + e.message });
    continue;
  }

  if (DRY_RUN) {
    process.stdout.write(' ✓ (dry-run)\n');
    results.ok.push(slug);
    continue;
  }

  process.stdout.write(' → deploying...');
  try {
    const data = await deployMcp(slug, outFile);
    process.stdout.write('\n');
    console.log(`✅ ${slug} → ${data.url}`);
    results.ok.push(slug);
  } catch (e) {
    process.stdout.write('\n');
    console.error(`❌ ${slug} — deploy failed: ${e.message}`);
    results.failed.push({ slug, reason: e.message });
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n─────────────────────────────────────────');
console.log(`✅ Deployed:  ${results.ok.length}`);
console.log(`⏭  Skipped:  ${results.skipped.length}`);
console.log(`❌ Failed:   ${results.failed.length}`);

if (results.failed.length) {
  console.log('\nFailed:');
  for (const { slug, reason } of results.failed) {
    console.log(`  • ${slug}: ${reason}`);
  }
  process.exit(1);
}
