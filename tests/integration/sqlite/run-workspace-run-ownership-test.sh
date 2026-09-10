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
  src/main/storage/database.ts \
  src/main/storage/state-repository.ts \
  src/shared/bootstrap-status.ts \
  src/shared/query-config.ts \
  src/shared/run-job.ts \
  src/shared/source.ts \
  src/shared/workspace.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/sqlite/workspace-run-ownership.integration.cjs \
  "$TMP_ROOT/build" \
  "$TMP_ROOT/work"
