#!/bin/sh
# Bump the asset version everywhere it must move in lockstep. Usage:
#   tools/release.sh 33
# Every first-party asset carries ?v=N; the service worker treats those URLs
# as immutable (cache-first). Bumping in one place per release prevents the
# mixed old/new-build skew that broke the v31 deploy.
set -e
[ -n "$1" ] || { echo "usage: tools/release.sh <new-version-number>" >&2; exit 1; }
cd "$(dirname "$0")/.."
OLD=$(grep -o 'app\.js?v=[0-9]*' web/index.html | grep -o '[0-9]*$')
sed -i '' "s/?v=$OLD/?v=$1/g" web/index.html web/app.js
sed -i '' "s/ASSET_V = \"$OLD\"/ASSET_V = \"$1\"/" web/app.js
echo "bumped v=$OLD -> v=$1 in web/index.html + web/app.js"
grep -c "?v=$1" web/index.html web/app.js
