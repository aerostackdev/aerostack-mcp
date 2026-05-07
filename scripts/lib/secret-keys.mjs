/**
 * Canonical secret-key extraction for hosted MCP `aerostack.toml` files.
 *
 * Two formats coexist in the market repo:
 *   1) Legacy:   env = ["FOO_API_KEY"]
 *   2) Newer:    [secrets]
 *                FOO_API_KEY = "User-friendly description for the dashboard"
 *
 * Until 2026-05-07 the deploy script only consumed (1), silently dropping
 * every secret declared via (2). Result: 9+ MCPs (jira-cloud, eventbrite,
 * gorgias, front, height, helpscout, luma, surveymonkey, freshservice)
 * shipped with empty config_schema.env in the registry — the gateway never
 * injected their X-Mcp-Secret-* headers and workers errored with
 * "Missing X_KEY secret" upstream. See parse-secrets.test.mjs for fixtures.
 *
 * Behaviour: union of both sources. `[secrets]`-table keys come first to
 * preserve the documented ordering, deduped against `env=[]`. Returns an
 * empty array when neither is set (caller should omit `config_schema` from
 * the payload in that case to avoid wiping a previously-correct value).
 */
export function collectSecretKeys(toml) {
  const fromTable = (toml && toml.secrets && typeof toml.secrets === 'object' && !Array.isArray(toml.secrets))
    ? Object.keys(toml.secrets)
    : [];
  const fromArray = Array.isArray(toml?.env) ? toml.env : [];
  return [...new Set([...fromTable, ...fromArray])];
}
