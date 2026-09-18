#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

npx tsc --noEmit
npm run lint

bash \
  tests/integration/m2-gate/run-integrated-m2-gate.sh

bash \
  tests/integration/config/run-query-config-adapters-test.sh

bash \
  tests/integration/app/run-google-trends-desktop-controller-test.sh

bash \
  tests/integration/app/run-google-trends-period-selection-test.sh

bash \
  tests/integration/app/run-application-file-access-test.sh

for TEST_SCRIPT in \
  "$PROJECT_DIR"/tests/integration/google-trends/run-*-test.sh
do
  bash "$TEST_SCRIPT"
done

bash \
  tests/integration/export/run-google-trends-export-manager-test.sh

bash \
  tests/integration/sources/run-non-google-source-slices-test.sh

bash \
  tests/integration/google-api/run-google-api-adapters-test.sh

bash \
  tests/integration/google-api/run-google-credential-composition-test.sh

bash \
  tests/integration/google-api/run-ads-reviewed-quick-run-test.sh

bash \
  tests/integration/google-api/run-gsc-reviewed-quick-run-test.sh

bash \
  tests/integration/google-api/run-keyword-planner-reviewed-api-test.sh

bash \
  tests/integration/app/run-desktop-multisource-flow-test.sh

bash \
  tests/integration/app/run-desktop-retry-export-test.sh

bash \
  tests/integration/export/run-data-package-exporter-test.sh

bash \
  tests/integration/serpapi/run-serpapi-source-test.sh

bash \
  tests/integration/serpapi/run-live-serpapi-command-test.sh

bash \
  tests/integration/bitkimark/run-live-bitkimark-command-test.sh

bash \
  tests/integration/app/run-desktop-ui-smoke-test.sh

echo 'PASS RELEASE-GATE-001: deterministic Core, Google Trends, desktop file access, configuration, validation, and export gates completed'
