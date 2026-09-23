#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/sources/google-api/google-oauth-credential-acquirer.ts \
  src/main/sources/google-api/google-auth.ts \
  src/main/sources/google-api/api-helpers.ts \
  src/main/core/credential-store.ts \
  src/shared/workspace-connection-management.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-api/google-oauth-credential-acquirer.integration.cjs \
  "$TMP_ROOT/build"
