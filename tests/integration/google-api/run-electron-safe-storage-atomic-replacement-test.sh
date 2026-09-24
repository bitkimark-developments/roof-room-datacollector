#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

mkdir -p "$TMP_ROOT/node_modules/electron"
cat > "$TMP_ROOT/node_modules/electron/index.js" <<'EOF'
module.exports = {
  safeStorage: {
    isEncryptionAvailable() { return true; },
    encryptString(value) { return Buffer.from(value, 'utf8'); },
    decryptString(value) { return value.toString('utf8'); },
  },
};
EOF

npx tsc \
  src/main/core/electron-safe-storage-credential-store.ts \
  src/main/core/credential-store.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

NODE_PATH="$TMP_ROOT/node_modules" \
  node \
    tests/integration/google-api/electron-safe-storage-atomic-replacement.integration.cjs \
    "$TMP_ROOT/build"
