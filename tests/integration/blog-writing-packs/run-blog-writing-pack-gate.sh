#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

bash tests/integration/blog-writing-packs/run-blog-writing-pack-assembler-test.sh
bash tests/integration/blog-writing-packs/run-blog-writing-pack-exporter-test.sh
bash tests/integration/blog-writing-packs/run-blog-writing-pack-store-test.sh
bash tests/integration/app/run-application-file-access-test.sh
bash tests/integration/app/run-desktop-blog-writing-pack-controller-test.sh
bash tests/integration/app/run-desktop-blog-writing-pack-ipc-test.sh
npm run test:m5:desktop-ui

echo 'PASS BLOG-WRITING-PACK-GATE-001: deterministic recipe, assembly, workbook, storage, file access, desktop boundary, and Run Detail gates completed'
