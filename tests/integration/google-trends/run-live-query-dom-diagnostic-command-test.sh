#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(
  mktemp -d \
    "$PROJECT_DIR/.tmp-m3-live-query-diagnostic-test.XXXXXX"
)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  scripts/m3/live-google-trends-query-dom-diagnostic.ts \
  --rootDir . \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --esModuleInterop \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-trends/live-query-dom-diagnostic.integration.cjs \
  "$TMP_ROOT/build"

HELP_OUTPUT="$(
  node \
    "$TMP_ROOT/build/scripts/m3/live-google-trends-query-dom-diagnostic.js" \
    --help
)"

grep -q \
  'npm run m3:live-query-diagnostic -- --confirm-live-diagnostic' \
  <<<"$HELP_OUTPUT"

set +e
REFUSAL_OUTPUT="$(
  node \
    "$TMP_ROOT/build/scripts/m3/live-google-trends-query-dom-diagnostic.js" \
    2>&1
)"
REFUSAL_STATUS=$?
set -e

if [[ "$REFUSAL_STATUS" -eq 0 ]]; then
  echo "ERROR: unconfirmed live query diagnostic unexpectedly succeeded."
  exit 1
fi

grep -q \
  'Refusing live Google Trends query DOM diagnostic' \
  <<<"$REFUSAL_OUTPUT"

echo \
  "PASS GT-LIVE-QUERY-DIAG-CMD-003: unconfirmed diagnostic exits before config access, browser launch, or provider request"
