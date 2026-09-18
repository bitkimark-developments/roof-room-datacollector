#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/app/desktop-multisource-controller.ts \
  src/main/app/production-collection-runtime.ts \
  src/desktop-task-catalog.ts \
  src/main/storage/database.ts \
  src/main/storage/state-repository.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

NODE_PATH="$PROJECT_DIR/node_modules" node \
  tests/integration/google-api/keyword-planner-reviewed-api.integration.cjs \
  "$TMP_ROOT/build" \
  "$TMP_ROOT/work"
