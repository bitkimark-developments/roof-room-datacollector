#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/roofroom-google-ads-conversion-configuration-normalization.XXXXXX")"
trap 'rm -rf "${BUILD_ROOT}"' EXIT

SOURCES=(
  src/shared/google-ads-configuration.ts
)

if [[ -f src/main/sources/google-ads/conversion-configuration-adapter.ts ]]; then
  SOURCES+=(src/main/sources/google-ads/conversion-configuration-adapter.ts)
fi

npx tsc \
  --pretty false \
  --module commonjs \
  --target ES2022 \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  --outDir "${BUILD_ROOT}" \
  "${SOURCES[@]}"

node \
  tests/integration/google-api/google-ads-conversion-configuration-normalization.integration.cjs \
  "${BUILD_ROOT}"
