#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
npx tsc \
  src/main/core/credential-store.ts \
  src/main/sources/serpapi/serpapi-client.ts \
  src/main/sources/serpapi/serpapi-job-plans.ts \
  src/main/sources/serpapi/serpapi-parser.ts \
  src/main/sources/serpapi/serpapi-readiness.ts \
  src/main/sources/serpapi/serpapi-request.ts \
  src/main/sources/serpapi/serpapi-runtime.ts \
  src/main/sources/serpapi/serpapi-source.ts \
  src/main/sources/serpapi/serpapi-validator.ts \
  src/shared/serpapi.ts \
  --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --strict --skipLibCheck
node tests/integration/serpapi/serpapi-source.integration.cjs "$TMP_ROOT/build" "$TMP_ROOT/work"
