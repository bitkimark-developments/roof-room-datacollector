#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." &&
    pwd
)"

cd "$PROJECT_DIR"

# Keep compiled probe code underneath the project so Node resolves
# the project's installed Playwright package without global tooling.
TMP_ROOT="$(
  mktemp -d \
    "$PROJECT_DIR/.tmp-m3-live-probe.XXXXXX"
)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  scripts/m3/live-google-trends-provider-probe.ts \
  src/main/browser/browser-manager.ts \
  src/main/browser/playwright-browser-launcher.ts \
  src/main/sources/google-trends/google-trends-provider-state.ts \
  src/main/sources/google-trends/google-trends-provider-probe.ts \
  src/main/sources/google-trends/google-trends-browser-probe-service.ts \
  src/shared/bootstrap-status.ts \
  src/shared/browser.ts \
  src/shared/query-config.ts \
  src/shared/source.ts \
  --rootDir . \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  "$TMP_ROOT/build/scripts/m3/live-google-trends-provider-probe.js" \
  "$@"
