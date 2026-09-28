#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/app/workspace-connection-management-service.ts \
  src/main/app/workspace-connection-metadata.ts \
  src/main/sources/google-api/google-oauth-credential-acquirer.ts \
  src/main/sources/google-api/google-api-readiness.ts \
  src/main/core/credential-store.ts \
  src/shared/workspace-connection-management.ts \
  src/shared/workspace-connection.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-api/google-workspace-connection-management.integration.cjs \
  "$TMP_ROOT/build"
