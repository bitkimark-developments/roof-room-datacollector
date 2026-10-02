#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/roofroom-google-ads-campaign-settings-source.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/sources/google-ads/configuration-request.ts \
  src/main/sources/google-ads/configuration-source.ts \
  src/main/sources/google-ads/campaign-settings-request.ts \
  src/shared/google-ads-configuration.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --moduleResolution node \
  --esModuleInterop \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-api/google-ads-campaign-settings-source.integration.cjs \
  "$TMP_ROOT/build"
