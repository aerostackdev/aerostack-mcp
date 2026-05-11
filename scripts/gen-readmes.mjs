#!/usr/bin/env node
/**
 * Generate README.md for MCPs that don't have one.
 * Reads aerostack.toml + src/index.ts, extracts tools, generates standard README.
 *
 * Usage:
 *   node scripts/gen-readmes.mjs [--dry-run] [--only mcp-adyen,mcp-foo]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

const DRY_RUN  = process.argv.includes('--dry-run');
const FORCE    = process.argv.includes('--force');
const onlyArg  = process.argv.indexOf('--only');
const onlyList = onlyArg !== -1 ? (process.argv[onlyArg + 1] ?? '').split(',').filter(Boolean) : [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseToml(content) {
  const result = {};
  let currentSection = null;
  for (const line of content.split('\n')) {
    const sectionMatch = line.match(/^\[(\w+)\]\s*$/);
    if (sectionMatch) { currentSection = sectionMatch[1]; result[currentSection] = result[currentSection] || {}; continue; }
    const strMatch = line.match(/^(\w+)\s*=\s*"(.+?)"/);
    if (strMatch) { if (currentSection) result[currentSection][strMatch[1]] = strMatch[2]; else result[strMatch[1]] = strMatch[2]; continue; }
    const arrMatch = line.match(/^(\w+)\s*=\s*\[(.+)\]/);
    if (arrMatch) {
      const arr = arrMatch[2].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) ?? [];
      if (currentSection) result[currentSection][arrMatch[1]] = arr; else result[arrMatch[1]] = arr;
    }
  }
  return result;
}

/**
 * Extract tool objects from TypeScript TOOLS array.
 * Handles single-quote and double-quote strings.
 */
function extractTools(source) {
  const tools = [];
  // Match tool blocks: { name: '...', description: '...' ... }
  const toolRegex = /\{\s*name:\s*['"`]([^'"`]+)['"`]\s*,\s*description:\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = toolRegex.exec(source)) !== null) {
    tools.push({ name: m[1], description: m[2] });
  }
  return tools;
}

/**
 * Determine how to get the secret (from [secrets] table in toml or generic)
 */
function secretHowToGet(key, toml) {
  const display = toml.secrets?.[key];
  if (display) return display;
  // Fallback generics
  if (key.includes('API_KEY')) return `Your ${key.replace(/_/g, ' ')} from the service's developer settings`;
  if (key.includes('TOKEN')) return `Personal access token or service token from the provider`;
  if (key.includes('SECRET')) return `Secret key from the provider's developer console`;
  return `See provider documentation`;
}

function titleCase(s) {
  return s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function slugToName(slug) {
  // mcp-adyen → Adyen, mcp-aws-s3 → AWS S3
  const name = slug.replace(/^mcp-/, '');
  // Full overrides for known brand names
  const brandOverrides = {
    'assemblyai': 'AssemblyAI', 'fal-ai': 'fal.ai', 'fireworks-ai': 'Fireworks AI',
    'together-ai': 'Together AI', 'stability-ai': 'Stability AI', 'openrouter': 'OpenRouter',
    'launchdarkly': 'LaunchDarkly', 'lemon-squeezy': 'Lemon Squeezy', 'trigger-dev': 'Trigger.dev',
    'uptimerobot': 'UptimeRobot', 'cal-com': 'Cal.com', 'heygen': 'HeyGen',
    'hookdeck': 'Hookdeck', 'messagebird': 'MessageBird', 'rocketchat': 'Rocket.Chat',
    'sendbird': 'Sendbird', 'surveymonkey': 'SurveyMonkey', 'pipedream': 'Pipedream',
    'productboard': 'Productboard', 'salesloft': 'Salesloft', 'wandb': 'Weights & Biases',
    'weaviate': 'Weaviate', 'bigcommerce': 'BigCommerce', 'freshbooks': 'FreshBooks',
    'freshsales': 'Freshsales', 'freshservice': 'Freshservice', 'helpscout': 'Help Scout',
    'bamboohr': 'BambooHR', 'braintree': 'Braintree', 'coinbase': 'Coinbase',
    'convertkit': 'ConvertKit', 'mailerlite': 'MailerLite', 'omnisend': 'Omnisend',
    'mattermost': 'Mattermost', 'runpod': 'RunPod', 'zoho-crm': 'Zoho CRM',
    'zoho-books': 'Zoho Books', 'google-chat': 'Google Chat', 'google-docs': 'Google Docs',
    'google-forms': 'Google Forms', 'google-slides': 'Google Slides', 'google-tasks': 'Google Tasks',
    'amazon-seller': 'Amazon Seller', 'jira-cloud': 'Jira Cloud', 'aws-s3': 'AWS S3',
  };
  if (brandOverrides[name]) return brandOverrides[name];
  const knownAcronyms = ['aws', 'api', 'sdk', 'crm', 'erp', 'smtp', 'ai', 'url', 'pdf', 'iam', 'sql', 'db', 'rds', 'ecs', 'eks', 'sqs', 'sns', 'ec2', 's3', 'aks', 'gke', 'dns', 'vapi', 'e2b'];
  return name.split('-').map(w => knownAcronyms.includes(w) ? w.toUpperCase() : titleCase(w)).join(' ');
}

function generateReadme(slug, toml, tools) {
  const name = slugToName(slug);
  const description = toml.description ?? `MCP server for ${name}`;
  const category = toml.category ?? 'Integrations';

  // Secret vars
  const secretKeys = [];
  if (toml.secrets) {
    secretKeys.push(...Object.keys(toml.secrets));
  } else if (Array.isArray(toml.env)) {
    secretKeys.push(...toml.env);
  }

  // Filter out _ping from tool table
  const publicTools = tools.filter(t => t.name !== '_ping');

  // Configuration table
  const configRows = secretKeys.map(key => {
    const howToGet = secretHowToGet(key, toml);
    return `| \`${key}\` | Yes | ${howToGet} |`;
  }).join('\n');

  const configSection = secretKeys.length > 0 ? `## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
${configRows}

` : '';

  // Tools table
  const toolRows = publicTools.map(t => `| \`${t.name}\` | ${t.description} |`).join('\n');

  // Quick start credential lines
  const credHeaders = secretKeys.map(k => `  -H 'X-Mcp-Secret-${k.replace(/_/g, '-')}: your-${k.toLowerCase().replace(/_/g, '-')}'`).join(' \\\n');
  const credNote = secretKeys.length > 0 ? `\nAdd the following secrets under **Project → Secrets**:\n${secretKeys.map(k => `- \`${k}\``).join('\n')}\n` : '';

  const firstTool = publicTools[0];
  const curlExample = firstTool ? `\`\`\`bash
curl -X POST https://mcp.aerostack.dev/s/aerostack/${slug} \\
  -H 'Content-Type: application/json' \\
${credHeaders} \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"${firstTool.name}","arguments":{}}}'
\`\`\`` : '';

  const toolCountText = publicTools.length === 1 ? '1 tool' : `${publicTools.length} tools`;

  return `# ${slug} — ${name} MCP Server

> ${description}

**Live endpoint:** \`https://mcp.aerostack.dev/s/aerostack/${slug}\`

---

## What You Can Do

This MCP server gives AI agents access to ${name} via ${toolCountText}. Connect it to any Aerostack workspace and your agents can interact with ${name} directly.

## Available Tools

| Tool | Description |
|------|-------------|
${toolRows}

${configSection}## Quick Start

### Add to Aerostack Workspace

1. Go to [aerostack.dev](https://aerostack.dev) → Your Project → **MCPs**
2. Search for **"${name}"** and click **Add to Workspace**
${credNote}
Once added, every AI agent in your workspace can use ${name} tools automatically.

### Direct API Call

${curlExample}

## License

MIT
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const dirs = readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name.startsWith('mcp-'))
  .map(d => d.name)
  .filter(d => onlyList.length === 0 || onlyList.includes(d))
  .sort();

let generated = 0;
let skipped = 0;
const failed = [];

for (const slug of dirs) {
  const dirPath   = join(ROOT, slug);
  const readmePath = join(dirPath, 'README.md');
  const tomlPath  = join(dirPath, 'aerostack.toml');
  const entryPath = join(dirPath, 'src/index.ts');

  if (existsSync(readmePath) && !FORCE) { skipped++; continue; }
  if (!existsSync(tomlPath) || !existsSync(entryPath)) {
    console.log(`⏭  ${slug} — missing toml or index.ts`);
    failed.push(slug);
    continue;
  }

  try {
    const toml   = parseToml(readFileSync(tomlPath, 'utf8'));
    const source = readFileSync(entryPath, 'utf8');
    const tools  = extractTools(source);

    if (tools.length === 0) {
      console.warn(`⚠️  ${slug} — no tools found in index.ts`);
    }

    const readme = generateReadme(slug, toml, tools);

    if (DRY_RUN) {
      console.log(`✓ ${slug} — ${tools.length} tools (dry-run)`);
    } else {
      writeFileSync(readmePath, readme);
      console.log(`✅ ${slug} — ${tools.length} tools`);
    }
    generated++;
  } catch (e) {
    console.error(`❌ ${slug} — ${e.message}`);
    failed.push(slug);
  }
}

console.log(`\n─────────────────────────────────────────`);
console.log(`✅ Generated: ${generated}`);
console.log(`⏭  Skipped (already had README): ${skipped}`);
console.log(`❌ Failed: ${failed.length}`);
if (failed.length) console.log('  ' + failed.join('\n  '));
