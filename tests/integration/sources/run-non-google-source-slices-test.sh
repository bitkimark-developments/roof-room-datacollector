#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
export NODE_PATH="$PROJECT_DIR/node_modules"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
npx tsc src/main/sources/ikas/ikas-products-parser.ts src/main/sources/ikas/ikas-products-source.ts src/main/sources/ikas/ikas-products-validator.ts src/main/sources/bitkimark/bitkimark-sitemap-parser.ts src/main/sources/bitkimark/bitkimark-sitemap-source.ts src/main/sources/bitkimark/bitkimark-sitemap-validator.ts src/shared/ikas-products.ts src/shared/bitkimark-sitemap.ts src/shared/collection.ts src/shared/source.ts src/shared/run-job.ts src/shared/artifact.ts src/shared/attempt.ts src/shared/validation-detail.ts src/shared/validation-summary.ts --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --strict --skipLibCheck
node tests/integration/sources/non-google-source-slices.integration.cjs "$TMP_ROOT/build" "$TMP_ROOT/work"
