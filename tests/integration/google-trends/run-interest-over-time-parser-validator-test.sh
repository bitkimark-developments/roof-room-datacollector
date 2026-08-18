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
  src/main/sources/google-trends/google-trends-interest-over-time-parser.ts \
  src/main/sources/google-trends/google-trends-interest-over-time-validator.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-trends/interest-over-time-parser-validator.integration.cjs \
  "$TMP_ROOT/build" \
  tests/fixtures/google-trends/interest-over-time/gt01-valid-5-queries.csv

