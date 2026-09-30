#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

bash tests/integration/app/run-desktop-task-package-controller-test.sh
bash tests/integration/app/run-desktop-task-package-ipc-test.sh
bash tests/integration/app/run-desktop-task-package-composition-test.sh

echo 'PASS ADS-OPTIMIZATION-PACK-DESKTOP-GATE-001: deterministic desktop controller, IPC, and production composition gates completed'
