#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../../.." &&
    pwd
)"

cd "$PROJECT_DIR"

TMP_ROOT="$(
  mktemp -d \
    "$PROJECT_DIR/.tmp-desktop-ui-test.XXXXXX"
)"

UI_TEST_PORT="$(
  node -e '
    const net = require("node:net");
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      console.log(server.address().port);
      server.close();
    });
  '
)"

npx vite \
  --config vite.renderer.config.ts \
  --host 127.0.0.1 \
  --port "$UI_TEST_PORT" \
  --strictPort \
  >"$TMP_ROOT/vite.log" 2>&1 &

VITE_PID=$!

cleanup() {
  kill "$VITE_PID" >/dev/null 2>&1 || true
  rm -rf "$TMP_ROOT"
}

trap cleanup EXIT

node \
  tests/integration/app/desktop-ui-smoke.integration.cjs \
  "http://127.0.0.1:$UI_TEST_PORT"
