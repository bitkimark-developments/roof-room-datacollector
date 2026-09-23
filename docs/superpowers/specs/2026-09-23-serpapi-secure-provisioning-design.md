# UXH2 SerpApi Secure Provisioning Design

**Status:** Design complete; implementation requires separate explicit approval
**Date:** 2026-09-23
**Milestone:** Post-R1 UX & Operations Hardening / UXH2 Workspace Connections
**Approved direction:** Main-process-owned native masked prompt through `/usr/bin/osascript`

## 1. Purpose

Add one bounded production slice that lets a user provision or replace the SerpApi API key from the Workspace connection surface without the value entering renderer state, ordinary configuration, command arguments, logs, exports, temporary files, or the system clipboard.

The slice stops when a secret-free renderer intent can trigger main-owned native entry, encrypted credential persistence, schema-v8 connection publication, safe readiness reread, and secret-free UI feedback. It does not call SerpApi, validate the key against the provider, collect data, or start UXH3.

## 2. Closed knowledge and constraints

- `DESKTOP_CONNECTIONS` remains unchanged and returns only `source_id`, `credential_status`, and `readiness_status`.
- SQLite remains schema v8. Existing connection upsert, exact rebind, global credential-reference count, deletion, and compensation primitives are sufficient.
- `ElectronSafeStorageCredentialStore` remains the secure persistence boundary; this slice does not redesign it.
- `WorkspaceConnectionManagementService` remains the single serialized connection mutation coordinator.
- The approved ingress mechanism is `/usr/bin/osascript`; external TTY provisioning and a custom native helper remain deferred, and clipboard ingress remains rejected as the normal contract.
- No deterministic test makes a live SerpApi or other provider request.
- JavaScript strings cannot be reliably zeroized. The design minimizes lifetime and copies but makes no false zeroization guarantee.

## 3. Considered service shapes

### Selected: existing mutation service plus a narrow SerpApi credential acquirer

`WorkspaceConnectionManagementService` gains one `provisionSerpApi` operation so SerpApi writes serialize with Manage, Disconnect, and Google mutations. A provider-specific `SerpApiCredentialAcquirer` owns native ingress, structural validation, fresh opaque-reference creation, and secure-store write. It returns only cancellation or a credential reference; plaintext never enters the workspace mutation coordinator.

This mirrors the existing Google credential-acquirer boundary and reuses established publication, rebind, reference-count, cleanup, refresh, diagnostic, and safe-result behavior.

### Rejected: separate SerpApi mutation service

A second mutation service would require a shared lock or allow provisioning to interleave with Disconnect. That duplicates the existing coordinator and weakens the proven serialization boundary.

### Rejected: native ingress adapter writes credentials and connection rows

That would combine OS process control, provider validation, secure storage, and SQLite publication in one adapter. It would be harder to test and would bypass the existing compensation coordinator.

## 4. Architecture and data flow

```text
Workspace button
  → provisionSerpApiDesktopWorkspaceConnection({ workspace_id, source_id: "serpapi" })
  → trusted DESKTOP_CONNECTION_PROVISION_SERPAPI main IPC
  → WorkspaceConnectionManagementService.provisionSerpApi(intent)
  → SerpApiCredentialAcquirer.acquire()
  → SecretIngressPort.requestSecret({ purpose: "SERPAPI_API_KEY" })
  → MacOsascriptSecretIngress
  → ElectronSafeStorageCredentialStore.writeCredential(fresh_ref, secret)
  → schema-v8 upsert or exact SerpApi rebind
  → obsolete-reference cleanup when globally unreferenced
  → existing safe readiness/read-model refresh
  → secret-free mutation response
  → unconditional DESKTOP_CONNECTIONS reread
```

The renderer initiates an action but never supplies prompt text, an API key, a credential reference, a storage location, or arbitrary metadata.

## 5. Secret ingress port

The main/Core port is deliberately small:

```ts
export type SecretIngressPurpose = 'SERPAPI_API_KEY';

export type SecretIngressFailureCode =
  | 'PROCESS_UNAVAILABLE'
  | 'PROCESS_FAILED'
  | 'TIMED_OUT'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'INVALID_OUTPUT';

export type SecretIngressResult =
  | { status: 'SUBMITTED'; secret: string }
  | { status: 'CANCELLED' }
  | { status: 'FAILED'; code: SecretIngressFailureCode };

export interface SecretIngressPort {
  requestSecret(input: {
    purpose: SecretIngressPurpose;
  }): Promise<SecretIngressResult>;
}
```

The purpose is an allowlisted enum, not renderer-controlled display text. The port does not persist, validate with a provider, update SQLite, log, or return UI copy. A fake port can deterministically return submitted, cancelled, or failed results.

## 6. macOS `/usr/bin/osascript` adapter

### 6.1 Process contract

`MacOsascriptSecretIngress` invokes exactly `/usr/bin/osascript` with:

- `shell: false`;
- no filename or `-e` arguments;
- `stdio: ['pipe', 'pipe', 'pipe']`;
- a fixed 120-second timeout;
- a 1024-byte cap applied independently to stdout and stderr;
- a fixed AppleScript program written to child stdin and then closed.

The adapter accepts a `RunOsaScript` function. Production uses `createRunOsaScript(spawnProcess = spawn)`, while deterministic tests inject a fake `spawnProcess`/child stream to prove chunking, byte limits, timeout, kill, and settle-once behavior without opening a prompt.

The local `osascript(1)` contract confirms that a script is read from stdin when no filename or `-e` argument is supplied. Supplying the fixed program through stdin keeps script/prompt text out of the process listing and removes shell/argv quoting as an attack surface. The secret is never part of the AppleScript source: it is typed only after the native prompt appears.

### 6.2 Fixed AppleScript protocol

The adapter owns one non-interpolated program equivalent to:

```applescript
try
  set promptResult to display dialog "Enter the SerpApi API key for RoofRoom." ¬
    default answer "" ¬
    buttons {"Cancel", "Continue"} ¬
    default button "Continue" ¬
    cancel button "Cancel" ¬
    with title "RoofRoom Data Collector" ¬
    with hidden answer
  return "ROOFROOM_SECRET_SUBMITTED:" & (text returned of promptResult)
on error number -128
  return "ROOFROOM_SECRET_CANCELLED"
end try
```

No renderer value is concatenated into this program. Cancellation becomes a fixed stdout sentinel rather than requiring raw stderr parsing. A successful result has one fixed prefix followed by the entered value. The parser removes at most one terminal line ending added by `osascript`; it does not call broad `trim()` on the secret.

### 6.3 Safe result mapping

- Exact cancel sentinel with exit code `0` → `CANCELLED`.
- Exact submitted prefix with exit code `0`, empty stderr, and bounded output → `SUBMITTED`.
- Spawn error → `FAILED/PROCESS_UNAVAILABLE`.
- The enforced timeout aborts the child process and maps to `FAILED/TIMED_OUT`; late process events cannot replace that settled result.
- Non-zero exit or signal → `FAILED/PROCESS_FAILED`.
- Either stream exceeding its cap → terminate child and return `FAILED/OUTPUT_LIMIT_EXCEEDED`.
- Exit `0` with stderr content, an unknown sentinel, duplicate protocol lines, or malformed output → `FAILED/INVALID_OUTPUT`.

Stdout is captured only because it carries the submitted secret. Stderr content is counted and discarded, never retained or logged. Neither buffer, the submitted string, nor a raw child-process error may be interpolated into diagnostics. The process runner restores no clipboard state and creates no file.

## 7. SerpApi credential acquirer

`SerpApiCredentialAcquirer` is the narrowest plaintext scope. It depends on `SecretIngressPort`, `CredentialStore`, and an injectable opaque-reference factory.

```ts
export type SerpApiCredentialAcquisition =
  | { status: 'ACQUIRED'; credential_ref: string }
  | { status: 'CANCELLED' };

export type SerpApiCredentialAcquisitionErrorCode =
  | 'SECRET_INGRESS_FAILED'
  | 'SECRET_INPUT_INVALID'
  | 'CREDENTIAL_PERSISTENCE_FAILED';
```

Acquisition behavior:

1. request purpose `SERPAPI_API_KEY`;
2. return `CANCELLED` unchanged;
3. map every ingress technical failure to the fixed `SECRET_INGRESS_FAILED` code;
4. accept only 1–512 printable ASCII bytes (`0x21`–`0x7e`), with no whitespace or control characters;
5. create a fresh opaque reference in the form `serpapi:<base64url random>`;
6. call `CredentialStore.writeCredential(fresh_ref, secret)`;
7. if that write throws, best-effort delete only the same fresh reference and map the operation to `CREDENTIAL_PERSISTENCE_FAILED`; cleanup failure does not expose a raw error or change the safe code;
8. map reference-generation failure to `CREDENTIAL_PERSISTENCE_FAILED` without a delete attempt;
9. return only `{ status: 'ACQUIRED', credential_ref }` after the write resolves.

The structural check prevents empty, multiline, control-character, oversized, or accidentally padded values. It deliberately does not hardcode a current provider key length or make a network request. It proves input shape, not validity or account ownership.

The submitted string is dropped from local references after the write attempt. This reduces lifetime but is not described as guaranteed memory erasure.

## 8. Workspace provisioning mutation

### 8.1 Intent and response

The only renderer intent is:

```ts
export interface ProvisionSerpApiWorkspaceConnectionIntent {
  workspace_id: string;
  source_id: 'serpapi';
}
```

Exact-key validation rejects every additional field, including `api_key`, `secret`, `credential_ref`, `value`, `prompt`, and metadata.

The existing response envelope is extended with action `PROVISION_SERPAPI` and fixed errors:

```text
SECRET_INGRESS_CANCELLED
SECRET_INGRESS_FAILED
SECRET_INPUT_INVALID
```

Existing persistence codes remain applicable. Cancellation uses `ok: false` with `SECRET_INGRESS_CANCELLED`, `retryable: false`; it is a distinct neutral user outcome, not a technical failure, and UI copy must not describe it as an error. No response carries a secret or reference.

### 8.2 Connect and replacement semantics

`provisionSerpApi` always acquires a fresh reference. It never overwrites an existing credential file.

- If no SerpApi row exists, secure-store write happens first, then schema-v8 upsert publishes `{ source_id: 'serpapi', credential_ref: fresh_ref, safe_metadata: {} }`.
- If a row exists with `credential_ref = null`, the same write-first/upsert path publishes the fresh reference.
- If a row has an old reference, secure-store write happens first, then exact schema-v8 rebind changes only that Workspace's SerpApi row from the expected old reference to the fresh reference.
- After successful rebind, the old reference is deleted only when the global connection reference count is zero.
- Obsolete-reference count/delete failure returns existing `SUCCEEDED_WITH_CLEANUP_WARNING`; the new connection remains authoritative.

The same secret-free action therefore supports initial Connect, missing-key re-provision, and available-key replacement. UI wording changes by current credential status, but the privileged contract does not multiply into three operations.

### 8.3 Failure and compensation matrix

| Event | Persisted result | Safe response |
|---|---|---|
| User cancels | No store or SQLite mutation | `SECRET_INGRESS_CANCELLED` |
| Process cannot launch, times out, or returns malformed output | No store or SQLite mutation | `SECRET_INGRESS_FAILED` |
| Submitted value fails structural check | No store or SQLite mutation | `SECRET_INPUT_INVALID` |
| Fresh secure-store write fails | Existing row/reference untouched; best-effort delete the fresh reference in case the store left partial material | `CREDENTIAL_PERSISTENCE_FAILED` |
| New-row upsert fails after fresh write | Delete fresh credential when globally unreferenced | `CONNECTION_PERSISTENCE_FAILED` |
| Existing-row rebind fails after fresh write | Old row/reference remains; delete fresh credential when unreferenced | `CONNECTION_REBIND_FAILED` |
| Fresh-credential compensation fails | Primary failure remains; fixed redacted diagnostic | Existing primary failure |
| Old credential cleanup fails after committed rebind | New row/reference remains authoritative | `SUCCEEDED_WITH_CLEANUP_WARNING` |
| Safe readiness refresh fails after committed publication | Do not roll back valid connection; record fixed diagnostic; renderer still performs its unconditional reread | Committed success/warning remains |

A process crash between fresh credential write and SQLite publication can leave an encrypted unreferenced credential. This is safer than destroying the old valid credential, but crash-orphan garbage collection is not added in this slice.

## 9. IPC, preload, and UI

Add one channel and one typed preload method:

```text
DESKTOP_CONNECTION_PROVISION_SERPAPI
provisionSerpApiDesktopWorkspaceConnection(intent)
```

The main handler performs trusted-sender validation before intent parsing, normalizes the exact secret-free shape, delegates once, and validates the entire service response. Unknown response fields, secret-shaped keys, raw native output, raw errors, and mismatched source/action fail closed.

The Workspace SerpApi row presents:

- `Provision API key` when `NOT_CONFIGURED`;
- `Replace API key` when `AVAILABLE`;
- `Re-provision API key` when `MISSING`;
- existing `Disconnect` whenever a row exists.

The row contains no secret field. It explains that entry occurs in a native masked prompt. Existing per-row pending/double-submit prevention remains. Every attempt, including cancel and technical failure, finishes with the existing `getDesktopWorkspaceConnections(workspace_id)` reread.

Safe UI copy distinguishes cancellation, prompt failure, invalid structure, secure-store failure, connection publication failure, replacement failure, and cleanup warning without provider/native-process details.

## 10. Readiness and connection state

No new readiness rule is introduced. After row publication:

- present row plus available fresh credential → `credential_status: AVAILABLE`; existing evaluator returns `READY`;
- present row plus unavailable credential → `MISSING` and `CONNECTION_REQUIRED`;
- no row → `NOT_CONFIGURED` and `CONFIGURATION_REQUIRED`.

The mutation response is not a second state model. The existing safe read path remains authoritative.

## 11. Deterministic verification

Tests use generated synthetic values only and never invoke real `/usr/bin/osascript`, Electron `safeStorage`, the system clipboard, or SerpApi.

Required proof layers:

1. adapter contract with injected process runner: fixed executable, empty argv, script over stdin, `shell:false`, bounded streams, success/cancel/failure/timeout/overflow mapping, and no logging;
2. acquirer contract with fake ingress/store/ref factory: structural validation, secure write, cancellation, safe failures, and no secret in returned/error values;
3. workspace service: initial publish, null-ref repair, fresh-ref replacement, compensation, cleanup warning, refresh behavior, serialization, and no leaks;
4. trusted main IPC and preload: exact intent, trust-first validation, unsafe output rejection, no secret-bearing method or field;
5. production composition: real macOS adapter reaches main service, fake injection remains possible in tests, and no port crosses preload;
6. renderer smoke: status-specific button labels, no secret input, neutral cancel copy, pending guard, and unconditional safe reread;
7. security regression scan: the test-only marker is absent from renderer payloads, mutation responses, diagnostics/log captures, ordinary config, and any export artifact touched by the fixture.

No deterministic test calls a live provider or validates whether a key works.

## 12. Packaged-app acceptance boundary

After deterministic implementation and packaging pass, a separately explicit limited acceptance run must verify on the supported macOS arm64 host:

- packaged app launches `/usr/bin/osascript` and the prompt is visible/focused;
- masking, keyboard navigation, Cancel, and timeout behave as designed;
- a synthetic non-production value reaches real `safeStorage` and produces safe connection/readiness state;
- the synthetic value does not appear in application logs or renderer state;
- replacement retains the old usable binding until new persistence succeeds;
- the behavior is repeated under the intended Developer ID, hardened-runtime, and notarization configuration when that distribution configuration exists.

This acceptance is not part of deterministic regression and makes no SerpApi request.

## 13. Architecture decision

Candidate A is a lasting main-process security and platform decision, not merely a local SerpApi implementation detail. It therefore warrants ADR-066. The ADR records the approved `/usr/bin/osascript` direction and the renderer/clipboard boundaries; this spec owns the detailed process protocol and mutation behavior.

Candidate B remains a deferred operator/recovery option. Clipboard is not a production ingress contract. A custom native helper remains deferred unless packaged acceptance produces contradictory evidence.

## 14. Acceptance criteria

- Renderer intent contains exactly `workspace_id` and `source_id: 'serpapi'`.
- No API key or credential reference crosses preload or renderer IPC.
- The native adapter uses `/usr/bin/osascript`, no shell, no script argv, stdin program delivery, bounded private pipes, fixed sentinels, timeout, and safe error mapping.
- Plaintext is scoped to the adapter/acquirer and written only through the existing credential store.
- Initial provisioning publishes only after successful secure-store write.
- Replacement uses a fresh reference and preserves the old binding until exact rebind succeeds.
- Every partial publication failure compensates where possible and returns a fixed secret-free result.
- Existing global reference-count rules protect any still-referenced old credential.
- Readiness remains separate and is refreshed through the existing safe read path.
- Deterministic tests make no native prompt or provider call and prove the synthetic marker does not leak.
- Schema remains v8; existing read contract remains unchanged.
- Full deterministic gate and package run pass after implementation; packaged native-prompt acceptance remains separately explicit.

## 15. Non-goals and stop point

This slice does not add:

- SerpApi provider validation, account lookup, quota inspection, or collection;
- a renderer secret field or generic credential manager;
- Google client-secret/developer-token ingress;
- clipboard or external CLI provisioning;
- a custom native helper;
- schema v9, credential-reference tables, or crash-orphan garbage collection;
- credential export/import, reveal, copy, or recovery;
- UXH3 or changes to freshness, execution, validation, raw evidence, provenance, or export.

Implementation stops when secure SerpApi provisioning/replacement and its safe Workspace presentation pass deterministic regression and packaging. It must not proceed into a live SerpApi request or collection behavior.
