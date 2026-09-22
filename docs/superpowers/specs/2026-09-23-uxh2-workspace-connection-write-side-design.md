# UXH2 Workspace Connection Write-Side Design

**Status:** Written design awaiting review
**Date:** 2026-09-23
**Milestone:** Post-R1 UX & Operations Hardening
**Scope:** UXH2 Workspace Connections only

## 1. Purpose

Add privileged Workspace connection mutation without weakening the verified safe connection read path or committing the product to an unproven secret-entry mechanism.

The work is deliberately split into three boundaries:

1. a credential-secret-ingress-free mutation foundation;
2. Google OAuth Connect/Reconnect through the existing main-owned system-browser model;
3. a separate secure secret-ingress spike and decision gate before SerpApi or any other user-entered secret is provisioned in production.

UXH3 and later hardening slices remain out of scope.

## 2. Locked constraints

- `DESKTOP_CONNECTIONS` remains a read-only contract with exactly `source_id`, `credential_status`, and `readiness_status`.
- `credential_ref` and credential material never enter ordinary renderer state.
- OAuth refresh tokens, API keys, developer tokens, client secrets, passwords, cookies, and provider authorization headers remain in main/Core security boundaries.
- SQLite remains schema version 8 unless later failing evidence proves a migration is necessary.
- Google Ads Search Terms and Google Keyword Planner may share a credential reference.
- Disconnect must never blindly delete shared credential material.
- Readiness, freshness, execution, and validation remain separate.
- Deterministic tests make no live provider requests.
- No provider lifecycle, collection lifecycle, raw-evidence, provenance, or export redesign is included.
- Clipboard provisioning is not an approved production contract. It is only a last-resort candidate for the later spike.

## 3. Current evidence

The existing schema-v8 `workspace_source_connections` table already provides one row per `(workspace_id, source_id)` with nullable `credential_ref` and safe JSON metadata. It can support deletion, reference counting, and reference rebinding without a schema change.

`StateRepository` currently provides upsert, get, and list operations. It does not provide connection-row deletion, credential-reference usage counting, or atomic shared-reference rebinding.

`ElectronSafeStorageCredentialStore` provides credential existence, read, write, and delete operations. Credential storage and SQLite are separate persistence systems, so their combined mutations require explicit ordering and compensation rather than a fictitious cross-system transaction.

`bootstrapGoogleOAuth` currently performs OAuth acquisition, credential persistence, source-row upsert, and previous-credential deletion in one provider function. Its previous-credential deletion does not check whether another source row still references the value. The write-side design must replace that unsafe ownership assumption before the normal Workspace UI invokes OAuth mutation.

The existing Google path keeps the OAuth browser, loopback callback, code exchange, refresh token, client secret, and optional developer token in main. The existing normal application has no approved user-secret ingress mechanism for SerpApi and no renderer-safe API-key provisioning path.

## 4. Architecture

### 4.1 Write service

Add a main/Core `WorkspaceConnectionManagementService`. It is the only application service allowed to coordinate connection-row writes with credential-store writes or deletion.

The service depends on narrow ports:

- a connection-mutation repository;
- the existing credential store;
- a Google OAuth credential acquirer for the Google slice;
- the existing safe readiness/read-model reader for post-mutation refresh;
- a mutation serializer so two write operations cannot interleave in one application process.

The service does not own provider collection, Run state, freshness, validation, or export.

### 4.2 Repository boundary

The schema-v8 repository boundary gains operations equivalent to:

- delete one connection by exact Workspace and source identity while returning the removed record;
- count all connection rows that reference one opaque `credential_ref`, across every Workspace;
- atomically rebind an exact allowlisted set of rows from one credential reference to another;
- preserve existing upsert/get/list behavior and safe-metadata validation.

Reference counting is global rather than Workspace-only. An opaque credential must not be deleted while any persisted connection row still references it, even if later code permits deliberate cross-Workspace reuse.

Shared rebinding is limited to rows selected by exact Workspace, source allowlist, and old credential reference. It must not update rows merely because they belong to the same provider.

### 4.3 IPC boundary

New write actions use dedicated trusted IPC channels. They do not overload or change `DESKTOP_CONNECTIONS`.

Every handler:

1. validates the trusted sender first;
2. validates the entire input as unknown data;
3. allowlists the source and action;
4. accepts only source-safe metadata;
5. delegates to `WorkspaceConnectionManagementService`;
6. returns only a safe mutation acknowledgement or a sanitized error.

The safe acknowledgement contains only the requested source, action, and one of `SUCCEEDED` or `SUCCEEDED_WITH_CLEANUP_WARNING`. The warning outcome is reserved for failure to remove obsolete, unreferenced credential material after a new credential-plus-row binding has already committed successfully. It exposes no credential reference, path, secret fragment, provider payload, or raw exception text.

After every completed mutation attempt, including a compensated failure, the renderer rereads state through the existing `getDesktopWorkspaceConnections(workspace_id)` method. Write responses are not a second connection-state model.

## 5. Renderer intent contracts

Renderer intents never contain a credential reference or secret.

The allowed intent families are:

- `MANAGE_METADATA`: Workspace ID, credential-managed source ID, and that source's allowlisted safe metadata;
- `DISCONNECT`: Workspace ID and credential-managed source ID;
- `CONNECT_GOOGLE`: Workspace ID, Google source ID, and allowlisted safe metadata;
- `RECONNECT_GOOGLE`: Workspace ID and Google source ID, with optional updated safe metadata.

No generic arbitrary metadata object is accepted at the trusted handler. Each source has a strict normalizer:

| Source | Renderer-safe metadata |
|---|---|
| Google Search Console | required `site_url` |
| Google Ads Search Terms | required `customer_id`; optional `login_customer_id` |
| Google Keyword Planner | required `customer_id`; optional `login_customer_id` |
| SerpApi | no safe metadata is currently required |

SerpApi Connect/Replace-Key intent is intentionally absent until the secret-ingress decision gate passes.

## 6. Source action semantics

### 6.1 Manage

Manage updates only allowlisted safe metadata and retains the existing credential reference. It requires an existing source connection. It performs no OAuth, secret read, secret write, provider request, or readiness inference.

Invalid metadata fails before persistence. A failed upsert leaves the previous connection row unchanged through the repository's SQLite transaction.

SerpApi has no metadata-only Manage action in this slice. Its future user action is Replace API Key, which is gated on the secret-ingress decision.

### 6.2 Disconnect

Disconnect has the following order:

1. validate Workspace, source, and current row;
2. retain the complete current connection record as compensation state in main memory;
3. delete the exact source row in SQLite;
4. count remaining global references to its credential reference;
5. if another reference exists, finish without touching credential material;
6. if no reference exists, delete the credential material;
7. if last-reference credential deletion fails, restore the removed row from the retained safe record and report a sanitized failure.

If SQLite deletion fails, credential material is untouched. If restoration itself fails, the service reports a distinct sanitized compensation failure and records redacted operational diagnostics; it does not claim success.

A connection row with `credential_ref = NULL` is deleted without credential-store activity.

### 6.3 Google Connect

Google Connect obtains a new OAuth credential only in main and persists it under a new opaque credential reference before publishing a source-row binding.

Google Search Console requests the existing read-only Search Console scope and stores `site_url` as safe metadata.

Google Ads Search Terms and Google Keyword Planner use the Google Ads scope and their source-specific customer metadata. When the sibling Ads/Planner source already has an available credential reference governed by the same Google Ads credential contract, Connect may bind the new source row to that existing reference instead of running duplicate OAuth.

OAuth application configuration, optional client secret, and optional developer-token material are resolved by main-owned configuration/credential boundaries. They are never supplied by renderer intent. If the required main-owned prerequisite is unavailable, Connect fails closed with a safe actionable error and creates no row.

### 6.4 Google Reconnect

Reconnect writes a newly acquired credential under a fresh opaque reference before changing SQLite.

For Search Console, only the exact Search Console row is rebound.

For Ads/Planner, the service atomically rebinds only the rows in the same Workspace that:

- are one of `google-ads-search-terms` or `google-keyword-planner`; and
- reference the exact old credential reference.

This heals the intentionally shared Ads/Planner credential as one unit without sweeping unrelated Google rows.

If the SQLite rebind fails, the service deletes the newly written credential and leaves every old binding intact. Once the rebind commits, the new connection is authoritative. The old credential is deleted only when its global reference count becomes zero.

Failure to clean up an unreferenced old credential after a successful rebind does not roll a working new connection back to a potentially invalid old credential. The operation returns `SUCCEEDED_WITH_CLEANUP_WARNING`, records redacted operational diagnostics, and must not expose the reference or secret. This cleanup condition is distinct from failure to establish the new credential-plus-SQLite binding.

## 7. Compensation model

Credential storage and SQLite cannot commit atomically. The service therefore uses fresh references, ordered publication, and compensating actions.

| Operation | Primary order | Compensation |
|---|---|---|
| Metadata Manage | SQLite transaction only | repository rollback |
| Connect | write fresh credential, then upsert row | delete fresh credential if SQLite fails |
| Shared Reconnect | write fresh credential, then atomic row rebind | delete fresh credential if rebind fails |
| Disconnect with shared ref | delete row, observe remaining references | no credential deletion |
| Disconnect with last ref | delete row, then delete credential | restore removed row if credential deletion fails |

Cleanup of an obsolete unreferenced credential after a successful Connect/Reconnect is post-commit hygiene, not part of the new binding's validity. Cleanup failures are visible operational failures but must not create a row that points to missing new credential material.

All write operations are serialized in the main process. Repository constraints remain the final protection for persisted identity.

## 8. Readiness refresh

The write service does not invent readiness. After success or compensated failure, UI state is refreshed through the existing safe read path:

```text
DesktopMultiSourceController.getWorkspaceConnections(workspace_id)
→ DESKTOP_CONNECTIONS
→ preload getDesktopWorkspaceConnections(workspace_id)
→ Workspace presentation
```

This preserves credential status and readiness as separate values and avoids a competing mutation-response cache.

## 9. Secure secret-ingress spike

SerpApi provisioning and any user-entered Google secret remain blocked until a separate spike produces platform evidence and a reviewed recommendation.

The spike question is:

> On the supported macOS target, how can a user supply a secret to the main/Core credential boundary without the value entering renderer state, command-line arguments, logs, ordinary configuration, temporary files, or unintended global OS state?

The spike compares at least:

1. a main-owned native secure input prompt or a minimal OS-native helper using a secure text control;
2. an explicit external secure provisioning command as a supported fallback;
3. clipboard ingestion only as a last-resort candidate.

Evaluation criteria include:

- whether the secret ever reaches a renderer, shell argument, process listing, environment dump, log, crash report, ordinary file, or clipboard history;
- cancellation and failed-write behavior;
- deterministic testability with an injected fake;
- Apple Silicon compatibility;
- packaged-app inclusion, code signing, hardened runtime, and notarization impact;
- new runtime/dependency and maintenance burden;
- accessibility and understandable user interaction;
- behavior when OS-backed encryption is unavailable;
- safe handoff into `ElectronSafeStorageCredentialStore` without returning credential material.

The spike may describe a future `SecretIngressPort`, but no production implementation, IPC secret parameter, or provider-specific binding is adopted before the spike result is reviewed. Any probe code is throwaway and does not enter the production source tree.

The spike ends with one of these explicit recommendations:

- adopt and test a native main-owned ingress implementation;
- adopt an external secure provisioning command as the supported path;
- reconsider clipboard only with documented evidence that the safer candidates are infeasible and with explicit residual-risk approval;
- block SerpApi UI provisioning if none meets the security contract.

## 10. Deterministic verification requirements

The mutation foundation must prove:

- exact Workspace/source deletion and missing-row failure;
- global reference counts across sources and Workspaces;
- atomic Ads/Planner shared rebinding;
- no deletion of a credential with remaining references;
- restoration after last-reference credential-deletion failure;
- fresh-credential cleanup after SQLite Connect/Reconnect failure;
- safe metadata allowlists and secret-like-field rejection;
- trusted sender and invalid IPC input failures before delegation;
- serialized concurrent mutation behavior;
- readiness reread after success and compensated failure;
- no change to the `DESKTOP_CONNECTIONS` method, channel, or payload;
- absence of credential references and secret sentinel values from renderer DOM, IPC results, logs, snapshots, exports, and validation evidence.

Google OAuth tests use fake loopback, browser-open, token requester, credential store, and repository ports. They make no live Google request and never open a real browser.

The secure-ingress spike has its own probe evidence and decision report. It is not allowed to make a live SerpApi request or become an automated provider test.

At each coherent implementation boundary, run focused tests, relevant regressions, typecheck, lint, `git diff --check`, and the full deterministic release gate. Run packaging/smoke after IPC, preload, native helper, or privileged connection behavior changes.

## 11. Slice and decision boundaries

The approved sequence is:

1. implement and verify the secret-ingress-free mutation foundation;
2. implement and verify Google OAuth Connect/Reconnect through main-owned system-browser orchestration;
3. perform the secure secret-ingress spike;
4. stop for explicit review of the spike recommendation;
5. only after approval, write and execute a separate SerpApi provisioning design/plan.

The foundation and Google slices must not quietly introduce a `SecretIngressPort` implementation, renderer secret field, clipboard dependency, external provisioning command, schema migration, or SerpApi credential mutation.

## 12. Non-goals

- UXH3 task-detail remediation;
- SerpApi API-key provisioning before the spike gate;
- generic credential-manager UI;
- password storage;
- provider calls used to validate credentials during deterministic tests;
- account/property discovery payloads in the renderer;
- OAuth scope expansion beyond the source requirement;
- credential sharing outside the explicit Ads/Planner semantics;
- a new persistence schema or credential-reference table;
- changes to collection, retry, validation, freshness, evidence, or export lifecycles.

## 13. Success criteria

The design is satisfied when Workspace write management can safely update metadata, disconnect one source, and connect/reconnect approved Google sources without renderer secrets; shared Ads/Planner credentials cannot be deleted or partially rebound; failures leave a deterministic recoverable state; the safe read contract remains byte-for-contract compatible; and SerpApi secret ingress remains behind a documented, separately approved platform decision.
