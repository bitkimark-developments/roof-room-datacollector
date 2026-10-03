#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
export NODE_PATH="$PROJECT_DIR/node_modules"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

SOURCES=(
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
  SOURCES+=(
    src/main/sources/google-analytics-4/google-analytics-4-job-plans.ts
  )
fi

npx tsc \
  "${SOURCES[@]}" \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-analytics-4/google-analytics-4-desktop.integration.cjs \
  "$TMP_ROOT/build"
