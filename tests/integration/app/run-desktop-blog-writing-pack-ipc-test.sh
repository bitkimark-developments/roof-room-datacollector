#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/shared/data-package.ts src/shared/blog-writing-pack.ts src/shared/desktop-blog-writing-pack.ts src/shared/run-job.ts \
  src/main/export/data-package-exporter.ts src/main/export/keyword-planner-user-export.ts \
  src/main/blog-writing-packs/blog-writing-pack-recipe.ts \
  src/main/blog-writing-packs/blog-writing-pack-assembler.ts \
  src/main/app/desktop-blog-writing-pack-controller.ts \
  src/main/app/desktop-blog-writing-pack-ipc.ts \
  --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --strict --skipLibCheck

NODE_PATH="$PROJECT_DIR/node_modules" node tests/integration/app/desktop-blog-writing-pack-ipc.integration.cjs "$TMP_ROOT/build"
