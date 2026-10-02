#!/usr/bin/env bash
set -euo pipefail

bash tests/integration/google-api/run-google-ads-campaign-settings-contract-test.sh
bash tests/integration/google-api/run-google-ads-campaign-settings-normalization-test.sh
bash tests/integration/google-api/run-google-ads-configuration-source-test.sh
bash tests/integration/google-api/run-google-ads-configuration-validation-test.sh

echo "PASS GOOGLE-ADS-CAMPAIGN-SETTINGS-GATE-001"
