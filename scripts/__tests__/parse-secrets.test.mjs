/**
 * Unit tests for collectSecretKeys() — the deploy script's bridge between
 * `aerostack.toml` and the `mcp_servers.config_schema.env` registry column.
 *
 * Why this file matters: a single drop here silently broke 9 MCPs in prod
 * (jira-cloud / eventbrite / gorgias / front / height / helpscout / luma /
 * surveymonkey / freshservice) because their `[secrets]` declarations never
 * reached the registry, the gateway never injected `X-Mcp-Secret-*` headers,
 * and workers rejected every call with "Missing <KEY> secret".
 *
 * Run: `node --test scripts/__tests__/parse-secrets.test.mjs`
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { collectSecretKeys } from '../lib/secret-keys.mjs';

test('legacy env=[] only — preserves order', () => {
  const toml = { env: ['NOTION_API_KEY'] };
  assert.deepEqual(collectSecretKeys(toml), ['NOTION_API_KEY']);
});

test('[secrets] table only — preserves declaration order via Object.keys', () => {
  const toml = {
    secrets: {
      JIRA_EMAIL:     'Your Atlassian account email address',
      JIRA_API_TOKEN: 'Your Jira API token',
      JIRA_DOMAIN:    "Your Jira subdomain (e.g. 'mycompany')",
    },
  };
  assert.deepEqual(
    collectSecretKeys(toml),
    ['JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_DOMAIN']
  );
});

test('both formats with overlap — [secrets] first, then non-overlapping env entries', () => {
  // mcp-rocketchat-style drift: env=[] declares some keys, [secrets] adds more.
  const toml = {
    env: ['ROCKETCHAT_URL', 'ROCKETCHAT_AUTH_TOKEN', 'ROCKETCHAT_USER_ID'],
    secrets: {
      ROCKETCHAT_URL:   'Server URL',
      ROCKETCHAT_TOKEN: 'X-Auth-Token',
    },
  };
  // Order: ROCKETCHAT_URL (from secrets, dedup'd), ROCKETCHAT_TOKEN (from secrets),
  // then ROCKETCHAT_AUTH_TOKEN + ROCKETCHAT_USER_ID (from env, not in secrets)
  assert.deepEqual(
    collectSecretKeys(toml),
    ['ROCKETCHAT_URL', 'ROCKETCHAT_TOKEN', 'ROCKETCHAT_AUTH_TOKEN', 'ROCKETCHAT_USER_ID']
  );
});

test('neither format — empty array (caller MUST omit config_schema in payload)', () => {
  assert.deepEqual(collectSecretKeys({}), []);
  assert.deepEqual(collectSecretKeys({ name: 'x', description: 'y' }), []);
});

test('empty [secrets] table — empty array', () => {
  assert.deepEqual(collectSecretKeys({ secrets: {} }), []);
});

test('null / undefined toml — empty array, no throw', () => {
  assert.deepEqual(collectSecretKeys(null), []);
  assert.deepEqual(collectSecretKeys(undefined), []);
});

test('malformed secrets (array instead of object) — falls through to env', () => {
  // Defensive: someone might write `secrets = ["X"]` accidentally; we must
  // not call Object.keys on an array (would return numeric indices "0","1").
  const toml = { secrets: ['BAD'], env: ['GOOD_KEY'] };
  assert.deepEqual(collectSecretKeys(toml), ['GOOD_KEY']);
});

test('regression: jira-cloud fixture (was 100% broken pre-fix)', () => {
  const toml = {
    name: 'mcp-jira-cloud',
    secrets: {
      JIRA_EMAIL:     'Your Atlassian account email address',
      JIRA_API_TOKEN: 'Your Jira API token',
      JIRA_DOMAIN:    'Your Jira subdomain',
    },
  };
  const keys = collectSecretKeys(toml);
  assert.deepEqual(keys, ['JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_DOMAIN']);
  // Critical: every key the worker reads at request.headers.get(`X-Mcp-Secret-${KEY}`)
  // must appear here, otherwise the gateway omits the header.
  for (const k of ['JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_DOMAIN']) {
    assert.ok(keys.includes(k), `worker reads ${k} but collectSecretKeys would drop it`);
  }
});

test('regression: notion fixture (legacy format, was working pre-fix — must not regress)', () => {
  const toml = {
    name: 'mcp-notion',
    env: ['NOTION_API_KEY'],
  };
  assert.deepEqual(collectSecretKeys(toml), ['NOTION_API_KEY']);
});
