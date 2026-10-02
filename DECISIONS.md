# RoofRoom Data Collector — Decision Register

**Status:** Active compact ADR register
**Purpose:** Cold-history index for accepted/superseded architecture decisions

---

## 1. Usage rule

Use this file only when a task:

- questions an existing architecture decision;
- may conflict with an accepted decision;
- needs historical rationale;
- proposes superseding a decision.

Do not use it for current Git state, bugs, implementation progress, test PASS/FAIL, or the next task.

Those belong in `PROJECT_HANDOFF.md`.

Routine implementation should not load this file by default.

---

## 2. Change rule

Accepted decisions may change only when new evidence materially justifies it.

When changing one:

```text
keep the old ADR identity
→ mark it SUPERSEDED
→ record the replacement decision
→ explain the evidence that changed the assumption
```

Do not silently rewrite history.

---

## 3. Active decision index

| ADR | Status | Decision |
|---|---|---|
| ADR-001 | ACCEPTED | One modular application |
| ADR-002 | ACCEPTED | Local-first desktop |
| ADR-003 | ACCEPTED | Collector / analysis separation |
| ADR-004 | SUPERSEDED by ADR-050 | Google Trends first MVP source |
| ADR-005 | SUPERSEDED by ADR-051 | Narrow Google Trends MVP scope |
| ADR-006 | ACCEPTED | External query configuration |
| ADR-007 | ACCEPTED | Prefer official API / supported UI |
| ADR-008 | ACCEPTED | Playwright preferred when browser automation is needed |
| ADR-009 | ACCEPTED | Application-owned browser profile |
| ADR-010 | ACCEPTED | No password storage or provider-security bypass |
| ADR-011 | ACCEPTED | Raw source files/responses are evidence |
| ADR-012 | ACCEPTED | Missing is not zero |
| ADR-013 | ACCEPTED | Google Trends remains relative interest |
| ADR-014 | ACCEPTED | Preserve GT comparison-group context |
| ADR-015 | ACCEPTED | No automatic cross-group GT comparability |
| ADR-016 | ACCEPTED | Search Term / Topic remain separate |
| ADR-017 | ACCEPTED | Distinct source modes remain distinct when semantics differ |
| ADR-018 | ACCEPTED | One GT query group = one GT Job |
| ADR-019 | ACCEPTED | Sequential GT collection by default |
| ADR-020 | ACCEPTED | Persist Run/Job/Attempt/artifact state |
| ADR-021 | ACCEPTED | SQLite for operational state |
| ADR-022 | ACCEPTED | Execution and validation are separate |
| ADR-023 | ACCEPTED | Validation before canonical acceptance |
| ADR-024 | ACCEPTED | Deterministic validation statuses |
| ADR-025 | ACCEPTED | Preserve rejected artifacts where useful |
| ADR-026 | ACCEPTED | Job-level retry + immutable Attempt history |
| ADR-027 | ACCEPTED | Resume reconciles interrupted work |
| ADR-028 | ACCEPTED | Renderer does not own privileged capabilities |
| ADR-029 | ACCEPTED | Stable machine IDs / explicit serialization |
| ADR-030 | ACCEPTED | ISO dates / UTC timestamps |
| ADR-031 | ACCEPTED | Run-oriented canonical filesystem evidence |
| ADR-032 | ACCEPTED | Normal export/package uses eligible accepted evidence |
| ADR-033 | ACCEPTED | Structured workbooks preserve provenance |
| ADR-034 | ACCEPTED | Core tests independent of live provider |
| ADR-035 | ACCEPTED | Fixtures from sanitized observed behavior |
| ADR-036 | ACCEPTED | Progressive GT rollout |
| ADR-037 | ACCEPTED | Small verified Git checkpoints |
| ADR-038 | ACCEPTED AS DIRECTION | TypeScript/Electron desktop stack direction |
| ADR-039 | ACCEPTED | Exact versions come from live repository evidence |
| ADR-040 | ACCEPTED | Evidence-based LOW_DATA thresholds |
| ADR-041 | ACCEPTED | Verified provider NO_DATA semantics |
| ADR-042 | ACCEPTED | Unknown external schema fails closed |
| ADR-043 | ACCEPTED | No exact unstable live GT metric assertions |
| ADR-044 | ACCEPTED | Hosted CI not required for initial milestone |
| ADR-045 | ACCEPTED | Verified desktop toolchain baseline |
| ADR-046 | ACCEPTED | Electron userData application storage |
| ADR-047 | ACCEPTED | Built-in node:sqlite storage backend |
| ADR-048 | ACCEPTED | write-excel-file for structured workbook output |
| ADR-049 | ACCEPTED | Valid no-positive-signal GT evidence is LOW_DATA |
| ADR-050 | ACCEPTED | R1 is the verified multi-source Collector |
| ADR-051 | ACCEPTED | GT is the reference browser-export module |
| ADR-052 | ACCEPTED | New sources require feasibility proof |
| ADR-053 | ACCEPTED | Automated regression never calls live providers |
| ADR-054 | ACCEPTED | Credentials use a Core security boundary |
| ADR-055 | ACCEPTED | Freshness separate from readiness/execution/validation |
| ADR-056 | ACCEPTED | All acquisition modes share one Core lifecycle |
| ADR-057 | ACCEPTED | One collection operation is one multi-source Run |
| ADR-058 | ACCEPTED | Workspace owns Runs; DB enforces active slot |
| ADR-059 | ACCEPTED | Workspace-owned presets + atomic Last Run Settings reservation |
| ADR-060 | ACCEPTED | Workspace connection metadata + credential boundary + source-keyed readiness |
| ADR-061 | ACCEPTED | İkas XLSX and Bitkimark sitemap use bounded shared-Core source slices |
| ADR-062 | ACCEPTED | Google API credentials use secure local storage + desktop PKCE composition |
| ADR-063 | ACCEPTED | SerpApi uses Workspace-scoped query Job with raw JSON + normalized evidence |
| ADR-064 | ACCEPTED | Generalized desktop flow delegates to existing Core contracts |
| ADR-065 | ACCEPTED | İkas production XLSX mapping uses exact evidence-backed fields |
| ADR-066 | ACCEPTED | macOS user-entered secrets use main-owned native masked prompt |
| ADR-067 | ACCEPTED | Google Ads SEARCH reporting is one family with independent dataset Jobs |
| ADR-068 | ACCEPTED | Task Packages assemble accepted evidence without owning acquisition |

---

## 4. Current architectural consequences

The accepted register currently means:

- RoofRoom remains one local-first modular desktop application;
- provider-specific semantics stay in source modules;
- Workspace owns Runs;
- one user collection operation may contain multiple source-keyed Jobs;
- retry preserves immutable Attempt history;
- raw evidence is authoritative;
- missing is not zero;
- validation precedes canonical acceptance;
- credentials stay behind privileged Core boundaries;
- freshness is separate from readiness/execution/validation;
- all approved acquisition modes share one lifecycle;
- desktop/general package flows delegate to existing Core contracts;
- Google Ads SEARCH reporting is one family with independent dataset Jobs;
- Task Packages assemble accepted evidence and do not own acquisition.

---

## 5. Provider-specific decision guardrails

Google Trends-specific decisions remain source-specific and must not become generic Core requirements.

The approved Google Ads SEARCH family remains SEARCH-only.

Performance Max or materially different Google Ads resources require separate scope/evidence.

The retired Google Ads Developer Token is not restored merely because legacy persisted compatibility fields still exist.

---

## 6. Deferred choices

Implementation details remain deferred until real evidence requires them, including package/library/tooling choices not already locked by live code, provider selector/schema evolution, retry tuning, future migration tooling, and concurrency/process architecture.

Deferred means:

> **Do not solve it merely because it might matter later.**

---

## 7. Explicitly rejected directions

Still rejected unless the original reason is materially invalidated:

- separate standalone application per source;
- treating Google Trends as absolute search volume;
- converting missing numeric evidence to zero;
- unproven cross-group GT ranking;
- Collector-generated marketing/SEO strategy;
- depending on the user's normal browser profile;
- undocumented private endpoints as default architecture;
- CAPTCHA/2FA/anti-bot bypass;
- default parallel GT collection without evidence;
- accepting every download without validation.

---

## 8. Authority routing

For current implementation details use the dedicated authority:

| Need | Authority |
|---|---|
| Current state / next action | `PROJECT_HANDOFF.md` |
| Product scope | `PROJECT_SPEC.md` |
| Architecture | `ARCHITECTURE.md` |
| Persistence/contracts | `DATA_CONTRACTS.md` |
| Validation | `VALIDATION_SPEC.md` |
| Test depth | `TEST_STRATEGY.md` |
| Source onboarding | `SOURCE_MODULE_GUIDE.md` |

Full historical ADR prose remains recoverable from Git history / pre-diet backups and should be opened only when this compact register is insufficient.

---

## 9. Governing decision rule

> **Follow the current accepted decision, or supersede it explicitly with evidence. Do not drift silently.**
