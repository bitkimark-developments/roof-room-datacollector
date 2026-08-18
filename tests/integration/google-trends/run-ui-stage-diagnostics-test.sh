#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(
  mktemp -d \
    "$PROJECT_DIR/.tmp-m3-gt-ui-diag.XXXXXX"
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
  tests/integration/google-trends/ui-stage-diagnostics.integration.cjs \
  "$TMP_ROOT/build"
