#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

node \
  tests/integration/app/desktop-credential-availability-composition.integration.cjs \
  "$PROJECT_DIR"
