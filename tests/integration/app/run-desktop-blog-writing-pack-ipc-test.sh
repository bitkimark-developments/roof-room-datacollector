#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$PROJECT_DIR"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

npx tsc \
  src/shared/data-package.ts src/shared/blog-writing-pack.ts src/shared/desktop-blog-writing-pack.ts src/shared/run-job.ts \
  src/shared/application-info.ts src/shared/bootstrap-status.ts src/shared/collection-control.ts \
  src/shared/google-trends-period.ts src/shared/desktop-multisource.ts \
  src/shared/collection-configuration.ts src/shared/workspace-connection-management.ts \
  src/shared/google-provider-configuration.ts src/shared/desktop-task-package.ts \
  src/main/export/data-package-exporter.ts src/main/export/keyword-planner-user-export.ts \
  src/main/blog-writing-packs/blog-writing-pack-recipe.ts \
  src/main/blog-writing-packs/blog-writing-pack-assembler.ts \
  src/main/app/desktop-blog-writing-pack-controller.ts \
  src/main/app/desktop-blog-writing-pack-ipc.ts \
  src/preload.ts \
  --rootDir src --outDir "$TMP_ROOT/build" --module commonjs --target ES2022 --strict --skipLibCheck

mkdir -p "$TMP_ROOT/node_modules/electron"
cat > "$TMP_ROOT/node_modules/electron/index.js" <<'EOF'
module.exports = {
  contextBridge: {
    exposeInMainWorld(name, api) {
      globalThis.__exposedApi = { name, api };
    },
  },
  ipcRenderer: {
    invoke(channel, value) {
      globalThis.__ipcInvocations.push([channel, value]);
      return Promise.resolve({ channel, value });
    },
  },
};
EOF

NODE_PATH="$PROJECT_DIR/node_modules" node tests/integration/app/desktop-blog-writing-pack-ipc.integration.cjs "$TMP_ROOT/build" "$PROJECT_DIR"
