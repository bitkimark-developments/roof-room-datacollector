#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/app/google-provider-configuration-ipc.ts \
  src/shared/google-provider-configuration.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/app/google-provider-configuration-main-ipc.integration.cjs \
  "$TMP_ROOT/build"
