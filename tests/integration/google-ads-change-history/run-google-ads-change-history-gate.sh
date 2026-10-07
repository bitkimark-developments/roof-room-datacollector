#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
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
    context)
      compile_and_run \
        context plain \
        tests/integration/google-ads-change-history/google-ads-change-history-context.integration.cjs \
        src/shared/google-ads-change-history.ts \
        src/main/sources/google-ads/google-ads-change-history-request.ts
      ;;
    contract)
      compile_and_run \
        contract plain \
        tests/integration/google-ads-change-history/google-ads-change-history-contract.integration.cjs \
        src/shared/google-ads-change-history.ts
      ;;
    parser)
      compile_and_run \
        parser plain \
        tests/integration/google-ads-change-history/google-ads-change-history-parser.integration.cjs \
        src/main/sources/google-ads/google-ads-change-history-adapter.ts
      ;;
    raw-request)
      compile_and_run \
        raw-request plain \
        tests/integration/google-ads-change-history/google-ads-change-history-raw-request.integration.cjs \
        src/shared/google-ads-change-history.ts \
        src/main/sources/google-ads/google-ads-change-history-request.ts
      ;;
    request)
      compile_and_run \
        request plain \
        tests/integration/google-ads-change-history/google-ads-change-history-request.integration.cjs \
        src/shared/google-ads-change-history.ts \
        src/main/sources/google-ads/google-ads-change-history-request.ts
      ;;
    runtime-validator)
      compile_and_run \
        runtime-validator node-path \
        tests/integration/google-ads-change-history/google-ads-change-history-runtime-validator.integration.cjs \
        src/main/app/production-collection-runtime.ts
      ;;
    source-collect)
      compile_and_run \
        source-collect plain \
        tests/integration/google-ads-change-history/google-ads-change-history-source-collect.integration.cjs \
        src/main/sources/google-ads/google-ads-change-history-source.ts \
        src/main/sources/google-ads/google-ads-change-history-request.ts \
        src/main/sources/google-ads/google-ads-change-history-validator.ts \
        src/main/sources/google-api/google-api-error.ts
      ;;
    source-contract)
      compile_and_run \
        source-contract plain \
        tests/integration/google-ads-change-history/google-ads-change-history-source-contract.integration.cjs \
        src/main/sources/google-ads/google-ads-change-history-source.ts
      ;;
    source-runtime)
      compile_and_run \
        source-runtime node-path \
        tests/integration/google-ads-change-history/google-ads-change-history-source-runtime.integration.cjs \
        src/main/app/production-collection-runtime.ts \
        src/main/sources/ikas/ikas-products-parser.ts \
        src/main/sources/ikas/ikas-products-validator.ts
      ;;
    validation-hardening)
      compile_and_run \
        validation-hardening plain \
        tests/integration/google-ads-change-history/google-ads-change-history-validation-hardening.integration.cjs \
        src/main/sources/google-ads/google-ads-change-history-validator.ts
      ;;
    validation)
      compile_and_run \
        validation plain \
        tests/integration/google-ads-change-history/google-ads-change-history-validation.integration.cjs \
        src/main/sources/google-ads/google-ads-change-history-validator.ts
      ;;
    *)
      echo "Unknown Google Ads change-history test selector: $1" >&2
      exit 64
      ;;
  esac
}

SELECTOR="${1:-all}"

if [ "$SELECTOR" = "all" ]; then
  for test_selector in \
    context \
    contract \
    parser \
    raw-request \
    request \
    runtime-validator \
    source-collect \
    source-contract \
    source-runtime \
    validation-hardening \
    validation
  do
    run_case "$test_selector"
  done
else
  run_case "$SELECTOR"
fi
