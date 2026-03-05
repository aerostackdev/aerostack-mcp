#!/bin/bash
# workers/scripts/mcp-sync.sh
# Syncs all workers/mcp-* and workers/README.md to aerostackdev/aerostack-mcp.
# Runs automatically via GitHub Actions on push to main when workers/mcp-** changes.

set -e

ORG="${AEROSTACK_ORG:-aerostackdev}"
TARGET_REPO="aerostack-mcp"
TARGET_URL="https://x-access-token:${SDK_SYNC_PAT}@github.com/$ORG/$TARGET_REPO.git"

echo "🔄 Aerostack MCP Catalog Sync"
echo "-----------------------------"
echo "Target: $ORG/$TARGET_REPO"

# 🛑 Agent Protection Guard — same as SDK sync
if [ "$GITHUB_ACTIONS" != "true" ] && [ "$ALLOW_LOCAL_SYNC" != "true" ]; then
  echo "❌ Error: Direct local sync is prohibited. Run via GitHub Actions."
  echo "To override (USE EXTREME CAUTION): ALLOW_LOCAL_SYNC=true ./workers/scripts/mcp-sync.sh"
  exit 1
fi

# Secret check
if [ -z "$SDK_SYNC_PAT" ]; then
  echo "❌ Error: SDK_SYNC_PAT is missing!"
  exit 1
else
  echo "✅ SDK_SYNC_PAT verified (length: ${#SDK_SYNC_PAT})"
fi

# Configure git for CI
if [ -n "$GITHUB_ACTIONS" ]; then
  git config --global user.email "bot@aerostack.ai"
  git config --global user.name "Aerostack Bot"
  git config --global commit.gpgsign false
fi

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
cd "$GIT_ROOT"

# ── Clone the target repo into a temp directory ─────────────────────────────
WORK_DIR=$(mktemp -d)
echo "📁 Cloning $ORG/$TARGET_REPO into $WORK_DIR..."
git clone "$TARGET_URL" "$WORK_DIR"

# ── Copy all mcp-* workers ───────────────────────────────────────────────────
echo "📋 Copying workers/mcp-* ..."
CHANGED=0

for worker_dir in workers/mcp-*/; do
    slug=$(basename "$worker_dir")
    dest="$WORK_DIR/$slug"

    # Skip if src/index.ts doesn't exist (incomplete worker)
    if [ ! -f "$worker_dir/src/index.ts" ]; then
        echo "   ⏭  $slug — no src/index.ts, skipping"
        continue
    fi

    mkdir -p "$dest"
    cp -r "$worker_dir"* "$dest/"
    echo "   ✅ Copied $slug"
    CHANGED=1
done

# Copy catalog and README
if [ -f "workers/README.md" ]; then
    cp workers/README.md "$WORK_DIR/README.md"
    echo "   ✅ Copied README.md"
fi
if [ -d "workers/catalog" ]; then
    cp -r workers/catalog "$WORK_DIR/catalog"
    echo "   ✅ Copied catalog/"
fi

# ── Commit and push if anything changed ──────────────────────────────────────
cd "$WORK_DIR"

git add -A

if git diff --cached --quiet; then
    echo ""
    echo "✅ No changes detected — $ORG/$TARGET_REPO is already up to date."
    rm -rf "$WORK_DIR"
    exit 0
fi

COMMIT_MSG="sync: update MCP catalog from aerostackdev/aerostack monorepo

Automated sync triggered by push to main.
Source: $GITHUB_SHA"

git commit -m "$COMMIT_MSG"
git push origin main

echo ""
echo "✅ Successfully synced to https://github.com/$ORG/$TARGET_REPO"

# Cleanup
rm -rf "$WORK_DIR"
