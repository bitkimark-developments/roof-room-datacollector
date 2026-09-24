#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/sources/google-api/google-provider-configuration.ts \
  src/main/core/credential-store.ts \
  src/main/core/secret-ingress.ts \
  src/shared/google-provider-configuration.ts \
  src/shared/workspace-connection-management.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/google-api/google-provider-configuration-service.integration.cjs \
  "$TMP_ROOT/build"
