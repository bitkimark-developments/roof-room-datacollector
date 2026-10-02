#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
mkdir -p "$TMP_ROOT/work"

SOURCES=(
  src/shared/google-analytics-4.ts
  src/shared/collection.ts
  src/main/sources/google-analytics-4/google-analytics-4-parser.ts
)

if [ -f src/main/sources/google-analytics-4/google-analytics-4-validator.ts ]; then
  SOURCES+=(
    src/main/sources/google-analytics-4/google-analytics-4-validator.ts
  )
fi

npx tsc \
  "${SOURCES[@]}" \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-analytics-4/google-analytics-4-validation.integration.cjs \
  "$TMP_ROOT/build" "$TMP_ROOT/work"
