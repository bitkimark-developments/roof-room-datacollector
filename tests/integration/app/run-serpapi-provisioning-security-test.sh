#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/core/secret-ingress.ts \
  src/main/app/macos-osascript-secret-ingress.ts \
  src/main/core/credential-store.ts \
  src/main/sources/serpapi/serpapi-credential-acquirer.ts \
  src/main/app/workspace-connection-metadata.ts \
  src/main/app/workspace-connection-management-service.ts \
  src/main/app/desktop-connection-write-ipc.ts \
  src/shared/workspace-connection-management.ts \
  src/shared/workspace-connection.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/app/serpapi-provisioning-security.integration.cjs \
  "$TMP_ROOT/build"
