#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
mkdir -p "$TMP_ROOT/work"

npx tsc \
  src/main/sources/google-ads/search-reporting-validator.ts \
  src/main/app/production-collection-runtime.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

NODE_PATH="$PROJECT_DIR/node_modules" node \
  tests/integration/google-api/google-ads-search-reporting-validation.integration.cjs \
  "$TMP_ROOT/build" "$TMP_ROOT/work"
