#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
npx tsc src/main/export/data-package-exporter.ts src/shared/data-package.ts src/shared/run-job.ts --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --strict --skipLibCheck
node tests/integration/export/data-package-exporter.integration.cjs "$TMP_ROOT/build" "$TMP_ROOT/package"
