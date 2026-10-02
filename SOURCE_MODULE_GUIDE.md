# RoofRoom Data Collector — Source Module Guide

**Status:** Canonical source onboarding/integration guide
**Scope:** How a source enters the existing Core without duplicating product, validation, or test authorities

---

## 1. Governing rule

> **Source modules own provider-specific behavior. Shared lifecycle and privileged infrastructure belong to Core.**

Google Trends is a reference integration, not a universal source template.

---

## 2. Scope routing

Release scope belongs in `PROJECT_SPEC.md`.

Current implementation status belongs in `PROJECT_HANDOFF.md`.

Persisted/source-native semantics belong in `DATA_CONTRACTS.md`.

Validation rules belong in `VALIDATION_SPEC.md`.

Do not duplicate those documents here.

---

## 3. Onboarding gate

A new source or materially different provider mode enters through:

```text
feasibility/acquisition proof
→ source + dataset + mode contract
→ explicit implementation approval
→ one vertical slice
→ deterministic regression
→ limited live acceptance where required
```

Old roadmap references do not create implementation permission.

---

## 4. Identity model

Keep separate:

```text
source identity
dataset identity
source mode
acquisition mode
job identity
```

Do not invent persisted IDs/enums/fields before inspecting live contracts.

---

## 5. Source responsibilities

A source may own:

- capability/readiness declaration;
- source-specific Job context;
- browser/API/file/HTTP interaction;
- provider request construction/pagination;
- raw response/file capture;
- parsing/normalization;
- observed-context extraction;
- semantic validation;
- provider-specific error mapping.

A source must not:

- create a parallel Run/Attempt lifecycle;
- create a private state database;
- own arbitrary storage roots;
- overwrite raw evidence;
- bypass Core validation acceptance;
- hide retries;
- expose secrets;
- convert missing to zero;
- generate analysis/recommendations.

---

## 6. Core services to reuse

Reuse existing Core behavior for:

- Workspace / Run / Job / Attempt;
- source registry;
- resume/reconciliation/retry/cancellation;
- artifact lifecycle/storage;
- provenance;
- validation coordination;
- logging;
- credential access;
- readiness/freshness coordination;
- accepted-evidence/package/export eligibility;
- desktop/IPC.

If the Core cannot truthfully represent a real source requirement, evolve the shared contract through a separate tested compatibility slice.

Never fabricate provider placeholders to fit an old Core assumption.

---

## 7. Acquisition patterns

### `BROWSER_EXPORT`

Source owns provider interaction/export semantics.

Core owns browser lifecycle, storage, and shared execution state.

### `OFFICIAL_API`

Source owns request/response/provider semantics.

Core owns credential boundary and shared lifecycle.

Preserve faithful raw provider response evidence before normalization where practical.

### `FILE_IMPORT`

Privileged code validates the selected path and preserves original bytes before parsing.

Detect format from evidence, not extension alone.

### `HTTP_XML`

Keep retrieval bounded to the approved source contract.

Preserve raw response and request/response metadata.

### `THIRD_PARTY_API`

Use explicit approved workloads and preserve provider evidence.

Quota/access remains operational state.

---

## 8. Readiness / freshness / execution / validation

Keep these domains separate:

- readiness — can the source run?
- freshness — should work run?
- execution — what happened in this Attempt?
- validation — can the evidence be trusted?

Do not encode one domain as another.

---

## 9. Raw evidence and provenance

A successful acquisition/import should preserve faithful source evidence before normalization.

Accepted evidence must remain traceable through source, Run, Job, Attempt, request/observation context, raw artifact, checksum where available, and validation.

Exact fields belong in `DATA_CONTRACTS.md`.

---

## 10. Validation integration

Source validator receives trusted Core context plus source-specific requested/candidate evidence.

It returns deterministic findings/outcomes.

Core owns the final artifact acceptance transition.

Source validation must not:

- invent observed values;
- tolerate unknown schema silently;
- convert operational failure into dataset quality;
- bypass package/export eligibility.

---

## 11. Error and retry mapping

Map failure at the narrowest truthful boundary:

- configuration/readiness;
- authentication/access/manual;
- quota/rate limit;
- provider/network;
- browser;
- download/import;
- parse/schema;
- semantic validation;
- persistence/storage.

Retryability is policy, not optimism.

Source modules do not run hidden provider retry loops.

---

## 12. Source-specific context rule

When working on one source, read only that source's relevant sections from:

- `DATA_CONTRACTS.md`;
- `VALIDATION_SPEC.md`;
- live source code/tests.

Do not load all other source contracts by default.

---

## 13. Minimum implementation sequence

```text
inspect current Core/source contracts
→ prove source-specific input/acquisition shape
→ register source/readiness
→ acquire/import one controlled evidence unit
→ preserve raw
→ parse/normalize
→ validate
→ persist provenance
→ prove accepted/rejected state
→ expose the minimum required desktop/package behavior
```

Prefer one vertical slice over a full provider surface.

---

## 14. Required deterministic coverage

Add only the relevant minimum:

- readiness/capability;
- request/input mapping;
- parser/normalizer;
- semantic validation;
- null/zero behavior;
- malformed/non-data handling;
- operational error mapping;
- raw preservation;
- provenance;
- Core integration;
- resume/retry/cancel where supported;
- UI/IPC where exposed;
- package/export eligibility.

Normal tests never call live providers.

Verification depth belongs in `TEST_STRATEGY.md`.

---

## 15. Definition of done

A source/mode is complete only when:

1. feasibility evidence exists;
2. identity/semantics are explicit;
3. shared Core lifecycle is used;
4. raw evidence is preserved;
5. parser/validator fail closed;
6. missing values remain missing;
7. operational failure stays separate from validation;
8. provenance is complete;
9. deterministic tests pass;
10. unsupported modes fail visibly;
11. required live acceptance is separately evidenced if claimed;
12. `PROJECT_HANDOFF.md` reflects actual status.

---

## 16. Governing module rule

> **Reuse one auditable Core lifecycle while keeping provider semantics and acquisition details inside the source boundary. Generalize only when real evidence requires it.**
