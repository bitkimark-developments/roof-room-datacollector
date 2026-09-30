#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

bash tests/integration/task-packages/run-ads-optimization-pack-recipe-test.sh
bash tests/integration/task-packages/run-task-package-evidence-resolver-test.sh
bash tests/integration/task-packages/run-task-package-store-test.sh
bash tests/integration/task-packages/run-task-package-assembler-test.sh
bash tests/integration/task-packages/run-ads-optimization-pack-exporter-test.sh
bash tests/integration/task-packages/run-ads-optimization-pack-slice-b-test.sh

echo 'PASS ADS-OPTIMIZATION-PACK-GATE-001: deterministic Slice B recipe, evidence, storage, assembly, export, and integrated package gates completed'
