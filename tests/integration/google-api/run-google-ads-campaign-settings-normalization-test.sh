#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/roofroom-google-ads-campaign-settings-normalization.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

SOURCES=(
  src/shared/google-ads-configuration.ts
  src/main/sources/google-ads/configuration-normalizer.ts
)

if [[ -f src/main/sources/google-ads/campaign-settings-adapter.ts ]]; then
  SOURCES+=(src/main/sources/google-ads/campaign-settings-adapter.ts)
fi

npx tsc \
  --pretty false \
  --module commonjs \
  --target ES2022 \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  --outDir "$TMP_ROOT/build" \
  "${SOURCES[@]}"

node \
  tests/integration/google-api/google-ads-campaign-settings-normalization.integration.cjs \
  "$TMP_ROOT/build"
