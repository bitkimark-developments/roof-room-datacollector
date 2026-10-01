#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d "$PROJECT_DIR/.tmp-blog-writing-pack-assembler-test.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/shared/blog-writing-pack.ts \
  src/main/blog-writing-packs/blog-writing-pack-recipe.ts \
  src/main/blog-writing-packs/blog-writing-pack-assembler.ts \
  src/main/export/data-package-exporter.ts \
  src/shared/data-package.ts \
  src/shared/run-job.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node tests/integration/blog-writing-packs/blog-writing-pack-assembler.integration.cjs "$TMP_ROOT/build"
