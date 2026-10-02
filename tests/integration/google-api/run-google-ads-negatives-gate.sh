#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

bash tests/integration/google-api/run-google-ads-negatives-contract-test.sh
bash tests/integration/google-api/run-google-ads-negatives-normalization-test.sh
bash tests/integration/google-api/run-google-ads-configuration-source-test.sh
bash tests/integration/google-api/run-google-ads-configuration-validation-test.sh

echo "PASS GOOGLE-ADS-NEGATIVES-GATE-001"
