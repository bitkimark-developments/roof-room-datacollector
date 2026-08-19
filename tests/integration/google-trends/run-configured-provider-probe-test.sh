#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(
  mktemp -d \
    "$PROJECT_DIR/.tmp-m3-configured-provider-probe-test.XXXXXX"
)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/sources/google-trends/google-trends-configured-provider-probe.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --esModuleInterop \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-trends/configured-provider-probe.integration.cjs \
  "$TMP_ROOT/build"
