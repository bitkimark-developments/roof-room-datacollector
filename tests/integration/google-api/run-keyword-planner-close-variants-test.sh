#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(
  mktemp -d \
    "$PROJECT_DIR/.tmp-kwp-close-variant-test.XXXXXX"
)"

trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/sources/google-ads/keyword-planner-adapter.ts \
  src/shared/google-api.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-api/keyword-planner-close-variants.integration.cjs \
  "$TMP_ROOT/build"
