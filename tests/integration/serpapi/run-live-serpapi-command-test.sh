#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
TMP_ROOT="$(mktemp -d "$PROJECT_DIR/.tmp-m3-live-serpapi-command.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT
npx tsc scripts/m3/live-serpapi-smoke.ts --rootDir . --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --esModuleInterop --strict --skipLibCheck
node tests/integration/serpapi/live-serpapi-command.integration.cjs "$TMP_ROOT/build"
