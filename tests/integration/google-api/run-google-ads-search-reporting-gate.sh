#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

for TEST_SCRIPT in \
  tests/integration/google-api/run-google-ads-search-reporting-contract-test.sh \
  tests/integration/google-api/run-google-ads-search-stream-response-test.sh \
  tests/integration/google-api/run-google-ads-search-reporting-source-test.sh \
  tests/integration/google-api/run-google-ads-campaign-ad-group-reporting-test.sh \
  tests/integration/google-api/run-google-ads-keyword-search-term-reporting-test.sh \
  tests/integration/google-api/run-google-ads-rsa-reporting-test.sh \
  tests/integration/google-api/run-google-ads-search-reporting-validation-test.sh
do
  bash "$TEST_SCRIPT"
done

echo 'PASS GOOGLE-ADS-SEARCH-REPORTING-GATE-001: six SEARCH reporting datasets collect, normalize, validate, and preserve deterministic provider evidence without live calls'
