#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/presets/google-ads-growth-rebuild-preset.ts \
  src/main/presets/blog-agentic-content-preset.ts \
  src/shared/desktop-run-resolution.ts \
  src/desktop-task-catalog.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

status=0

node \
  tests/integration/presets/asset-preset-windowing.integration.cjs \
  "$TMP_ROOT/build" \
  || status=1

node \
  tests/integration/presets/asset-presets.integration.cjs \
  "$TMP_ROOT/build" \
  || status=1

exit "$status"
