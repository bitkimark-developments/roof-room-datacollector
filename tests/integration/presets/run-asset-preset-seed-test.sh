#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

BUILD_ROOT="$TMP_ROOT/build"
TEST_HOME="$TMP_ROOT/home"

mkdir -p \
  "$BUILD_ROOT" \
  "$TEST_HOME"

npx tsc \
  scripts/create-asset-presets.ts \
  --rootDir . \
  --outDir "$BUILD_ROOT" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/presets/asset-preset-seed.integration.cjs \
  "$BUILD_ROOT" \
  "$TEST_HOME"
