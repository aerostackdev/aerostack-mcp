#!/usr/bin/env python3
"""
Patch all published MCP servers with:
  - README from local files
  - Tools extracted from README tool table
  - Correct display names
  - Description from aerostack.toml

Usage: JWT=eyJ... python3 patch-mcp-metadata.py
"""

import json, os, re, sys, time
import urllib.request, urllib.error

API_BASE = "https://api.aerostack.dev"
MCP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

JWT = os.environ.get("JWT", "")
if not JWT:
    print("ERROR: JWT env var required. Run: JWT=your_token python3 patch-mcp-metadata.py")
    sys.exit(1)

# Correct display names (DB has lowercase/wrong casing)
DISPLAY_NAMES = {
    "mcp-cloudflare":     "Cloudflare",
    "mcp-github":         "GitHub",
    "mcp-figma":          "Figma",
    "mcp-google-calendar":"Google Calendar",
    "mcp-slack":          "Slack",
    "mcp-linear":         "Linear",
    "mcp-stripe":         "Stripe",
    "mcp-shopify":        "Shopify",
    "mcp-jira":           "Jira",
    "mcp-airtable":       "Airtable",
    "mcp-resend":         "Resend",
    "mcp-twilio":         "Twilio",
    "mcp-hubspot":        "HubSpot",
    "mcp-supabase":       "Supabase",
    "mcp-notion":         "Notion",
    "mcp-openai":         "OpenAI",
    "mcp-planetscale":    "PlanetScale",
    "mcp-railway":        "Railway",
    "mcp-sentry":         "Sentry",
    "mcp-vercel":         "Vercel",
}

# DB IDs from production
MCP_IDS = {
    "mcp-cloudflare":     "b31bc76c897055f4f8a5491a4023a5d3",
    "mcp-github":         "6da7066cfa6410027e88365bb7997d4b",
    "mcp-figma":          "fbbadaa622261f59e050290a331c60ff",
    "mcp-google-calendar":"abeffcc5c4ad9c7e1c729eb0d5f1b7fe",
    "mcp-slack":          "036b04e4d51cb0f562a5bbbe6e69f1d5",
    "mcp-linear":         "0e3e6af038f52bacd3b5f2b77f3cd72f",
    "mcp-stripe":         "7ee66dbc236375da407a649101864281",
    "mcp-shopify":        "5e7103afb049f9d63c5619533724b549",
    "mcp-jira":           "87b4a7fceeadff9e227da7b435c88aee",
    "mcp-airtable":       "7f589170669ec51702845a464d2996a3",
    "mcp-resend":         "6440ff62f5b4598f49288a8c04f01218",
    "mcp-twilio":         "74f7958225377b4d464e2a4719808d2a",
    "mcp-hubspot":        "e51fa42343afd7f0bc76331d48200496",
    "mcp-supabase":       "e7d2834135db603df2fbc4f1c3206b73",
    "mcp-notion":         "0350130e8cb5805e028e5441df9b7a6b",
    "mcp-openai":         "fc3387b2abfedd2105c9850a9adb57fa",
    "mcp-planetscale":    "cd4022dd30b70becf6220c26145b9c7b",
    "mcp-railway":        "ab4bdbae5d9e70a052d1db3514fd0ba9",
    "mcp-sentry":         "5c3a0b9f398d3f8b9f38cd34a6a64fc0",
    "mcp-vercel":         "e39b84afac5e5de6920a24c47cafffe6",
}


def parse_tools_from_readme(readme: str) -> list:
    """Extract tool list from the README's markdown table."""
    tools = []
    in_tools_section = False
    for line in readme.splitlines():
        if re.match(r'#+\s*Tools', line, re.IGNORECASE):
            in_tools_section = True
            continue
        if in_tools_section:
            # Stop at next heading
            if re.match(r'#+\s', line) and 'tool' not in line.lower():
                break
            # Parse table row: | tool_name | description |
            m = re.match(r'\|\s*`?(\w[\w_-]*)`?\s*\|\s*(.+?)\s*\|', line)
            if m:
                name, desc = m.group(1), m.group(2).strip()
                if name.lower() in ('tool', 'name', '---', ':---'):
                    continue
                tools.append({"name": name, "description": desc, "inputSchema": {"type": "object", "properties": {}}})
    return tools


def parse_description_from_toml(toml_path: str) -> str:
    if not os.path.exists(toml_path):
        return ""
    with open(toml_path) as f:
        for line in f:
            m = re.match(r'description\s*=\s*"(.+)"', line)
            if m:
                return m.group(1)
    return ""


def patch_mcp(server_id: str, payload: dict) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{API_BASE}/api/community/mcp/{server_id}",
        data=data,
        method="PATCH",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {JWT}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()}


GREEN = '\033[0;32m'
RED = '\033[0;31m'
YELLOW = '\033[1;33m'
NC = '\033[0m'

print("=== Aerostack MCP Metadata Patcher ===\n")

ok_count = 0
fail = []

for key, server_id in MCP_IDS.items():
    mcp_dir = os.path.join(MCP_ROOT, key)
    readme_path = os.path.join(mcp_dir, "README.md")
    toml_path = os.path.join(mcp_dir, "aerostack.toml")

    print(f"  Patching {DISPLAY_NAMES[key]} ({key}) ... ", end="", flush=True)

    if not os.path.exists(readme_path):
        print(f"{YELLOW}SKIP{NC} — no README.md")
        fail.append(f"{key}: no README.md")
        continue

    readme = open(readme_path).read()
    tools = parse_tools_from_readme(readme)
    description = parse_description_from_toml(toml_path)

    payload = {
        "name": DISPLAY_NAMES[key],
        "readme": readme,
        "tools": tools,
    }
    # Only update description if we got a valid one (≥20 chars)
    if len(description) >= 20:
        payload["description"] = description

    resp = patch_mcp(server_id, payload)

    if "error" in resp and resp["error"]:
        print(f"{RED}FAILED{NC} — {resp['error']}")
        fail.append(f"{key}: {resp['error']}")
    else:
        print(f"{GREEN}OK{NC} ({len(tools)} tools, {len(readme)} chars README)")
        ok_count += 1

    time.sleep(0.3)  # gentle rate limit

print(f"\n{'='*45}")
print(f"Updated: {GREEN}{ok_count}{NC} / {len(MCP_IDS)}")
if fail:
    print(f"\n{RED}Failures:{NC}")
    for f in fail:
        print(f"  - {f}")
