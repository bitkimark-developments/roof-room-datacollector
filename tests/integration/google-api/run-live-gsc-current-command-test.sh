#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  scripts/m3/live-google-gsc-current.ts \
  --rootDir . \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --esModuleInterop \
  --strict \
  --skipLibCheck

NODE_PATH="$PROJECT_DIR/node_modules" \
node \
  tests/integration/google-api/live-gsc-current-command.integration.cjs \
  "$TMP_ROOT/build"
