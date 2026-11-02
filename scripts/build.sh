#!/usr/bin/env bash
# Rebuild the generated parts of site/: the changelog page, the migrated papers, and the shared
# header and footer on every page. Safe to run any time; it only rewrites generated content.
#   CHANGELOG=path/to/CHANGELOG.md PAPERS=path/to/public/stream scripts/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/changelog.py ${CHANGELOG:+"$CHANGELOG"}
PAPERS="${PAPERS:-../Bitcoin/cloudflare/map-site/public/stream}"
if [ -d "$PAPERS" ]; then
  python3 scripts/migrate_papers.py "$PAPERS"
else
  echo "papers: source not found, keeping the pages in site/whitepaper/ as they are"
fi
node scripts/chrome.mjs
