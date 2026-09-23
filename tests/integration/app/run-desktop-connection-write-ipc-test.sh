#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

mkdir -p "$TMP_ROOT/node_modules/electron"

cat > "$TMP_ROOT/node_modules/electron/index.js" <<'EOF'
module.exports = {
  contextBridge: {
    exposeInMainWorld(name, api) {
      global.__roofroomExposed = { name, api };
    },
  },
  ipcRenderer: {
    async invoke(...args) {
      global.__roofroomInvocations.push(args);
      return null;
    },
  },
};
EOF

npx tsc \
  src/preload.ts \
  src/shared/application-info.ts \
  --rootDir src \
  --outDir "$TMP_ROOT/build" \
  --module commonjs \
  --target ES2022 \
  --strict \
  --skipLibCheck

NODE_PATH="$TMP_ROOT/node_modules" \
  node \
    tests/integration/app/desktop-connection-write-ipc.integration.cjs \
    "$TMP_ROOT/build" \
    "$PROJECT_DIR"
