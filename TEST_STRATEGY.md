# RoofRoom Data Collector — Test Strategy

**Status:** Canonical verification strategy
**Primary rule:** Normal automated tests and CI never call live providers

---

## 1. Goal

Use the smallest deterministic evidence set that proves the changed boundary reliably.

Testing protects:

- evidence preservation;
- Run/Job/Attempt correctness;
- persistence/migration integrity;
- source semantics;
- null/zero behavior;
- requested/observed separation;
- validation;
- credential/IPC boundaries;
- package integrity;
- resume/retry/cancellation behavior.

---

## 2. Test levels

### Unit

Pure parsing, validation, mapping, serialization, state transitions, helpers.

### Integration

SQLite, filesystem, Core orchestration, source adapters, credentials, IPC, package stores/exporters, local HTTP.

### Renderer/UI

User-visible intent/state/remediation/action availability.

### Packaging/runtime

Electron composition, packaged resources, signing/runtime startup, safe open/reveal behavior.

### Live-provider acceptance

Explicit, separate, minimal, quota-aware proof of current provider behavior.

Never routine regression.

---

## 3. Verification-depth rule

### Local/pure change

```text
focused deterministic test
```

### Shared/reused contract

```text
focused test
+ affected regressions
```

### Persistence / filesystem / IPC / credential / package-integrity change

```text
focused integration
+ affected regressions
```

### Slice/checkpoint boundary

Run the relevant broader deterministic gate.

### Release/runtime boundary

Run release/package/runtime verification only when that boundary is part of the claim.

### Live behavior

Use the smallest separately authorized live acceptance that cannot be proven locally.

Do not run broader gates merely for reassurance.

---

## 4. Default development loop

```text
inspect relevant live code + directly affected contract
→ smallest failing deterministic test where practical
→ observe RED
→ minimum compatible implementation
→ observe GREEN
→ affected regressions if required
→ diff/check
```

Do not repeatedly rerun unchanged gates.

---

## 5. Live-provider policy

Normal unit, integration, regression, release-gate, and CI commands must not call:

- Google Trends;
- GSC;
- Google Ads;
- Keyword Planner;
- SerpApi;
- any future provider.

A live command must be:

- explicitly authorized;
- bounded;
- quota-aware;
- non-destructive;
- separate from deterministic verification;
- stopped on auth/manual/rate-limit/quota/security intervention.

Do not assert unstable exact business metrics.

---

## 6. Fixture policy

Provider fixtures should preserve enough sanitized structure to prove:

- source/dataset identity;
- acquisition/source mode where relevant;
- encoding/media shape;
- parser behavior;
- validation behavior;
- provider limitations needed by the test.

Never commit credentials, cookies, tokens, production secrets, or unnecessary private account identifiers.

---

## 7. Shared Core coverage

Relevant Core tests cover:

- Workspace ownership;
- one-active-Run enforcement;
- multi-source Run membership;
- source-keyed Job identity;
- nullable GT-only query groups;
- immutable Attempts;
- retry atomicity;
- reconciliation/resume/cancellation;
- migrations and integrity;
- artifact state/storage/checksum;
- provenance;
- validator dispatch;
- credentials/readiness;
- freshness;
- renderer/main privilege boundaries;
- package/export eligibility.

Use fake source-neutral collaborators where provider behavior is irrelevant.

---

## 8. Source coverage

Each implemented source adds only the tests needed for its own contract:

- request/input mapping;
- parser/normalizer;
- source validation;
- missing/null/zero semantics;
- malformed/non-data behavior;
- provider operational error mapping;
- raw preservation;
- provenance;
- Core integration;
- UI/IPC only where exposed;
- package/export eligibility.

Detailed trust semantics belong in `VALIDATION_SPEC.md`.

---

## 9. Acquisition-mode coverage

### Browser export

Test verified interaction contract, bounded waits, provider-state mapping, byte capture, browser ownership, fail-closed behavior.

### Official API

Mock/sanitize requests, pagination/streaming, responses, auth/quota mapping, cancellation, raw preservation, provenance.

### File import

Use controlled fixture files for path validation, original-byte preservation, format detection, encoding/workbook parsing, malformed input, null semantics.

### HTTP/XML

Use fixtures or local HTTP for content mismatch, XML parsing, relationships, duplicates, optional fields, raw-response preservation.

### Third-party API

Mock success/no-results/errors/quota/request context/raw evidence.

---

## 10. Credential and security coverage

Where affected, prove:

- secrets never cross renderer IPC;
- secrets do not appear in logs/config/exports/findings/packages;
- safeStorage/credential references behave correctly;
- masked native secret ingress does not place secrets in argv/temporary files/clipboard;
- cancellation/failure preserves prior valid credential state;
- source readiness reflects real configuration state.

---

## 11. Freshness coverage

Where affected, prove:

- freshness is deterministic;
- readiness/freshness are separate;
- accepted completed evidence advances last success;
- failed/rejected/candidate evidence does not;
- on-demand sources do not become refresh loops;
- clock logic is controllable.

---

## 12. Package coverage

### Production Data Package

Prove accepted-only loading, source separation, integrity/provenance, no raw mutation.

### `ADS_OPTIMIZATION_PACK v1`

Prove exact compatibility, current/previous window rules, no reconstruction, deterministic evidence reuse, immutable publication, safe manifest/table/workbook validation, trusted desktop Review/Start/Open contracts.

### `BLOG_WRITING_PACK v1`

Prove fixed recipe filtering, truthful coverage, Keyword Planner provenance separation, immutable publication, package/data consistency, workbook structure, trusted Build/Open/Reveal, and no acquisition/retry side effects.

---

## 13. Resume/retry/cancellation coverage

Where supported, prove:

- accepted work is not recollected unnecessarily;
- interrupted state reconciles before new work;
- retry creates a new Attempt;
- retry ownership/active-slot changes are atomic;
- earlier evidence remains preserved;
- quota/manual conditions do not loop;
- cancellation does not fabricate provider interruption.

---

## 14. UI / IPC coverage

Test only behavior exposed by the changed slice:

- safe source/connection state;
- remediation actions;
- reviewed inputs;
- start/resume/retry/cancel intent;
- progress;
- accepted-evidence opening;
- package review/build/open/reveal;
- rejection of invalid renderer inputs.

Privileged objects and secrets must not cross IPC.

---

## 15. Evidence claims

Keep distinct:

```text
test exists
test ran
test passed
release gate passed
package built
packaged runtime accepted
live provider accepted
```

Historical PASS evidence is historical.

Do not claim a later changed implementation passed unless the relevant gate was rerun.

Current verification state belongs in `PROJECT_HANDOFF.md`.

---

## 16. Release/checkpoint gate

At a release or substantial shared checkpoint, require the relevant combination of:

- shared Core deterministic coverage;
- affected source suites;
- credential/security coverage where changed;
- freshness coverage where changed;
- UI/IPC coverage where changed;
- package/export integrity;
- type/lint/build checks where required by the boundary;
- packaging/runtime checks when claimed;
- explicit live acceptance only when separately authorized.

No live provider request belongs inside the ordinary deterministic release gate.

---

## 17. Governing test rule

> **Prove the changed boundary with the minimum sufficient deterministic evidence; use live providers only for explicit proof that cannot be established locally.**
