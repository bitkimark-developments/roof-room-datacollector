#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

if grep -RInE \
  '#input-[0-9]+|\.first\(\)|\.nth\(' \
  src/main/sources/google-trends/google-trends-query-group-ui.ts \
  src/main/sources/google-trends/google-trends-geography-ui.ts
then
  echo "ERROR: forbidden positional/dynamic locator pattern found."
  exit 1
fi

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/browser/browser-manager.ts \
  src/main/sources/google-trends/google-trends-query-group-ui.ts \
  src/main/sources/google-trends/google-trends-geography-ui.ts \
  src/shared/bootstrap-status.ts \
  src/shared/browser.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-trends/query-group-geography-ui.integration.cjs \
  "$TMP_ROOT/build"
