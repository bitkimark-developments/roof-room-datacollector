#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/sources/google-api/google-oauth-credential-acquirer.ts \
  src/main/sources/google-api/google-auth.ts \
  src/main/sources/google-api/google-provider-configuration.ts \
  src/main/sources/google-api/api-helpers.ts \
  src/main/app/workspace-connection-metadata.ts \
  src/main/core/credential-store.ts \
  src/main/core/secret-ingress.ts \
  src/shared/google-analytics-4.ts \
  src/shared/google-provider-configuration.ts \
  src/shared/workspace-connection-management.ts \
  src/shared/desktop-multisource.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-analytics-4/google-analytics-4-connection.integration.cjs \
  "$TMP_ROOT/build"
