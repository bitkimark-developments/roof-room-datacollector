#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/sources/google-ads/ads-request.ts \
  src/main/sources/google-ads/ads-adapter.ts \
  src/main/sources/google-ads/rsa-assets-request.ts \
  src/main/sources/google-ads/rsa-assets-adapter.ts \
  src/main/sources/google-ads/search-reporting-source.ts \
  src/main/sources/google-ads/search-reporting-request.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node tests/integration/google-api/google-ads-rsa-reporting.integration.cjs "$TMP_ROOT/build"
