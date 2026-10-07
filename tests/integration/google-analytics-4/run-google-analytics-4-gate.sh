#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"
export NODE_PATH="$PROJECT_DIR/node_modules"

SELECTED="${1:-all}"

case "$SELECTED" in
  all|connection-service|connection|contract|desktop|parser|request|source-runtime|validation)
    ;;
  *)
    echo "Usage: $0 [all|connection-service|connection|contract|desktop|parser|request|source-runtime|validation]" >&2
    exit 2
    ;;
esac

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

run_case() {
  name="$1"
  test_file="$2"
  needs_work="$3"
  shift 3

  if [ "$SELECTED" != "all" ] && [ "$SELECTED" != "$name" ]; then
    return
  fi

  case_root="$TMP_ROOT/$name"
  mkdir -p "$case_root/build"
  if [ "$needs_work" = "yes" ]; then
    mkdir -p "$case_root/work"
  fi

  npx tsc \
    "$@" \
    --rootDir src \
    --outDir "$case_root/build" \
    --module commonjs \
    --target ES2022 \
    --strict \
    --skipLibCheck

  if [ "$needs_work" = "yes" ]; then
    node "$test_file" "$case_root/build" "$case_root/work"
  else
    node "$test_file" "$case_root/build"
  fi
}

sources=(
  src/main/app/workspace-connection-management-service.ts
  src/main/app/workspace-connection-metadata.ts
  src/main/core/credential-store.ts
  src/main/core/secret-ingress.ts
  src/main/sources/google-api/google-oauth-credential-acquirer.ts
  src/main/sources/google-api/google-provider-configuration.ts
  src/main/sources/google-api/api-helpers.ts
  src/main/sources/serpapi/serpapi-credential-acquirer.ts
  src/shared/desktop-multisource.ts
  src/shared/google-analytics-4.ts
  src/shared/google-provider-configuration.ts
  src/shared/workspace-connection-management.ts
  src/shared/workspace-connection.ts
)
run_case \
  connection-service \
  tests/integration/google-analytics-4/google-analytics-4-connection-service.integration.cjs \
  no \
  "${sources[@]}"

sources=(
  src/main/sources/google-api/google-oauth-credential-acquirer.ts
  src/main/sources/google-api/google-auth.ts
  src/main/sources/google-api/google-provider-configuration.ts
  src/main/sources/google-api/api-helpers.ts
  src/main/app/workspace-connection-metadata.ts
  src/main/core/credential-store.ts
  src/main/core/secret-ingress.ts
  src/shared/google-analytics-4.ts
  src/shared/google-provider-configuration.ts
  src/shared/workspace-connection-management.ts
  src/shared/desktop-multisource.ts
)
run_case \
  connection \
  tests/integration/google-analytics-4/google-analytics-4-connection.integration.cjs \
  no \
  "${sources[@]}"

sources=(
  src/shared/desktop-multisource.ts
  src/shared/workspace-connection-management.ts
)
if [ -f src/shared/google-analytics-4.ts ]; then
  sources+=(src/shared/google-analytics-4.ts)
fi
run_case \
  contract \
  tests/integration/google-analytics-4/google-analytics-4-contract.integration.cjs \
  no \
  "${sources[@]}"

sources=(
  src/main/app/desktop-multisource-controller.ts
  src/shared/desktop-multisource.ts
  src/shared/desktop-run-resolution.ts
  src/shared/collection-configuration.ts
  src/shared/run-job.ts
  src/shared/readiness.ts
  src/shared/workspace.ts
  src/shared/google-analytics-4.ts
)
if [ -f src/main/sources/google-analytics-4/google-analytics-4-job-plans.ts ]; then
  sources+=(src/main/sources/google-analytics-4/google-analytics-4-job-plans.ts)
fi
if [ -f src/main/sources/google-analytics-4/google-analytics-4-readiness.ts ]; then
  sources+=(src/main/sources/google-analytics-4/google-analytics-4-readiness.ts)
fi
run_case \
  desktop \
  tests/integration/google-analytics-4/google-analytics-4-desktop.integration.cjs \
  no \
  "${sources[@]}"

sources=(
  src/shared/google-analytics-4.ts
)
if [ -f src/main/sources/google-analytics-4/google-analytics-4-parser.ts ]; then
  sources+=(src/main/sources/google-analytics-4/google-analytics-4-parser.ts)
fi
run_case \
  parser \
  tests/integration/google-analytics-4/google-analytics-4-parser.integration.cjs \
  no \
  "${sources[@]}"

sources=(
  src/shared/google-analytics-4.ts
  src/main/sources/google-api/api-helpers.ts
)
if [ -f src/main/sources/google-analytics-4/google-analytics-4-request.ts ]; then
  sources+=(src/main/sources/google-analytics-4/google-analytics-4-request.ts)
fi
run_case \
  request \
  tests/integration/google-analytics-4/google-analytics-4-request.integration.cjs \
  no \
  "${sources[@]}"

sources=(
  src/main/app/production-collection-runtime.ts
  src/main/sources/google-api/google-api-runtime.ts
  src/shared/*.ts
)
if [ -f src/main/sources/google-analytics-4/google-analytics-4-source.ts ]; then
  sources+=(src/main/sources/google-analytics-4/google-analytics-4-source.ts)
fi
run_case \
  source-runtime \
  tests/integration/google-analytics-4/google-analytics-4-source-runtime.integration.cjs \
  no \
  "${sources[@]}"

sources=(
  src/shared/google-analytics-4.ts
  src/shared/collection.ts
  src/main/sources/google-analytics-4/google-analytics-4-parser.ts
)
if [ -f src/main/sources/google-analytics-4/google-analytics-4-validator.ts ]; then
  sources+=(src/main/sources/google-analytics-4/google-analytics-4-validator.ts)
fi
run_case \
  validation \
  tests/integration/google-analytics-4/google-analytics-4-validation.integration.cjs \
  yes \
  "${sources[@]}"
