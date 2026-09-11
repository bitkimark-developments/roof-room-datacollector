#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT
npx tsc scripts/m3/live-bitkimark-sitemap-smoke.ts src/main/sources/bitkimark/bitkimark-sitemap-source.ts src/main/sources/bitkimark/bitkimark-sitemap-parser.ts src/main/sources/bitkimark/bitkimark-sitemap-validator.ts src/shared/bitkimark-sitemap.ts src/shared/collection.ts src/shared/source.ts src/shared/run-job.ts src/shared/artifact.ts src/shared/attempt.ts src/shared/validation-detail.ts src/shared/validation-summary.ts --rootDir . --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --esModuleInterop --strict --skipLibCheck
NODE_PATH="$PROJECT_DIR/node_modules" node tests/integration/bitkimark/live-bitkimark-command.integration.cjs "$TMP_ROOT/build"
