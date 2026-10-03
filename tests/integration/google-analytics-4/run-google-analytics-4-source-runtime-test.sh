#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

SOURCES=(
  src/main/app/production-collection-runtime.ts
  src/main/sources/google-api/google-api-runtime.ts
)

if [ -f src/main/sources/google-analytics-4/google-analytics-4-source.ts ]; then
  SOURCES+=(
    src/main/sources/google-analytics-4/google-analytics-4-source.ts
  )
fi

npx tsc \
  "${SOURCES[@]}" \
  src/shared/*.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

NODE_PATH="$PROJECT_DIR/node_modules" node \
  tests/integration/google-analytics-4/google-analytics-4-source-runtime.integration.cjs \
  "$TMP_ROOT/build"
