#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

compile_common_storage() {
  local build_dir="$1"
  mkdir -p "$build_dir"

  npx tsc \
    src/main/storage/storage-manager.ts \
    src/shared/bootstrap-status.ts \
    src/shared/query-config.ts \
    src/shared/source.ts \
    --rootDir src \
    --outDir "$build_dir" \
    --module commonjs \
    --target ES2022 \
    --strict \
    --skipLibCheck
}

run_case() {
  case "$1" in
    storage)
      local build_dir="$TMP_ROOT/storage/build"
      compile_common_storage "$build_dir"
      node \
        tests/integration/filesystem/storage-manager.integration.cjs \
        "$build_dir" \
        "$TMP_ROOT/storage/work"
      ;;
    documents)
      local build_dir="$TMP_ROOT/documents/build"
      compile_common_storage "$build_dir"
      node \
        tests/integration/filesystem/generated-documents.integration.cjs \
        "$build_dir" \
        "$TMP_ROOT/documents/work"
      ;;
    boundary)
      local build_dir="$TMP_ROOT/boundary/build"
      mkdir -p "$build_dir"

      npx tsc \
        src/main/app/application-directories.ts \
        src/shared/bootstrap-status.ts \
        --rootDir src \
        --outDir "$build_dir" \
        --module commonjs \
        --target ES2022 \
        --esModuleInterop \
        --strict \
        --skipLibCheck

      NODE_PATH="$PROJECT_DIR/node_modules" node \
        tests/integration/filesystem/application-directory-boundary.integration.cjs \
        "$build_dir"
      ;;
    *)
      echo "Unknown filesystem test selector: $1" >&2
      exit 64
      ;;
  esac
}

SELECTOR="${1:-all}"

if [ "$SELECTOR" = "all" ]; then
  run_case storage
  run_case documents
  run_case boundary
else
  run_case "$SELECTOR"
fi
