#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

node \
  tests/integration/google-trends/runtime-packaging-config.integration.cjs \
  "$PROJECT_DIR"
