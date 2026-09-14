#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/app/desktop-multisource-controller.ts \
  src/main/app/desktop-execution-service.ts \
  src/shared/desktop-multisource.ts \
  src/shared/desktop-run-resolution.ts \
  src/shared/collection-configuration.ts \
  src/shared/run-job.ts \
  src/shared/readiness.ts \
  src/shared/workspace.ts \
  --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --strict --skipLibCheck

node tests/integration/app/desktop-multisource-flow.integration.cjs "$TMP_ROOT/build"
