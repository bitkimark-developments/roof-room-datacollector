#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d "$PROJECT_DIR/.tmp-blog-writing-pack-gate.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

compile_and_run() {
  local selector="$1"
  local node_path_mode="$2"
  local test_file="$3"
  shift 3

  local build_dir="$TMP_ROOT/$selector/build"
  mkdir -p "$build_dir"

  npx tsc \
    "$@" \
    --rootDir src \
    --outDir "$build_dir" \
    --module commonjs \
    --target ES2022 \
    --strict \
    --skipLibCheck

  if [ "$node_path_mode" = "node-path" ]; then
    NODE_PATH="$PROJECT_DIR/node_modules" node "$test_file" "$build_dir"
  else
    node "$test_file" "$build_dir"
  fi
}

run_case() {
  case "$1" in
    assembler)
      compile_and_run \
        assembler plain \
        tests/integration/blog-writing-packs/blog-writing-pack-assembler.integration.cjs \
        src/shared/blog-writing-pack.ts \
        src/main/blog-writing-packs/blog-writing-pack-recipe.ts \
        src/main/blog-writing-packs/blog-writing-pack-assembler.ts \
        src/main/export/data-package-exporter.ts \
        src/shared/data-package.ts \
        src/shared/run-job.ts
      ;;
    exporter)
      compile_and_run \
        exporter node-path \
        tests/integration/blog-writing-packs/blog-writing-pack-exporter.integration.cjs \
        src/shared/data-package.ts \
        src/shared/blog-writing-pack.ts \
        src/main/export/blog-writing-pack-exporter.ts
      ;;
    store)
      compile_and_run \
        store node-path \
        tests/integration/blog-writing-packs/blog-writing-pack-store.integration.cjs \
        src/shared/data-package.ts \
        src/shared/blog-writing-pack.ts \
        src/main/export/data-package-exporter.ts \
        src/main/export/keyword-planner-user-export.ts \
        src/main/export/blog-writing-pack-exporter.ts \
        src/main/blog-writing-packs/blog-writing-pack-store.ts \
        src/main/blog-writing-packs/blog-writing-pack-publisher.ts
      ;;
    *)
      echo "Unknown Blog Writing Pack test selector: $1" >&2
      exit 64
      ;;
  esac
}

SELECTOR="${1:-all}"

if [ "$SELECTOR" = "all" ]; then
  run_case assembler
  run_case exporter
  run_case store
  bash tests/integration/app/run-application-file-access-test.sh
  bash tests/integration/app/run-desktop-blog-writing-pack-controller-test.sh
  bash tests/integration/app/run-desktop-blog-writing-pack-ipc-test.sh
  npm run test:m5:desktop-ui

  echo 'PASS BLOG-WRITING-PACK-GATE-001: deterministic recipe, assembly, workbook, storage, file access, desktop boundary, and Run Detail gates completed'
else
  run_case "$SELECTOR"
fi
