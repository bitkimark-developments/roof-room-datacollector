# RoofRoom Data Collector — Project Handoff

**Document:** `PROJECT_HANDOFF.md`  
**Product:** RoofRoom Data Collector  
**Last Updated:** 2026-08-18  
**Current Milestone:** M2 — Core Collector Engine  
**Milestone Status:** READY TO START  
**Previous Milestone:** M1 — Application Skeleton — COMPLETED  
**M0 Final Consistency Review:** PASS  

---

# 1. Current Repository

Verified repository:

```text
~/Projects/roofroom-data-collector/
```

Branch:

```text
main
```

Latest verified implementation checkpoint:

```text
5503309 feat: add SQLite schema bootstrap
```

Previous verified checkpoints:

```text
35d9b74 feat: add source registry and Google Trends placeholder
b8d9505 docs: update M1 handoff after config slice
9e3328b feat: add app directories and YAML query config loader
885b132 docs: add M0 baseline and update M1 handoff
06740fb feat: add React renderer and typed IPC bridge
e2409cc chore: bootstrap Electron Forge Vite TypeScript app
```

Working tree was clean after `5503309`.

---

# 2. Milestone Status

## M0 — Product & Architecture Lock

```text
STATUS: COMPLETED
```

## M1 — Application Skeleton

```text
STATUS: COMPLETED
```

M1 acceptance was verified on the target Apple Silicon Mac.

## M2 — Core Collector Engine

```text
STATUS: READY TO START
```

M2 owns operational persistence and deterministic orchestration foundations.

M2 does not perform real Google Trends browser collection.

## M3 — Google Trends MVP Collector

```text
STATUS: NOT STARTED
```

## M4 — Validation Engine

```text
STATUS: NOT STARTED
```

## M5 — Desktop UX

```text
STATUS: NOT STARTED
```

## M6 — Data Package & Workbook

```text
STATUS: NOT STARTED
```

## M7 — Hardening & Release 1.0

```text
STATUS: NOT STARTED
```

---

# 3. Verified M1 Environment

Target machine:

```text
macOS:        26.5.2
Architecture: arm64
Node.js dev:  24.19.0 via nvm
npm:          11.17.0
```

Electron runtime probe:

```text
Electron: 43.4.0
Node:     24.18.1
SQLite:   3.53.1
```

Verified implementation baseline:

```text
Electron                         43.4.0
Electron Forge                   7.11.2
React                            18.3.1
React DOM                        18.3.1
Vite                             5.4.21
TypeScript                       5.9.3
ESLint                           8.57.1
@typescript-eslint/parser        8.65.0
@typescript-eslint/eslint-plugin 8.65.0
yaml                             2.9.0
```

These are a verified baseline, not permanent forever-pins.

---

# 4. M1 Completed Work

## Electron / React / IPC

Verified:

- Electron launches,
- React renderer loads,
- typed preload/IPC bridge works,
- `contextIsolation: true`,
- `nodeIntegration: false`,
- renderer sandbox enabled,
- raw privileged Electron/Node objects are not exposed to React,
- IPC sender validation is implemented.

## Application Directories

Verified writable root:

```text
~/Library/Application Support/RoofRoom Data Collector/app-data/
```

Current subdirectories include:

```text
config/
data/
data/runs/
database/
browser-profiles/
logs/
```

## YAML QueryConfig

Verified:

- external YAML config creation,
- strict YAML parsing,
- canonical QueryConfig normalization,
- config version validation,
- `source = google-trends` validation,
- GT group-ID validation,
- duplicate group rejection,
- duplicate query rejection within a group,
- unsupported-field rejection,
- query/group order preservation,
- valid-config recovery after a controlled invalid-config test.

Current deterministic M1 fixture contains GT01 and GT02 only. It is not the final GT01–GT20 Release 1.0 config.

## SourceRegistry

Verified:

- `google-trends` registration,
- stable source-ID lookup,
- duplicate registration rejection,
- unknown source lookup rejection,
- capabilities/readiness summary,
- typed renderer transport.

Current Google Trends source readiness is intentionally:

```text
UNAVAILABLE
```

because real collection is not implemented in M1.

## SQLite Bootstrap

Current database:

```text
~/Library/Application Support/RoofRoom Data Collector/app-data/database/roofroom.sqlite
```

Verified:

```text
schema version      = 1
migrations applied  = 1
journal mode        = wal
foreign keys        = ON
quick check         = ok
```

Schema version 1 contains only bootstrap/migration infrastructure.

Operational run/job persistence begins in M2.

---

# 5. M1 Acceptance Record

Verified:

```text
Electron development launch                     PASS
React renderer                                  PASS
typed preload / IPC bridge                      PASS
renderer privilege boundary                     PASS
application directories                         PASS
valid YAML config                               PASS
invalid config rejection                        PASS
duplicate query-group rejection                 PASS
SourceRegistry                                  PASS
stable source-ID lookup                         PASS
duplicate source registration rejection         PASS
unknown source rejection                        PASS
Electron node:sqlite runtime probe               PASS
SQLite fresh migration                          PASS
SQLite restart/idempotency                      PASS
SQLite future-schema rejection                  PASS
SQLite quick_check                              PASS
npm run lint                                    PASS
npx tsc --noEmit                                PASS
git diff --check                                PASS
npm audit --omit=dev                            PASS / 0 vulnerabilities
Electron Forge production package               PASS
packaged macOS arm64 application launch          PASS
```

Packaged output:

```text
out/
└── RoofRoom Data Collector-darwin-arm64/
    └── RoofRoom Data Collector.app
```

Packaged application runtime showed:

```text
React renderer            READY
Typed IPC bridge          READY
Application directories  READY
YAML QueryConfig          READY
SourceRegistry            READY
SQLite bootstrap          READY
```

No real Google Trends collection was performed.

---

# 6. Dependency / Security Notes

Production dependency audit remains:

```text
0 vulnerabilities
```

The full development/build dependency tree has previously reported:

```text
32 vulnerabilities
3 low
1 moderate
27 high
1 critical
```

Do not run:

```text
npm audit fix --force
```

without a deliberate toolchain migration and regression test.

Do not blindly approve install scripts.

---

# 7. M1 Closure

M1 is complete.

The verified M1 chain is:

```text
Electron launch
↓
React renderer
↓
safe preload / typed IPC
↓
application directories
↓
YAML → canonical QueryConfig
↓
SourceRegistry → google-trends
↓
SQLite open + schema/migration bootstrap
↓
production package
↓
packaged app launch on target Mac
```

Persisted runs/jobs were intentionally not added to M1. That boundary belongs to M2.

---

# 8. M2 Objective

M2 — Core Collector Engine targets:

- persisted runs,
- persisted jobs,
- persisted attempts,
- deterministic execution-status transitions,
- sequential orchestration,
- resume/reconciliation foundation,
- retry foundation,
- artifact records,
- validation-summary records,
- shared storage foundation,
- metadata foundation,
- logging foundation,
- BrowserManager foundation,
- fake/test source pipeline.

M2 must keep `execution_status` separate from `validation_status`.

M2 should prove shared Core behavior deterministically before M3 connects the live Google Trends UI.

---

# 9. Current Known Issues / Deferred Work

1. No formal automated test runner has been selected yet.
2. Existing deterministic checks are runtime/TypeScript/shell probes rather than a formal suite.
3. Full development dependency audit still contains build-tool dependency findings.
4. Playwright is not yet installed/configured.
5. Google Trends source remains intentionally `UNAVAILABLE`.
6. Current YAML fixture contains only GT01 and GT02.
7. JSON/CSV config adapters remain Release 1.0 work.
8. Run/job/attempt/artifact persistence is not yet implemented.
9. BrowserManager is not yet implemented.
10. Logging/schema-validation/XLSX/CSV implementation choices remain deferred where not yet required.

---

# 10. Exact Next Action

Begin M2 with the smallest persistence vertical slice:

```text
inspect canonical Run / Job contracts
↓
define shared execution-status TypeScript contracts
↓
design SQLite migration v2 for runs + jobs only
↓
implement StateRepository run/job persistence
↓
create one run from canonical QueryConfig
↓
persist independent jobs in query-group order
↓
reload database
↓
prove run/jobs survive restart
↓
prove status values fail closed
↓
lint / type-check / deterministic integration test
↓
runtime summary
↓
Git checkpoint
```

Do not add attempts, artifacts, retry, resume, BrowserManager, or real source collection to the first M2 slice unless required to prove the run/job persistence boundary.

After run/job persistence is proven:

```text
attempts + transition rules
↓
sequential fake-source orchestration
↓
artifacts / validation summaries
↓
resume / retry
↓
shared storage / metadata / logging
↓
BrowserManager foundation
↓
M2 acceptance gate
```

---

# 11. Handoff Discipline

At the end of every meaningful implementation session:

1. verify actual behavior,
2. record tests that actually ran,
3. record known failures,
4. update the current milestone,
5. record the latest verified Git checkpoint,
6. record one exact next action.

Never record unverified work as completed.
