#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
export NODE_PATH="$PROJECT_DIR/node_modules"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
npx tsc src/main/app/desktop-multisource-controller.ts src/main/export/data-package-exporter.ts src/shared/desktop-multisource.ts src/shared/data-package.ts src/shared/collection-configuration.ts src/shared/run-job.ts src/shared/readiness.ts src/shared/workspace.ts src/shared/resume.ts src/shared/reconciliation.ts --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --strict --skipLibCheck
node tests/integration/app/desktop-retry-export.integration.cjs "$TMP_ROOT/build"
