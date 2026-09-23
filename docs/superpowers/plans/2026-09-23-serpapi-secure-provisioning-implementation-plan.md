# UXH2 SerpApi Secure Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secret-free Workspace provisioning and replacement of a SerpApi API key through a main-owned macOS native masked prompt, existing encrypted credential storage, and schema-v8 connection publication.

**Architecture:** A fixed `/usr/bin/osascript` adapter implements a narrow main-only `SecretIngressPort`; a SerpApi credential acquirer contains plaintext validation and secure-store persistence; the existing serialized `WorkspaceConnectionManagementService` owns SQLite publication, rebind, compensation, cleanup, and readiness refresh. Renderer IPC carries only `{ workspace_id, source_id: 'serpapi' }` and fixed safe outcomes.

**Tech Stack:** TypeScript 5.9, Electron 43 main/preload IPC, Node child processes, React 18, Electron `safeStorage`, schema-v8 SQLite repository primitives, deterministic CommonJS integration tests, Bash 3.2-compatible runners.

**Spec:** `docs/superpowers/specs/2026-09-23-serpapi-secure-provisioning-design.md`

## Global Constraints

- Do not change `DESKTOP_CONNECTIONS` or `DesktopWorkspaceConnectionView`; its renderer payload remains exactly `source_id`, `credential_status`, and `readiness_status`.
- Keep SQLite schema version at 8. Use existing upsert, exact rebind, global reference count, delete, and compensation primitives.
- Never expose a real API key, `credential_ref`, native stdout/stderr, secure-store payload, raw process error, or persistence path to renderer state, IPC results, logs, config, exports, fixtures, or documentation output. Synthetic marker values may exist only in deterministic test code and must be proven absent from safe outputs.
- Invoke exactly `/usr/bin/osascript` with `shell:false`; pass the fixed AppleScript program through stdin, not argv; use no clipboard and no temporary plaintext file.
- Apply a 120000 ms timeout and 1024-byte independent stdout/stderr caps.
- Accept only 1–512 printable ASCII bytes (`0x21`–`0x7e`) as the submitted SerpApi key; do not trim or provider-validate it.
- Write every new/replacement key under a fresh opaque reference before publishing or rebinding SQLite state. Never overwrite the old reference in place.
- Keep all Workspace connection mutations on the existing `WorkspaceConnectionManagementService` serialization tail.
- Make no live SerpApi or other provider call in deterministic tests.
- Do not add Google secret ingress, external CLI provisioning, a custom native helper, clipboard access, crash-orphan garbage collection, UXH3, or collection behavior.
- Never modify, stage, delete, move, or rewrite `CODEX_HANDOFF_CURRENT.md` or `PROJECT_HANDOFF.pre-20260820.md`.
- Every production task starts with a focused failing test, confirms the intended failure, adds the minimum implementation, reruns focused GREEN, and ends with a narrow commit.

## Review Focus

1. Split/multibyte subprocess output must enforce byte caps without ever logging stdout/stderr; Task 2 tests chunked output, overflow, and captured console calls.
2. Native Cancel must remain distinguishable from spawn, timeout, signal, non-zero-exit, stderr, and malformed-output failures; Tasks 2 and 3 pin every mapping.
3. Re-provisioning an AVAILABLE or MISSING SerpApi row must retain the old binding until fresh secure-store write and exact rebind succeed; Task 4 tests both states and cleanup failure.
4. Secret-shaped renderer input or unsafe service output must fail before delegation/return; Task 5 tests trust-first parsing, exact keys, unknown fields, and nested leak attempts.
5. A committed connection followed by readiness-refresh failure must remain committed while diagnostics and the renderer's final reread stay secret-free; Tasks 4 and 6 test this post-commit failure.

## Locked File Structure

Create these production files:

- `src/main/core/secret-ingress.ts` — privileged port and result types only.
- `src/main/app/macos-osascript-secret-ingress.ts` — fixed macOS adapter and bounded injectable subprocess runner.
- `src/main/sources/serpapi/serpapi-credential-acquirer.ts` — structural validation, fresh reference creation, and secure-store write.

Modify these existing production files:

- `src/shared/workspace-connection-management.ts` — SerpApi intent/action/safe error contracts.
- `src/main/app/workspace-connection-metadata.ts` — exact intent normalizer.
- `src/main/app/workspace-connection-management-service.ts` — serialized provision/replace mutation and compensation.
- `src/main/app/desktop-connection-write-ipc.ts` — trusted safe handler and output validator.
- `src/main/app/serpapi-electron-composition.ts` — production ingress/acquirer composition.
- `src/shared/application-info.ts`, `src/preload.ts`, `src/main.ts` — dedicated channel, typed preload method, and main registration/composition.
- `src/DesktopMultiSourceView.tsx` — status-specific secret-free action and safe copy.

Keep adapter, acquirer, mutation, IPC, composition, and UI tests separate so each security boundary fails independently.

---

### Task 1: Define the secret-free SerpApi intent and safe result vocabulary

**Files:**

- Modify: `src/shared/workspace-connection-management.ts`
- Modify: `src/main/app/workspace-connection-metadata.ts`
- Modify: `tests/integration/app/workspace-connection-metadata.integration.cjs`

**Interfaces:**

- Consumes: existing `WorkspaceConnectionMutationResponse` and exact-key normalizer helpers.
- Produces: `ProvisionSerpApiWorkspaceConnectionIntent`, `PROVISION_SERPAPI`, three fixed ingress/input error codes, and `normalizeProvisionSerpApiWorkspaceConnectionIntent(value)`.

- [ ] **Step 1: Write focused failing intent-contract tests**

Add a successful exact-shape case:

```js
assert.deepEqual(
  normalizeProvisionSerpApiWorkspaceConnectionIntent({
    workspace_id: ' ws_fixture ',
    source_id: 'serpapi',
  }),
  { workspace_id: 'ws_fixture', source_id: 'serpapi' },
);
```

Add invalid cases for blank workspace, another source, non-object input, and every extra key below. Assert `WorkspaceConnectionIntentValidationError`, fixed message/code, and absence of the test-only value from serialized errors:

```js
for (const forbiddenKey of [
  'api_key', 'secret', 'credential_ref', 'value', 'prompt', 'metadata',
]) {
  expectInvalid(
    () => normalizeProvisionSerpApiWorkspaceConnectionIntent({
      workspace_id: 'ws_fixture',
      source_id: 'serpapi',
      [forbiddenKey]: 'rr_test_only_key_0123456789',
    }),
    `SerpApi provisioning rejects ${forbiddenKey}`,
  );
}
```

- [ ] **Step 2: Run RED and confirm the missing export**

```bash
npm run test:m5:connection-metadata
```

Expected: compile/import failure because the SerpApi intent normalizer does not exist. Reject failures caused by existing Google/Disconnect cases.

- [ ] **Step 3: Add the exact shared types and normalizer**

Extend the shared unions with `PROVISION_SERPAPI`, `SECRET_INGRESS_CANCELLED`, `SECRET_INGRESS_FAILED`, and `SECRET_INPUT_INVALID`, preserving every existing member. Add:

```ts
export interface ProvisionSerpApiWorkspaceConnectionIntent {
  workspace_id: string;
  source_id: 'serpapi';
}

export const normalizeProvisionSerpApiWorkspaceConnectionIntent = (
  value: unknown,
): ProvisionSerpApiWorkspaceConnectionIntent => {
  const intent = requirePlainRecord(value);
  requireExactKeys(intent, ['workspace_id', 'source_id']);
  if (intent.source_id !== 'serpapi') return invalidIntent();
  return {
    workspace_id: requireTrimmedString(intent.workspace_id),
    source_id: 'serpapi',
  };
};
```

- [ ] **Step 4: Run focused GREEN and static checks**

```bash
npm run test:m5:connection-metadata
npx tsc --noEmit
git diff --check
```

Expected: `PASS WORKSPACE-CONNECTION-METADATA-001`, zero type errors, clean diff.

- [ ] **Step 5: Commit the contract checkpoint**

```bash
git add src/shared/workspace-connection-management.ts src/main/app/workspace-connection-metadata.ts tests/integration/app/workspace-connection-metadata.integration.cjs
git commit -m "feat: define safe serpapi provisioning intent"
```

### Task 2: Implement the bounded macOS native secret-ingress adapter

**Files:**

- Create: `src/main/core/secret-ingress.ts`
- Create: `src/main/app/macos-osascript-secret-ingress.ts`
- Create: `tests/integration/app/macos-osascript-secret-ingress.integration.cjs`
- Create: `tests/integration/app/run-macos-osascript-secret-ingress-test.sh`
- Modify: `package.json`

**Interfaces:**

- Consumes: Node `child_process.spawn`; no Electron, store, repository, provider, renderer, clipboard, or filesystem dependency.
- Produces: `SecretIngressPort`, `SecretIngressResult`, `MacOsascriptSecretIngress`, and an injectable `RunOsaScript` boundary used only inside main-process composition/tests.

- [ ] **Step 1: Write failing adapter tests with a fake runner**

Create a fake runner that records the complete request and returns deterministic process results. Assert the submitted case receives only the secret in the privileged result:

```js
const syntheticKey = 'rr_test_only_key_0123456789';
const calls = [];
const ingress = new MacOsascriptSecretIngress(async (request) => {
  calls.push(request);
  return {
    exit_code: 0,
    signal: null,
    stdout: Buffer.from('ROOFROOM_SECRET_SUBMITTED:' + syntheticKey + '\n'),
    stderr_bytes: 0,
    timed_out: false,
    overflowed: false,
  };
});
assert.deepEqual(await ingress.requestSecret({ purpose: 'SERPAPI_API_KEY' }), {
  status: 'SUBMITTED',
  secret: syntheticKey,
});
assert.equal(calls[0].executable, '/usr/bin/osascript');
assert.deepEqual(calls[0].argv, []);
assert.equal(calls[0].shell, false);
assert.equal(calls[0].timeout_ms, 120000);
assert.equal(calls[0].max_output_bytes, 1024);
assert.match(calls[0].script, /with hidden answer/);
assert.equal(calls[0].script.includes(syntheticKey), false);
```

Add cases for exact cancel sentinel, spawn unavailable, timeout, signal/non-zero exit, stderr bytes on exit zero, unknown sentinel, duplicate protocol lines, stdout/stderr overflow, split output chunks in the real runner seam, and a multibyte chunk crossing 1024 bytes. The timeout and overflow cases must assert that the child is terminated exactly once and that late `error`/`close` events cannot replace the settled safe result. Patch `console.log`, `console.error`, `console.warn`, and `console.debug`; assert no call receives stdout, stderr, raw error text, or the synthetic key.

Read both production source files and assert they contain no `clipboard`, `writeFile`, `mkdtemp`, `tmpdir`, `-e`, or secret-bearing argv construction.

- [ ] **Step 2: Add the runner script/package entry and run RED**

The Bash 3.2-compatible runner compiles only the port and adapter to a temporary build and executes the integration file. Add:

```json
"test:m5:secret-ingress": "bash tests/integration/app/run-macos-osascript-secret-ingress-test.sh"
```

Run `npm run test:m5:secret-ingress`.

Expected: compile/import failure because both production modules are absent.

- [ ] **Step 3: Add the port types**

Create `src/main/core/secret-ingress.ts` with the exact `SecretIngressPurpose`, `SecretIngressFailureCode`, `SecretIngressResult`, and `SecretIngressPort` types from the spec.

- [ ] **Step 4: Implement the fixed protocol and injected process runner**

Define:

```ts
export interface OsaScriptProcessResult {
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr_bytes: number;
  timed_out: boolean;
  overflowed: boolean;
}

export interface OsaScriptRunRequest {
  executable: '/usr/bin/osascript';
  argv: readonly [];
  shell: false;
  script: string;
  timeout_ms: 120000;
  max_output_bytes: 1024;
}
```

Export `createRunOsaScript(spawnProcess = spawn)` so tests can supply a fake child with controlled stdin/stdout/stderr streams. The production runner calls `spawnProcess(request.executable, [], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] })`, writes only the fixed script to stdin, collects bounded stdout, counts/discards stderr, kills once on timeout/overflow, and settles once on `error` or `close`. It never exposes raw spawn errors. The adapter removes at most one final line ending and recognizes only the exact cancel sentinel or one submitted prefix.

- [ ] **Step 5: Run focused GREEN**

```bash
npm run test:m5:secret-ingress
npx tsc --noEmit
npm run lint
git diff --check
```

Expected: `PASS MACOS-OSASCRIPT-SECRET-INGRESS-001`; no real `osascript` launch.

- [ ] **Step 6: Commit the adapter checkpoint**

```bash
git add package.json src/main/core/secret-ingress.ts src/main/app/macos-osascript-secret-ingress.ts tests/integration/app/macos-osascript-secret-ingress.integration.cjs tests/integration/app/run-macos-osascript-secret-ingress-test.sh
git commit -m "feat: add native macos secret ingress"
```

### Task 3: Add the SerpApi credential acquirer

**Files:**

- Create: `src/main/sources/serpapi/serpapi-credential-acquirer.ts`
- Create: `tests/integration/serpapi/serpapi-credential-acquirer.integration.cjs`
- Create: `tests/integration/serpapi/run-serpapi-credential-acquirer-test.sh`
- Modify: `package.json`

**Interfaces:**

- Consumes: `SecretIngressPort`, `CredentialStore`, and injected `credential_ref_factory`.
- Produces: `SerpApiCredentialAcquirer.acquire()` returning only cancellation or a fresh opaque reference; throws only `SerpApiCredentialAcquisitionError` with fixed safe codes.

- [ ] **Step 1: Write failing acquirer tests**

Use fake ingress/store/ref factory. Assert successful `writeCredential('serpapi:test-ref', syntheticKey)` and return `{ status: 'ACQUIRED', credential_ref: 'serpapi:test-ref' }`. Add cancellation, each ingress failure code, empty, whitespace, leading/trailing whitespace, control/newline, non-ASCII, 513-byte, 1-byte, and 512-byte cases. Add ref-factory and store-write failures. A store-write failure must attempt `deleteCredential` only for the fresh reference; a cleanup failure must retain the same fixed safe error and log nothing. Assert all non-success paths that precede reference creation make zero store calls, and no returned/error/log value contains the synthetic key.

- [ ] **Step 2: Add the runner/package entry and run RED**

Add:

```json
"test:m3:serpapi-credential-acquirer": "bash tests/integration/serpapi/run-serpapi-credential-acquirer-test.sh"
```

Run `npm run test:m3:serpapi-credential-acquirer`.

Expected: compile/import failure because the acquirer is absent.

- [ ] **Step 3: Implement the minimal acquirer**

Define:

```ts
export type SerpApiCredentialAcquisition =
  | { status: 'ACQUIRED'; credential_ref: string }
  | { status: 'CANCELLED' };
export type SerpApiCredentialAcquisitionErrorCode =
  | 'SECRET_INGRESS_FAILED'
  | 'SECRET_INPUT_INVALID'
  | 'CREDENTIAL_PERSISTENCE_FAILED';
export class SerpApiCredentialAcquisitionError extends Error {
  constructor(
    public readonly code: SerpApiCredentialAcquisitionErrorCode,
  ) {
    super('SerpApi credential acquisition failed.');
    this.name = 'SerpApiCredentialAcquisitionError';
  }
}
export interface SerpApiCredentialAcquirer {
  acquire(): Promise<SerpApiCredentialAcquisition>;
}

export interface SerpApiCredentialAcquirerDependencies {
  secret_ingress: SecretIngressPort;
  credential_store: CredentialStore;
  credential_ref_factory: () => string;
}

export class MainProcessSerpApiCredentialAcquirer
implements SerpApiCredentialAcquirer {
  constructor(
    private readonly dependencies: SerpApiCredentialAcquirerDependencies,
  ) {}

  async acquire(): Promise<SerpApiCredentialAcquisition> {
    const ingress = await this.dependencies.secret_ingress.requestSecret({
      purpose: 'SERPAPI_API_KEY',
    });
    if (ingress.status === 'CANCELLED') return { status: 'CANCELLED' };
    if (ingress.status === 'FAILED') {
      throw new SerpApiCredentialAcquisitionError('SECRET_INGRESS_FAILED');
    }
    if (!/^[\x21-\x7e]{1,512}$/.test(ingress.secret)) {
      throw new SerpApiCredentialAcquisitionError('SECRET_INPUT_INVALID');
    }
    let credentialRef: string;
    try {
      credentialRef = this.dependencies.credential_ref_factory();
    } catch {
      throw new SerpApiCredentialAcquisitionError(
        'CREDENTIAL_PERSISTENCE_FAILED',
      );
    }
    try {
      await this.dependencies.credential_store.writeCredential(
        credentialRef,
        ingress.secret,
      );
      return { status: 'ACQUIRED', credential_ref: credentialRef };
    } catch {
      try {
        await this.dependencies.credential_store.deleteCredential(
          credentialRef,
        );
      } catch {
        // Cleanup is best-effort; raw errors and references stay private.
      }
      throw new SerpApiCredentialAcquisitionError(
        'CREDENTIAL_PERSISTENCE_FAILED',
      );
    }
  }
}
```

The concrete class requests `SERPAPI_API_KEY`, validates `/^[\x21-\x7e]{1,512}$/`, creates a fresh opaque ref through the injected factory, writes once, and returns only the ref. Error messages are fixed by code and contain no secret, raw error, or ref.

- [ ] **Step 4: Run focused GREEN**

```bash
npm run test:m3:serpapi-credential-acquirer
npm run test:m3:serpapi
npx tsc --noEmit
git diff --check
```

Expected: new acquirer marker plus existing `PASS SERPAPI-SOURCE-001`; no live provider call.

- [ ] **Step 5: Commit the acquirer checkpoint**

```bash
git add package.json src/main/sources/serpapi/serpapi-credential-acquirer.ts tests/integration/serpapi/serpapi-credential-acquirer.integration.cjs tests/integration/serpapi/run-serpapi-credential-acquirer-test.sh
git commit -m "feat: acquire serpapi credentials in main"
```

### Task 4: Publish and replace SerpApi connections atomically

**Files:**

- Modify: `src/main/app/workspace-connection-management-service.ts`
- Modify: `src/main/app/serpapi-electron-composition.ts`
- Modify: `src/main.ts`
- Modify: `tests/integration/app/workspace-connection-management-service.integration.cjs`
- Modify: `tests/integration/app/run-workspace-connection-management-service-test.sh`
- Modify: `tests/integration/app/desktop-connection-write-composition.integration.cjs`
- Modify: `tests/integration/app/run-desktop-connection-write-composition-test.sh`

**Interfaces:**

- Consumes: normalized `ProvisionSerpApiWorkspaceConnectionIntent`, `SerpApiCredentialAcquirer`, and existing repository/store/refresh/diagnostic dependencies.
- Produces: serialized `provisionSerpApi(value)` with action `PROVISION_SERPAPI` plus a required main-only production acquirer composition.

- [ ] **Step 1: Extend the test harness and write RED mutation cases**

Give `FakeRepository.rebindSourceConnections` exact compare-and-swap behavior for `source_ids: ['serpapi']`; make fake credential deletes, fake acquirer results, and operation ordering observable.

Test all of these service cases:

- new row: acquire fresh ref before upsert, persist `safe_metadata: {}`, refresh once, return success;
- existing null-ref row: fresh acquisition then upsert;
- existing AVAILABLE row: fresh acquisition then exact rebind, old credential deleted only after global count zero;
- existing MISSING row: same fresh-ref replacement, never overwrite the old ref;
- cancel: no upsert/rebind/delete/refresh and fixed cancel response;
- ingress failure, invalid input, and store failure: safe code and no repository mutation;
- repository lookup failure before acquisition: no prompt/acquirer call;
- upsert/rebind failure after acquisition: old row unchanged and fresh ref compensation delete;
- compensation failure: primary safe failure plus `NEW_CREDENTIAL_COMPENSATION_FAILED` diagnostic;
- old ref still globally referenced: retain old credential material;
- old-ref count/delete failure after rebind: new row retained and `SUCCEEDED_WITH_CLEANUP_WARNING`;
- refresh failure after commit: new row remains, fixed `SAFE_STATE_REFRESH_FAILED` diagnostic, secret-free success;
- provisioning serializes behind a deliberately blocked Disconnect;
- results and diagnostics contain no synthetic key and no `credential_ref` property.

In the composition test, assert `createElectronSerpApiCredentialAcquirer` exists, main passes its result as `serpapi_credential_acquirer`, `MacOsascriptSecretIngress` appears only in main composition, `/usr/bin/osascript` appears only in the adapter, no clipboard/environment secret path exists, and the shared credential-store instance is reused. Use injected fakes; do not launch a native process.

- [ ] **Step 2: Run RED**

```bash
npm run test:m5:connection-management-service
npm run test:m5:connection-write-composition
```

Expected: compilation/assertion failures because the service method and production factory/composition are absent.

- [ ] **Step 3: Extend service dependencies and safe diagnostics**

Add:

```ts
serpapi_credential_acquirer: SerpApiCredentialAcquirer;
```

Broaden `NEW_CREDENTIAL_COMPENSATION_FAILED.source_id` from Google-only to `DesktopCredentialManagedSourceId`. Add only this fixed ingress diagnostic:

```ts
{
  code: 'SERPAPI_SECRET_INGRESS_FAILED';
  workspace_id: string;
  source_id: 'serpapi';
}
```

Do not add raw error detail.

- [ ] **Step 4: Implement serialized provision/replace behavior**

Normalize before serialization. Inside the serialized operation, read the existing row before invoking the acquirer. Map cancel to `SECRET_INGRESS_CANCELLED`; allowlist the three acquirer failure codes and record the fixed ingress diagnostic only for `SECRET_INGRESS_FAILED`.

For no row or null ref, upsert `{ workspace_id, source_id: 'serpapi', credential_ref: freshRef, safe_metadata: {} }`. For an old ref, use:

```ts
repository.rebindSourceConnections({
  workspace_id: intent.workspace_id,
  source_ids: ['serpapi'],
  expected_credential_ref: existing.credential_ref,
  replacement_credential_ref: acquired.credential_ref,
});
```

On publication failure, call the existing fresh-ref compensation generalized to `DesktopCredentialManagedSourceId`. After committed rebind, count/delete the old ref using existing cleanup-warning semantics. Use existing `refreshSafeState` after committed or compensated persistence, and return only fixed results.

Export this production factory from `serpapi-electron-composition.ts`:

```ts
export const createElectronSerpApiCredentialAcquirer = (
  credentialStore: CredentialStore,
): SerpApiCredentialAcquirer => new MainProcessSerpApiCredentialAcquirer({
  secret_ingress: new MacOsascriptSecretIngress(),
  credential_store: credentialStore,
  credential_ref_factory: () =>
    `serpapi:${randomBytes(24).toString('base64url')}`,
});
```

Pass it into `WorkspaceConnectionManagementService` immediately after the shared `credentialStore` is created. Do not expose the port as a global, preload value, controller dependency, or renderer prop.

- [ ] **Step 5: Run focused and neighboring GREEN**

```bash
npm run test:m5:connection-management-service
npm run test:m5:connection-write-composition
npm run test:m3:google-connection-management
npm run test:m2:connection-mutations
npx tsc --noEmit
git diff --check
```

Expected: all markers pass; existing Google shared-reference behavior remains unchanged.

- [ ] **Step 6: Commit the mutation checkpoint**

```bash
git add src/main/app/workspace-connection-management-service.ts src/main/app/serpapi-electron-composition.ts src/main.ts tests/integration/app/workspace-connection-management-service.integration.cjs tests/integration/app/run-workspace-connection-management-service-test.sh tests/integration/app/desktop-connection-write-composition.integration.cjs tests/integration/app/run-desktop-connection-write-composition-test.sh
git commit -m "feat: provision serpapi workspace credentials"
```

### Task 5: Expose one trusted secret-free IPC/preload action

**Files:**

- Modify: `src/main/app/desktop-connection-write-ipc.ts`
- Modify: `src/shared/application-info.ts`
- Modify: `src/preload.ts`
- Modify: `src/main.ts`
- Modify: `tests/integration/app/desktop-connection-write-main-ipc.integration.cjs`
- Modify: `tests/integration/app/desktop-connection-write-ipc.integration.cjs`
- Modify: `tests/integration/app/run-desktop-connection-write-main-ipc-test.sh`

**Interfaces:**

- Consumes: Task 1 normalizer and Task 4 service method.
- Produces: `DESKTOP_CONNECTION_PROVISION_SERPAPI`, handler `provisionSerpApi`, and preload method `provisionSerpApiDesktopWorkspaceConnection`.

- [ ] **Step 1: Write failing trusted-handler tests**

Expect channel `desktop:connection:provision-serpapi`. Test trust-first rejection, one exact valid call, and rejection of extra `api_key`, `secret`, `credential_ref`, `metadata`, `prompt`, and unknown fields before service invocation. Return a fake unsafe response containing nested native stdout, raw error, and the test-only key; assert the handler throws only a generic invalid-response error whose message and stack contain none of them.

Extend safe response allowlists for the new action and three new error codes only.

- [ ] **Step 2: Write failing preload contract tests**

```js
await api.provisionSerpApiDesktopWorkspaceConnection({
  workspace_id: 'ws',
  source_id: 'serpapi',
});
assert.deepEqual(lastInvocation, [
  IPC_CHANNELS.DESKTOP_CONNECTION_PROVISION_SERPAPI,
  { workspace_id: 'ws', source_id: 'serpapi' },
]);
```

Keep assertions that no generic invoke/channel selector, clipboard method, credential reference, or secret-shaped field crosses preload.

- [ ] **Step 3: Run both RED tests**

```bash
npm run test:m5:connection-write-main-ipc
npm run test:m5:connection-write-ipc
```

Expected: absent handler/channel/preload method failures.

- [ ] **Step 4: Add the handler, API type, preload method, and main registration**

Extend `ConnectionWriteService` with:

```ts
provisionSerpApi: (
  intent: ProvisionSerpApiWorkspaceConnectionIntent,
) => Promise<WorkspaceConnectionMutationResponse>;
```

Implement trust → exact normalize → delegate → `requireSafeMutationResponse(response, 'serpapi', 'PROVISION_SERPAPI')`. Add the channel and typed preload method, wire the service delegate, and register the new `ipcMain.handle` adjacent to existing connection-write handlers.

- [ ] **Step 5: Run focused GREEN plus read-contract regressions**

```bash
npm run test:m5:connection-write-main-ipc
npm run test:m5:connection-write-ipc
bash tests/integration/app/run-desktop-connection-main-ipc-test.sh
bash tests/integration/app/run-desktop-connection-ipc-test.sh
npx tsc --noEmit
git diff --check
```

Expected: write/read markers pass; `DESKTOP_CONNECTIONS` remains unchanged.

- [ ] **Step 6: Commit the IPC checkpoint**

```bash
git add src/main/app/desktop-connection-write-ipc.ts src/shared/application-info.ts src/preload.ts src/main.ts tests/integration/app/desktop-connection-write-main-ipc.integration.cjs tests/integration/app/desktop-connection-write-ipc.integration.cjs tests/integration/app/run-desktop-connection-write-main-ipc-test.sh
git commit -m "feat: expose safe serpapi provision intent"
```

### Task 6: Add the Workspace SerpApi provisioning presentation

**Files:**

- Modify: `src/DesktopMultiSourceView.tsx`
- Modify: `tests/integration/app/desktop-ui-smoke.integration.cjs`

**Interfaces:**

- Consumes: `window.roofroom.provisionSerpApiDesktopWorkspaceConnection` and the existing safe connection reread.
- Produces: status-specific buttons and fixed safe copy; no secret input or local secret state.

- [ ] **Step 1: Write failing UI smoke cases**

Extend the page API fake to record provisioning intents and return configurable safe responses. Assert:

- `NOT_CONFIGURED` renders `Provision API key` and no text/password input;
- `AVAILABLE` renders `Replace API key` and existing `Disconnect`;
- `MISSING` renders `Re-provision API key` and existing `Disconnect`;
- click sends exactly `{ workspace_id: 'ws_fixture', source_id: 'serpapi' }`;
- pending state disables the row and prevents a second call;
- cancel shows neutral `SerpApi API-key entry was cancelled.` copy;
- ingress, invalid input, store, publication, rebind, and cleanup-warning results show fixed copy;
- every branch, including cancel and thrown error, triggers exactly one final `getDesktopWorkspaceConnections` reread;
- refreshed AVAILABLE/READY state renders after success;
- reread failure after committed success shows only the existing safe refresh message;
- DOM, recorded invocation, messages, and captured logs contain no synthetic key, `credential_ref`, native stdout, or raw error.

- [ ] **Step 2: Run RED**

```bash
npm run test:m5:desktop-ui
```

Expected: missing method/button assertions fail while existing desktop smoke remains otherwise valid.

- [ ] **Step 3: Add the secret-free UI action**

Extend `WorkspaceConnectionAction` with `PROVISION_SERPAPI`. In `mutateWorkspaceConnection`, call the new preload method before Google metadata branches:

```ts
if (action === 'PROVISION_SERPAPI') {
  response = await window.roofroom
    .provisionSerpApiDesktopWorkspaceConnection({
      workspace_id: workspaceId,
      source_id: 'serpapi',
    });
}
```

Place this branch before the existing `DISCONNECT` branch without changing that branch's body. Add fixed copy for the three new codes. Remove the old “separately approved flow” blocker and explain that entry occurs in a native masked prompt. Do not add an `<input>`, draft field, clipboard action, reveal/copy control, or API-key state variable.

- [ ] **Step 4: Run focused GREEN and renderer boundary checks**

```bash
npm run test:m5:desktop-ui
npm run test:m5:connection-write-ipc
npx tsc --noEmit
npm run lint
git diff --check
```

Expected: `PASS DESKTOP-UI-001` and preload marker pass; no renderer secret field.

- [ ] **Step 5: Commit the UI checkpoint**

```bash
git add src/DesktopMultiSourceView.tsx tests/integration/app/desktop-ui-smoke.integration.cjs
git commit -m "feat: present secure serpapi provisioning"
```

### Task 7: Gate the complete deterministic slice

**Files:**

- Modify: `tests/integration/release/run-release-gate.sh`
- Create: `tests/integration/app/serpapi-provisioning-security.integration.cjs`
- Create: `tests/integration/app/run-serpapi-provisioning-security-test.sh`
- Modify: `package.json`

**Interfaces:**

- Consumes: every focused runner from Tasks 1–6.
- Produces: one end-to-end safe-surface leak assertion and release-gate ordering that proves port/acquirer before service/IPC/composition/UI consumers.

- [ ] **Step 1: Add the deterministic security-regression runner**

Compile the port, adapter, acquirer, mutation service, intent normalizer, and trusted IPC handler into a temporary build. Exercise a successful fake-ingress flow with:

```js
const syntheticKey = [
  'rr', 'test', 'only', 'provisioning', 'key',
].join('_');
const ordinaryConfigWrites = [];
const exportWrites = [];
const capturedLogs = [];
```

Assert the privileged fake `CredentialStore.writeCredential` receives the synthetic value exactly once. Then assert it is absent from the renderer intent, handler response, mutation diagnostics, captured console/logger calls, `ordinaryConfigWrites`, `exportWrites`, and serialized safe read fixture. Assert both write arrays remain empty because provisioning owns neither config nor export.

The runner prints:

```text
PASS SERPAPI-PROVISIONING-SECURITY-001
```

Add:

```json
"test:m5:serpapi-provisioning-security": "bash tests/integration/app/run-serpapi-provisioning-security-test.sh"
```

- [ ] **Step 2: Add all new runners to the release gate**

Insert before workspace management service tests:

```bash
bash \
  tests/integration/app/run-macos-osascript-secret-ingress-test.sh

bash \
  tests/integration/serpapi/run-serpapi-credential-acquirer-test.sh

bash \
  tests/integration/app/run-serpapi-provisioning-security-test.sh
```

Do not add a native prompt or live-provider command.

- [ ] **Step 3: Run the focused security ladder**

```bash
npm run test:m5:secret-ingress
npm run test:m3:serpapi-credential-acquirer
npm run test:m5:connection-metadata
npm run test:m5:connection-management-service
npm run test:m5:connection-write-main-ipc
npm run test:m5:connection-write-ipc
npm run test:m5:connection-write-composition
npm run test:m5:serpapi-provisioning-security
bash tests/integration/app/run-desktop-connection-main-ipc-test.sh
bash tests/integration/app/run-desktop-connection-ipc-test.sh
npm run test:m3:serpapi
npm run test:m5:desktop-ui
```

Expected: every stable PASS marker, no real prompt, no live provider call.

- [ ] **Step 4: Run static and full deterministic verification**

```bash
npx tsc --noEmit
npm run lint
git diff --check
npm run test:release:gate
```

Expected: zero type/lint/diff failures and `PASS RELEASE-GATE-001`.

- [ ] **Step 5: Run package verification because privileged IPC/native composition changed**

```bash
npm run package
```

Expected: Electron main, preload, and renderer build successfully and macOS arm64 package completes. Do not launch the prompt in this step.

- [ ] **Step 6: Inspect the implementation range for leaks and scope drift**

```bash
git diff 6ae684a0ef8c8bb4e7b7187d2e37319e3ea233ab..HEAD -- src tests package.json
rg -n "clipboard|api_key|credential_ref|ROOFROOM_SECRET_SUBMITTED" src/preload.ts src/shared/application-info.ts src/DesktopMultiSourceView.tsx
git status --short
```

Expected: no clipboard path; no renderer/preload secret/reference field; protocol sentinel only in main adapter/tests; protected historical files remain untracked and untouched.

- [ ] **Step 7: Commit release-gate wiring**

```bash
git add package.json tests/integration/release/run-release-gate.sh tests/integration/app/serpapi-provisioning-security.integration.cjs tests/integration/app/run-serpapi-provisioning-security-test.sh
git commit -m "test: gate secure serpapi provisioning"
```

### Task 8: Reconcile canonical documentation and close the implementation checkpoint

**Files:**

- Modify: `ARCHITECTURE.md`
- Modify: `DATA_CONTRACTS.md`
- Modify: `TEST_STRATEGY.md`
- Modify: `PROJECT_HANDOFF.md`
- Audit only: `PROJECT_SPEC.md`, `VALIDATION_SPEC.md`, `SOURCE_MODULE_GUIDE.md`, `DECISIONS.md`

**Interfaces:**

- Consumes: verified production/test evidence from Tasks 1–7.
- Produces: implementation-accurate canonical documentation and exact next action; no new behavior.

- [ ] **Step 1: Document only verified implementation truth**

Record the main-only port/adapter, stdin protocol, acquirer plaintext scope, secret-free intent/response, unchanged read contract, fresh-ref mutation/compensation rules, status-specific UI, deterministic markers, release gate/package results, pending packaged prompt acceptance, and stop before live provider/UXH3 work.

Do not claim Developer ID, hardened-runtime, notarized, accessibility, focus, or native prompt acceptance unless it actually ran under that configuration.

- [ ] **Step 2: Audit stable canonical files**

Leave `PROJECT_SPEC.md`, `VALIDATION_SPEC.md`, and `SOURCE_MODULE_GUIDE.md` unchanged unless verified implementation materially changes their contract. `DECISIONS.md` already contains ADR-066 from the approved design checkpoint; do not duplicate or rewrite it.

- [ ] **Step 3: Run documentation and status checks**

```bash
git diff --check
git status --short
git diff -- ARCHITECTURE.md DATA_CONTRACTS.md TEST_STRATEGY.md PROJECT_HANDOFF.md PROJECT_SPEC.md VALIDATION_SPEC.md SOURCE_MODULE_GUIDE.md DECISIONS.md
```

Expected: only evidence-backed documentation changes plus the two protected untracked files.

- [ ] **Step 4: Commit the documentation checkpoint**

```bash
git add ARCHITECTURE.md DATA_CONTRACTS.md TEST_STRATEGY.md PROJECT_HANDOFF.md
git commit -m "docs: close secure serpapi provisioning"
```

- [ ] **Step 5: Run final post-commit verification**

```bash
npx tsc --noEmit
npm run lint
git diff --check
npm run test:release:gate
git status --short
git log --oneline -12
```

Expected: deterministic checks pass; tracked tree clean; only `CODEX_HANDOFF_CURRENT.md` and `PROJECT_HANDOFF.pre-20260820.md` remain untracked.

## Deferred Packaged-App Acceptance — Separate Explicit Run

Do not execute this during deterministic plan implementation. After the implementation checkpoint is reviewed, obtain explicit authorization for a limited local acceptance using only a synthetic non-production value:

1. launch the packaged macOS arm64 app;
2. verify prompt visibility, ownership/branding, focus, masking, keyboard navigation, Cancel, and timeout;
3. provision the synthetic value through real `safeStorage` and observe only `AVAILABLE`/`READY` through the safe read contract;
4. inspect app logs for absence of the synthetic marker, native stdout/stderr, and credential reference;
5. replace the value while forcing a pre-publication failure and confirm the old binding remains;
6. disconnect and remove the synthetic credential through existing UXH2 semantics;
7. repeat under the intended Developer ID, hardened-runtime, and notarization configuration when that distribution setup exists.

This acceptance makes no SerpApi request and does not authorize collection work.

## Implementation Stop

Stop after Task 8 and report the verified checkpoint. Do not validate the key against SerpApi, call a provider, modify SerpApi collection/runtime semantics, begin UXH3, or execute deferred packaged-app acceptance without separate authorization.
