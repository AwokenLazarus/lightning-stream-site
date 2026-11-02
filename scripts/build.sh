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
node scripts/donate.mjs
node scripts/chrome.mjs
# version every asset link by the assets' content, so a deploy never meets a cached old script or stylesheet
V=$(cat site/assets/*.js site/assets/*.css | sha256sum | cut -c1-10)
find site -name "*.html" -print0 | xargs -0 sed -i -E "s#(/assets/[a-z0-9_-]+\.(js|css))(\?v=[a-f0-9]+)?\"#\1?v=$V\"#g"
echo "assets: links versioned v=$V"
