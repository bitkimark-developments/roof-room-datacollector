#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
TMP_ROOT="$(mktemp -d "$PROJECT_DIR/.tmp-google-credential.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT
npx tsc \
  src/main/core/credential-store.ts \
  src/main/core/electron-safe-storage-credential-store.ts \
  src/main/sources/google-api/api-helpers.ts \
  src/main/sources/google-api/google-api-readiness.ts \
  src/main/sources/google-api/google-api-runtime.ts \
  src/main/sources/google-api/google-auth.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck
node \
  tests/integration/google-api/google-credential-composition.integration.cjs \
  "$TMP_ROOT/build" \
  "$TMP_ROOT/work"
