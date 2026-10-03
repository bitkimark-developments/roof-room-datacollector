#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

export NODE_PATH="$PROJECT_DIR/node_modules"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

SOURCES=(
  src/main/app/production-collection-runtime.ts
  src/main/sources/ikas/ikas-products-parser.ts
  src/main/sources/ikas/ikas-products-validator.ts
)

npx tsc \
  "${SOURCES[@]}" \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-ads-change-history/google-ads-change-history-source-runtime.integration.cjs \
  "$TMP_ROOT/build"
