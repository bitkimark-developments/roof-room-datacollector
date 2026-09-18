#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/app/desktop-multisource-controller.ts \
  src/main/core/freshness.ts \
  src/main/core/freshness-registry.ts \
  src/main/storage/database.ts \
  src/main/storage/state-repository.ts \
  src/shared/freshness.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/freshness/freshness-lifecycle.integration.cjs \
  "$TMP_ROOT/build" \
  "$TMP_ROOT/work"
