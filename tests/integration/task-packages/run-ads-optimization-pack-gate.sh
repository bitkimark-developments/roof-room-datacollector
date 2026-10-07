#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

compile_and_run() {
  local selector="$1"
  local node_path_mode="$2"
  local es_module_interop="$3"
  local test_file="$4"
  shift 4

  local build_dir="$TMP_ROOT/$selector/build"
  mkdir -p "$build_dir"

  local tsc_args=(
    "$@"
    --rootDir src
    --outDir "$build_dir"
    --module commonjs
    --target ES2022
  )

  if [ "$es_module_interop" = "yes" ]; then
    tsc_args+=(--esModuleInterop)
  fi

  tsc_args+=(--strict --skipLibCheck)
  npx tsc "${tsc_args[@]}"

  if [ "$node_path_mode" = "node-path" ]; then
    NODE_PATH="$PROJECT_DIR/node_modules" node "$test_file" "$build_dir"
  else
    node "$test_file" "$build_dir"
  fi
}

run_case() {
  case "$1" in
    recipe)
      compile_and_run recipe plain no tests/integration/task-packages/ads-optimization-pack-recipe.integration.cjs         src/shared/task-package.ts         src/shared/google-ads-search-reporting.ts         src/main/task-packages/task-package-window.ts         src/main/task-packages/ads-optimization-pack-recipe.ts
      ;;
    evidence)
      compile_and_run evidence plain no tests/integration/task-packages/task-package-evidence-resolver.integration.cjs         src/shared/task-package.ts         src/shared/google-ads-search-reporting.ts         src/shared/run-job.ts         src/shared/artifact.ts         src/main/task-packages/task-package-window.ts         src/main/task-packages/ads-optimization-pack-recipe.ts         src/main/task-packages/task-package-evidence-resolver.ts
      ;;
    store)
      compile_and_run store plain yes tests/integration/task-packages/task-package-store.integration.cjs         src/shared/task-package.ts         src/main/task-packages/task-package-window.ts         src/main/task-packages/task-package-manifest.ts         src/main/task-packages/task-package-store.ts
      ;;
    assembler)
      compile_and_run assembler plain no tests/integration/task-packages/task-package-assembler.integration.cjs         src/shared/task-package.ts         src/shared/google-ads-search-reporting.ts         src/main/task-packages/task-package-window.ts         src/main/task-packages/ads-optimization-pack-recipe.ts         src/main/task-packages/task-package-evidence-resolver.ts         src/main/task-packages/task-package-assembler.ts
      ;;
    exporter)
      compile_and_run exporter node-path no tests/integration/task-packages/ads-optimization-pack-exporter.integration.cjs         src/shared/task-package.ts         src/main/task-packages/task-package-window.ts         src/main/task-packages/task-package-manifest.ts         src/main/task-packages/task-package-store.ts         src/main/export/ads-optimization-pack-exporter.ts
      ;;
    slice-b)
      compile_and_run slice-b node-path yes tests/integration/task-packages/ads-optimization-pack-slice-b.integration.cjs         src/main/storage/storage-manager.ts         src/main/export/production-data-package-loader.ts         src/main/export/ads-optimization-pack-exporter.ts         src/main/task-packages/ads-optimization-pack-recipe.ts         src/main/task-packages/task-package-evidence-resolver.ts         src/main/task-packages/task-package-assembler.ts         src/main/task-packages/task-package-store.ts
      ;;
    *)
      echo "Unknown task-package test selector: $1" >&2
      exit 64
      ;;
  esac
}

SELECTOR="${1:-all}"

if [ "$SELECTOR" = "all" ]; then
  for test_selector in recipe evidence store assembler exporter slice-b
  do
    run_case "$test_selector"
  done
  echo 'PASS ADS-OPTIMIZATION-PACK-GATE-001: deterministic Slice B recipe, evidence, storage, assembly, export, and integrated package gates completed'
else
  run_case "$SELECTOR"
fi
