#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

run_case() {
  case "$1" in
    multisource)
      local build_dir="$TMP_ROOT/multisource/build"
      mkdir -p "$build_dir"

      NODE_PATH="$PROJECT_DIR/node_modules" npx tsc \
        src/main/app/desktop-multisource-controller.ts \
        src/main/presets/blog-agentic-content-preset.ts \
        src/main/presets/google-ads-growth-rebuild-preset.ts \
        src/shared/desktop-multisource.ts \
        src/shared/desktop-run-resolution.ts \
        src/shared/collection-configuration.ts \
        src/shared/run-job.ts \
        src/shared/readiness.ts \
        src/shared/workspace.ts \
        --rootDir src \
        --outDir "$build_dir" \
        --module commonjs \
        --target ES2022 \
        --strict \
        --skipLibCheck

      NODE_PATH="$PROJECT_DIR/node_modules" node \
        tests/integration/presets/asset-preset-multisource-window.integration.cjs \
        "$build_dir"
      ;;
    seed)
      local build_root="$TMP_ROOT/seed/build"
      local test_home="$TMP_ROOT/seed/home"
      mkdir -p "$build_root" "$test_home"

      npx tsc \
        scripts/create-asset-presets.ts \
        --rootDir . \
        --outDir "$build_root" \
        --module commonjs \
        --target ES2022 \
        --strict \
        --skipLibCheck

      node \
        tests/integration/presets/asset-preset-seed.integration.cjs \
        "$build_root" \
        "$test_home"
      ;;
    catalog)
      local build_dir="$TMP_ROOT/catalog/build"
      mkdir -p "$build_dir"

      npx tsc \
        src/main/presets/google-ads-growth-rebuild-preset.ts \
        src/main/presets/blog-agentic-content-preset.ts \
        src/shared/desktop-run-resolution.ts \
        src/desktop-task-catalog.ts \
        --rootDir src \
        --outDir "$build_dir" \
        --module commonjs \
        --target ES2022 \
        --strict \
        --skipLibCheck

      local status=0

      node \
        tests/integration/presets/asset-preset-windowing.integration.cjs \
        "$build_dir" \
        || status=1

      node \
        tests/integration/presets/asset-presets.integration.cjs \
        "$build_dir" \
        || status=1

      return "$status"
      ;;
    *)
      echo "Unknown presets test selector: $1" >&2
      exit 64
      ;;
  esac
}

SELECTOR="${1:-all}"

if [ "$SELECTOR" = "all" ]; then
  run_case multisource
  run_case seed
  run_case catalog
else
  run_case "$SELECTOR"
fi
