#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/shared/data-package.ts \
  src/shared/blog-writing-pack.ts \
  src/main/export/blog-writing-pack-exporter.ts \
  --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --strict --skipLibCheck

NODE_PATH="$PROJECT_DIR/node_modules" \
  node tests/integration/blog-writing-packs/blog-writing-pack-exporter.integration.cjs "$TMP_ROOT/build"
