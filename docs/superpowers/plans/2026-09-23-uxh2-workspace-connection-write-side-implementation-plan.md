# UXH2 Workspace Connection Write-Side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add privileged Workspace connection management for safe metadata updates, disconnect, and Google OAuth connect/reconnect while preserving the existing renderer-safe read contract, schema v8, shared Google credentials, and a separate future decision gate for secret ingress.

**Architecture:** A main-process WorkspaceConnectionManagementService will own serialized connection mutations and compensation. Renderer IPC will carry only source identifiers and source-specific non-secret metadata. Google OAuth acquisition remains main-owned and system-browser based. Repository transactions will provide delete, reference counting, and atomic shared-reference rebind primitives. SerpApi secret provisioning is excluded until a separate secure-ingress spike is approved.

**Tech Stack:** TypeScript, Electron IPC/preload, React, better-sqlite3, Electron safeStorage, Node deterministic integration scripts, Bash 3.2-compatible release gates.

**Approved design:** docs/superpowers/specs/2026-09-23-uxh2-workspace-connection-write-side-design.md

---

## Global constraints

- Do not change the DESKTOP_CONNECTIONS channel or DesktopWorkspaceConnectionView fields. The renderer-safe read payload remains exactly source_id, credential_status, and readiness_status.
- Never expose credential_ref, OAuth refresh tokens, API keys, developer tokens, client secrets, credential bundles, raw provider errors, or persistence paths to renderer state or IPC results.
- Keep schema_version at 8. Add no migration unless a deterministic failing test proves schema v8 cannot satisfy the approved design.
- Keep credential status separate from readiness, freshness, execution, and validation.
- Preserve immutable raw artifacts and provenance behavior.
- Make no live provider call in deterministic tests.
- Do not add clipboard ingress, SerpApi provisioning, SecretIngressPort, UXH3 work, or opportunistic refactors.
- Never modify, stage, delete, or rewrite CODEX_HANDOFF_CURRENT.md or PROJECT_HANDOFF.pre-20260820.md.
- Keep all renderer intents declarative and secret-free. Main/Core owns every privileged credential operation.
- Every task starts RED, confirms the intended failure, implements the smallest production change, and returns to GREEN before its checkpoint commit.

## Fresh audit map and locked file structure

Repository evidence at planning time establishes these seams:

- src/shared/workspace-connection.ts owns persisted connection row contracts.
- src/shared/desktop-multisource.ts owns production source IDs, credential-managed source IDs, DesktopWorkspaceConnectionView, and DesktopMultiSourceRepository.
- src/main/storage/database.ts defines schema v8 and workspace_source_connections.
- src/main/storage/state-repository.ts owns connection upsert/get/list and needs bounded mutation primitives.
- src/main/core/credential-store.ts defines the credential-store boundary.
- src/main/core/electron-safe-storage-credential-store.ts keeps credential material encrypted and main-owned.
- src/main/sources/google-api/google-auth.ts currently combines browser OAuth, credential persistence, row publication, and old-reference deletion.
- src/main/app/google-api-electron-composition.ts owns the main-process system-browser OAuth composition.
- src/main/sources/google-api/google-api-runtime.ts consumes persisted Google connection state.
- src/main/app/desktop-connection-ipc.ts is the verified read-only IPC path and must stay unchanged.
- src/main/app/desktop-multisource-controller.ts owns the verified safe read refresh method.
- src/main.ts composes the repository, credential store, controller, and trusted IPC registrations.
- src/preload.ts and src/shared/application-info.ts expose the existing read method.
- src/DesktopMultiSourceView.tsx renders Workspace connections, with presentation styles in src/index.css.
- tests/integration/app/desktop-connection-ipc.integration.cjs, tests/integration/app/desktop-connection-main-ipc.integration.cjs, tests/integration/google-api/google-credential-composition.integration.cjs, tests/integration/sqlite/workspace-connection-readiness.integration.cjs, and tests/integration/app/desktop-ui-smoke.integration.cjs are the closest existing deterministic seams.
- tests/integration/release/run-release-gate.sh is the milestone regression gate.

Create only these new production modules:

- src/shared/workspace-connection-management.ts
- src/main/app/workspace-connection-metadata.ts
- src/main/app/workspace-connection-management-service.ts
- src/main/app/desktop-connection-write-ipc.ts
- src/main/sources/google-api/google-oauth-credential-acquirer.ts

Do not move the verified read handler. Do not put provider-specific Google logic in source-neutral Core.

## Review Focus

Before approval and again before implementation completion, review these five risks explicitly:

1. A renderer-controlled value cannot become a credential reference, secret, scope list, auth state, or persistence locator.
2. Disconnect cannot delete credential material while any connection row in any workspace still references it.
3. Ads and Keyword Planner can atomically move together within one workspace when they share a compatible Google credential, without changing unrelated workspaces.
4. Any split operation across credential storage and SQLite either compensates or returns a distinct safe failure/warning that preserves recoverability.
5. The existing DESKTOP_CONNECTIONS contract and schema v8 remain byte-for-byte and version-for-version compatible.

## Phase A: Secret-ingress-free mutation foundation

### Task 1: Add schema-v8 connection mutation primitives

**Files:**

- Modify: src/shared/workspace-connection.ts
- Modify: src/main/storage/state-repository.ts
- Create: tests/integration/sqlite/workspace-connection-mutations.integration.cjs
- Create: tests/integration/sqlite/run-workspace-connection-mutations-test.sh

**Step 1: Write the failing repository contract tests**

Add deterministic cases that create two workspaces and multiple source rows against an in-memory schema-v8 database:

- deleteSourceConnection removes exactly the requested workspace/source row and returns the removed record.
- Deleting an absent row returns null and changes nothing.
- countSourceConnectionsByCredentialRef counts references across all workspaces, not only the active workspace.
- rebindSourceConnections updates exactly the requested source IDs in one workspace from expected_credential_ref to replacement_credential_ref.
- Rebind fails closed when any requested row is missing or no longer references expected_credential_ref.
- Rebind of Ads and Keyword Planner is atomic: install a temporary SQLite trigger that aborts one update and assert both rows retain the original reference.
- Unrelated rows, safe_metadata_json, connection_id, credential_ref, created_at, and timestamps remain unchanged except the intentionally rebound rows and their updated_at.
- restoreSourceConnection restores the complete removed record, including connection_id and created_at, and fails if the Workspace/source identity has since been recreated.

The runner must print one stable PASS marker:

~~~text
PASS WORKSPACE-CONNECTION-MUTATIONS-001
~~~

**Step 2: Run RED and confirm the intended failure**

Run:

~~~bash
bash tests/integration/sqlite/run-workspace-connection-mutations-test.sh
~~~

Expected: compilation or assertion failure because the four mutation methods and rebind input contract do not exist. Reject failures caused by fixture setup or schema creation.

**Step 3: Add exact shared and repository contracts**

Add the following input and narrow repository port to workspace-connection.ts, importing DesktopCredentialManagedSourceId as a type from desktop-multisource.ts:

~~~ts
export interface RebindWorkspaceSourceConnectionsInput {
  workspace_id: string;
  source_ids: readonly DesktopCredentialManagedSourceId[];
  expected_credential_ref: string;
  replacement_credential_ref: string;
}

export interface WorkspaceConnectionMutationRepository {
  deleteSourceConnection(
    workspace_id: string,
    source_id: DesktopCredentialManagedSourceId,
  ): WorkspaceSourceConnectionRecord | null;

  restoreSourceConnection(
    record: WorkspaceSourceConnectionRecord,
  ): WorkspaceSourceConnectionRecord;

  getSourceConnection(
    workspace_id: string,
    source_id: DesktopCredentialManagedSourceId,
  ): WorkspaceSourceConnectionRecord | null;

  upsertSourceConnection(
    input: UpsertWorkspaceSourceConnectionInput,
  ): WorkspaceSourceConnectionRecord;

  countSourceConnectionsByCredentialRef(credential_ref: string): number;

  rebindSourceConnections(
    input: RebindWorkspaceSourceConnectionsInput,
  ): readonly WorkspaceSourceConnectionRecord[];
}
~~~

Use the repository's current row mapping and safe metadata validation. Implement delete, exact-record restore, and count with parameterized SQL. Restore inserts the retained complete record and never overwrites a row created after deletion. Implement rebind in one better-sqlite3 transaction, validate the complete expected row set before updating, and return records in input source_ids order. Do not add a table, column, index, trigger, or migration.

**Step 4: Run focused GREEN**

Run:

~~~bash
bash tests/integration/sqlite/run-workspace-connection-mutations-test.sh
npx tsc --noEmit
git diff --check
~~~

Expected: PASS WORKSPACE-CONNECTION-MUTATIONS-001, zero type errors, clean whitespace check, schema version still 8.

**Step 5: Commit the repository primitive checkpoint**

~~~bash
git add src/shared/workspace-connection.ts src/main/storage/state-repository.ts tests/integration/sqlite/workspace-connection-mutations.integration.cjs tests/integration/sqlite/run-workspace-connection-mutations-test.sh
git commit -m "feat: add workspace connection mutation primitives"
~~~

### Task 2: Define secret-free intents, results, and metadata normalization

**Files:**

- Create: src/shared/workspace-connection-management.ts
- Create: src/main/app/workspace-connection-metadata.ts
- Create: tests/integration/app/workspace-connection-metadata.integration.cjs
- Create: tests/integration/app/run-workspace-connection-metadata-test.sh

**Step 1: Write failing contract tests**

Test exact-key input validation:

- Google Search Console accepts only workspace_id, source_id, and metadata containing site_url.
- Google Ads and Keyword Planner accept only workspace_id, source_id, and metadata containing customer_id plus optional login_customer_id.
- Unknown top-level fields and unknown metadata fields fail with INVALID_CONNECTION_INTENT.
- credential_ref, credential, secret, api_key, developer_token, client_secret, refresh_token, scopes, and auth_state are rejected wherever supplied.
- SerpApi is rejected for Manage and Google Connect/Reconnect.
- Disconnect accepts only workspace_id and one credential-managed source_id, including SerpApi.
- Returned error/result objects contain no unknown provider text and serialize without any secret-shaped key.

The runner prints:

~~~text
PASS WORKSPACE-CONNECTION-METADATA-001
~~~

**Step 2: Run RED**

~~~bash
bash tests/integration/app/run-workspace-connection-metadata-test.sh
~~~

Expected: missing module/type failures only.

**Step 3: Define exact shared contracts**

In src/shared/workspace-connection-management.ts define:

~~~ts
export const DESKTOP_GOOGLE_CONNECTION_SOURCE_IDS = [
  "google-search-console-query-page",
  "google-ads-search-terms",
  "google-keyword-planner",
] as const;

export type DesktopGoogleConnectionSourceId =
  (typeof DESKTOP_GOOGLE_CONNECTION_SOURCE_IDS)[number];

export type WorkspaceConnectionMutationOutcome =
  | "SUCCEEDED"
  | "SUCCEEDED_WITH_CLEANUP_WARNING";

export type WorkspaceConnectionMutationAction =
  | "MANAGE_METADATA"
  | "DISCONNECT"
  | "CONNECT_GOOGLE"
  | "RECONNECT_GOOGLE";

export type WorkspaceConnectionMutationErrorCode =
  | "INVALID_CONNECTION_INTENT"
  | "CONNECTION_NOT_FOUND"
  | "CONNECTION_ALREADY_EXISTS"
  | "CONNECTION_CONFIGURATION_UNAVAILABLE"
  | "OAUTH_MANUAL_ACTION_REQUIRED"
  | "OAUTH_ACQUISITION_FAILED"
  | "CREDENTIAL_PERSISTENCE_FAILED"
  | "CONNECTION_PERSISTENCE_FAILED"
  | "CONNECTION_REBIND_FAILED"
  | "DISCONNECT_CREDENTIAL_DELETE_FAILED"
  | "DISCONNECT_COMPENSATION_FAILED";

export interface WorkspaceConnectionMutationResult {
  source_id: DesktopCredentialManagedSourceId;
  action: WorkspaceConnectionMutationAction;
  outcome: WorkspaceConnectionMutationOutcome;
}

export interface GoogleSearchConsoleConnectionMetadata {
  site_url: string;
}

export interface GoogleAdsConnectionMetadata {
  customer_id: string;
  login_customer_id?: string;
}

export type GoogleConnectionMetadataIntent =
  | {
      source_id: "google-search-console-query-page";
      metadata: GoogleSearchConsoleConnectionMetadata;
    }
  | {
      source_id: "google-ads-search-terms" | "google-keyword-planner";
      metadata: GoogleAdsConnectionMetadata;
    };

export type ManageWorkspaceConnectionIntent = {
  workspace_id: string;
} & GoogleConnectionMetadataIntent;

export interface DisconnectWorkspaceConnectionIntent {
  workspace_id: string;
  source_id: DesktopCredentialManagedSourceId;
}

export type ConnectGoogleWorkspaceConnectionIntent = {
  workspace_id: string;
} & GoogleConnectionMetadataIntent;

export type ReconnectGoogleWorkspaceConnectionIntent = {
  workspace_id: string;
} & (
  | {
      source_id: "google-search-console-query-page";
      metadata?: GoogleSearchConsoleConnectionMetadata;
    }
  | {
      source_id: "google-ads-search-terms" | "google-keyword-planner";
      metadata?: GoogleAdsConnectionMetadata;
    }
);

export interface WorkspaceConnectionMutationError {
  code: WorkspaceConnectionMutationErrorCode;
  source_id?: DesktopCredentialManagedSourceId;
  retryable: boolean;
}

export type WorkspaceConnectionMutationResponse =
  | { ok: true; result: WorkspaceConnectionMutationResult }
  | { ok: false; error: WorkspaceConnectionMutationError };
~~~

The handler accepts each incoming value as unknown, validates it, and then produces the typed intent. The response union above is the only write response. Do not include cause, message, stack, credential_ref, or provider response.

**Step 4: Implement one strict metadata normalizer**

workspace-connection-metadata.ts must:

- Check plain-object shape and exact keys.
- Trim non-secret strings.
- Require non-empty site_url for Search Console.
- Require non-empty customer_id and normalize optional empty login_customer_id to omission for Ads/Keyword Planner.
- Return the existing safe metadata JSON shape expected by StateRepository.
- Reject SerpApi and any value outside the exact source-specific contract.

Keep this normalizer main-only so raw renderer input never reaches repository methods.

**Step 5: Run GREEN and commit**

~~~bash
bash tests/integration/app/run-workspace-connection-metadata-test.sh
npx tsc --noEmit
git diff --check
git add src/shared/workspace-connection-management.ts src/main/app/workspace-connection-metadata.ts tests/integration/app/workspace-connection-metadata.integration.cjs tests/integration/app/run-workspace-connection-metadata-test.sh
git commit -m "feat: define safe workspace connection write intents"
~~~

### Task 3: Implement Manage and Disconnect in the main-process service

**Files:**

- Create: src/main/app/workspace-connection-management-service.ts
- Create: tests/integration/app/workspace-connection-management-service.integration.cjs
- Create: tests/integration/app/run-workspace-connection-management-service-test.sh

**Step 1: Write failing service tests with fakes**

Build deterministic repository, credential-store, diagnostic, and refresh fakes. Cover:

Manage:

- A valid Google metadata update preserves connection_id, credential_ref, and created_at.
- Manage of a missing row returns CONNECTION_NOT_FOUND.
- Invalid metadata performs no repository or credential-store call.
- SerpApi Manage is rejected.

Disconnect:

- Deleting a row with remaining references leaves credential material untouched.
- Deleting the last reference deletes credential material only after the row is removed.
- Last-reference credential deletion failure restores the exact removed row and returns DISCONNECT_CREDENTIAL_DELETE_FAILED.
- Restoration failure returns DISCONNECT_COMPENSATION_FAILED and emits only a fixed diagnostic code.
- Disconnect of a missing row returns CONNECTION_NOT_FOUND and performs no credential-store activity.
- A row with credential_ref equal to null is deleted without credential-store activity.
- Concurrent mutations are globally serialized in arrival order, including operations for different Workspace/source identities that may share a reference.
- Safe-state refresh is requested after success and after a compensated failure.
- Refresh failure does not replace the mutation outcome; it emits SAFE_STATE_REFRESH_FAILED.
- No call/result/diagnostic leaks a credential reference or fake secret.

The runner prints:

~~~text
PASS WORKSPACE-CONNECTION-MANAGEMENT-SERVICE-001
~~~

**Step 2: Run RED**

~~~bash
bash tests/integration/app/run-workspace-connection-management-service-test.sh
~~~

Expected: missing service failure.

**Step 3: Define narrow dependencies**

The service constructor accepts:

~~~ts
interface WorkspaceConnectionManagementDependencies {
  repository: WorkspaceConnectionMutationRepository;
  credential_store: CredentialStore;
  refresh_safe_state: (workspace_id: string) => Promise<void>;
  record_diagnostic: (event: WorkspaceConnectionDiagnosticEvent) => void;
}
~~~

Diagnostic events are a fixed union:

~~~ts
type WorkspaceConnectionDiagnosticEvent =
  | {
      code: "OBSOLETE_CREDENTIAL_CLEANUP_FAILED";
      workspace_id: string;
      source_id: DesktopCredentialManagedSourceId;
    }
  | {
      code: "DISCONNECT_COMPENSATION_FAILED";
      workspace_id: string;
      source_id: DesktopCredentialManagedSourceId;
    }
  | {
      code: "NEW_CREDENTIAL_COMPENSATION_FAILED";
      workspace_id: string;
      source_id: DesktopGoogleConnectionSourceId;
    }
  | {
      code: "SAFE_STATE_REFRESH_FAILED";
      workspace_id: string;
      source_id: DesktopCredentialManagedSourceId;
    };
~~~

Do not pass raw Error objects to record_diagnostic.

**Step 4: Implement serialization and Manage minimally**

Use one internal main-process promise-tail queue for every connection write. Normalize intent first. Fetch the current row, then upsert only safe metadata while copying credential_ref from the fetched row. Never accept the reference from callers.

**Step 5: Implement Disconnect with explicit compensation**

Within the serialized operation:

1. Read and retain the exact row for possible compensation.
2. Delete only that workspace/source row.
3. If the removed credential_ref is null, finish without credential-store activity.
4. Otherwise count global references to the removed credential_ref.
5. If references remain, finish successfully.
6. If the count is zero, delete the encrypted credential.
7. If credential deletion fails, restore the complete retained record through restoreSourceConnection.
8. If restore succeeds, return DISCONNECT_CREDENTIAL_DELETE_FAILED.
9. If restore fails, return DISCONNECT_COMPENSATION_FAILED and emit its fixed diagnostic.

Never delete the credential before the row. Never infer sharing only from source type or active workspace.

**Step 6: Implement non-masking safe refresh**

Call refresh_safe_state in a finally-like path after every mutation that may have changed persisted state, including successfully compensated failure. Catch refresh errors, emit SAFE_STATE_REFRESH_FAILED, and retain the primary result/error.

**Step 7: Run GREEN and commit**

~~~bash
bash tests/integration/app/run-workspace-connection-management-service-test.sh
npx tsc --noEmit
git diff --check
git add src/main/app/workspace-connection-management-service.ts tests/integration/app/workspace-connection-management-service.integration.cjs tests/integration/app/run-workspace-connection-management-service-test.sh
git commit -m "feat: add workspace connection mutation service"
~~~

## Phase B: Main-owned Google OAuth connection management

### Task 4: Separate Google OAuth acquisition from connection publication

**Files:**

- Create: src/main/sources/google-api/google-oauth-credential-acquirer.ts
- Modify: src/main/sources/google-api/google-auth.ts
- Modify: src/main/app/google-api-electron-composition.ts
- Modify: tests/integration/google-api/google-credential-composition.integration.cjs
- Create: tests/integration/google-api/google-oauth-credential-acquirer.integration.cjs
- Create: tests/integration/google-api/run-google-oauth-credential-acquirer-test.sh

**Step 1: Write failing acquirer tests**

Cover without network calls:

- Search Console requests the existing Search Console scope set.
- Ads and Keyword Planner request the existing Ads scope set.
- System-browser/loopback flow remains main-owned.
- Missing application configuration fails with CONNECTION_CONFIGURATION_UNAVAILABLE before opening a browser, loopback server, token exchange, credential write, or repository mutation.
- Successful acquisition writes the new encrypted bundle and returns only an opaque credential reference to the service.
- A credential-store write failure returns CREDENTIAL_PERSISTENCE_FAILED.
- The acquirer has no repository dependency and cannot publish a connection row.
- Stored bundles include the granted scopes required to assess future sharing compatibility.
- Existing legacy bundles without stored scopes remain readable by the runtime but are not assumed compatible for automatic sibling reuse.

The runner prints:

~~~text
PASS GOOGLE-OAUTH-CREDENTIAL-ACQUIRER-001
~~~

**Step 2: Run RED**

~~~bash
bash tests/integration/google-api/run-google-oauth-credential-acquirer-test.sh
~~~

Expected: missing acquirer and scope-persistence assertions.

**Step 3: Introduce exact acquisition contracts**

Define:

~~~ts
export interface GoogleOAuthApplicationConfiguration {
  client_id: string;
  client_secret?: string;
  developer_token?: string;
}

export interface GoogleOAuthAcquisitionInput {
  workspace_id: string;
  source_id: DesktopGoogleConnectionSourceId;
  application_configuration: GoogleOAuthApplicationConfiguration;
}

export interface AcquiredGoogleCredential {
  credential_ref: string;
  granted_scopes: readonly string[];
}

export interface GoogleOAuthCredentialAcquirer {
  acquire(input: GoogleOAuthAcquisitionInput): Promise<AcquiredGoogleCredential>;
  readApplicationConfiguration(
    existing_credential_ref?: string,
  ): Promise<GoogleOAuthApplicationConfiguration | null>;
  isCompatible(
    credential_ref: string,
    required_scopes: readonly string[],
  ): Promise<boolean>;
}
~~~

readApplicationConfiguration may derive client application configuration from an existing encrypted Google bundle for reconnect. It must never return it across IPC or renderer boundaries.

**Step 4: Extract acquisition without changing provider behavior**

Move the system-browser, loopback, token exchange, bundle creation, and credential-store write into google-oauth-credential-acquirer.ts. Preserve existing manual-action and timeout semantics. Add granted_scopes to new encrypted bundles. Keep optional client_secret and developer_token inside the main-owned application configuration and encrypted bundle only.

The normal packaged application must use a configuration provider that returns null when no approved main-owned Google application configuration exists. Do not introduce environment variables, command-line secret flags, renderer input, clipboard input, or a new settings store as normal product behavior. Deterministic success tests inject a fake configuration; reconnect may reuse configuration already present in the existing encrypted bundle.

**Step 5: Make legacy bootstrap cleanup globally reference-aware**

Keep guarded/live bootstrap compatibility, but route its credential acquisition through the new acquirer. Before deleting a replaced credential, call countSourceConnectionsByCredentialRef after publication. Delete only at global count zero. If cleanup fails after successful publication, retain the successful connection and report a fixed cleanup warning/diagnostic rather than rolling it back.

**Step 6: Run focused and existing Google regressions**

~~~bash
bash tests/integration/google-api/run-google-oauth-credential-acquirer-test.sh
bash tests/integration/google-api/run-google-credential-composition-test.sh
npx tsc --noEmit
git diff --check
~~~

Expected both PASS markers and no live calls.

**Step 7: Commit**

~~~bash
git add src/main/sources/google-api/google-oauth-credential-acquirer.ts src/main/sources/google-api/google-auth.ts src/main/app/google-api-electron-composition.ts tests/integration/google-api/google-credential-composition.integration.cjs tests/integration/google-api/google-oauth-credential-acquirer.integration.cjs tests/integration/google-api/run-google-oauth-credential-acquirer-test.sh
git commit -m "refactor: separate google oauth credential acquisition"
~~~

### Task 5: Add Google Connect and Reconnect orchestration

**Files:**

- Modify: src/main/app/workspace-connection-management-service.ts
- Create: tests/integration/google-api/google-workspace-connection-management.integration.cjs
- Create: tests/integration/google-api/run-google-workspace-connection-management-test.sh

**Step 1: Write the complete RED matrix**

Use deterministic fakes for OAuth, repository, credential storage, clock, and refresh:

Connect:

- Search Console uses Search Console scopes and publishes one source row only after credential persistence succeeds.
- Ads and Keyword Planner use Ads scopes.
- When a same-workspace Ads/Keyword Planner sibling has a scope-compatible credential, Connect reuses that reference and performs no OAuth acquisition.
- A legacy or scope-incompatible sibling reference is not reused.
- Missing configuration fails closed with no browser/acquirer side effect and no persisted mutation.
- Row publication failure after acquisition deletes the newly created credential when its global reference count is zero.
- Cleanup failure after publication failure produces CONNECTION_PERSISTENCE_FAILED plus NEW_CREDENTIAL_COMPENSATION_FAILED, never secret data.

Reconnect:

- Search Console rebinds only its exact row.
- When the selected Ads/Keyword Planner row shares an old credential with its same-workspace sibling and that sibling is in the approved shared family, both rows atomically rebind to the new reference.
- A different workspace that shares the old reference is not rebound.
- The old credential is deleted only after rebind and only when the global reference count becomes zero.
- Rebind failure deletes the newly acquired credential if unreferenced and leaves old rows unchanged.
- Old-credential cleanup failure after successful rebind returns SUCCEEDED_WITH_CLEANUP_WARNING and emits the fixed OBSOLETE_CREDENTIAL_CLEANUP_FAILED diagnostic only in main.
- Reconnect preserves existing safe metadata when metadata is omitted; supplied metadata is strictly normalized.
- Every result and diagnostic remains secret-free.
- Readiness refresh runs after each possible state change and cannot mask the primary result.

The runner prints:

~~~text
PASS GOOGLE-WORKSPACE-CONNECTION-MANAGEMENT-001
~~~

**Step 2: Run RED**

~~~bash
bash tests/integration/google-api/run-google-workspace-connection-management-test.sh
~~~

Expected: missing Connect/Reconnect service behavior.

**Step 3: Implement Connect**

Within the serialized service operation:

First extend WorkspaceConnectionManagementDependencies with google_credential_acquirer: GoogleOAuthCredentialAcquirer. Keep this provider-specific port in the main/app service dependency surface; do not import it into source-neutral Core.

1. Validate source and metadata.
2. Reject an already-connected target with a fixed safe error rather than overwriting it implicitly.
3. For Ads/Keyword Planner, inspect the same-workspace sibling row and ask isCompatible for the exact required scopes.
4. If compatible, publish the new row using the sibling credential_ref.
5. Otherwise resolve main-owned application configuration before any browser action.
6. Acquire and persist a new credential.
7. Publish the row with the main-generated credential_ref.
8. If publication fails, count global references and delete the new credential only at zero.
9. Refresh the safe read state.

Do not return the credential reference.

**Step 4: Implement Reconnect and shared-family rebind**

Within the serialized operation:

1. Require an existing target row.
2. Resolve application configuration from the existing encrypted bundle or the main-owned provider.
3. Acquire/persist the replacement credential.
4. Determine the rebind set: the target plus only the same-workspace Ads/Keyword Planner sibling that currently has the exact same old reference.
5. Atomically rebind that exact set with expected_credential_ref.
6. On rebind failure, delete the replacement only if globally unreferenced.
7. After successful rebind, delete the old credential only if global count is zero.
8. Convert old-credential cleanup failure into SUCCEEDED_WITH_CLEANUP_WARNING and a fixed diagnostic.
9. Refresh safe state.

Never broaden the rebind set from a source-family assumption alone. The exact old reference match is mandatory.

**Step 5: Run GREEN and focused regressions**

~~~bash
bash tests/integration/google-api/run-google-workspace-connection-management-test.sh
bash tests/integration/app/run-workspace-connection-management-service-test.sh
bash tests/integration/sqlite/run-workspace-connection-mutations-test.sh
bash tests/integration/google-api/run-google-credential-composition-test.sh
npx tsc --noEmit
git diff --check
~~~

**Step 6: Commit**

~~~bash
git add src/main/app/workspace-connection-management-service.ts tests/integration/google-api/google-workspace-connection-management.integration.cjs tests/integration/google-api/run-google-workspace-connection-management-test.sh
git commit -m "feat: add google workspace connection mutations"
~~~

### Task 6: Add trusted write IPC and preload methods without changing the read path

**Files:**

- Create: src/main/app/desktop-connection-write-ipc.ts
- Modify: src/shared/application-info.ts
- Modify: src/preload.ts
- Create: tests/integration/app/desktop-connection-write-main-ipc.integration.cjs
- Create: tests/integration/app/desktop-connection-write-ipc.integration.cjs
- Create: tests/integration/app/run-desktop-connection-write-main-ipc-test.sh
- Create: tests/integration/app/run-desktop-connection-write-ipc-test.sh
- Verify unchanged: src/main/app/desktop-connection-ipc.ts

**Step 1: Write failing main-handler tests**

Register four dedicated channels:

~~~text
desktop:connection:manage
desktop:connection:disconnect
desktop:connection:connect-google
desktop:connection:reconnect-google
~~~

For each handler assert:

- Trusted sender verification runs before intent validation or service invocation.
- Untrusted senders receive the existing safe trusted-IPC rejection behavior.
- Unknown top-level or metadata fields are rejected.
- credential_ref and every secret-shaped field are rejected.
- Google channels reject SerpApi.
- Manage rejects SerpApi.
- Disconnect accepts SerpApi because it requires no secret ingress.
- Service results/errors are passed only through their safe shared shapes.
- No provider error, stack, credential reference, or secret appears in serialized output.

Print:

~~~text
PASS DESKTOP-CONNECTION-WRITE-MAIN-IPC-001
~~~

**Step 2: Write failing preload/static-boundary tests**

Assert the preload exposes exactly these additional methods:

~~~ts
manageDesktopWorkspaceConnection(intent: ManageWorkspaceConnectionIntent)
disconnectDesktopWorkspaceConnection(intent: DisconnectWorkspaceConnectionIntent)
connectGoogleDesktopWorkspaceConnection(intent: ConnectGoogleWorkspaceConnectionIntent)
reconnectGoogleDesktopWorkspaceConnection(intent: ReconnectGoogleWorkspaceConnectionIntent)
~~~

Also assert:

- getDesktopWorkspaceConnections remains present and its return type is unchanged.
- No generic invoke/channel method is exposed.
- No method accepts credential_ref or a raw secret string.
- Source scans find no clipboard read in the connection write path.

Print:

~~~text
PASS DESKTOP-CONNECTION-WRITE-IPC-001
~~~

**Step 3: Run both RED tests**

~~~bash
bash tests/integration/app/run-desktop-connection-write-main-ipc-test.sh
bash tests/integration/app/run-desktop-connection-write-ipc-test.sh
~~~

Expected: missing channels/methods.

**Step 4: Implement handlers and preload surface**

desktop-connection-write-ipc.ts owns registration and strict validation before calling WorkspaceConnectionManagementService. Reuse the project's trusted-sender guard pattern. Extend DesktopApi in application-info.ts and contextBridge exposure in preload.ts with only the four typed methods.

Do not edit DESKTOP_CONNECTIONS, DesktopWorkspaceConnectionView, getDesktopWorkspaceConnections, or desktop-connection-ipc.ts.

**Step 5: Run write and read regressions**

~~~bash
bash tests/integration/app/run-desktop-connection-write-main-ipc-test.sh
bash tests/integration/app/run-desktop-connection-write-ipc-test.sh
bash tests/integration/app/run-desktop-connection-main-ipc-test.sh
bash tests/integration/app/run-desktop-connection-ipc-test.sh
npx tsc --noEmit
git diff --check
~~~

**Step 6: Commit**

~~~bash
git add src/main/app/desktop-connection-write-ipc.ts src/shared/application-info.ts src/preload.ts tests/integration/app/desktop-connection-write-main-ipc.integration.cjs tests/integration/app/desktop-connection-write-ipc.integration.cjs tests/integration/app/run-desktop-connection-write-main-ipc-test.sh tests/integration/app/run-desktop-connection-write-ipc-test.sh
git commit -m "feat: expose safe workspace connection write ipc"
~~~

### Task 7: Compose the privileged service in the Electron main process

**Files:**

- Modify: src/main.ts
- Modify: src/main/app/google-api-electron-composition.ts
- Create: tests/integration/app/desktop-connection-write-composition.integration.cjs
- Create: tests/integration/app/run-desktop-connection-write-composition-test.sh

**Step 1: Write failing composition/source-boundary tests**

Assert:

- The service receives the existing StateRepository and ElectronSafeStorageCredentialStore instances.
- The Google acquirer receives only main-owned system-browser/loopback dependencies.
- The production Google application-configuration provider returns unavailable/null until an approved main-owned configuration exists.
- Existing encrypted Google bundle configuration can support reconnect without crossing IPC.
- refresh_safe_state calls DesktopMultiSourceController.getWorkspaceConnections with the affected workspace.
- Diagnostics contain only fixed event code, workspace_id, and source_id.
- All four write handlers register beside the unchanged read handler.
- No renderer, preload, shared intent, or diagnostic type imports Electron safeStorage bundle internals.
- No clipboard API, process.env Google secret, CLI secret option, or SerpApi provisioning path is introduced.

Print:

~~~text
PASS DESKTOP-CONNECTION-WRITE-COMPOSITION-001
~~~

**Step 2: Run RED**

~~~bash
bash tests/integration/app/run-desktop-connection-write-composition-test.sh
~~~

Expected: missing production composition.

**Step 3: Add minimal composition**

After the existing repository, credential store, and DesktopMultiSourceController are created:

1. Construct the Google OAuth credential acquirer using the existing Electron external-browser composition.
2. Provide a normal-app configuration resolver that returns null; allow reconnect lookup only inside the acquirer from the existing encrypted bundle.
3. Construct WorkspaceConnectionManagementService with the same repository/store instances.
4. Implement refresh_safe_state by awaiting controller.getWorkspaceConnections(workspace_id); do not cache or expose its output in the service.
5. Supply a small main-process diagnostic callback that writes only the fixed event object. Do not attach it to run-scoped StructuredLogger records and do not include raw causes or credential references.
6. Register the four trusted write handlers.
7. Leave the existing DESKTOP_CONNECTIONS registration unchanged.

**Step 4: Run GREEN plus composition regressions**

~~~bash
bash tests/integration/app/run-desktop-connection-write-composition-test.sh
bash tests/integration/app/run-desktop-connection-main-ipc-test.sh
bash tests/integration/google-api/run-google-credential-composition-test.sh
npx tsc --noEmit
npm run lint
git diff --check
~~~

**Step 5: Commit**

~~~bash
git add src/main.ts src/main/app/google-api-electron-composition.ts tests/integration/app/desktop-connection-write-composition.integration.cjs tests/integration/app/run-desktop-connection-write-composition-test.sh
git commit -m "feat: compose workspace connection write service"
~~~

### Task 8: Add the bounded Workspace connection management UI

**Files:**

- Modify: src/DesktopMultiSourceView.tsx
- Modify: src/index.css
- Modify: tests/integration/app/desktop-ui-smoke.integration.cjs

**Step 1: Extend the deterministic UI smoke test first**

Use the existing malicious read fixture that includes extra credential_ref and secret fields. Assert those values never render. Exercise these exact states/actions:

- Google Search Console AVAILABLE renders Manage and Disconnect.
- Google Ads MISSING renders Reconnect and Disconnect.
- Keyword Planner NOT_CONFIGURED renders Connect.
- SerpApi AVAILABLE renders Disconnect plus text explaining secure provisioning is a separate approved flow.
- SerpApi never renders Connect, Reconnect, Manage, API-key input, or clipboard action.
- Metadata fields are local renderer state only and match the source-specific safe schema.
- No metadata field is prepopulated from the safe read payload, because that payload intentionally contains no metadata.
- Manage invokes only manageDesktopWorkspaceConnection.
- Connect/Reconnect invoke only their dedicated Google methods.
- Disconnect invokes only disconnectDesktopWorkspaceConnection.
- Every mutation path, including safe failure and cleanup warning, calls getDesktopWorkspaceConnections in a finally path and replaces displayed connection state with that response.
- Safe fixed errors and cleanup warnings render without raw error text.
- Buttons disable while their row mutation is pending and cannot double-submit.

Keep the existing UI marker:

~~~text
PASS DESKTOP-UI-001
~~~

**Step 2: Run RED**

~~~bash
bash tests/integration/app/run-desktop-ui-smoke-test.sh
~~~

Expected: missing actions/method invocations, while existing safe-read assertions remain green.

**Step 3: Implement minimal local UI state**

In src/DesktopMultiSourceView.tsx:

- Keep the existing connection array sourced only from getDesktopWorkspaceConnections.
- Add local per-source safe metadata draft state.
- Render site_url for Search Console.
- Render customer_id and optional login_customer_id for Ads/Keyword Planner.
- Do not render a secret input.
- Do not attempt to reconstruct metadata from read state.
- Route each action to its dedicated typed preload method.
- In finally, call the existing safe read method and update the existing connection presentation.
- Show only shared fixed error codes mapped to user-facing copy.
- Show a non-fatal cleanup warning for SUCCEEDED_WITH_CLEANUP_WARNING.
- Add narrowly scoped styles; do not redesign the Workspace page.

**Step 4: Run UI GREEN and read-path regressions**

~~~bash
bash tests/integration/app/run-desktop-ui-smoke-test.sh
bash tests/integration/app/run-desktop-connection-ipc-test.sh
bash tests/integration/app/run-desktop-connection-main-ipc-test.sh
npx tsc --noEmit
npm run lint
git diff --check
~~~

**Step 5: Commit**

~~~bash
git add src/DesktopMultiSourceView.tsx src/index.css tests/integration/app/desktop-ui-smoke.integration.cjs
git commit -m "feat: add workspace connection management actions"
~~~

### Task 9: Wire deterministic gates and run full verification

**Files:**

- Modify: package.json
- Modify: tests/integration/release/run-release-gate.sh

**Step 1: Add explicit package scripts**

Add these exact package.json entries:

~~~json
"test:m2:connection-mutations": "bash tests/integration/sqlite/run-workspace-connection-mutations-test.sh",
"test:m3:google-oauth-acquirer": "bash tests/integration/google-api/run-google-oauth-credential-acquirer-test.sh",
"test:m3:google-connection-management": "bash tests/integration/google-api/run-google-workspace-connection-management-test.sh",
"test:m5:connection-metadata": "bash tests/integration/app/run-workspace-connection-metadata-test.sh",
"test:m5:connection-management-service": "bash tests/integration/app/run-workspace-connection-management-service-test.sh",
"test:m5:connection-write-main-ipc": "bash tests/integration/app/run-desktop-connection-write-main-ipc-test.sh",
"test:m5:connection-write-ipc": "bash tests/integration/app/run-desktop-connection-write-ipc-test.sh",
"test:m5:connection-write-composition": "bash tests/integration/app/run-desktop-connection-write-composition-test.sh"
~~~

Keep all existing script names unchanged.

**Step 2: Add the new deterministic runners to the release gate**

Insert the runners in dependency order:

1. workspace connection mutations
2. connection metadata
3. Google OAuth acquirer
4. connection management service
5. Google workspace connection management
6. write main IPC
7. write preload IPC
8. write composition
9. existing desktop UI smoke

Use Bash 3.2-compatible syntax. Do not add live-provider execution.

**Step 3: Run the focused suite as one coherent batch**

~~~bash
npm run test:m2:connection-mutations
npm run test:m3:google-oauth-acquirer
npm run test:m3:google-connection-management
npm run test:m5:connection-metadata
npm run test:m5:connection-management-service
npm run test:m5:connection-write-main-ipc
npm run test:m5:connection-write-ipc
npm run test:m5:connection-write-composition
npm run test:m5:desktop-ui
~~~

Expected: every named PASS marker, with no network access.

**Step 4: Run static and full deterministic verification**

~~~bash
npx tsc --noEmit
npm run lint
git diff --check
npm run test:release:gate
npm run package
~~~

Record exact command results. Do not claim PASS for a command that did not complete successfully.

**Step 5: Review the implementation range**

Review from the approved design checkpoint:

~~~bash
git diff --stat 89368053a39f34527b51236d0319fe5afaebb339..HEAD
git diff 89368053a39f34527b51236d0319fe5afaebb339..HEAD -- src tests package.json
~~~

Re-evaluate every Review Focus item and scan for credential_ref crossing renderer boundaries, raw Error serialization, clipboard use, SerpApi provisioning, schema edits, and unrelated refactors.

**Step 6: Commit gate wiring**

~~~bash
git add package.json tests/integration/release/run-release-gate.sh
git commit -m "test: gate workspace connection writes"
~~~

### Task 10: Close the technical slice in canonical documentation

**Files:**

- Modify: PROJECT_HANDOFF.md
- Modify: ARCHITECTURE.md
- Modify: DATA_CONTRACTS.md
- Modify: TEST_STRATEGY.md
- Audit and modify only if the verified implementation changes their canonical claims: PROJECT_SPEC.md, VALIDATION_SPEC.md, SOURCE_MODULE_GUIDE.md, DECISIONS.md
- Never touch: CODEX_HANDOFF_CURRENT.md
- Never touch: PROJECT_HANDOFF.pre-20260820.md

**Step 1: Update only verified claims**

Document:

- WorkspaceConnectionManagementService as the privileged write boundary.
- Exact safe intent/result contracts and unchanged safe read payload.
- Schema-v8 delete/count/atomic-rebind semantics.
- Global credential reference counting and Ads/Keyword Planner same-workspace shared-rebind rule.
- Disconnect and Connect/Reconnect compensation order.
- Main-owned Google OAuth acquisition and unavailable normal-app first-connect configuration until separately approved.
- New deterministic test markers and actual verification results.
- SerpApi provisioning remains blocked on the secure secret-ingress decision.
- UXH3 remains unstarted.

Do not describe a test or package run as passed until it has actually passed.

**Step 2: Run documentation and final repository checks**

~~~bash
git diff --check
npm run test:release:gate
git status --short
~~~

If production code has not changed since Task 9 package verification, do not rerun package solely for prose edits. Record that package passed at the technical checkpoint and release gate passed again after docs.

**Step 3: Commit documentation separately**

~~~bash
git add PROJECT_HANDOFF.md ARCHITECTURE.md DATA_CONTRACTS.md TEST_STRATEGY.md
git diff --cached --name-only
git commit -m "docs: close ux workspace connection writes"
~~~

If the audit proves that PROJECT_SPEC.md, VALIDATION_SPEC.md, SOURCE_MODULE_GUIDE.md, or DECISIONS.md needs a canonical claim change, add only that individually justified file before inspecting the staged list. Do not stage an audited-but-unchanged or unrelated document. Confirm the protected historical files are absent from the staged list.

**Step 4: Final verification and handoff**

~~~bash
git log -2 --oneline
git status --short
git diff --check
~~~

Expected final status: tracked tree clean; only CODEX_HANDOFF_CURRENT.md and PROJECT_HANDOFF.pre-20260820.md remain untracked.

## Phase C decision boundary: secure secret ingress spike

After UXH2 write-side foundation and Google OAuth are complete, stop. Do not implement SerpApi provisioning or a generic SecretIngressPort in this plan.

A separately approved, small macOS secure-ingress spike must compare with repository and platform evidence:

1. A main-owned/native secure input prompt or a small OS-native helper.
2. An explicit external secure provisioning command as fallback.
3. Clipboard only as a last resort, with documented reasons the safer options are unsuitable.

The spike must assess secret lifetime, process and renderer visibility, cancellation/failure cleanup, accessibility, packaging/signing/notarization, deterministic testability, and the effect on the user's existing clipboard. Its result is a new approval gate, not an automatic production implementation.
