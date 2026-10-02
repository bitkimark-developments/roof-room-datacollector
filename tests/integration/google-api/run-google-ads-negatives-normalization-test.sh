#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/roofroom-google-ads-negatives-normalization.XXXXXX")"
trap 'rm -rf "${BUILD_ROOT}"' EXIT

npx tsc \
  --pretty false \
  --module commonjs \
  --target ES2022 \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  --outDir "${BUILD_ROOT}" \
  src/shared/google-ads-configuration.ts \
  src/main/sources/google-ads/negatives-adapter.ts

node \
  tests/integration/google-api/google-ads-negatives-normalization.integration.cjs \
  "${BUILD_ROOT}"
