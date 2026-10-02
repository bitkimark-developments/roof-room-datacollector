#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

SOURCES=(
  src/shared/desktop-multisource.ts
  src/shared/workspace-connection-management.ts
)

if [ -f src/shared/google-analytics-4.ts ]; then
  SOURCES+=(src/shared/google-analytics-4.ts)
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
  tests/integration/google-analytics-4/google-analytics-4-contract.integration.cjs \
  "$TMP_ROOT/build"
