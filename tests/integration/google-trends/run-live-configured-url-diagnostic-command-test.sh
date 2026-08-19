#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(
  mktemp -d \
    "$PROJECT_DIR/.tmp-m3-live-configured-url-command-test.XXXXXX"
)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  scripts/m3/live-google-trends-configured-url-diagnostic.ts \
  --rootDir . \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --esModuleInterop \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-trends/live-configured-url-diagnostic-command.integration.cjs \
  "$TMP_ROOT/build"

HELP_OUTPUT="$(
  node \
    "$TMP_ROOT/build/scripts/m3/live-google-trends-configured-url-diagnostic.js" \
    --help
)"

grep -q \
  'never types a query, clicks download, refreshes, retries, or writes an artifact' \
  <<<"$HELP_OUTPUT"

set +e
REFUSAL_OUTPUT="$(
  node \
    "$TMP_ROOT/build/scripts/m3/live-google-trends-configured-url-diagnostic.js" \
    2>&1
)"
REFUSAL_STATUS=$?
set -e

if [[ "$REFUSAL_STATUS" -eq 0 ]]; then
  echo "ERROR: unconfirmed configured-URL diagnostic unexpectedly succeeded."
  exit 1
fi

grep -q \
  'Refusing live Google Trends configured-URL diagnostic' \
  <<<"$REFUSAL_OUTPUT"

echo \
  "PASS GT-LIVE-CONFIG-URL-CMD-005: unconfirmed command exits before config access, browser launch, or provider request"
