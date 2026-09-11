#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
npx tsc \
  src/main/app/production-collection-runtime.ts \
  src/main/core/collection-orchestrator.ts \
  src/main/core/collection-validator-registry.ts \
  src/main/core/job-execution-state-machine.ts \
  src/main/core/metadata-manager.ts \
  src/main/core/reconciliation-coordinator.ts \
  src/main/core/resume-planner.ts \
  src/main/core/retry-policy.ts \
  src/main/core/run-execution-state-machine.ts \
  src/main/core/run-manager.ts \
  src/main/core/source-registry.ts \
  src/main/core/credential-store.ts \
  src/main/storage/database.ts \
  src/main/storage/state-repository.ts \
  src/main/storage/storage-manager.ts \
  src/main/sources/google-trends/google-trends-source.ts \
  src/main/sources/google-api/google-api-runtime.ts \
  src/main/sources/google-api/google-auth.ts \
  src/main/sources/google-api/api-helpers.ts \
  src/main/sources/google-search-console/google-search-console-source.ts \
  src/main/sources/google-search-console/query-page-adapter.ts \
  src/main/sources/google-ads/google-ads-sources.ts \
  src/main/sources/google-ads/search-terms-adapter.ts \
  src/main/sources/google-ads/keyword-planner-adapter.ts \
  src/main/sources/ikas/ikas-products-source.ts \
  src/main/sources/bitkimark/bitkimark-sitemap-source.ts \
  src/main/sources/serpapi/serpapi-source.ts \
  src/main/sources/serpapi/serpapi-runtime.ts \
  src/main/sources/serpapi/serpapi-client.ts \
  src/main/sources/google-trends/google-trends-collection-validator.ts \
  src/main/sources/google-trends/google-trends-interest-over-time-validator.ts \
  src/main/sources/serpapi/serpapi-validator.ts \
  src/main/sources/ikas/ikas-products-validator.ts \
  src/main/sources/bitkimark/bitkimark-sitemap-validator.ts \
  src/shared/*.ts \
  --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --strict --skipLibCheck
NODE_PATH="$PROJECT_DIR/node_modules" node tests/integration/app/production-source-composition.integration.cjs "$TMP_ROOT/build"
