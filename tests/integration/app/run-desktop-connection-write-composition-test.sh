#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

mkdir -p "$TMP_ROOT/node_modules/electron"
cat > "$TMP_ROOT/node_modules/electron/index.js" <<'EOF'
module.exports = {
  shell: {
    async openExternal(url) {
      global.__openedExternalUrl = url;
    },
  },
  safeStorage: {
    isEncryptionAvailable() { return true; },
    encryptString(value) { return Buffer.from(value, 'utf8'); },
    decryptString(value) { return value.toString('utf8'); },
  },
};
EOF

npx tsc \
  src/main/app/google-api-electron-composition.ts \
  src/main/app/serpapi-electron-composition.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

NODE_PATH="$TMP_ROOT/node_modules" \
  node \
    tests/integration/app/desktop-connection-write-composition.integration.cjs \
    "$TMP_ROOT/build" \
    "$PROJECT_DIR"
