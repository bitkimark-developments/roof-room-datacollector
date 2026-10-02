# RoofRoom Data Collector — Architecture

**Status:** Canonical multi-source architecture
**Scope:** Ownership boundaries, dependency direction, privileged infrastructure, shared lifecycle, and package boundaries

---

## 1. Governing architecture

RoofRoom is one local-first Electron application with independent source modules sharing one source-neutral Core.

```text
Renderer
→ typed preload / IPC
→ Main / Application Core
→ registered source contract
→ Source Module
→ Browser | Official API | File Import | HTTP/XML | Third-party API
```

Google Trends is the reference browser-export source, not the generic architecture.

---

## 2. Process and privilege boundaries

### Renderer

Owns:

- presentation;
- user intent;
- safe status/readiness/coverage display.

Must not own:

- SQLite;
- unrestricted filesystem access;
- provider clients;
- browser automation;
- raw credentials;
- arbitrary shell/network privilege.

### Preload / IPC

Exposes narrow typed allowlisted operations.

Privileged inputs are validated again in main.

Secrets, unrestricted paths, raw provider payloads, and privileged objects do not cross this boundary.

### Main / Core

Owns privileged:

- orchestration;
- persistence;
- storage;
- browser lifecycle;
- API/provider clients;
- file import;
- validation coordination;
- logging/redaction;
- credential access;
- package verification/publication;
- desktop/file opening.

---

## 3. Shared Core responsibilities

Core owns source-neutral behavior:

- Workspace ownership;
- Run / Job / Attempt lifecycle;
- one-active-Run enforcement;
- resume / reconciliation;
- explicit retry and eligible cancellation;
- source registry;
- capability/readiness coordination;
- credential/access boundary;
- freshness evaluation;
- artifact lifecycle and storage;
- provenance;
- validation coordination;
- structured logging;
- accepted-evidence eligibility;
- package/export coordination;
- trusted desktop IPC.

These are responsibilities, not mandatory class names.

Extend existing working components before introducing new abstractions.

---

## 4. Source-module boundary

A source module owns:

- provider/dataset semantics;
- source-specific request/job planning;
- provider interaction;
- parsing/normalization;
- observed-context extraction;
- semantic validation;
- provider-specific operational error mapping;
- source-specific readiness requirements.

A source module must not own:

- a private Run/Attempt lifecycle;
- a parallel database;
- arbitrary storage roots;
- hidden retry loops;
- global credential storage;
- global freshness policy;
- renderer security;
- cross-source business analysis.

Provider-specific selectors, GAQL/resources, worksheet headers, XML shape, SERP fields, and validation semantics stay outside generic Core.

---

## 5. Identity model

Keep separate:

```text
workspace
source
dataset
source mode
acquisition mode
Run
Job
Attempt
artifact
```

A documentation term does not create a persisted enum, field, or migration.

Persisted identity contracts belong in `DATA_CONTRACTS.md`.

---

## 6. Acquisition modes

### `BROWSER_EXPORT`

Core supplies browser lifecycle/storage.

Source owns verified provider UI/export behavior.

Provider security/manual blocks stop safely.

### `OFFICIAL_API`

Core supplies credential boundary and shared lifecycle.

Source owns request construction, pagination/streaming, response mapping, and provider error semantics.

Preserve faithful raw response evidence before normalization where practical.

### `FILE_IMPORT`

Privileged code validates the selected file.

Original bytes are copied into canonical run evidence before parsing.

Extension alone must not determine format/encoding.

### `HTTP_XML`

Bound retrieval to the approved source contract.

Preserve raw response bytes and request/response metadata.

Reject HTML/error content as source XML data.

### `THIRD_PARTY_API`

Use only approved explicit workloads.

Preserve provider response/provenance and separate quota/access from dataset quality.

---

## 7. Shared lifecycle

All acquisition modes participate in:

```text
user intent / due decision / import selection
→ readiness
→ Workspace-scoped Run
→ source-keyed Jobs
→ Attempt
→ acquire/import
→ preserve candidate evidence
→ parse
→ validate
→ accept/warn/reject
→ deterministic normalization where applicable
→ provenance/documentation
→ package eligible evidence
→ export
```

Acquisition success is not validation success.

Raw evidence remains separate from derived artifacts.

---

## 8. Workspace / Run / Job / Attempt

### Workspace

First-class brand/business ownership boundary for Runs.

### Run

One coordinated operation. May contain Jobs from multiple sources.

The database enforces one active Run per Workspace for the implemented active status set.

### Job

Independent execution/resume/retry unit.

Identity within a Run is source-keyed.

Provider-specific fields must not be fabricated for unrelated sources.

### Attempt

Immutable execution history item.

Retry creates a new Attempt and preserves prior evidence.

---

## 9. Persistence and storage

Current persistence baseline is SQLite schema v8.

SQLite owns operational state/references.

Filesystem storage owns raw and derived evidence artifacts.

Current schema includes Workspace, Run/Job/Attempt/artifact/validation state plus Saved Presets, Last Run Settings, and Workspace source connections.

Credential secrets remain outside SQLite.

Freshness is derived rather than stored as a cache table.

Canonical raw evidence uses application-owned storage; Downloads or opened workbooks are downstream conveniences.

---

## 10. Credential and secret boundary

Credential lifecycle is a privileged Core/main-process responsibility.

The renderer receives only safe availability/readiness outcomes.

Production macOS secret ingress may use the main-owned native masked prompt boundary; plaintext exists only transiently in privileged memory and must not be logged, placed in argv, clipboard, temporary files, ordinary config, or renderer state.

Google provider application configuration, OAuth account authorization, Workspace-safe metadata, and SerpApi API-key storage remain separate concerns.

Legacy Developer Token fields are compatibility-only and must not be reactivated as current requirements without an approved contract.

---

## 11. Freshness boundary

Freshness is independent from readiness, execution, and validation.

Implemented conceptual states include:

```text
FRESH
DUE
STALE
IMPORT_NEEDED
ON_DEMAND
UNKNOWN
```

Freshness derives from accepted completed Job history.

It never schedules or starts work by itself.

---

## 12. Validation architecture

Core:

- resolves the validator from persisted Job/source identity;
- invokes generic + source validation;
- persists outcomes/findings;
- transitions artifact acceptance state;
- controls package/export eligibility.

Source validator:

- proves source/dataset/schema/context semantics;
- preserves requested/observed separation;
- validates provider-native metrics/null behavior;
- maps source-specific findings.

Unknown or mismatched source identity fails closed.

Detailed rules belong in `VALIDATION_SPEC.md`.

---

## 13. Desktop architecture

The generalized desktop surface may manage:

- Workspace selection/configuration;
- safe source connections/readiness;
- presets and last-run settings;
- task review/start;
- persisted Run progress;
- resume/retry/manual continuation/cancellation;
- accepted-evidence opening;
- package build/review/open/reveal.

Renderer state is never execution authority.

Main/Core re-resolves authoritative state before privileged actions.

---

## 14. Package architecture

### Production Data Package

Consumes accepted evidence and preserves source separation/provenance.

### Task Packages

A source-neutral assembly layer above accepted Run/Job/Attempt/artifact evidence.

Task package code must not authenticate, acquire, retry, or fabricate missing source evidence.

`ADS_OPTIMIZATION_PACK v1` is implemented through this boundary.

### Blog package

`BLOG_WRITING_PACK v1` is a separate thin single-Run specialization over Production Data Package.

It is not an Ads Task Package.

Both package families publish immutable derived artifacts while raw source evidence remains authoritative in Run storage.

---

## 15. Dependency direction

```text
renderer
→ preload / IPC
→ main application coordination
→ Core interfaces
→ source / storage / validation interfaces

source implementation
→ provider client / browser / parser / importer
```

Core may depend on source interfaces.

Core must not depend on provider-specific semantics.

---

## 16. Testing boundary

Architecture must be deterministically testable without live providers.

Use fake sources, sanitized fixtures, mocks, local files, local HTTP, and deterministic browser substitutes where practical.

Live-provider evidence is explicit and separate.

Test-depth policy belongs in `TEST_STRATEGY.md`.

---

## 17. Extension rule

When a real requirement does not fit the current Core:

1. prove the requirement from live code/provider evidence;
2. add the smallest deterministic failing test;
3. extend the shared contract compatibly;
4. migrate persisted state explicitly if required;
5. preserve existing source behavior;
6. avoid fake provider placeholders;
7. stop at the minimum abstraction needed by current evidence.

---

## 18. Anti-patterns

Do not:

- put provider branches throughout Core;
- treat provider success as validation success;
- overwrite raw evidence during transformation;
- hide retry inside adapters;
- expose secrets to renderer;
- encode freshness as execution;
- encode auth/quota as dataset quality;
- invent cross-source scores;
- make package layers own acquisition;
- generalize unsupported provider modes;
- refactor working architecture for hypothetical reuse.

---

## 19. Governing architecture rule

> **Share lifecycle and privileged infrastructure; keep provider meaning source-specific; preserve evidence boundaries end to end.**
