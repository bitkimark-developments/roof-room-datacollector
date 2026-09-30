#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
export NODE_PATH="$PROJECT_DIR/node_modules"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/app/ads-optimization-pack-desktop-composition.ts \
  src/main/app/desktop-task-package-controller.ts \
  src/main/app/application-file-access.ts \
  src/main/app/desktop-execution-service.ts \
  src/main/export/ads-optimization-pack-exporter.ts \
  src/main/export/production-data-package-loader.ts \
  src/main/task-packages/task-package-evidence-resolver.ts \
  src/main/task-packages/task-package-assembler.ts \
  src/main/task-packages/task-package-store.ts \
  src/shared/desktop-task-package.ts \
  --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --strict --skipLibCheck --esModuleInterop

node tests/integration/app/desktop-task-package-composition.integration.cjs "$TMP_ROOT/build" "$TMP_ROOT/fixture"
