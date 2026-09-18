#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

export NODE_PATH="$PROJECT_DIR/node_modules"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/app/desktop-multisource-controller.ts \
  src/main/app/production-collection-runtime.ts \
  src/main/sources/google-ads/keyword-planner-csv-parser.ts \
  src/main/sources/google-ads/keyword-planner-csv-source.ts \
  src/main/storage/database.ts \
  src/main/storage/state-repository.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/file-import/keyword-planner-manual-csv.integration.cjs \
  "$TMP_ROOT/build" \
  "$TMP_ROOT/work"
