#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(
  mktemp -d \
    "$PROJECT_DIR/.tmp-m3-live-probe-test.XXXXXX"
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
  tests/integration/google-trends/live-provider-probe-command.integration.cjs \
  "$TMP_ROOT/build"

HELP_OUTPUT="$(
  node \
    "$TMP_ROOT/build/scripts/m3/live-google-trends-provider-probe.js" \
    --help
)"

grep -q \
  'npm run m3:live-provider-probe -- --confirm-live-request' \
  <<<"$HELP_OUTPUT"

set +e
REFUSAL_OUTPUT="$(
  node \
    "$TMP_ROOT/build/scripts/m3/live-google-trends-provider-probe.js" \
    2>&1
)"
REFUSAL_STATUS=$?
set -e

if [[ "$REFUSAL_STATUS" -eq 0 ]]; then
  echo "ERROR: unconfirmed live probe unexpectedly succeeded."
  exit 1
fi

grep -q \
  'Refusing live Google Trends request' \
  <<<"$REFUSAL_OUTPUT"

echo \
  "PASS GT-LIVE-CMD-004: unconfirmed CLI execution exits before any live probe is authorized"
