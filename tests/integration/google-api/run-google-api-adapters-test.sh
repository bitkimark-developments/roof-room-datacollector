#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
npx tsc src/main/sources/google-api/api-helpers.ts src/main/sources/google-search-console/query-page-adapter.ts src/main/sources/google-ads/search-terms-adapter.ts src/main/sources/google-ads/keyword-planner-adapter.ts src/shared/google-api.ts --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --strict --skipLibCheck
node tests/integration/google-api/google-api-adapters.integration.cjs "$TMP_ROOT/build"
