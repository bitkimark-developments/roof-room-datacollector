#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/sources/google-ads/google-ads-change-history-source.ts \
  src/main/sources/google-ads/google-ads-change-history-request.ts \
  src/main/sources/google-ads/google-ads-change-history-validator.ts \
  src/main/sources/google-api/google-api-error.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-ads-change-history/google-ads-change-history-source-collect.integration.cjs \
  "$TMP_ROOT/build"
