#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/main/core/job-execution-state-machine.ts \
  src/main/core/run-execution-state-machine.ts \
  src/main/core/run-manager.ts \
  src/main/core/resume-planner.ts \
  src/main/core/retry-policy.ts \
  src/main/core/reconciliation-coordinator.ts \
  src/main/storage/database.ts \
  src/main/storage/state-repository.ts \
  src/shared/artifact.ts \
  src/shared/attempt.ts \
  src/shared/bootstrap-status.ts \
  src/shared/query-config.ts \
  src/shared/reconciliation.ts \
  src/shared/resume.ts \
  src/shared/run-job.ts \
  src/shared/source.ts \
  src/shared/validation-summary.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

node \
  tests/integration/reconciliation/reconciliation-coordinator.integration.cjs \
  "$TMP_ROOT/build" \
  "$TMP_ROOT/work"
