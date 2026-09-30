#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/shared/task-package.ts \
  src/main/task-packages/task-package-window.ts \
  src/main/task-packages/task-package-manifest.ts \
  src/main/task-packages/task-package-store.ts \
  src/main/export/ads-optimization-pack-exporter.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

NODE_PATH="$PROJECT_DIR/node_modules" \
  node tests/integration/task-packages/ads-optimization-pack-exporter.integration.cjs "$TMP_ROOT/build"
