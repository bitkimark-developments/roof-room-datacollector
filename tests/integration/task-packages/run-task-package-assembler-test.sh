#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/shared/task-package.ts \
  src/shared/google-ads-search-reporting.ts \
  src/main/task-packages/task-package-window.ts \
  src/main/task-packages/ads-optimization-pack-recipe.ts \
  src/main/task-packages/task-package-evidence-resolver.ts \
  src/main/task-packages/task-package-assembler.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node tests/integration/task-packages/task-package-assembler.integration.cjs "$TMP_ROOT/build"
