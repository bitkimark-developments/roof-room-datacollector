# RoofRoom Data Collector — UX & Operations Hardening Plan

**Status:** Approved execution roadmap
**Program:** R1.0 UX & Operations Hardening
**Baseline:** Release 1.0 local implementation is closed and deterministic-green.
**Purpose:** Convert the verified collector architecture into a clearer, safer, lower-friction user journey without reopening completed source adapters unless new failing evidence appears.

---

## 1. Governing goal

Preserve the proven collection architecture while improving the user journey:

```text
Workspace
→ connection/readiness
→ task configuration/input
→ Review
→ Start
→ progress
→ result/validation
→ evidence
→ retry/resume
→ export
```

The hardening program must not expand provider scope, add analysis/recommendation behavior, or weaken data-integrity/security boundaries.

---

## 2. Priority classes

- **MUST** — blocks task completion, hides required remediation, creates input/error risk, or leaves a core user journey incomplete.
- **GOOD TO HAVE** — work can complete, but unnecessary complexity, uncertainty, or editing risk remains.
- **COULD BE** — refinement/polish after functional journeys are complete.

---

## 3. Approved workchart

| ID | Work package | Priority | Depends on | Objective | Acceptance criteria |
|---|---|---:|---|---|---|
| UXH0 | UX Reality Lock | MUST | — | Freeze current screens, journeys, states, and proven gaps before implementation | Screen/task capability matrix exists; bug vs UX gap vs polish is separated; no feature code changed |
| UXH1 | Status & Remediation Contract | MUST | UXH0 | Make readiness/freshness/system-health states understandable and actionable | Every blocking readiness state has a reason and direct remediation action; readiness and freshness remain separate |
| UXH2 | Workspace Connections | MUST | UXH1 | Make Workspace the user-facing connection-management surface | GSC/Google Ads/SerpApi connection states are visible; connect/manage/disconnect flows exist; secrets remain behind Core security boundary |
| UXH3 | Task Detail Remediation | MUST | UXH1–UXH2 | Eliminate dead-end `CONFIGURATION REQUIRED` task pages | Every task explains what is missing and provides the correct action or input path |
| UXH4 | Structured Input Editors | MUST | UXH3 | Replace free-form mini-DSLs for Keyword Planner and SerpApi | Structured add/edit/remove flows; inline validation; duplicate detection; Review receives the same canonical reviewed artifact |
| UXH5 | File Import UX | MUST | UXH3 | Complete İkas and Keyword Planner CSV import journey | Selected file name/size/type are visible; replace/remove supported; import need is distinct from generic configuration failure |
| UXH6 | Bitkimark Bounded Selector | MUST | UXH3 | Replace editable sitemap textarea with approved URL selection UI | Allowlisted URLs shown as selectable items; selected/request count visible; arbitrary URL editing is not the primary UI |
| UXH7 | Run History & Run Detail | MUST | UXH3 | Turn Runs from debug output into operational history | Human-readable task/source/status/validation/time/error/retry/evidence/export information is available |
| UXH8 | Task-level Recent Runs | MUST | UXH7 | Bind task detail history to persisted Core runs correctly | Recent runs are filtered by Workspace + task/source and show truthful validation/execution state |
| UXH9 | Preset Editing Lifecycle | MUST | UXH3–UXH4 | Turn Presets into real reusable configurations | Create/open/edit/rename/duplicate/delete/review lifecycle; preset contents and task readiness are visible; delete is confirmed |
| UXH10 | Editing Safety | GOOD TO HAVE | UXH4–UXH6, UXH9 | Protect unsaved work and Workspace isolation | Navigation/workspace changes warn about unsaved edits; drafts do not leak across workspaces/tasks |
| UXH11 | Source-specific Task Context | GOOD TO HAVE | UXH2–UXH8 | Enrich generic task detail with source-specific safe context | GSC property, Ads account/scope, request counts, file info, SerpApi request/quota context shown where applicable |
| UXH12 | Operational Dashboard | GOOD TO HAVE | UXH7–UXH8 | Make Home a useful operations summary | Ready/needs-connection/needs-import/needs-attention/recent-success summaries are truthful and actionable |
| UXH13 | Usability Polish | COULD BE | UXH0–UXH12 | Improve readability without changing semantics | Human-readable timestamps, density, contrast, hover states, icons, filters/search where useful |
| UXH14 | Integrated UX Hardening Gate | MUST | UXH0–UXH13 | Verify complete packaged user journeys | Deterministic journey suites + release gate + package/smoke when relevant + final handoff checkpoint |

---

## 4. Delivery waves

### Wave A — User can get a task ready and run it

```text
UXH0 → UXH1 → UXH2 → UXH3 → UXH4 → UXH5 → UXH6
```

Exit condition: a user can understand readiness, establish required connections, provide/edit inputs safely, review the exact artifact, and start supported work without learning internal contracts.

### Wave B — User can manage completed and in-progress work

```text
UXH7 → UXH8 → UXH9 → UXH10 → UXH11
```

Exit condition: the user can understand run history, inspect failures, retry correctly, manage presets, preserve edits safely, and see the source context needed to trust a run.

### Wave C — Release-quality operations experience

```text
UXH12 → UXH13 → UXH14
```

Exit condition: Home acts as an operational dashboard, usability polish is complete, and packaged end-to-end journeys pass the integrated hardening gate.

---

## 5. Required development discipline

Every implementation slice follows:

```text
Repository audit
→ bounded plan
→ focused RED
→ confirm intended failure
→ minimal implementation
→ focused GREEN
→ relevant regression batch
→ typecheck / lint / diff check
→ full deterministic release gate
→ package/smoke when the changed boundary requires it
→ technical commit
→ PROJECT_HANDOFF update
→ documentation commit
→ fast-forward local main
→ post-merge verification
```

Do not run the full gate after every small edit. Batch expensive verification at coherent slice boundaries.

If several failures appear:

```text
collect
→ classify
→ reproduce
→ inspect evidence
→ trace root cause
→ one hypothesis
→ minimal fix
→ verify
```

No "while I am here" refactors.

---

## 6. UX contracts that must remain true

### 6.1 Blocking state contract

Every blocking readiness state shown to a user must provide:

```text
status
reason
remediation label
remediation target/action
```

A task must never end at `CONFIGURATION REQUIRED` without telling the user what is missing and how to resolve it.

### 6.2 Readiness and freshness remain separate

Presentation may simplify labels, but must not collapse:

```text
application/system health
≠ task readiness
≠ freshness
≠ execution status
≠ validation status
```

### 6.3 Workspace owns connection management

Workspace is the user-facing surface for connection state and safe account/property labels.

Secrets remain behind the Core credential/security boundary. The renderer must never receive OAuth refresh tokens, API keys, developer tokens, client secrets, passwords, or unrestricted credential payloads.

### 6.4 Structured editing is primary

Internal compact formats such as:

```text
group-id | Group name | keyword one, keyword two
query-id | query
```

may remain as import/bulk-entry conveniences, but must not be the primary editing experience.

### 6.5 Run history is operational, not debug output

Primary run identity should communicate task/source, execution state, validation state, time, and available actions. Internal IDs remain secondary evidence identifiers.

### 6.6 Presets are editable reusable configurations

A preset must expose its contents and support a truthful create/edit/review/run lifecycle. A preset is not merely a named record.

---

## 7. Explicit non-goals

This program does not add:

- new providers or datasets;
- SEO/marketing/advertising/merchandising recommendations;
- arbitrary Google Ads reporting modes;
- unsupported Google Trends modes;
- arbitrary site crawling;
- continuous rank tracking;
- cloud sync;
- remote publishing/release automation;
- broad architecture rewrites without failing evidence.

Completed R1 source adapters remain closed unless a new deterministic or live failure proves a defect.

---

## 8. Integrated hardening journeys

At UXH14, verify at minimum:

### Provider connection journey

```text
Workspace
→ view missing connection
→ connect/configure through privileged boundary
→ task becomes ready
→ Review
→ Start
→ completion
→ evidence
→ export
```

### File import journey

```text
Task
→ select file
→ selected-file preview
→ Review
→ import
→ validation
→ evidence
→ export
```

### Failure/retry journey

```text
Run
→ failure reason
→ retry eligible job
→ new attempt
→ previous evidence preserved
→ success/final state
```

### Preset journey

```text
Create
→ choose tasks
→ edit inputs
→ save
→ reopen
→ modify
→ Review
→ Run
```

### Workspace isolation

```text
Workspace A state ≠ Workspace B state
```

Draft input, connections, readiness, run history, and presets must not silently cross workspace boundaries.

---

## 9. Exact next action

Start **UXH0 — UX Reality Lock**.

It is a read-only/product-contract slice. Inspect the live repository and current packaged UI, then produce a task-by-task matrix covering:

- readiness state and reason;
- freshness state;
- required connection/input;
- current remediation action;
- editing model;
- Review availability;
- Start behavior;
- Recent Runs binding;
- evidence/export access;
- known usability/functional gap.

Do not implement UXH1 until the matrix confirms the actual current behavior and avoids reopening already-correct functionality.
