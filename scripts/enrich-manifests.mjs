#!/usr/bin/env node
/**
 * Enrich MCP proxy.json files with capability_manifest.
 *
 * Reads each proxy/{service}/proxy.json, generates a capability_manifest
 * from existing metadata (tools, description, category, tags), and writes
 * it back to the file. Also outputs a SQL file for bulk-updating D1.
 *
 * Usage: node scripts/enrich-manifests.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROXY_DIR = join(__dirname, '..', 'proxy');
const OUTPUT_SQL = join(__dirname, '..', 'enrichment-updates.sql');

// ─── Capability Manifest Generator (mirrors packages/api/src/lib/capability-manifest.ts) ───

function generateManifest(mcp) {
    const tools = mcp.tools || [];
    const toolNames = tools.map(t => t.name?.toLowerCase() || '');
    const allText = [
        mcp.name || '', mcp.description || '',
        ...toolNames, ...(mcp.tags || []), mcp.category || '',
    ].join(' ').toLowerCase();

    // Capabilities from tool names
    const capabilities = [];
    if (toolNames.some(n => /create|insert|add|post/.test(n))) capabilities.push('create');
    if (toolNames.some(n => /get|read|list|search|query|find|retrieve|fetch/.test(n))) capabilities.push('read');
    if (toolNames.some(n => /update|edit|modify|patch|put/.test(n))) capabilities.push('update');
    if (toolNames.some(n => /delete|remove|destroy|archive/.test(n))) capabilities.push('delete');
    if (toolNames.some(n => /search|query|find|filter/.test(n))) capabilities.push('search');
    if (toolNames.some(n => /webhook|subscribe|watch|listen|event/.test(n))) capabilities.push('webhooks');
    if (toolNames.some(n => /send|notify|post_message|email|message/.test(n))) capabilities.push('notifications');
    if (capabilities.length === 0) capabilities.push('general');

    // Data types from tool names and descriptions
    const dataTypes = [];
    const allToolText = tools.map(t => `${t.name} ${t.description || ''}`).join(' ').toLowerCase();
    const dataKeywords = [
        'user', 'payment', 'order', 'message', 'file', 'document',
        'customer', 'invoice', 'ticket', 'project', 'task', 'issue',
        'page', 'database', 'record', 'channel', 'team', 'repo',
        'pull_request', 'branch', 'commit', 'subscription', 'product',
        'event', 'alert', 'metric', 'dashboard', 'workspace', 'member',
        'comment', 'block', 'board', 'card', 'item', 'folder',
    ];
    for (const kw of dataKeywords) {
        if (allToolText.includes(kw) || allText.includes(kw)) dataTypes.push(kw);
    }

    // Auth type mapping
    const authMap = {
        'bearer': 'bearer', 'secret-headers': 'secret_headers',
        'oauth': 'oauth', 'api_key': 'api_key',
    };
    const authRequired = authMap[mcp.auth_type] || 'api_key';

    // Triggers available
    const triggersAvailable = [];
    if (toolNames.some(n => /webhook|event|subscribe/.test(n))) triggersAvailable.push('webhook');
    if (allText.includes('schedule') || allText.includes('cron')) triggersAvailable.push('schedule');

    // Pairs with — intelligent pairing based on category
    const pairsMap = {
        'Payments': ['slack', 'notion', 'email', 'webhook'],
        'Developer Tools': ['slack', 'notion', 'jira', 'linear'],
        'Productivity': ['slack', 'email', 'calendar', 'webhook'],
        'Communication': ['notion', 'github', 'jira', 'webhook'],
        'CRM': ['slack', 'email', 'webhook', 'notion'],
        'Project Management': ['slack', 'github', 'email', 'notion'],
        'Analytics': ['slack', 'email', 'webhook', 'notion'],
        'Cloud Infrastructure': ['slack', 'github', 'email', 'webhook'],
        'Design': ['slack', 'notion', 'github', 'webhook'],
        'Monitoring': ['slack', 'email', 'webhook', 'pagerduty'],
        'E-commerce': ['slack', 'email', 'notion', 'stripe'],
        'Storage': ['notion', 'slack', 'email', 'webhook'],
        'Customer Support': ['slack', 'email', 'notion', 'crm'],
    };
    const pairsWith = (pairsMap[mcp.category] || ['slack', 'email', 'webhook'])
        .filter(p => p !== mcp.id); // don't pair with self

    // Best for
    const bestFor = [];
    if (capabilities.includes('create') && capabilities.includes('read'))
        bestFor.push(`managing ${mcp.category?.toLowerCase() || mcp.id} data`);
    if (capabilities.includes('search'))
        bestFor.push(`searching and filtering ${(dataTypes[0] || mcp.id)}s`);
    if (capabilities.includes('notifications'))
        bestFor.push('sending notifications and alerts');
    if (capabilities.includes('webhooks'))
        bestFor.push('event-driven automations');
    if (bestFor.length === 0)
        bestFor.push(`${mcp.category?.toLowerCase() || 'general'} operations`);

    // Not suitable for
    const notSuitableFor = [];
    if (!capabilities.includes('webhooks'))
        notSuitableFor.push('real-time event streaming (no webhook support)');
    if (tools.length < 3)
        notSuitableFor.push('complex multi-step workflows (limited tool set)');

    return {
        capabilities: [...new Set(capabilities)],
        data_types: [...new Set(dataTypes)].slice(0, 10),
        auth_required: authRequired,
        triggers_available: triggersAvailable,
        pairs_with: pairsWith.slice(0, 5),
        best_for: bestFor.slice(0, 5),
        not_suitable_for: notSuitableFor.slice(0, 3),
    };
}

// ─── Main ───

const proxyDirs = readdirSync(PROXY_DIR).filter(d => {
    const jsonPath = join(PROXY_DIR, d, 'proxy.json');
    return existsSync(jsonPath);
});

console.log(`Found ${proxyDirs.length} proxy MCPs to enrich.\n`);

const sqlStatements = [];
let enriched = 0;
let skipped = 0;

for (const dir of proxyDirs) {
    const jsonPath = join(PROXY_DIR, dir, 'proxy.json');
    try {
        const raw = readFileSync(jsonPath, 'utf-8');
        const mcp = JSON.parse(raw);

        // Skip if already has capability_manifest
        if (mcp.capability_manifest) {
            console.log(`  ⏭ ${dir} — already has capability_manifest`);
            skipped++;
            continue;
        }

        const manifest = generateManifest(mcp);
        mcp.capability_manifest = manifest;

        // Write back to proxy.json (pretty-printed)
        writeFileSync(jsonPath, JSON.stringify(mcp, null, 2) + '\n');

        // Generate SQL for D1 update — slugs in prod are @aerostack/mcp-{id}
        const manifestJson = JSON.stringify(manifest).replace(/'/g, "''");
        sqlStatements.push(
            `UPDATE mcp_servers SET capability_manifest = '${manifestJson}' WHERE slug = '@aerostack/mcp-${mcp.id}' OR slug = '${mcp.id}';`
        );

        console.log(`  ✅ ${dir} — ${manifest.capabilities.join(', ')} | ${manifest.data_types.join(', ')}`);
        enriched++;
    } catch (err) {
        console.error(`  ❌ ${dir} — ${err.message}`);
    }
}

// Also enrich from MCP-list.json for hosted MCPs
const listPath = join(__dirname, '..', 'MCP-list.json');
if (existsSync(listPath)) {
    const list = JSON.parse(readFileSync(listPath, 'utf-8'));
    let listEnriched = 0;
    for (const mcp of list) {
        if (!mcp.id || mcp.capability_manifest) continue;
        // Only enrich MCPs with status = live
        if (mcp.status !== 'live') continue;

        const manifest = generateManifest(mcp);
        mcp.capability_manifest = manifest;

        const manifestJson = JSON.stringify(manifest).replace(/'/g, "''");
        sqlStatements.push(
            `UPDATE mcp_servers SET capability_manifest = '${manifestJson}' WHERE slug = '@aerostack/mcp-${mcp.id}' OR slug = '${mcp.id}';`
        );
        listEnriched++;
    }

    // Write back MCP-list.json
    writeFileSync(listPath, JSON.stringify(list, null, 2) + '\n');
    console.log(`\n  📋 MCP-list.json — enriched ${listEnriched} live entries`);
}

// Write SQL file
if (sqlStatements.length > 0) {
    const sql = `-- Bulk capability_manifest enrichment for ${sqlStatements.length} MCPs\n-- Generated by: node scripts/enrich-manifests.mjs\n-- Run with: npx wrangler d1 execute aerostack-core --remote --file=MCP/enrichment-updates.sql\n\n${sqlStatements.join('\n')}\n`;
    writeFileSync(OUTPUT_SQL, sql);
    console.log(`\n📝 SQL written to: ${OUTPUT_SQL} (${sqlStatements.length} statements)`);
}

console.log(`\nDone: ${enriched} enriched, ${skipped} skipped (already had manifest)`);
