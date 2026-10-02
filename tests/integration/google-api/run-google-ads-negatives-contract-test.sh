#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/shared/google-ads-configuration.ts \
  src/shared/google-api.ts \
  src/main/sources/google-ads/configuration-request.ts \
  src/main/sources/google-ads/negatives-request.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-api/google-ads-negatives-contract.integration.cjs \
  "$TMP_ROOT/build"
