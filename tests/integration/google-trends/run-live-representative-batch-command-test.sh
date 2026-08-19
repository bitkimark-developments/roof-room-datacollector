#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(
  mktemp -d \
    "$PROJECT_DIR/.tmp-m3-live-representative-batch-command-test.XXXXXX"
)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  scripts/m3/live-google-trends-representative-batch.ts \
  --rootDir . \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --esModuleInterop \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-trends/live-representative-batch-command.integration.cjs \
  "$TMP_ROOT/build"

HELP_OUTPUT="$(
  node \
    "$TMP_ROOT/build/scripts/m3/live-google-trends-representative-batch.js" \
    --help
)"

grep -q \
  'loads exactly GT01 then GT02' \
  <<<"$HELP_OUTPUT"

set +e
REFUSAL_OUTPUT="$(
  node \
    "$TMP_ROOT/build/scripts/m3/live-google-trends-representative-batch.js" \
    2>&1
)"
REFUSAL_STATUS=$?
set -e

if [[ "$REFUSAL_STATUS" -eq 0 ]]; then
  echo "ERROR: unconfirmed representative batch unexpectedly succeeded."
  exit 1
fi

grep -q \
  'Refusing representative Google Trends batch' \
  <<<"$REFUSAL_OUTPUT"

echo \
  "PASS GT-LIVE-BATCH-CMD-003: unconfirmed command exits before config access, browser launch, or provider request"
