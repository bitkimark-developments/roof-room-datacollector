#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
export NODE_PATH="$PROJECT_DIR/node_modules"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/shared/desktop-task-package.ts \
  src/shared/task-package.ts \
  src/shared/google-ads-search-reporting.ts \
  src/shared/run-job.ts \
  src/shared/workspace.ts \
  src/shared/workspace-connection.ts \
  src/shared/readiness.ts \
  src/main/task-packages/task-package-window.ts \
  src/main/task-packages/task-package-evidence-resolver.ts \
  src/main/task-packages/task-package-assembler.ts \
  src/main/task-packages/task-package-store.ts \
  src/main/task-packages/task-package-manifest.ts \
  src/main/task-packages/ads-optimization-pack-recipe.ts \
  src/main/sources/google-ads/search-reporting-request.ts \
  src/main/app/desktop-task-package-controller.ts \
  src/main/app/ads-optimization-pack-desktop-composition.ts \
  --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --strict --skipLibCheck

node tests/integration/app/desktop-task-package-controller.integration.cjs "$TMP_ROOT/build"
