#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/app/application-directories.ts \
  src/shared/bootstrap-status.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --esModuleInterop \
  --strict \
  --skipLibCheck

NODE_PATH="$PROJECT_DIR/node_modules" node \
  tests/integration/filesystem/application-directory-boundary.integration.cjs \
  "$TMP_ROOT/build"
