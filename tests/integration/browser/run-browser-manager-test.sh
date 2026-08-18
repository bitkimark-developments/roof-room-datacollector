#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/browser/browser-manager.ts \
  src/main/browser/playwright-browser-launcher.ts \
  src/shared/bootstrap-status.ts \
  src/shared/browser.ts \
  src/shared/query-config.ts \
  src/shared/source.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/browser/browser-manager.integration.cjs \
  "$TMP_ROOT/build" \
  "$TMP_ROOT/work"

node -e "
const { chromium } = require('playwright');
if (!chromium || typeof chromium.launchPersistentContext !== 'function') {
  throw new Error('Playwright Chromium persistent-context API is unavailable.');
}
console.log('PASS BROWSER-010: installed Playwright library exposes Chromium persistent-context API');
"
