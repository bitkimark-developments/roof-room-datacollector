#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

run_case() {
  case "$1" in
    manager)
      local build_dir="$TMP_ROOT/manager/build"
      mkdir -p "$build_dir"

      npx tsc \
        src/main/browser/browser-manager.ts \
        src/main/browser/playwright-browser-launcher.ts \
        src/shared/bootstrap-status.ts \
        src/shared/browser.ts \
        src/shared/query-config.ts \
        src/shared/source.ts \
        --rootDir src \
        --outDir "$build_dir" \
        --module commonjs \
        --target ES2022 \
        --strict \
        --skipLibCheck

      node \
        tests/integration/browser/browser-manager.integration.cjs \
        "$build_dir" \
        "$TMP_ROOT/manager/work"

      node -e "
const { chromium } = require('playwright');
if (!chromium || typeof chromium.launchPersistentContext !== 'function') {
  throw new Error('Playwright Chromium persistent-context API is unavailable.');
}
console.log('PASS BROWSER-010: installed Playwright library exposes Chromium persistent-context API');
"
      ;;
    download)
      local build_dir="$TMP_ROOT/download/build"
      mkdir -p "$build_dir"

      npx tsc \
        src/main/browser/browser-manager.ts \
        src/main/browser/browser-download-capture.ts \
        src/main/browser/playwright-browser-launcher.ts \
        src/shared/bootstrap-status.ts \
        src/shared/browser.ts \
        --rootDir src \
        --outDir "$build_dir" \
        --module commonjs \
        --target ES2022 \
        --strict \
        --skipLibCheck

      node \
        tests/integration/browser/browser-download-capture.integration.cjs \
        "$build_dir"
      ;;
    *)
      echo "Unknown browser test selector: $1" >&2
      exit 64
      ;;
  esac
}

SELECTOR="${1:-all}"

if [ "$SELECTOR" = "all" ]; then
  run_case manager
  run_case download
else
  run_case "$SELECTOR"
fi
