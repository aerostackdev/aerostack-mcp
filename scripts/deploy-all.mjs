#!/usr/bin/env node
/**
 * Deploy all MCP servers (hosted + proxy) to Aerostack.
 *
 * Usage:
 *   AEROSTACK_API_KEY=ak_... DEPLOY_ENV=staging node scripts/deploy-all.mjs
 *   AEROSTACK_API_KEY=ak_... DEPLOY_ENV=production node scripts/deploy-all.mjs
 *
 * Options:
 *   --only mcp-airtable,mcp-slack   deploy specific MCPs only
 *   --skip mcp-airtable             skip specific MCPs
 *   --dry-run                       build only, skip API upload
 *   --proxies-only                  only register proxy MCPs (no Worker builds)
 */
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

// ── Config ────────────────────────────────────────────────────────────────────

const ENV          = process.env.DEPLOY_ENV ?? 'staging';
const DRY_RUN       = process.argv.includes('--dry-run');
const PROXIES_ONLY  = process.argv.includes('--proxies-only');
const HOSTED_ONLY   = process.argv.includes('--hosted-only');

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
const onlyList = onlyArg !== -1 ? (process.argv[onlyArg + 1] ?? '').split(',').filter(Boolean) : [];
const skipArg  = process.argv.indexOf('--skip');
const skipList = skipArg !== -1 ? (process.argv[skipArg + 1] ?? '').split(',').filter(Boolean) : [];

const API_BASE = process.env.AEROSTACK_API_BASE ?? 'https://api.aerostack.dev';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseToml(content) {
  const result = {};
  let currentSection = null;
  for (const line of content.split('\n')) {
    // Section header: [capability_manifest]
    const sectionMatch = line.match(/^\[(\w+)\]\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      result[currentSection] = result[currentSection] || {};
      continue;
    }
    // key = "value"
    const strMatch = line.match(/^(\w+)\s*=\s*"(.+?)"/);
    if (strMatch) {
      if (currentSection) result[currentSection][strMatch[1]] = strMatch[2];
      else result[strMatch[1]] = strMatch[2];
      continue;
    }
    // tags = ["a", "b"]
    const arrMatch = line.match(/^(\w+)\s*=\s*\[(.+)\]/);
    if (arrMatch) {
      const arr = arrMatch[2].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) ?? [];
      if (currentSection) result[currentSection][arrMatch[1]] = arr;
      else result[arrMatch[1]] = arr;
    }
  }
  return result;
}

async function patchMcpMeta(id, meta) {
  const res = await fetch(`${API_BASE}/api/community/mcp/${id}`, {
    method: 'PATCH',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PATCH HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

/** Convert API-returned URL to public aerostack.dev format */
function publicUrl(slug) {
  // e.g. mcp-airtable → https://aerostack.dev/mcp/aerostack/mcp-airtable
  const profile = process.env.AEROSTACK_PROFILE ?? 'aerostack';
  return `https://aerostack.dev/mcp/${profile}/${slug}`;
}

function buildMcp(dirPath, entryPath, outFile) {
  mkdirSync(join(dirPath, 'dist'), { recursive: true });
  // Install npm dependencies if the MCP has any
  const pkgFile = join(dirPath, 'package.json');
  const lockFile = join(dirPath, 'package-lock.json');
  if (existsSync(lockFile)) {
    execSync('npm ci --ignore-scripts', { cwd: dirPath, stdio: 'pipe' });
  } else if (existsSync(pkgFile)) {
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
    if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
      execSync('npm install --ignore-scripts --no-audit --no-fund', { cwd: dirPath, stdio: 'pipe' });
    }
  }
  execSync(
    `npx esbuild "${entryPath}" --bundle --outfile="${outFile}" --format=esm --minify --external:node:* --external:cloudflare:*`,
    { stdio: 'pipe' }
  );
}

async function deployHosted(slug, outFile) {
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

async function publishMcp(id) {
  const res = await fetch(`${API_BASE}/api/community/mcp/${id}/publish`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY },
  });
  const data = await res.json().catch(() => ({}));
  // 422 = quality rejected, still return data so caller can log reason
  return { status: res.status, ...data };
}

async function registerProxy(proxy, readme) {
  // Build config_schema from ALL env_vars (not just the first one)
  const allEnvKeys = proxy.env_vars?.map(v => v.key).filter(Boolean) ?? [];
  const body = {
    name:            proxy.name,
    slug:            `mcp-${proxy.id}`,
    description:     proxy.description,
    category:        proxy.category,
    type:            'proxy',
    external_url:    proxy.proxy_url,
    auth_type:       proxy.auth_type ?? 'bearer',
    auth_secret_key: allEnvKeys[0] ?? undefined,
    ...(allEnvKeys.length > 0 && { config_schema: { env: allEnvKeys } }),
    version:         '1.0.0',
    license:         'MIT',
    ...(proxy.tools  && { tools: proxy.tools }),
    ...(proxy.tags   && { tags:  proxy.tags }),
    ...(readme       && { readme }),
    ...(proxy.capability_manifest && { capability_manifest: proxy.capability_manifest }),
  };

  const res = await fetch(`${API_BASE}/api/community/mcp`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ── Hosted MCPs ───────────────────────────────────────────────────────────────

const results = { ok: [], failed: [], skipped: [] };

if (!PROXIES_ONLY || HOSTED_ONLY) {
  const dirs = readdirSync(ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('mcp-'))
    .map(d => d.name)
    .filter(d => onlyList.length === 0 || onlyList.includes(d))
    .filter(d => !skipList.includes(d))
    .sort();

  console.log(`\n🚀 Aerostack MCP Deploy — Hosted`);
  console.log(`   env:      ${ENV}${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log(`   servers:  ${dirs.length}\n`);

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
      const data = await deployHosted(slug, outFile);
      process.stdout.write(' → patching metadata...');

      // Patch description, category, tags, readme
      const readme = existsSync(join(dirPath, 'README.md'))
        ? readFileSync(join(dirPath, 'README.md'), 'utf8') : undefined;

      await patchMcpMeta(data.mcp_server_id, {
        ...(toml.description && { description: toml.description }),
        ...(toml.category    && { category:    toml.category }),
        ...(toml.tags        && { tags:        toml.tags }),
        ...(toml.env         && { config_schema: { env: toml.env, ...(toml.scopes && { scopes: toml.scopes }) } }),
        ...(readme           && { readme }),
        ...(toml.capability_manifest && { capability_manifest: toml.capability_manifest }),
      });

      process.stdout.write('\n');
      console.log(`✅ ${slug} → ${publicUrl(slug)}`);
      results.ok.push(slug);
    } catch (e) {
      process.stdout.write('\n');
      console.error(`❌ ${slug} — ${e.message}`);
      results.failed.push({ slug, reason: e.message });
    }
  }
}

// ── Proxy MCPs ────────────────────────────────────────────────────────────────

const proxyRoot = join(ROOT, 'proxy');
if (existsSync(proxyRoot)) {
  const proxyDirs = readdirSync(proxyRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name)
    .filter(d => onlyList.length === 0 || onlyList.includes(`proxy-${d}`) || onlyList.includes(d))
    .sort();

  if (proxyDirs.length > 0) {
    console.log(`\n🔗 Aerostack MCP Deploy — Proxy`);
    console.log(`   proxies: ${proxyDirs.length}\n`);

    for (const name of proxyDirs) {
      const proxyFile = join(proxyRoot, name, 'proxy.json');
      if (!existsSync(proxyFile)) {
        console.log(`⏭  proxy/${name} — skipped (no proxy.json)`);
        results.skipped.push(`proxy-${name}`);
        continue;
      }

      const proxy = JSON.parse(readFileSync(proxyFile, 'utf8'));
      const slug  = `mcp-${proxy.id}`;

      if (DRY_RUN) {
        console.log(`✓  ${slug} → ${proxy.proxy_url} (dry-run)`);
        results.ok.push(slug);
        continue;
      }

      // Skip proxies with per-tenant dynamic URLs (e.g. https://{SHOPIFY_DOMAIN}/...)
      if (proxy.proxy_url.includes('{')) {
        console.log(`⏭  ${slug} — skipped (dynamic per-tenant URL: ${proxy.proxy_url})`);
        results.skipped.push(slug);
        continue;
      }

      const proxyReadme = existsSync(join(proxyRoot, name, 'README.md'))
        ? readFileSync(join(proxyRoot, name, 'README.md'), 'utf8') : undefined;

      process.stdout.write(`🔗 ${slug} — registering...`);
      try {
        const reg = await registerProxy(proxy, proxyReadme);
        process.stdout.write(' → publishing...');

        const pub = await publishMcp(reg.id);

        // Ensure capability_manifest from proxy.json is persisted (publish auto-generates a weaker one)
        if (proxy.capability_manifest) {
          await patchMcpMeta(reg.id, { capability_manifest: proxy.capability_manifest }).catch(() => {});
        }
        process.stdout.write('\n');

        if (pub.decision === 'auto_publish' || pub.status === 'published' || pub.error === 'Already published') {
          console.log(`✅ ${slug} → ${publicUrl(slug)}`);
        } else if (pub.decision === 'pending_review') {
          console.log(`⏳ ${slug} → pending review (score: ${pub.score})`);
        } else {
          console.log(`⚠️  ${slug} → registered but publish returned: ${JSON.stringify(pub)}`);
        }
        results.ok.push(slug);
      } catch (e) {
        process.stdout.write('\n');
        console.error(`❌ ${slug} — ${e.message}`);
        results.failed.push({ slug, reason: e.message });
      }
    }
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
