#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(
  mktemp -d \
    "$PROJECT_DIR/.tmp-m3-live-gt01-command-test.XXXXXX"
)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  scripts/m3/live-google-trends-gt01-collection.ts \
  --rootDir . \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --esModuleInterop \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-trends/live-gt01-collection-command.integration.cjs \
  "$TMP_ROOT/build"

HELP_OUTPUT="$(
  node \
    "$TMP_ROOT/build/scripts/m3/live-google-trends-gt01-collection.js" \
    --help
)"

grep -q \
  'npm run m3:live-gt01 -- --confirm-live-collection' \
  <<<"$HELP_OUTPUT"

grep -q \
  'loads GT01 from the external app-data query-groups.yaml' \
  <<<"$HELP_OUTPUT"

set +e
REFUSAL_OUTPUT="$(
  node \
    "$TMP_ROOT/build/scripts/m3/live-google-trends-gt01-collection.js" \
    2>&1
)"
REFUSAL_STATUS=$?
set -e

if [[ "$REFUSAL_STATUS" -eq 0 ]]; then
  echo "ERROR: unconfirmed live GT01 command unexpectedly succeeded."
  exit 1
fi

grep -q \
  'Refusing live Google Trends GT01 collection' \
  <<<"$REFUSAL_OUTPUT"

echo \
  "PASS GT-LIVE-GT01-CMD-004: unconfirmed CLI exits before reading external config, opening Playwright, or making a provider request"
