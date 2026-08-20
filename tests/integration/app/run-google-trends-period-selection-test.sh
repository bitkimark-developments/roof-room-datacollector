#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(
  mktemp -d \
    "$PROJECT_DIR/.tmp-period-selection-test.XXXXXX"
)"

trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/shared/google-trends-period.ts \
  --rootDir . \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --esModuleInterop \
  --strict \
  --skipLibCheck

node \
  tests/integration/app/google-trends-period-selection.integration.cjs \
  "$TMP_ROOT/build"
