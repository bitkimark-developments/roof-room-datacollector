#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(
  mktemp -d \
    "$PROJECT_DIR/.tmp-m3-live-stage-gate-test.XXXXXX"
)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  scripts/m3/live-google-trends-stage-gate.ts \
  --rootDir . \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --esModuleInterop \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-trends/live-stage-gate-command.integration.cjs \
  "$TMP_ROOT/build"

HELP_OUTPUT="$(
  node \
    "$TMP_ROOT/build/scripts/m3/live-google-trends-stage-gate.js" \
    --help
)"

grep -q \
  'npm run m3:live-stage -- --stage=DATE_RANGE --confirm-live-stage' \
  <<<"$HELP_OUTPUT"

set +e
REFUSAL_OUTPUT="$(
  node \
    "$TMP_ROOT/build/scripts/m3/live-google-trends-stage-gate.js" \
    --stage=DATE_RANGE \
    2>&1
)"
REFUSAL_STATUS=$?
set -e

if [[ "$REFUSAL_STATUS" -eq 0 ]]; then
  echo "ERROR: unconfirmed live stage gate unexpectedly succeeded."
  exit 1
fi

grep -q \
  'Refusing live Google Trends stage gate' \
  <<<"$REFUSAL_OUTPUT"

echo \
  "PASS GT-LIVE-STAGE-CMD-004: unconfirmed stage gate exits before config access, browser launch, or provider request"
