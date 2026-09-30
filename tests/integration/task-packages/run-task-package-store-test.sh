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
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --esModuleInterop \
  --strict \
  --skipLibCheck

node tests/integration/task-packages/task-package-store.integration.cjs "$TMP_ROOT/build"
