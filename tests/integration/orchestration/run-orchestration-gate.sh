#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

run_case() {
  case "$1" in
    registry)
      local build_dir="$TMP_ROOT/registry/build"
      mkdir -p "$build_dir"
      npx tsc \
        src/main/core/collection-validator-registry.ts \
        --rootDir src \
        --outDir "$build_dir" \
        --module commonjs \
        --target ES2022 \
        --strict \
        --skipLibCheck
      node \
        tests/integration/orchestration/collection-validator-registry.integration.cjs \
        "$build_dir"
      ;;
    multi-source)
      local build_dir="$TMP_ROOT/multi-source/build"
      mkdir -p "$build_dir"
      npx tsc \
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
        src/main/storage/database.ts \
        src/main/storage/state-repository.ts \
        src/main/storage/storage-manager.ts \
        src/shared/artifact.ts \
        src/shared/attempt.ts \
        src/shared/bootstrap-status.ts \
        src/shared/collection.ts \
        src/shared/logging.ts \
        src/shared/metadata.ts \
        src/shared/orchestration.ts \
        src/shared/query-config.ts \
        src/shared/reconciliation.ts \
        src/shared/resume.ts \
        src/shared/run-job.ts \
        src/shared/source.ts \
        src/shared/validation-detail.ts \
        src/shared/validation-summary.ts \
        --rootDir src \
        --outDir "$build_dir" \
        --module commonjs \
        --target ES2022 \
         --strict \
        --skipLibCheck
      node \
        tests/integration/orchestration/multi-source-run.integration.cjs \
        "$build_dir" \
        "$TMP_ROOT/multi-source/work"
      ;;
    sequential)
      local build_dir="$TMP_ROOT/sequential/build"
      mkdir -p "$build_dir"
      npx tsc \
        src/main/core/collection-orchestrator.ts \
        src/main/core/collection-validator-registry.ts \
        src/main/core/job-execution-state-machine.ts \
        src/main/core/reconciliation-coordinator.ts \
        src/main/core/resume-planner.ts \
        src/main/core/retry-policy.ts \
        src/main/core/run-execution-state-machine.ts \
        src/main/core/run-manager.ts \
        src/main/core/source-registry.ts \
        src/main/storage/database.ts \
        src/main/storage/state-repository.ts \
        src/main/storage/storage-manager.ts \
        src/shared/artifact.ts \
        src/shared/attempt.ts \
        src/shared/bootstrap-status.ts \
        src/shared/collection.ts \
        src/shared/orchestration.ts \
        src/shared/query-config.ts \
        src/shared/reconciliation.ts \
        src/shared/resume.ts \
        src/shared/run-job.ts \
        src/shared/source.ts \
        src/shared/validation-summary.ts \
        --rootDir src \
        --outDir "$build_dir" \
        --module commonjs \
        --target ES2022 \
        --strict \
        --skipLibCheck
      node \
        tests/integration/orchestration/sequential-fake-source.integration.cjs \
        "$build_dir" \
        "$TMP_ROOT/sequential/work"
      ;;
    source-neutral)
      local build_dir="$TMP_ROOT/source-neutral/build"
      mkdir -p "$build_dir"
      npx tsc \
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
        src/main/storage/database.ts \
        src/main/storage/state-repository.ts \
        src/main/storage/storage-manager.ts \
        src/shared/artifact.ts \
        src/shared/attempt.ts \
        src/shared/bootstrap-status.ts \
        src/shared/collection.ts \
        src/shared/logging.ts \
        src/shared/metadata.ts \
        src/shared/orchestration.ts \
        src/shared/query-config.ts \
        src/shared/reconciliation.ts \
        src/shared/resume.ts \
        src/shared/run-job.ts \
        src/shared/source.ts \
        src/shared/validation-detail.ts \
        src/shared/validation-summary.ts \
        --rootDir src \
        --outDir "$build_dir" \
        --module commonjs \
        --target ES2022 \
        --strict \
        --skipLibCheck
      node \
        tests/integration/orchestration/source-neutral-fake-json.integration.cjs \
        "$build_dir" \
        "$TMP_ROOT/source-neutral/work"
      ;;
    *)
      echo "Unknown orchestration test selector: $1" >&2
      exit 64
      ;;
  esac
}

SELECTOR="${1:-all}"

if [ "$SELECTOR" = "all" ]; then
  run_case registry
  run_case multi-source
  run_case sequential
  run_case source-neutral
else
  run_case "$SELECTOR"
fi
