#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/storage/storage-manager.ts \
  src/main/export/production-data-package-loader.ts \
  src/main/export/ads-optimization-pack-exporter.ts \
  src/main/task-packages/ads-optimization-pack-recipe.ts \
  src/main/task-packages/task-package-evidence-resolver.ts \
  src/main/task-packages/task-package-assembler.ts \
  src/main/task-packages/task-package-store.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --esModuleInterop \
  --strict \
  --skipLibCheck

NODE_PATH="$PROJECT_DIR/node_modules" \
  node tests/integration/task-packages/ads-optimization-pack-slice-b.integration.cjs "$TMP_ROOT/build"
